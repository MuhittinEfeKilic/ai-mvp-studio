import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';

import { CodexRunner } from './codex-runner.mjs';
import { config } from './config.mjs';
import { Database } from './database.mjs';
import { Orchestrator } from './orchestrator.mjs';
import { validateSpec } from './spec-validator.mjs';

fs.mkdirSync(config.dataDir, { recursive: true });
fs.mkdirSync(config.projectsDir, { recursive: true });

const database = new Database(config.databasePath);
database.markStaleRunsInterrupted();
const runner = new CodexRunner(config.codexCommand, { timeoutMs: config.codexTimeoutMs });
const orchestrator = new Orchestrator({
  database, runner, projectsDir: config.projectsDir,
  maxConcurrentRuns: config.maxConcurrentRuns,
  maxConcurrentAgents: config.maxConcurrentAgents,
  maxParallelBuilders: config.maxParallelBuilders,
  tokenBudget: config.projectTokenBudget,
  deviceMinFreeMb: config.deviceMinFreeMb,
  flutterTimeoutMs: config.flutterTimeoutMs,
});
const indexPath = path.join(config.root, 'src', 'mvp_studio', 'static', 'index.html');
const specTemplate = fs.readFileSync(path.join(config.root, 'templates', 'PROJECT_SPEC.template.md'), 'utf8');
const mobileSpecTemplate = fs.readFileSync(path.join(config.root, 'templates', 'PROJECT_SPEC.mobile.template.md'), 'utf8');

function sendJson(response, status, body) {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(body));
}

async function readJson(request) {
  let body = '';
  for await (const chunk of request) {
    body += chunk;
    if (body.length > 210_000) throw new Error('İstek gövdesi çok büyük.');
  }
  return JSON.parse(body || '{}');
}

export function createServer() {
  return http.createServer(async (request, response) => {
    const url = new URL(request.url, `http://${request.headers.host}`);
    try {
      if (request.method === 'GET' && url.pathname === '/') {
        response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
        // Read per request: caching it at boot silently served a stale panel
        // after every edit until the server was restarted.
        response.end(fs.readFileSync(indexPath, 'utf8'));
        return;
      }
      if (request.method === 'GET' && url.pathname === '/api/spec-template') {
        response.writeHead(200, {
          'content-type': 'text/markdown; charset=utf-8',
          'content-disposition': 'attachment; filename="PROJECT_SPEC.template.md"',
        });
        response.end(specTemplate);
        return;
      }
      if (request.method === 'GET' && url.pathname === '/api/spec-template/mobile') {
        response.writeHead(200, {
          'content-type': 'text/markdown; charset=utf-8',
          'content-disposition': 'attachment; filename="PROJECT_SPEC.mobile.template.md"',
        });
        response.end(mobileSpecTemplate);
        return;
      }
      if (request.method === 'POST' && url.pathname === '/api/specs/validate') {
        const payload = await readJson(request);
        sendJson(response, 200, validateSpec(payload.spec_content));
        return;
      }
      if (request.method === 'GET' && url.pathname === '/api/health') {
        const version = await runner.version();
        sendJson(response, 200, {
          status: 'ok',
          codex_available: Boolean(version),
          codex_version: version,
          token_budget: config.projectTokenBudget,
        });
        return;
      }
      if (request.method === 'GET' && url.pathname === '/api/projects') {
        sendJson(response, 200, database.listProjects());
        return;
      }
      if (request.method === 'POST' && url.pathname === '/api/projects') {
        const payload = await readJson(request);
        const specContent = String(payload.spec_content ?? '');
        const report = validateSpec(specContent);
        if (!report.ready) {
          sendJson(response, 422, { detail: 'PROJECT_SPEC.md üretime hazır değil.', report });
          return;
        }
        const version = await runner.version();
        if (!version) {
          sendJson(response, 503, { detail: 'Codex CLI bulunamadı veya çalıştırılamadı.' });
          return;
        }
        sendJson(response, 202, orchestrator.createProject(report.project_name, specContent));
        return;
      }
      const resumeMatch = request.method === 'POST'
        && url.pathname.match(/^\/api\/projects\/([a-f0-9]{12})\/resume$/);
      if (resumeMatch) {
        sendJson(response, 202, orchestrator.resumeProject(resumeMatch[1]));
        return;
      }
      const acceptMatch = request.method === 'POST'
        && url.pathname.match(/^\/api\/projects\/([a-f0-9]{12})\/accept$/);
      if (acceptMatch) {
        sendJson(response, 200, await orchestrator.acceptProject(acceptMatch[1]));
        return;
      }
      const feedbackMatch = request.method === 'POST'
        && url.pathname.match(/^\/api\/projects\/([a-f0-9]{12})\/feedback$/);
      if (feedbackMatch) {
        const payload = await readJson(request);
        const message = String(payload.message ?? '').trim();
        if (!message) {
          sendJson(response, 422, { detail: 'Geri bildirim mesajı boş olamaz.' });
          return;
        }
        sendJson(response, 202, await orchestrator.submitFeedback(feedbackMatch[1], message));
        return;
      }
      const artifactMatch = request.method === 'GET'
        && url.pathname.match(/^\/api\/projects\/([a-f0-9]{12})\/artifact$/);
      if (artifactMatch) {
        const project = database.getProject(artifactMatch[1]);
        if (!project?.artifact_path) { sendJson(response, 404, { detail: 'APK bulunamadı.' }); return; }
        const workspace = path.resolve(project.workspace_path);
        const artifact = path.resolve(project.artifact_path);
        const relative = path.relative(workspace, artifact);
        if (relative.startsWith('..') || path.isAbsolute(relative) || !fs.existsSync(artifact)) {
          sendJson(response, 404, { detail: 'APK bulunamadı.' }); return;
        }
        response.writeHead(200, {
          'content-type': 'application/vnd.android.package-archive',
          'content-disposition': `attachment; filename="${project.id}-app-debug.apk"`,
          'content-length': fs.statSync(artifact).size,
        });
        fs.createReadStream(artifact).pipe(response);
        return;
      }
      const taskRetryMatch = request.method === 'POST'
        && url.pathname.match(/^\/api\/projects\/([a-f0-9]{12})\/tasks\/([^/]+)\/retry$/);
      if (taskRetryMatch) {
        const projectId = taskRetryMatch[1];
        const taskId = decodeURIComponent(taskRetryMatch[2]);
        const task = database.getTask(taskId);
        if (!task || task.project_id !== projectId) {
          sendJson(response, 404, { detail: 'Görev bulunamadı.' });
          return;
        }
        sendJson(response, 202, await orchestrator.retryTask(projectId, taskId));
        return;
      }
      const match = request.method === 'GET' && url.pathname.match(/^\/api\/projects\/([a-f0-9]{12})$/);
      if (match) {
        const project = database.getProject(match[1]);
        if (!project) sendJson(response, 404, { detail: 'Proje bulunamadı.' });
        else sendJson(response, 200, {
          ...project,
          agent_runs: database.listAgentRuns(match[1]),
          tasks: database.listTasks(match[1]),
          events: database.listEvents(match[1], { limit: 400 }),
        });
        return;
      }
      sendJson(response, 404, { detail: 'Endpoint bulunamadı.' });
    } catch (error) { sendJson(response, 500, { detail: error.message }); }
  });
}

const server = createServer();
server.listen(config.port, config.host, () => {
  console.log(`AI MVP Studio: http://${config.host}:${config.port}`);
});

function shutdown() {
  server.close(() => { database.close(); process.exit(0); });
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
