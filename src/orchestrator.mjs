import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { selectReadyTasks } from './task-scheduler.mjs';
import { readTaskPlan, writeProjectState } from './task-plan.mjs';
import { getGitChangedPaths, pathMatchesAllowedPattern, validateChangedPaths } from './task-worktree.mjs';
import { buildContextPackage } from './context-packager.mjs';
import { resolveAdb, runAndroidDeviceGate, writeDeviceReport } from './device-tester.mjs';
import {
  normalizeQualityReport, parseReviewerResult, renderQualityReportJson,
  renderQualityReportMarkdown, validateQualityReport,
} from './quality-report.mjs';
import { parseCriticalUserFlows, parseSpec } from './spec-validator.mjs';

function git(workspace, args, options = {}) {
  const result = spawnSync('git', args, {
    cwd: workspace,
    encoding: 'utf8',
    windowsHide: true,
    ...options,
  });
  if (result.status !== 0) {
    throw new Error(result.stderr?.trim() || result.stdout?.trim() || `git ${args[0]} başarısız.`);
  }
  return result.stdout.trim();
}

function gitChanged(workspace) {
  return Boolean(git(workspace, ['status', '--porcelain']));
}

function isPipelineGeneratedArtifact(filePath) {
  const normalized = String(filePath ?? '').replace(/\\/g, '/').replace(/^\.\//, '');
  return normalized.startsWith('build/') || /^TEST_REPORT\.(?:json|md)$/i.test(normalized);
}

function flutterCandidates() {
  const configured = String(process.env.FLUTTER_BIN || '').trim();
  const values = [];
  if (configured) {
    values.push(fs.existsSync(configured) && fs.statSync(configured).isDirectory()
      ? path.join(configured, 'bin', process.platform === 'win32' ? 'flutter.bat' : 'flutter')
      : configured);
  }
  if (process.platform === 'win32') values.push('C:\\flutter\\bin\\flutter.bat');
  values.push('flutter');
  return [...new Set(values)];
}

function runFlutter(executable, args, workspace) {
  const options = { cwd: workspace, encoding: 'utf8', windowsHide: true, timeout: 600_000 };
  if (process.platform === 'win32' && /\.(?:bat|cmd)$/i.test(executable)) {
    return spawnSync(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', executable, ...args], options);
  }
  return spawnSync(executable, args, options);
}

function resolveFlutter(workspace) {
  for (const candidate of flutterCandidates()) {
    const result = runFlutter(candidate, ['--version'], workspace);
    if (result.status === 0) return candidate;
  }
  return null;
}

function commandDetails(result) {
  return [result.stdout, result.stderr, result.error?.message]
    .filter(Boolean).join('\n').trim().slice(-8000);
}

function fullCommandOutput(result) {
  return [result.stdout, result.stderr, result.error?.message]
    .filter(Boolean).join('\n').trim();
}

export function qualityFailureSignature(report) {
  const failures = ['analyze', 'test', 'apk'].map(name => {
    const check = report.checks?.[name] || {};
    const diagnostics = String(check.details || '')
      .replaceAll('\\', '/')
      .replace(/\b\d+(?:\.\d+)?s\b/g, '<time>')
      .replace(/\b\d{2}:\d{2}(?::\d{2})?\b/g, '<clock>')
      .split(/\r?\n/)
      .filter(line => /error|failed|exception|undefined|expected|actual|\[e\]/i.test(line))
      .slice(-40)
      .join('\n');
    return `${name}:${check.status}:${check.exit_code}:${diagnostics}`;
  });
  return crypto.createHash('sha256').update(failures.join('\n')).digest('hex').slice(0, 16);
}

const PROJECT_GITIGNORE = [
  '.dart_tool/', '.flutter-plugins-dependencies', '.tool_state/', '.tool_state_local/',
  'build/', 'QUALITY_LOGS/', 'ROOT_CAUSE_REPORT.md', 'android/.gradle/', 'android/local.properties',
];

export function ensureProjectGitignore(workspace) {
  const filePath = path.join(workspace, '.gitignore');
  const existing = fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : '';
  const lines = new Set(existing.split(/\r?\n/).map(line => line.trim()).filter(Boolean));
  for (const pattern of PROJECT_GITIGNORE) lines.add(pattern);
  fs.writeFileSync(filePath, `${[...lines].join('\n')}\n`, 'utf8');
}

function branchAhead(workspace, branch) {
  return Boolean(git(workspace, ['log', '--oneline', `main..${branch}`]));
}

function classifyInterruption(message) {
  if (/context window|maximum context|context length/i.test(message)) return 'context';
  if (/usage limit|rate limit|quota|too many requests|429/i.test(message)) return 'usage';
  return null;
}

class PauseError extends Error {
  constructor(kind, message) {
    super(message);
    this.kind = kind;
  }
}

class DeviceWaitError extends Error {}

const taskId = (projectId, key) => `${projectId}:${key}`;

export class Orchestrator {
  constructor({ database, runner, projectsDir, maxConcurrentRuns = 2, flutterChecker = null, deviceTester = null }) {
    this.database = database;
    this.runner = runner;
    this.projectsDir = projectsDir;
    this.maxConcurrentRuns = maxConcurrentRuns;
    this.flutterChecker = flutterChecker;
    this.deviceTester = deviceTester;
    this.activeRuns = 0;
    this.queue = [];
  }

  createProject(name, specContent) {
    const id = crypto.randomBytes(6).toString('hex');
    const projectRoot = path.join(this.projectsDir, id);
    const workspace = path.join(projectRoot, 'repository');
    fs.mkdirSync(workspace, { recursive: true });
    git(workspace, ['init', '--initial-branch=main']);
    git(workspace, ['config', 'user.name', 'AI MVP Studio']);
    git(workspace, ['config', 'user.email', 'studio@localhost']);
    fs.writeFileSync(path.join(workspace, 'PROJECT_SPEC.md'), specContent, 'utf8');
    const criticalFlows = parseCriticalUserFlows(specContent);
    if (criticalFlows.length) {
      fs.writeFileSync(path.join(workspace, 'USER_FLOWS.json'), `${JSON.stringify({
        version: 1, profile: 'flutter_mobile', flows: criticalFlows,
      }, null, 2)}\n`, 'utf8');
    }
    ensureProjectGitignore(workspace);
    git(workspace, ['add', 'PROJECT_SPEC.md', '.gitignore']);
    if (criticalFlows.length) git(workspace, ['add', 'USER_FLOWS.json']);
    git(workspace, ['commit', '-m', 'docs: add approved project specification']);

    const project = {
      id, name, prompt: specContent, status: 'queued', workspace_path: workspace,
      project_profile: 'flutter_mobile',
    };
    this.database.createProject(project);
    this.database.createTasks([
      { id: taskId(id, 'architecture'), project_id: id, name: 'Mobile Architecture', role: 'architecture', allowed_paths: ['ARCHITECTURE.md'] },
      { id: taskId(id, 'ux'), project_id: id, name: 'Mobile UX', role: 'ux', allowed_paths: ['UX_SPEC.md'] },
      { id: taskId(id, 'coordinator'), project_id: id, name: 'Mobile Coordinator', role: 'coordinator', allowed_paths: ['TASK_PLAN.json'], depends_on: [taskId(id, 'architecture'), taskId(id, 'ux')] },
    ]);
    this.#syncProjectState(id, workspace);
    fs.appendFileSync(path.join(workspace, '.git', 'info', 'exclude'), '\nPROJECT_STATE.json\n', 'utf8');
    this.queue.push({ id, projectRoot, workspace });
    this.#drainQueue();
    return project;
  }

  resumeProject(id) {
    const project = this.database.getProject(id);
    if (!project) throw new Error('Proje bulunamadı.');
    if (!['paused_context', 'paused_usage', 'interrupted', 'failed', 'awaiting_device_test'].includes(project.status)) {
      throw new Error(`Bu proje ${project.status} durumundayken devam ettirilemez.`);
    }
    this.database.updateProject(id, { status: 'queued', error: null });
    for (const task of this.database.listTasks(id)) {
      if (['ready', 'running', 'validating', 'paused_context', 'paused_usage', 'interrupted', 'failed'].includes(task.status)) {
        this.database.updateTask(task.id, { status: 'pending', error: null });
      }
    }
    this.#syncProjectState(id, project.workspace_path);
    this.queue.push({ id, projectRoot: path.dirname(project.workspace_path), workspace: project.workspace_path });
    this.#drainQueue();
    return this.database.getProject(id);
  }

  retryTask(projectId, requestedTaskId) {
    const project = this.database.getProject(projectId);
    const task = this.database.getTask(requestedTaskId);
    if (!project || !task || task.project_id !== projectId) throw new Error('Görev bulunamadı.');
    if (!['failed', 'paused_context', 'paused_usage', 'interrupted'].includes(task.status)) {
      throw new Error(`Bu görev ${task.status} durumundayken yeniden çalıştırılamaz.`);
    }
    this.database.updateTask(task.id, { status: 'pending', error: null });
    this.database.updateProject(projectId, { status: 'queued', error: null });
    this.queue.push({
      id: projectId, projectRoot: path.dirname(project.workspace_path), workspace: project.workspace_path,
    });
    this.#syncProjectState(projectId, project.workspace_path);
    this.#drainQueue();
    return this.database.getTask(task.id);
  }

  acceptProject(id) {
    const project = this.database.getProject(id);
    if (!project) throw new Error('Proje bulunamadı.');
    if (project.status !== 'awaiting_user_review') {
      throw new Error(`Bu proje ${project.status} durumundayken onaylanamaz.`);
    }
    this.database.updateProject(id, {
      status: 'accepted', accepted_at: new Date().toISOString(), error: null,
    });
    this.#syncProjectState(id, project.workspace_path);
    return this.database.getProject(id);
  }

  submitFeedback(id, message) {
    const project = this.database.getProject(id);
    if (!project) throw new Error('Proje bulunamadı.');
    if (!['awaiting_user_review', 'accepted'].includes(project.status)) {
      throw new Error(`Bu proje ${project.status} durumundayken geri bildirim alamaz.`);
    }
    const feedback = String(message || '').trim();
    if (feedback.length < 3 || feedback.length > 4000) throw new Error('Geri bildirim 3–4000 karakter olmalı.');
    const reviewerId = taskId(id, 'reviewer');
    const repairId = taskId(id, 'repair');
    this.database.updateTask(repairId, { status: 'pending', error: null });
    this.database.updateTask(reviewerId, { status: 'failed', error: 'Kullanıcı geri bildirimi bekliyor.' });
    this.database.updateProject(id, {
      status: 'queued', user_feedback: feedback, error: null, accepted_at: null,
    });
    this.queue.push({
      id, projectRoot: path.dirname(project.workspace_path), workspace: project.workspace_path,
      feedbackRepair: true,
    });
    this.#syncProjectState(id, project.workspace_path);
    this.#drainQueue();
    return this.database.getProject(id);
  }

  #drainQueue() {
    while (this.activeRuns < this.maxConcurrentRuns && this.queue.length) {
      const job = this.queue.shift();
      this.activeRuns += 1;
      this.#execute(job).finally(() => {
        this.activeRuns -= 1;
        this.#drainQueue();
      });
    }
  }

  #syncProjectState(projectId, workspace) {
    writeProjectState(workspace, this.database.getProject(projectId), this.database.listTasks(projectId));
  }

  #readyTasks(projectId, keys, capacity) {
    const tasks = this.database.listTasks(projectId);
    const expected = new Set(keys.map(key => taskId(projectId, key))
      .filter(id => tasks.find(task => task.id === id)?.status !== 'completed'));
    if (!expected.size) return [];
    const selected = selectReadyTasks(tasks, { capacity })
      .filter(task => expected.has(task.id));
    if (selected.length !== expected.size) {
      throw new Error(`Görev bağımlılıkları hazır değil: ${keys.join(', ')}`);
    }
    return selected;
  }

  async #runAgent({ projectId, taskKey, agentName, role, workspace, prompt }) {
    const currentTaskId = taskKey.includes(':') ? taskKey : taskId(projectId, taskKey);
    const runId = this.database.createAgentRun(projectId, agentName, role, workspace);
    const checkpointCommit = git(workspace, ['rev-parse', 'HEAD']);
    const currentTask = this.database.getTask(currentTaskId);
    const contextPackage = buildContextPackage({
      workspace, role, task: currentTask, baseRef: role === 'architecture' || role === 'ux' ? null : checkpointCommit,
    });
    const packagedPrompt = `${prompt}\n\n${contextPackage.prompt}`;
    this.database.updateTask(currentTaskId, {
      status: 'running', workspace_path: workspace, checkpoint_commit: checkpointCommit,
      attempt_count: (currentTask?.attempt_count || 0) + 1,
      started_at: new Date().toISOString(), error: null,
    });
    this.#syncProjectState(projectId, this.database.getProject(projectId).workspace_path);
    this.database.updateAgentRun(runId, {
      status: 'running', started_at: new Date().toISOString(), checkpoint_commit: checkpointCommit,
      context_chars: contextPackage.prompt.length,
      context_manifest: JSON.stringify(contextPackage.manifest),
    });
    const onEvent = (type, payload) => {
      this.database.addEvent(projectId, type, { agent: agentName, role, ...payload });
      if (type === 'thread.started' && payload.thread_id) {
        this.database.updateAgentRun(runId, { thread_id: payload.thread_id });
      }
      if (type === 'turn.completed' && payload.usage) {
        this.database.updateAgentRun(runId, {
          input_tokens: payload.usage.input_tokens || 0,
          cached_input_tokens: payload.usage.cached_input_tokens || 0,
          output_tokens: payload.usage.output_tokens || 0,
        });
      }
    };
    try {
      this.database.addEvent(projectId, 'context.packaged', {
        agent: agentName, role, chars: contextPackage.prompt.length, manifest: contextPackage.manifest,
      });
      const finalMessage = await this.runner.run({ workspace, prompt: packagedPrompt, onEvent });
      this.database.updateAgentRun(runId, {
        status: 'completed', final_message: finalMessage, completed_at: new Date().toISOString(),
      });
      this.database.updateTask(currentTaskId, {
        status: 'validating', final_message: finalMessage,
      });
      this.#syncProjectState(projectId, this.database.getProject(projectId).workspace_path);
      return finalMessage;
    } catch (error) {
      const interruption = classifyInterruption(error.message);
      this.database.updateAgentRun(runId, {
        status: interruption ? `paused_${interruption}` : 'failed',
        pause_reason: interruption,
        error: error.message,
        completed_at: new Date().toISOString(),
      });
      this.database.updateTask(currentTaskId, {
        status: interruption ? `paused_${interruption}` : 'failed',
        error: error.message, completed_at: new Date().toISOString(),
      });
      this.#syncProjectState(projectId, this.database.getProject(projectId).workspace_path);
      if (interruption) throw new PauseError(interruption, `${agentName}: ${error.message}`);
      throw new Error(`${agentName}: ${error.message}`);
    }
  }

  #completeTask(projectId, key, workspace, finalMessage = null) {
    const id = key.includes(':') ? key : taskId(projectId, key);
    this.database.updateTask(id, {
      status: 'completed', checkpoint_commit: git(workspace, ['rev-parse', 'HEAD']),
      final_message: finalMessage, completed_at: new Date().toISOString(), error: null,
    });
    this.#syncProjectState(projectId, this.database.getProject(projectId).workspace_path);
  }

  #createWorktree(mainWorkspace, projectRoot, name) {
    const worktree = path.join(projectRoot, 'worktrees', name);
    if (fs.existsSync(path.join(worktree, '.git'))) return worktree;
    fs.mkdirSync(path.dirname(worktree), { recursive: true });
    const branch = `agent/${name}`;
    const exists = spawnSync('git', ['show-ref', '--verify', '--quiet', `refs/heads/${branch}`], {
      cwd: mainWorkspace, windowsHide: true,
    }).status === 0;
    git(mainWorkspace, exists
      ? ['worktree', 'add', worktree, branch]
      : ['worktree', 'add', '-b', branch, worktree, 'main']);
    return worktree;
  }

  #commitArtifact(workspace, artifact, message) {
    if (!fs.existsSync(path.join(workspace, artifact))) {
      throw new Error(`${artifact} agent tarafından oluşturulmadı.`);
    }
    const unexpected = git(workspace, ['status', '--short'])
      .split(/\r?\n/)
      .filter(Boolean)
      .filter(line => !line.endsWith(artifact));
    if (unexpected.length) {
      throw new Error(`Agent izin verilmeyen dosyaları değiştirdi: ${unexpected.join(', ')}`);
    }
    if (!gitChanged(workspace)) return;
    git(workspace, ['add', artifact]);
    git(workspace, ['commit', '-m', message]);
  }

  #materializeBuildGraph(projectId, workspace) {
    const existing = this.database.listTasks(projectId);
    if (existing.some(task => task.role === 'flutter_builder')) return;
    const project = this.database.getProject(projectId);
    const maxTasks = project.prompt.length < 15_000 ? 3 : 5;
    const plan = readTaskPlan(workspace, { maxTasks });
    const builders = plan.tasks.map(task => ({
      id: taskId(projectId, task.id), project_id: projectId, name: task.title,
      role: 'flutter_builder', status: 'pending', allowed_paths: task.allowed_paths,
      required_outputs: task.required_outputs, acceptance_checks: task.acceptance_checks,
      prompt: task.prompt, priority: task.priority,
      depends_on: task.depends_on.map(key => taskId(projectId, key)),
    }));
    const builderIds = builders.map(task => task.id);
    this.database.createTasks([
      ...builders,
      { id: taskId(projectId, 'integration'), project_id: projectId, name: 'Flutter Integration', role: 'integration', allowed_paths: ['**'], depends_on: builderIds },
      { id: taskId(projectId, 'test'), project_id: projectId, name: 'Flutter Test', role: 'test', allowed_paths: ['TEST_REPORT.md'], depends_on: [taskId(projectId, 'integration')] },
      { id: taskId(projectId, 'repair'), project_id: projectId, name: 'Conditional Repair', role: 'repair', allowed_paths: ['**'], depends_on: [taskId(projectId, 'test')] },
      { id: taskId(projectId, 'reviewer'), project_id: projectId, name: 'Mobile Reviewer', role: 'reviewer', allowed_paths: ['**'], depends_on: [taskId(projectId, 'repair')] },
    ]);
    this.#syncProjectState(projectId, workspace);
  }

  async #runBuilderTask(projectId, projectRoot, mainWorkspace, task) {
    const key = task.id.slice(projectId.length + 1);
    const worktreeName = `task-${key}`;
    const taskWorkspace = this.#createWorktree(mainWorkspace, projectRoot, worktreeName);
    const branch = `agent/${worktreeName}`;
    this.database.updateTask(task.id, { workspace_path: taskWorkspace, branch_name: branch });
    try {
      await this.#runAgent({
        projectId, taskKey: task.id, agentName: `Flutter Builder: ${task.name}`,
        role: 'flutter_builder', workspace: taskWorkspace,
        prompt: `Read PROJECT_SPEC.md, ARCHITECTURE.md, UX_SPEC.md and TASK_PLAN.json. Complete only task "${task.name}". ${task.prompt}\nYou may modify only these paths: ${task.allowed_paths.join(', ')}. Required outputs: ${task.required_outputs.join(', ') || 'as specified'}. Do not edit planning documents or other task areas. Do not run flutter, dart, pub or Gradle commands; the orchestrator runs toolchain checks after integration. Perform only file-level or static task acceptance checks: ${task.acceptance_checks.join(', ') || 'relevant focused checks'}.`,
      });
      const changed = getGitChangedPaths(taskWorkspace);
      const report = validateChangedPaths(changed, task.allowed_paths);
      if (!report.ok) throw new Error(`${task.name} path ihlali: ${report.violations.join(', ')}`);
      const requiredFileOutputs = task.required_outputs.filter(output =>
        !isPipelineGeneratedArtifact(output)
        && task.allowed_paths.some(pattern => pathMatchesAllowedPattern(output, pattern)));
      for (const output of requiredFileOutputs) {
        if (!fs.existsSync(path.join(taskWorkspace, output))) throw new Error(`${task.name} çıktısı eksik: ${output}`);
      }
      git(taskWorkspace, ['add', '-A']);
      if (gitChanged(taskWorkspace)) git(taskWorkspace, ['commit', '-m', `feat: complete ${key}`]);
      this.#completeTask(projectId, task.id, taskWorkspace);
      return { ...this.database.getTask(task.id), branch_name: branch };
    } catch (error) {
      const current = this.database.getTask(task.id);
      if (current && ['ready', 'running', 'validating'].includes(current.status)) {
        this.database.updateTask(task.id, { status: 'failed', error: error.message });
        this.#syncProjectState(projectId, mainWorkspace);
      }
      throw error;
    }
  }

  async #runBuilderGraph(projectId, projectRoot, workspace) {
    while (true) {
      const builders = this.database.listTasks(projectId).filter(task => task.role === 'flutter_builder');
      const incomplete = builders.filter(task => task.status !== 'completed');
      if (!incomplete.length) return;
      const selected = selectReadyTasks(this.database.listTasks(projectId), {
        capacity: Math.min(3, this.maxConcurrentRuns),
      }).filter(task => task.role === 'flutter_builder');
      if (!selected.length) throw new Error('Builder görev grafiği ilerleyemiyor; bağımlılık veya path çakışması var.');
      const completed = await Promise.all(selected.map(task => this.#runBuilderTask(
        projectId, projectRoot, workspace, task,
      )));
      for (const task of completed.sort((a, b) => a.id.localeCompare(b.id, 'en'))) {
        if (task.branch_name && branchAhead(workspace, task.branch_name)) {
          git(workspace, ['merge', '--no-edit', task.branch_name]);
        }
      }
    }
  }

  #runFlutterPreflight(projectId, workspace) {
    const flutter = resolveFlutter(workspace);
    const androidSdk = [
      process.env.ANDROID_HOME,
      process.env.ANDROID_SDK_ROOT,
      process.platform === 'win32' && process.env.LOCALAPPDATA
        ? path.join(process.env.LOCALAPPDATA, 'Android', 'Sdk') : null,
    ].filter(Boolean).find(candidate => fs.existsSync(candidate));
    const report = {
      generated_at: new Date().toISOString(),
      flutter: { status: flutter ? 'PASS' : 'FAIL', executable: flutter },
      android_sdk: { status: androidSdk ? 'PASS' : 'FAIL', path: androidSdk || null },
    };
    if (flutter) {
      const version = runFlutter(flutter, ['--version'], workspace);
      report.flutter.version = fullCommandOutput(version).split(/\r?\n/)[0] || null;
      report.flutter.status = version.status === 0 ? 'PASS' : 'FAIL';
      report.flutter.details = commandDetails(version);
    }
    report.status = report.flutter.status === 'PASS' && report.android_sdk.status === 'PASS'
      ? 'PASS' : 'FAIL';
    const logDir = path.join(workspace, 'QUALITY_LOGS');
    fs.mkdirSync(logDir, { recursive: true });
    fs.writeFileSync(path.join(logDir, 'PREFLIGHT.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    this.database.addEvent(projectId, 'preflight.completed', report);
    if (report.status !== 'PASS') {
      throw new Error(`Flutter/Android preflight başarısız: ${JSON.stringify(report)}`);
    }
    return report;
  }

  #runLocalFlutterChecks(workspace) {
    if (this.flutterChecker) return this.flutterChecker(workspace);
    const skipped = details => ({ checks: {
      analyze: { status: 'SKIPPED', details }, test: { status: 'SKIPPED', details },
      apk: { status: 'SKIPPED', details, path: null },
    } });
    if (!fs.existsSync(path.join(workspace, 'pubspec.yaml'))) return skipped('pubspec.yaml yok.');
    const flutter = resolveFlutter(workspace);
    if (!flutter) return skipped('Flutter SDK bulunamadı. FLUTTER_BIN veya PATH ayarını kontrol edin.');
    const checks = {};
    const logs = {};
    const dependencyResult = runFlutter(flutter, ['pub', 'get'], workspace);
    logs.pub_get = fullCommandOutput(dependencyResult);
    if (dependencyResult.status !== 0) {
      const details = commandDetails(dependencyResult);
      checks.analyze = {
        status: 'FAIL', command: 'flutter pub get', exit_code: dependencyResult.status, details,
      };
      checks.test = { status: 'SKIPPED', details: 'Bağımlılık çözümleme başarısız olduğu için çalıştırılmadı.' };
      checks.apk = { status: 'SKIPPED', details: 'Bağımlılık çözümleme başarısız olduğu için çalıştırılmadı.', path: null };
      return { profile: 'flutter_mobile', checks, logs };
    }
    for (const [name, args] of [['analyze', ['analyze']], ['test', ['test']], ['apk', ['build', 'apk', '--debug']]]) {
      const result = runFlutter(flutter, args, workspace);
      logs[name] = fullCommandOutput(result);
      checks[name] = {
        status: result.status === 0 ? 'PASS' : 'FAIL', command: `flutter ${args.join(' ')}`,
        exit_code: result.status,
        details: `Tam log: QUALITY_LOGS/${name}.log\n${commandDetails(result)}`,
      };
      if (name === 'apk') checks[name].path = 'build/app/outputs/flutter-apk/app-debug.apk';
      if (result.status !== 0) break;
    }
    for (const name of ['analyze', 'test', 'apk']) {
      if (!checks[name]) checks[name] = { status: 'SKIPPED', details: 'Önceki kontrol başarısız olduğu için çalıştırılmadı.' };
    }
    return { profile: 'flutter_mobile', checks, logs };
  }

  #writeQualityReports(workspace, rawReport, message) {
    const logDir = path.join(workspace, 'QUALITY_LOGS');
    fs.mkdirSync(logDir, { recursive: true });
    for (const [name, output] of Object.entries(rawReport.logs || {})) {
      fs.writeFileSync(path.join(logDir, `${name}.log`), `${output || '(çıktı yok)'}\n`, 'utf8');
    }
    const report = normalizeQualityReport(rawReport);
    fs.writeFileSync(path.join(workspace, 'TEST_REPORT.json'), renderQualityReportJson(report), 'utf8');
    fs.writeFileSync(path.join(workspace, 'TEST_REPORT.md'), renderQualityReportMarkdown(report), 'utf8');
    git(workspace, ['add', 'TEST_REPORT.json', 'TEST_REPORT.md']);
    if (gitChanged(workspace)) git(workspace, ['commit', '-m', message]);
    return report;
  }

  #writeRootCauseReport(workspace, { attempts, signature, report }) {
    const failures = ['analyze', 'test', 'apk']
      .map(name => `## ${name}\n\nDurum: ${report.checks[name].status}\n\n${report.checks[name].details || 'Detay yok.'}`)
      .join('\n\n');
    const body = [
      '# Pipeline Kök Neden Raporu', '',
      `Repair turu: ${attempts}`, `Hata imzası: \`${signature}\``, '',
      'Aynı kalite hatası iki ardışık kontrolde değişmeden kaldığı için otomatik döngü durduruldu.', '',
      failures, '', 'Tam komut çıktıları `QUALITY_LOGS/` dizinindedir.', '',
    ].join('\n');
    fs.writeFileSync(path.join(workspace, 'ROOT_CAUSE_REPORT.md'), body, 'utf8');
    return body;
  }

  #runDeviceGate(projectId, workspace, verifiedReport) {
    const project = this.database.getProject(projectId);
    const flowsPath = path.join(workspace, 'USER_FLOWS.json');
    const flows = fs.existsSync(flowsPath)
      ? JSON.parse(fs.readFileSync(flowsPath, 'utf8')).flows || [] : [];
    const packageName = parseSpec(project.prompt).metadata.package_name;
    const apkPath = path.resolve(workspace, verifiedReport.checks.apk.path);
    const report = this.deviceTester
      ? this.deviceTester({ workspace, apkPath, packageName, flows })
      : runAndroidDeviceGate({
        workspace, apkPath, packageName, flows,
        flutterExecutable: resolveFlutter(workspace), adbExecutable: resolveAdb(),
      });
    writeDeviceReport(workspace, report);
    this.database.updateProject(projectId, { device_report: JSON.stringify(report) });
    this.database.addEvent(projectId, 'device_test.completed', report);
    if (report.status === 'WAITING') throw new DeviceWaitError(report.reason);
    if (report.status !== 'PASS') {
      throw new Error(`Android cihaz kalite kapısı geçilemedi: ${report.checks?.flow_coverage?.details || 'DEVICE_REPORT.json dosyasını inceleyin.'}`);
    }
    return report;
  }

  async #executeFeedbackRepair({ id, workspace }) {
    const project = this.database.getProject(id);
    try {
      this.database.updateProject(id, { status: 'building', error: null });
      await this.#runAgent({
        projectId: id, taskKey: 'repair', agentName: 'Feedback Repair Agent', role: 'repair', workspace,
        prompt: `Apply only this approved user feedback: ${project.user_feedback}. Keep PROJECT_SPEC.md and planning documents unchanged. Do not run flutter, dart, pub or Gradle commands; the orchestrator runs all checks. Do not expand scope.`,
      });
      git(workspace, ['add', '-A']);
      if (gitChanged(workspace)) git(workspace, ['commit', '-m', 'fix: apply user review feedback']);
      const report = this.#writeQualityReports(
        workspace, this.#runLocalFlutterChecks(workspace), 'test: verify user feedback repair',
      );
      const verified = validateQualityReport(report, { workspace });
      this.#completeTask(id, 'repair', workspace, 'Kullanıcı geri bildirimi uygulandı ve doğrulandı.');

      this.database.updateTask(taskId(id, 'reviewer'), { status: 'pending', error: null });
      const reviewerMessage = await this.#runAgent({
        projectId: id, taskKey: 'reviewer', agentName: 'Mobile Reviewer Agent', role: 'reviewer', workspace,
        prompt: `Review the user-feedback repair against PROJECT_SPEC.md and TEST_REPORT.json without modifying files. Final response JSON only: {"status":"PASS"|"FAIL","summary":"...","issues":[]}.`,
      });
      const reviewerResult = parseReviewerResult(reviewerMessage);
      if (reviewerResult.status !== 'PASS') throw new Error('Feedback sonrası reviewer kalite kapısını geçemedi.');
      this.#completeTask(id, 'reviewer', workspace, reviewerMessage);
      this.database.updateProject(id, {
        status: 'awaiting_user_review', final_message: reviewerResult.summary,
        quality_report: JSON.stringify(verified), artifact_path: path.join(workspace, verified.checks.apk.path),
        error: null,
      });
      this.#syncProjectState(id, workspace);
    } catch (error) {
      this.database.updateProject(id, { status: 'failed', error: error.message });
    }
  }

  async #execute({ id, projectRoot, workspace, feedbackRepair = false }) {
    if (feedbackRepair) return this.#executeFeedbackRepair({ id, workspace });
    this.database.updateProject(id, { status: 'planning', error: null });
    try {
      ensureProjectGitignore(workspace);
      if (!this.flutterChecker) this.#runFlutterPreflight(id, workspace);
      const architectureWorkspace = this.#createWorktree(workspace, projectRoot, 'architecture');
      const uxWorkspace = this.#createWorktree(workspace, projectRoot, 'ux');

      this.#readyTasks(id, ['architecture', 'ux'], 2);

      await Promise.all([
        fs.existsSync(path.join(architectureWorkspace, 'ARCHITECTURE.md')) && !gitChanged(architectureWorkspace)
          ? Promise.resolve()
          : this.#runAgent({
          projectId: id,
          taskKey: 'architecture',
          agentName: 'Architecture Agent',
          role: 'architecture',
          workspace: architectureWorkspace,
          prompt: `Read PROJECT_SPEC.md and USER_FLOWS.json when present. Produce only ARCHITECTURE.md. Define the minimal architecture, file structure, data model, cross-feature ID/reference contracts, implementation order, integration-test strategy for every critical user flow, local run commands, risks, and explicit scope boundaries. Do not create or edit any other file. Do not implement the application.`,
        }).then(() => {
          this.#commitArtifact(architectureWorkspace, 'ARCHITECTURE.md', 'docs: add architecture plan');
          this.#completeTask(id, 'architecture', architectureWorkspace);
        }),
        fs.existsSync(path.join(uxWorkspace, 'UX_SPEC.md')) && !gitChanged(uxWorkspace)
          ? Promise.resolve()
          : this.#runAgent({
          projectId: id,
          taskKey: 'ux',
          agentName: 'UX Agent',
          role: 'ux',
          workspace: uxWorkspace,
          prompt: `Read PROJECT_SPEC.md and USER_FLOWS.json when present. Produce only UX_SPEC.md. Define screens, states, interactions, responsive behavior, visual direction, accessibility requirements, copy guidance, and a UI acceptance checklist. For every cross-feature reference, specify whether the user selects an existing entity or enters free text; never present database IDs as text fields. Do not create or edit any other file. Do not implement the application.`,
        }).then(() => {
          this.#commitArtifact(uxWorkspace, 'UX_SPEC.md', 'docs: add UX plan');
          this.#completeTask(id, 'ux', uxWorkspace);
        }),
      ]);

      if (this.database.getTask(taskId(id, 'architecture')).status !== 'completed') {
        this.#completeTask(id, 'architecture', architectureWorkspace);
      }
      if (this.database.getTask(taskId(id, 'ux')).status !== 'completed') {
        this.#completeTask(id, 'ux', uxWorkspace);
      }

      if (branchAhead(workspace, 'agent/architecture')) git(workspace, ['merge', '--no-edit', 'agent/architecture']);
      if (branchAhead(workspace, 'agent/ux')) git(workspace, ['merge', '--no-edit', 'agent/ux']);

      this.#readyTasks(id, ['coordinator'], 1);
      if (!fs.existsSync(path.join(workspace, 'TASK_PLAN.json'))) {
        await this.#runAgent({
          projectId: id, taskKey: 'coordinator', agentName: 'Coordinator Agent', role: 'coordinator', workspace,
          prompt: `Read PROJECT_SPEC.md, USER_FLOWS.json, ARCHITECTURE.md and UX_SPEC.md. Produce only TASK_PLAN.json with {"version":1,"profile":"flutter_mobile","tasks":[]}. Create 2 to 4 coarse, safely parallel Flutter implementation tasks; do not over-split the MVP. Every task needs a lowercase kebab-case id, title, prompt, depends_on, allowed_paths, required_outputs, acceptance_checks and priority. Assign every USER_FLOWS.json flow to a builder and require an integration_test/<flow-name>_test.dart output that exercises the real feature boundaries and persistent data path. Verify foreign-key/reference fields are supplied by entity selection, not free text. required_outputs must contain repository-relative source or test file paths only. Never assign build/**, APK files, TEST_REPORT.json or TEST_REPORT.md to builder tasks; the integration quality gate produces those after every builder branch is merged. Paths must not overlap between parallel tasks. Reserve shared files such as pubspec.yaml and lib/main.dart for the app-shell task. Do not implement code.`,
        });
        this.#commitArtifact(workspace, 'TASK_PLAN.json', 'docs: add coordinated task plan');
      }
      this.#completeTask(id, 'coordinator', workspace);
      this.#materializeBuildGraph(id, workspace);

      this.database.updateProject(id, { status: 'building' });
      await this.#runBuilderGraph(id, projectRoot, workspace);

      this.#readyTasks(id, ['integration'], 1);
      await this.#runAgent({
        projectId: id, taskKey: 'integration', agentName: 'Integration Agent', role: 'integration', workspace,
        prompt: `Inspect the merged Flutter task branches against PROJECT_SPEC.md, USER_FLOWS.json and TASK_PLAN.json. Resolve only concrete integration issues, including cross-feature ID/reference contracts and missing integration tests for critical flows. Keep planning documents unchanged and ensure the project structure is coherent. Do not run flutter, dart, pub or Gradle commands; the orchestrator runs all toolchain checks outside the agent sandbox. Do not expand scope or deploy.`,
      });
      git(workspace, ['add', '-A']);
      if (gitChanged(workspace)) git(workspace, ['commit', '-m', 'chore: integrate parallel Flutter tasks']);
      this.#completeTask(id, 'integration', workspace);

      this.database.updateProject(id, { status: 'testing' });
      this.#readyTasks(id, ['test'], 1);
      let checkReport = this.#writeQualityReports(
        workspace, this.#runLocalFlutterChecks(workspace), 'test: add structured Flutter quality report',
      );
      this.#completeTask(id, 'test', workspace, JSON.stringify(checkReport));

      this.#readyTasks(id, ['repair'], 1);
      let repairAttempts = 0;
      let previousFailureSignature = null;
      let repeatedFailureCount = 0;
      while (checkReport.status !== 'PASS' && repairAttempts < 3) {
        const signature = qualityFailureSignature(checkReport);
        repeatedFailureCount = signature === previousFailureSignature ? repeatedFailureCount + 1 : 1;
        if (repeatedFailureCount >= 2) {
          this.#writeRootCauseReport(workspace, {
            attempts: repairAttempts, signature, report: checkReport,
          });
          this.database.updateTask(taskId(id, 'repair'), {
            status: 'failed',
            error: `Aynı kalite hatası tekrarlandı (${signature}). ROOT_CAUSE_REPORT.md oluşturuldu.`,
          });
          throw new Error(`Repair döngüsü aynı hata nedeniyle durduruldu (${signature}).`);
        }
        previousFailureSignature = signature;
        repairAttempts += 1;
        this.database.updateTask(taskId(id, 'repair'), { status: 'pending', error: null });
        await this.#runAgent({
          projectId: id, taskKey: 'repair', agentName: 'Repair Agent', role: 'repair', workspace,
          prompt: `Repair turu ${repairAttempts}/3. Read TEST_REPORT.md and the referenced QUALITY_LOGS files. Fix only the reported Flutter analyze/test/build failures. Do not run flutter, dart, pub or Gradle commands; the orchestrator re-runs all checks after your changes. Do not expand scope or change planning documents. Previous failure signature: ${signature}.`,
        });
        git(workspace, ['add', '-A']);
        if (gitChanged(workspace)) git(workspace, ['commit', '-m', 'fix: repair Flutter test failures']);
        checkReport = this.#writeQualityReports(
          workspace, this.#runLocalFlutterChecks(workspace), 'test: verify repaired Flutter project',
        );
      }
      if (checkReport.status !== 'PASS') {
        const signature = qualityFailureSignature(checkReport);
        this.#writeRootCauseReport(workspace, { attempts: repairAttempts, signature, report: checkReport });
        this.database.updateTask(taskId(id, 'repair'), {
          status: 'failed', error: 'Üç repair turu sonunda kalite kapısı PASS değil.',
        });
        throw new Error('Üç repair turu sonunda Flutter kalite kapısı geçilemedi.');
      }
      const verifiedReport = validateQualityReport(checkReport, { workspace });
      this.#completeTask(id, 'repair', workspace, checkReport.status === 'PASS' ? 'Kalite kapısı geçti.' : 'Repair completed.');

      this.database.updateProject(id, {
        status: 'technically_verified', quality_report: JSON.stringify(verifiedReport),
        artifact_path: path.join(workspace, verifiedReport.checks.apk.path),
      });
      if (!this.flutterChecker || this.deviceTester) {
        this.database.updateProject(id, { status: 'device_testing' });
        this.#runDeviceGate(id, workspace, verifiedReport);
        this.database.updateProject(id, { status: 'device_test_passed' });
      }

      this.database.updateProject(id, { status: 'reviewing' });
      this.#readyTasks(id, ['reviewer'], 1);
      const reviewerMessage = await this.#runAgent({
        projectId: id, taskKey: 'reviewer', agentName: 'Mobile Reviewer Agent', role: 'reviewer', workspace,
        prompt: `Review the complete Flutter mobile MVP against PROJECT_SPEC.md, USER_FLOWS.json, UX_SPEC.md and TEST_REPORT.json. Trace every critical flow across UI, repository and persistence boundaries. A text field that supplies a foreign key/reference ID, a missing integration test, or a swallowed catch (_) is a blocking FAIL. Verify Android behavior, accessibility and scope without modifying files. Do not deploy or alter planning documents. Your final response must be JSON only: {"status":"PASS"|"FAIL","summary":"...","issues":[]}.`,
      });
      git(workspace, ['add', '-A']);
      if (gitChanged(workspace)) git(workspace, ['commit', '-m', 'fix: address mobile review findings']);
      const reviewerResult = parseReviewerResult(reviewerMessage);
      if (reviewerResult.status !== 'PASS') {
        this.database.updateTask(taskId(id, 'reviewer'), {
          status: 'failed', error: 'Reviewer PASS sonucu vermedi.', final_message: reviewerMessage,
        });
        throw new Error('Mobile Reviewer kalite kapısını geçemedi.');
      }
      this.#completeTask(id, 'reviewer', workspace, reviewerMessage);

      this.database.updateProject(id, {
        status: 'awaiting_user_review', final_message: reviewerResult.summary || reviewerMessage,
        quality_report: JSON.stringify(verifiedReport),
        artifact_path: path.join(workspace, verifiedReport.checks.apk.path),
        user_feedback: null, accepted_at: null,
      });
      this.#syncProjectState(id, workspace);
    } catch (error) {
      this.database.updateProject(id, {
        status: error instanceof PauseError ? `paused_${error.kind}`
          : error instanceof DeviceWaitError ? 'awaiting_device_test' : 'failed',
        error: error.message,
      });
    }
  }
}
