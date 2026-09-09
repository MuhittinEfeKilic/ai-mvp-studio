import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { CodexRunner } from '../src/codex-runner.mjs';
import { config } from '../src/config.mjs';
import { Database } from '../src/database.mjs';
import { Orchestrator } from '../src/orchestrator.mjs';

/**
 * The reviewer verdict has to satisfy the same contract as a real review: JSON
 * only, every acceptance criterion answered exactly once, and no blocking issue
 * on a PASS. The criterion list is read from the contract file the orchestrator
 * wrote, so the fixture cannot drift away from it the way the previous
 * `'Local reviewer fixture: PASS.'` string did.
 */
function reviewerVerdict(workspace) {
  const filePath = path.join(workspace, 'ACCEPTANCE_CRITERIA.json');
  const criteria = fs.existsSync(filePath)
    ? JSON.parse(fs.readFileSync(filePath, 'utf8')).criteria ?? [] : [];
  return JSON.stringify({
    status: 'PASS',
    summary: 'Local reviewer fixture: checkpoint flow verified.',
    criteria: criteria.map(item => ({ id: item.id, status: 'PASS', evidence: 'index.html' })),
    issues: [],
    notes: [],
  });
}

class MinimalHybridRunner {
  constructor() {
    this.codex = new CodexRunner(config.codexCommand);
    this.builderAttempts = 0;
    this.realCalls = 0;
  }

  async run({ workspace, prompt, onEvent }) {
    if (prompt.includes('Produce only ARCHITECTURE.md')) {
      fs.writeFileSync(path.join(workspace, 'ARCHITECTURE.md'), '# Architecture\n\nOne static HTML file.\n');
      return 'Local architecture fixture completed.';
    }
    if (prompt.includes('Produce only UX_SPEC.md')) {
      fs.writeFileSync(path.join(workspace, 'UX_SPEC.md'), '# UX\n\nOne heading and one button.\n');
      return 'Local UX fixture completed.';
    }
    if (prompt.includes('Produce only TASK_PLAN.json')) {
      fs.writeFileSync(path.join(workspace, 'TASK_PLAN.json'), JSON.stringify({
        version: 1, profile: 'flutter_mobile', tasks: [{
          id: 'app-shell', title: 'App Shell', prompt: 'Create minimal HTML fixture.', depends_on: [],
          allowed_paths: ['index.html'], required_outputs: ['index.html'], acceptance_checks: [],
        }],
      }));
      return 'Local coordinator fixture completed.';
    }
    if (prompt.includes('Complete only task')) {
      this.builderAttempts += 1;
      if (this.builderAttempts === 1) {
        fs.writeFileSync(path.join(workspace, 'index.html'), '<!-- preserved partial state -->\n');
        throw new Error('maximum context window exceeded (simulated locally)');
      }
      this.realCalls += 1;
      return this.codex.run({
        workspace,
        onEvent,
        prompt: 'Create only index.html. It must contain valid minimal HTML, the heading "Checkpoint OK", and no external assets. Do not explain; make the file and finish.',
      });
    }
    assert.ok(fs.existsSync(path.join(workspace, 'index.html')));
    return /Review the complete Flutter/.test(prompt)
      ? reviewerVerdict(workspace)
      : 'Local integration fixture completed.';
  }
}

async function waitFor(database, id, expected) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    const project = database.getProject(id);
    if (expected.includes(project.status)) return project;
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  throw new Error(`Project did not reach ${expected.join('/')} in time.`);
}

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-mvp-minimal-live-'));
const database = new Database(path.join(directory, 'studio.db'));
const runner = new MinimalHybridRunner();
const orchestrator = new Orchestrator({
  database,
  runner,
  projectsDir: path.join(directory, 'projects'),
  maxConcurrentRuns: 1,
  flutterChecker: workspace => {
    const apk = path.join(workspace, 'build', 'app', 'outputs', 'flutter-apk', 'app-debug.apk');
    fs.mkdirSync(path.dirname(apk), { recursive: true }); fs.writeFileSync(apk, 'fixture');
    return { checks: { analyze: { status: 'PASS', exit_code: 0 }, test: { status: 'PASS', exit_code: 0 }, apk: { status: 'PASS', exit_code: 0, path: 'build/app/outputs/flutter-apk/app-debug.apk' } } };
  },
});

try {
  const project = orchestrator.createProject('Minimal Live Check', '# Minimal Live Check\n');
  const paused = await waitFor(database, project.id, ['paused_context', 'failed']);
  assert.equal(paused.status, 'paused_context', paused.error);
  const pausedTask = database.listTasks(project.id).find(task => task.status === 'paused_context');
  assert.ok(fs.existsSync(path.join(pausedTask.workspace_path, 'index.html')));

  orchestrator.resumeProject(project.id);
  const completed = await waitFor(database, project.id, ['awaiting_user_review', 'failed']);
  assert.equal(completed.status, 'awaiting_user_review', completed.error);
  orchestrator.acceptProject(project.id);
  assert.equal(runner.realCalls, 1);
  const html = fs.readFileSync(path.join(project.workspace_path, 'index.html'), 'utf8');
  assert.match(html, /Checkpoint OK/);

  const realRun = database.listAgentRuns(project.id)
    .find(run => run.role === 'flutter_builder' && run.status === 'completed');
  console.log(JSON.stringify({
    result: 'PASS',
    real_codex_calls: runner.realCalls,
    project_status: database.getProject(project.id).status,
    checkpoint_preserved: true,
    input_tokens: realRun?.input_tokens ?? 0,
    cached_input_tokens: realRun?.cached_input_tokens ?? 0,
    output_tokens: realRun?.output_tokens ?? 0,
    workspace: project.workspace_path,
  }, null, 2));
} finally {
  database.close();
}
