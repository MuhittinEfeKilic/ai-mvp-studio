import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { RESUMABLE_PROJECT_STATUSES } from './database.mjs';
import { selectReadyTasks } from './task-scheduler.mjs';
import { normalizePackageDependencies, readTaskPlan, writeProjectState } from './task-plan.mjs';
import { getGitChangedPaths, pathMatchesAllowedPattern, validateChangedPaths } from './task-worktree.mjs';
import { buildContextPackage } from './context-packager.mjs';
import {
  describeDeviceFailure, deviceFailureSignature, isRepairableDeviceFailure, resolveAdb,
  runAndroidDeviceGate, writeDeviceReport,
} from './device-tester.mjs';
import {
  CHECK_NAMES, normalizeQualityReport, parseReviewerResult, renderQualityReportJson,
  renderQualityReportMarkdown, validateQualityReport,
} from './quality-report.mjs';
import { parseEmulatorList, probeBuildTools } from './android-environment.mjs';
import { runSourceDiagnostics } from './source-diagnostics.mjs';
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

function flutterInvocation(executable, args) {
  return process.platform === 'win32' && /\.(?:bat|cmd)$/i.test(executable)
    ? { command: process.env.ComSpec || 'cmd.exe', args: ['/d', '/s', '/c', executable, ...args] }
    : { command: executable, args };
}

function runFlutter(executable, args, workspace) {
  const invocation = flutterInvocation(executable, args);
  return spawnSync(invocation.command, invocation.args, {
    cwd: workspace, encoding: 'utf8', windowsHide: true, timeout: 600_000,
  });
}

/** Non-blocking variant, so a slow Gradle build can overlap the planning agents. */
function runFlutterAsync(executable, args, workspace) {
  return new Promise(resolve => {
    const invocation = flutterInvocation(executable, args);
    let child;
    try {
      child = spawn(invocation.command, invocation.args, { cwd: workspace, windowsHide: true });
    } catch (error) {
      resolve({ status: null, stdout: '', stderr: '', error });
      return;
    }
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', chunk => { stdout += chunk; });
    child.stderr.on('data', chunk => { stderr += chunk; });
    child.once('error', error => resolve({ status: null, stdout, stderr, error }));
    child.once('close', status => resolve({ status, stdout, stderr }));
  });
}

/** `flutter create` needs a snake_case name and a reverse-DNS org. */
export function scaffoldIdentity(metadata = {}) {
  const packageName = String(metadata.package_name || '').trim();
  const segments = packageName.split('.').filter(Boolean);
  const fromSlug = String(metadata.project_slug || metadata.project_name || 'mvp_app')
    .trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  const name = (segments.length > 1 ? segments.at(-1) : fromSlug)
    .toLowerCase().replace(/[^a-z0-9_]/g, '_').replace(/^[^a-z]+/, '') || 'mvp_app';
  const org = segments.length > 1 ? segments.slice(0, -1).join('.') : 'com.aimvpstudio';
  return { name, org };
}

// Probing costs a real `flutter --version` spawn (~2s) and the answer cannot
// change while the Studio is running, so it is resolved once per process.
let cachedFlutter;

function resolveFlutter(workspace) {
  if (cachedFlutter !== undefined) return cachedFlutter;
  cachedFlutter = null;
  for (const candidate of flutterCandidates()) {
    const result = runFlutter(candidate, ['--version'], workspace);
    if (result.status === 0) {
      cachedFlutter = candidate;
      break;
    }
  }
  return cachedFlutter;
}

/** Test seam: clears the memoised toolchain lookup. */
export function resetToolchainCache() {
  cachedFlutter = undefined;
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
  const failures = CHECK_NAMES.map(name => {
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
  'build/', 'QUALITY_LOGS/', 'ROOT_CAUSE_REPORT.md', 'DEVICE_ROOT_CAUSE_REPORT.md',
  'android/.gradle/', 'android/local.properties',
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

/** Device rounds rebuild the APK and rerun the emulator, so they stay expensive. */
const MAX_DEVICE_REPAIR_ROUNDS = 2;

/** A review round replays the quality and device gates, so it is expensive too. */
const MAX_REVIEW_REPAIR_ROUNDS = 2;

/**
 * Single source of truth for how many builder tasks a spec may be split into.
 * The Coordinator prompt and the TASK_PLAN.json validator must agree, otherwise
 * a plan that follows the prompt is rejected and the project cannot recover.
 */
export function builderTaskLimit(specContent) {
  return String(specContent ?? '').length < 15_000 ? 3 : 5;
}

/**
 * Counting semaphore that hands a released slot straight to the next waiter.
 * Nothing waits on another agent while holding a slot, so it cannot deadlock.
 */
class Semaphore {
  constructor(limit) {
    this.limit = Math.max(1, limit);
    this.active = 0;
    this.waiters = [];
  }

  async acquire() {
    if (this.active < this.limit) {
      this.active += 1;
      return;
    }
    await new Promise(resolve => { this.waiters.push(resolve); });
  }

  release() {
    const next = this.waiters.shift();
    if (next) next();
    else this.active -= 1;
  }
}

export class Orchestrator {
  constructor({
    database, runner, projectsDir, maxConcurrentRuns = 2, flutterChecker = null,
    deviceTester = null, maxConcurrentAgents = 3, maxParallelBuilders = 3,
  }) {
    this.database = database;
    this.runner = runner;
    this.projectsDir = projectsDir;
    this.maxConcurrentRuns = maxConcurrentRuns;
    this.maxParallelBuilders = maxParallelBuilders;
    this.flutterChecker = flutterChecker;
    this.deviceTester = deviceTester;
    this.activeRuns = 0;
    this.queue = [];
    this.busyProjects = new Set();
    // Project and builder parallelism multiply; this caps the real Codex process
    // count across every project regardless of how those two are configured.
    this.agentSlots = new Semaphore(maxConcurrentAgents);
  }

  /** True while a project is queued or executing; two runs would share a worktree. */
  #isBusy(projectId) {
    return this.busyProjects.has(projectId) || this.queue.some(job => job.id === projectId);
  }

  #assertNotBusy(projectId) {
    if (this.#isBusy(projectId)) throw new Error('Bu proje için zaten bir çalışma sürüyor.');
  }

  #enqueue(job) {
    this.queue.push(job);
    this.#drainQueue();
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
    this.#enqueue({ id, projectRoot, workspace });
    return project;
  }

  resumeProject(id) {
    const project = this.database.getProject(id);
    if (!project) throw new Error('Proje bulunamadı.');
    if (!RESUMABLE_PROJECT_STATUSES.includes(project.status)) {
      throw new Error(`Bu proje ${project.status} durumundayken devam ettirilemez.`);
    }
    this.#assertNotBusy(id);
    this.database.updateProject(id, { status: 'queued', error: null });
    for (const task of this.database.listTasks(id)) {
      if (['ready', 'running', 'validating', 'paused_context', 'paused_usage', 'interrupted', 'failed'].includes(task.status)) {
        this.database.updateTask(task.id, { status: 'pending', error: null });
      }
    }
    this.#syncProjectState(id, project.workspace_path);
    // A pending user_feedback marks an unfinished feedback round, which must
    // resume on the feedback path instead of the full pipeline.
    this.#enqueue({
      id, projectRoot: path.dirname(project.workspace_path), workspace: project.workspace_path,
      feedbackRepair: Boolean(String(project.user_feedback || '').trim()),
    });
    return this.database.getProject(id);
  }

  retryTask(projectId, requestedTaskId) {
    const project = this.database.getProject(projectId);
    const task = this.database.getTask(requestedTaskId);
    if (!project || !task || task.project_id !== projectId) throw new Error('Görev bulunamadı.');
    if (!['failed', 'paused_context', 'paused_usage', 'interrupted'].includes(task.status)) {
      throw new Error(`Bu görev ${task.status} durumundayken yeniden çalıştırılamaz.`);
    }
    this.#assertNotBusy(projectId);
    this.database.updateTask(task.id, { status: 'pending', error: null });
    this.database.updateProject(projectId, { status: 'queued', error: null });
    this.#syncProjectState(projectId, project.workspace_path);
    this.#enqueue({
      id: projectId, projectRoot: path.dirname(project.workspace_path), workspace: project.workspace_path,
    });
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
    this.#assertNotBusy(id);
    const feedback = String(message || '').trim();
    if (feedback.length < 3 || feedback.length > 4000) throw new Error('Geri bildirim 3–4000 karakter olmalı.');
    const reviewerId = taskId(id, 'reviewer');
    const repairId = taskId(id, 'repair');
    this.database.updateTask(repairId, { status: 'pending', error: null });
    this.database.updateTask(reviewerId, { status: 'failed', error: 'Kullanıcı geri bildirimi bekliyor.' });
    this.database.updateProject(id, {
      status: 'queued', user_feedback: feedback, error: null, accepted_at: null,
    });
    this.#syncProjectState(id, project.workspace_path);
    this.#enqueue({
      id, projectRoot: path.dirname(project.workspace_path), workspace: project.workspace_path,
      feedbackRepair: true,
    });
    return this.database.getProject(id);
  }

  #drainQueue() {
    while (this.activeRuns < this.maxConcurrentRuns && this.queue.length) {
      const job = this.queue.shift();
      this.activeRuns += 1;
      this.busyProjects.add(job.id);
      this.#execute(job).finally(() => {
        this.activeRuns -= 1;
        this.busyProjects.delete(job.id);
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

  async #runAgent(options) {
    await this.agentSlots.acquire();
    try {
      return await this.#runAgentWithSlot(options);
    } finally {
      this.agentSlots.release();
    }
  }

  async #runAgentWithSlot({ projectId, taskKey, agentName, role, workspace, prompt }) {
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
    // Compare whole paths: a suffix match would also accept OTHER_ARCHITECTURE.md.
    const unexpected = git(workspace, ['status', '--short', '--untracked-files=all'])
      .split(/\r?\n/)
      .filter(Boolean)
      .map(line => line.slice(3).trim().replace(/^"|"$/g, '').replaceAll('\\', '/'))
      .filter(changed => changed !== artifact);
    if (unexpected.length) {
      throw new Error(`Agent izin verilmeyen dosyaları değiştirdi: ${unexpected.join(', ')}`);
    }
    if (!gitChanged(workspace)) return;
    git(workspace, ['add', artifact]);
    git(workspace, ['commit', '-m', message]);
  }

  /**
   * Produces a TASK_PLAN.json that the validator accepts. A plan rejected by the
   * contract is discarded and requested once more with the concrete reason, so a
   * bad plan cannot lock the project on every later resume.
   */
  async #produceTaskPlan(projectId, workspace) {
    // Once builders exist the plan is already bound to database tasks; revalidating
    // it here could discard a plan the running graph depends on.
    if (this.database.listTasks(projectId).some(task => task.role === 'flutter_builder')) return;
    const planPath = path.join(workspace, 'TASK_PLAN.json');
    const limit = builderTaskLimit(this.database.getProject(projectId).prompt);
    let correction = '';
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      if (!fs.existsSync(planPath)) {
        await this.#runAgent({
          projectId, taskKey: 'coordinator', agentName: 'Coordinator Agent', role: 'coordinator', workspace,
          prompt: `Read PROJECT_SPEC.md, USER_FLOWS.json, ARCHITECTURE.md and UX_SPEC.md. Produce only TASK_PLAN.json with {"version":1,"profile":"flutter_mobile","dependencies":[],"tasks":[]}. The Flutter application skeleton already exists: pubspec.yaml, android/, analysis_options.yaml and a placeholder lib/main.dart are committed. List every extra package the MVP needs in the top-level "dependencies" array (for example ["sqflite","path"]); the orchestrator installs them with flutter pub add. No task may claim pubspec.yaml or pubspec.lock. Create 2 to ${limit} coarse Flutter implementation tasks; ${limit} is a hard maximum and the plan is rejected above it, so do not over-split the MVP. Every task needs a lowercase kebab-case id, title, prompt, depends_on, allowed_paths, required_outputs, acceptance_checks and priority. Task ids must not be architecture, ux, coordinator, integration, test, repair or reviewer. The plan is rejected unless at least two tasks are independent of each other, so avoid a single foundation task that everything else depends on. Two tasks without a dependency path between them run at the same time and must own strictly disjoint paths: nesting counts as a conflict, so test/features/** and test/features/detail/** cannot belong to different independent tasks. Assign every USER_FLOWS.json flow to a builder and require an integration_test/<flow-name>_test.dart output that exercises the real feature boundaries and persistent data path. Verify foreign-key/reference fields are supplied by entity selection, not free text. required_outputs must contain repository-relative source or test file paths only. Never assign build/**, APK files, TEST_REPORT.json or TEST_REPORT.md to builder tasks; the integration quality gate produces those after every builder branch is merged. Reserve lib/main.dart for the task that owns the application shell. Do not implement code.${correction}`,
        });
        this.#commitArtifact(workspace, 'TASK_PLAN.json', 'docs: add coordinated task plan');
      }
      try {
        readTaskPlan(workspace, { maxTasks: limit });
        return;
      } catch (error) {
        this.database.addEvent(projectId, 'task_plan.rejected', {
          attempt, max_tasks: limit, error: error.message,
        });
        if (attempt === 2) throw new Error(`TASK_PLAN.json sözleşmeye uymuyor: ${error.message}`);
        fs.rmSync(planPath, { force: true });
        git(workspace, ['add', 'TASK_PLAN.json']);
        if (gitChanged(workspace)) git(workspace, ['commit', '-m', 'chore: discard rejected task plan']);
        correction = ` The previous TASK_PLAN.json was rejected: ${error.message} Produce a corrected plan with at most ${limit} tasks.`;
      }
    }
  }

  #materializeBuildGraph(projectId, workspace) {
    const existing = this.database.listTasks(projectId);
    if (existing.some(task => task.role === 'flutter_builder')) return;
    const project = this.database.getProject(projectId);
    const plan = readTaskPlan(workspace, { maxTasks: builderTaskLimit(project.prompt) });
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

  /**
   * Continuous builder scheduling: a finished task frees its slot immediately
   * instead of waiting for the slowest task of its wave. Tasks that may run
   * together own disjoint paths (enforced by the task plan contract), so merging
   * them in completion order is equivalent to any other order.
   */
  async #runBuilderGraph(projectId, projectRoot, workspace) {
    const running = new Map();
    while (true) {
      const tasks = this.database.listTasks(projectId);
      const builders = tasks.filter(task => task.role === 'flutter_builder');
      if (builders.every(task => task.status === 'completed')) return;

      if (running.size < this.maxParallelBuilders) {
        // A task started here may still be `pending` in the database while it
        // waits for an agent slot, so it is presented to the scheduler as running.
        const inFlight = tasks.map(task => (running.has(task.id) ? { ...task, status: 'running' } : task));
        for (const task of selectReadyTasks(inFlight, { capacity: this.maxParallelBuilders })) {
          if (task.role !== 'flutter_builder' || running.has(task.id)) continue;
          running.set(task.id, this.#runBuilderTask(projectId, projectRoot, workspace, task)
            .then(completed => ({ id: task.id, completed }), error => ({ id: task.id, error })));
          if (running.size >= this.maxParallelBuilders) break;
        }
      }

      if (!running.size) {
        throw new Error('Builder görev grafiği ilerleyemiyor; bağımlılık veya path çakışması var.');
      }
      const settled = await Promise.race(running.values());
      running.delete(settled.id);
      if (settled.error) {
        // Let the other builders stop on their own so nothing writes after the failure.
        await Promise.allSettled(running.values());
        throw settled.error;
      }
      const branch = settled.completed?.branch_name;
      if (branch && branchAhead(workspace, branch)) {
        git(workspace, ['merge', '--no-edit', branch]);
      }
    }
  }

  /**
   * Creates the Flutter skeleton centrally. It used to be the first builder task
   * that everything else depended on, which put ~430s of boilerplate agent work
   * on the critical path. `flutter create` produces the same files in seconds.
   */
  #scaffoldApplication(projectId, workspace) {
    if (fs.existsSync(path.join(workspace, 'pubspec.yaml'))) return false;
    const flutter = resolveFlutter(workspace);
    if (!flutter) return false;
    const { metadata } = parseSpec(this.database.getProject(projectId).prompt);
    const { name, org } = scaffoldIdentity(metadata);
    const result = runFlutter(
      flutter,
      ['create', '--project-name', name, '--org', org, '--platforms', 'android', '.'],
      workspace,
    );
    if (result.status !== 0) {
      throw new Error(`flutter create başarısız: ${commandDetails(result)}`);
    }
    // The generated smoke test targets the placeholder MyApp and starts failing
    // as soon as a builder replaces lib/main.dart. Removing it outright is not
    // enough either: `flutter test` fails on an empty test directory.
    fs.mkdirSync(path.join(workspace, 'test'), { recursive: true });
    fs.writeFileSync(path.join(workspace, 'test', 'scaffold_test.dart'), [
      "import 'package:flutter_test/flutter_test.dart';",
      '',
      '// Placeholder so the test suite is runnable before feature tests land.',
      '// Builders may delete this file once they add real tests.',
      'void main() {',
      "  test('scaffold is testable', () {",
      '    expect(true, isTrue);',
      '  });',
      '}',
      '',
    ].join('\n'), 'utf8');
    fs.rmSync(path.join(workspace, 'test', 'widget_test.dart'), { force: true });
    const dependencies = runFlutter(flutter, ['pub', 'get'], workspace);
    if (dependencies.status !== 0) {
      throw new Error(`flutter pub get başarısız: ${commandDetails(dependencies)}`);
    }
    ensureProjectGitignore(workspace);
    git(workspace, ['add', '-A']);
    if (gitChanged(workspace)) git(workspace, ['commit', '-m', 'chore: scaffold Flutter application']);
    this.database.addEvent(projectId, 'scaffold.created', { project_name: name, org });
    return true;
  }

  /**
   * Warms the Android toolchain while the planning agents think. A cold Gradle
   * build measured 177.7s against 1.8s for analyze, so hiding it behind the
   * Architecture/UX/Coordinator window removes it from the critical path.
   * Best effort: a failure here must never fail the project.
   */
  #startWarmBuild(projectId, workspace) {
    const flutter = resolveFlutter(workspace);
    if (!flutter || !fs.existsSync(path.join(workspace, 'pubspec.yaml'))) return null;
    const startedAt = Date.now();
    return runFlutterAsync(flutter, ['build', 'apk', '--debug'], workspace).then(result => {
      this.database.addEvent(projectId, 'warm_build.completed', {
        status: result.status === 0 ? 'PASS' : 'FAIL',
        seconds: Math.round((Date.now() - startedAt) / 1000),
      });
      return result;
    }, error => {
      this.database.addEvent(projectId, 'warm_build.completed', { status: 'FAIL', error: error.message });
      return null;
    });
  }

  /**
   * Installs the packages the plan declares. Central ownership keeps pubspec.yaml
   * out of every builder's allowed_paths, which is the shared file that forced
   * feature tasks to run one after another.
   */
  #installPlanDependencies(projectId, workspace, dependencies) {
    const packages = normalizePackageDependencies(dependencies);
    if (!packages.length) return;
    const flutter = resolveFlutter(workspace);
    if (!flutter) return;
    const result = runFlutter(flutter, ['pub', 'add', ...packages], workspace);
    this.database.addEvent(projectId, 'dependencies.installed', {
      packages, status: result.status === 0 ? 'PASS' : 'FAIL',
    });
    if (result.status !== 0) {
      throw new Error(`Plan bağımlılıkları kurulamadı (${packages.join(', ')}): ${commandDetails(result)}`);
    }
    git(workspace, ['add', '-A']);
    if (gitChanged(workspace)) git(workspace, ['commit', '-m', 'chore: install planned dependencies']);
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
      report.emulators = parseEmulatorList(fullCommandOutput(runFlutter(flutter, ['emulators'], workspace)));
    }
    report.build_tools = probeBuildTools({
      sdkRoot: androidSdk,
      run: (executable, args) => runFlutter(executable, args, workspace),
    });
    report.status = report.flutter.status === 'PASS' && report.android_sdk.status === 'PASS'
      && report.build_tools.status !== 'FAIL'
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

  /**
   * Async on purpose: a debug APK build measured 177.7s and spawnSync would block
   * the whole event loop for that long, freezing every other project's agents.
   */
  async #runLocalFlutterChecks(workspace) {
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
    const dependencyResult = await runFlutterAsync(flutter, ['pub', 'get'], workspace);
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
      const result = await runFlutterAsync(flutter, args, workspace);
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
    // Runs outside the toolchain hook so the main and the feedback path both get it.
    const diagnostics = runSourceDiagnostics(workspace);
    const combined = {
      ...rawReport,
      checks: { ...(rawReport.checks || {}), diagnostics: diagnostics.check },
      logs: { ...(rawReport.logs || {}), diagnostics: diagnostics.log },
    };
    for (const [name, output] of Object.entries(combined.logs)) {
      fs.writeFileSync(path.join(logDir, `${name}.log`), `${output || '(çıktı yok)'}\n`, 'utf8');
    }
    const report = normalizeQualityReport(combined);
    fs.writeFileSync(path.join(workspace, 'TEST_REPORT.json'), renderQualityReportJson(report), 'utf8');
    fs.writeFileSync(path.join(workspace, 'TEST_REPORT.md'), renderQualityReportMarkdown(report), 'utf8');
    git(workspace, ['add', 'TEST_REPORT.json', 'TEST_REPORT.md']);
    if (gitChanged(workspace)) git(workspace, ['commit', '-m', message]);
    return report;
  }

  #writeRootCauseReport(workspace, { attempts, signature, report }) {
    const failures = CHECK_NAMES
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

  async #runDeviceGate(projectId, workspace, verifiedReport) {
    const project = this.database.getProject(projectId);
    const flowsPath = path.join(workspace, 'USER_FLOWS.json');
    const flows = fs.existsSync(flowsPath)
      ? JSON.parse(fs.readFileSync(flowsPath, 'utf8')).flows || [] : [];
    const packageName = parseSpec(project.prompt).metadata.package_name;
    const apkPath = path.resolve(workspace, verifiedReport.checks.apk.path);
    const report = this.deviceTester
      ? await this.deviceTester({ workspace, apkPath, packageName, flows })
      : await runAndroidDeviceGate({
        workspace, apkPath, packageName, flows,
        flutterExecutable: resolveFlutter(workspace), adbExecutable: resolveAdb(),
      });
    writeDeviceReport(workspace, report);
    this.database.updateProject(projectId, { device_report: JSON.stringify(report) });
    this.database.addEvent(projectId, 'device_test.completed', report);
    // Only a host/emulator problem parks the project; a product failure is
    // returned so the caller can attempt a targeted repair.
    if (report.status === 'WAITING') throw new DeviceWaitError(report.reason);
    return report;
  }

  #ensureReviewRepairTask(projectId) {
    return this.#ensureRepairTask(projectId, 'review_repair', 'Review Repair');
  }

  #ensureDeviceRepairTask(projectId) {
    return this.#ensureRepairTask(projectId, 'device_repair', 'Device Repair');
  }

  /** Older projects predate these tasks, so the graph grows them on demand. */
  #ensureRepairTask(projectId, role, name) {
    const id = taskId(projectId, role);
    if (!this.database.getTask(id)) {
      this.database.createTasks([{
        id, project_id: projectId, name, role,
        allowed_paths: ['**'], depends_on: [taskId(projectId, 'repair')],
      }]);
    }
    return id;
  }

  #writeDeviceRootCauseReport(workspace, { rounds, signature, report, repeated, repairable = true }) {
    const checks = Object.entries(report.checks || {})
      .map(([name, check]) => `## ${name}\n\nDurum: ${check.status}\n\n${check.details || `exit ${check.exit_code ?? '—'}`}`)
      .join('\n\n');
    const body = [
      '# Cihaz Kapısı Kök Neden Raporu', '',
      `Device repair turu: ${rounds}`, `Hata imzası: \`${signature}\``,
      `Arıza türü: ${report.failure_kind || 'product'}`, '',
      !repairable
        ? 'Bu hata bir agent turuyla düzeltilemez: USER_FLOWS.json kritik akış sözleşmesi eksik olduğu için kapsam doğrulanamıyor. Düzeltme PROJECT_SPEC seviyesindedir.'
        : repeated
          ? 'Aynı cihaz hatası iki ardışık koşuda değişmeden kaldığı için döngü durduruldu.'
          : 'İzin verilen device repair turu tükendiği için döngü durduruldu.', '',
      checks, '', 'Tam cihaz çıktıları `QUALITY_LOGS/DEVICE_*.log` dosyalarındadır.', '',
    ].join('\n');
    fs.writeFileSync(path.join(workspace, 'DEVICE_ROOT_CAUSE_REPORT.md'), body, 'utf8');
    return body;
  }

  /**
   * Runs the device gate and, when the generated app itself fails on the device,
   * applies up to MAX_DEVICE_REPAIR_ROUNDS targeted repairs. Every repair
   * rebuilds and re-verifies the APK, so the next install uses the fixed build.
   * Returns the quality report that matches the APK that finally passed.
   */
  async #runDeviceStage(projectId, workspace, initialQualityReport, { beforeRepair = null } = {}) {
    let qualityReport = initialQualityReport;
    let previousSignature = null;
    for (let round = 0; ; round += 1) {
      // The gate itself is spawnSync-based and blocks the event loop for minutes.
      // Yielding first lets a concurrently started agent reach its own spawn, so
      // the work really overlaps instead of queueing behind this call.
      await new Promise(resolve => { setImmediate(resolve); });
      const deviceReport = await this.#runDeviceGate(projectId, workspace, qualityReport);
      if (deviceReport.status === 'PASS') return { qualityReport, repairRounds: round };

      const signature = deviceFailureSignature(deviceReport);
      const repeated = signature === previousSignature;
      const repairable = isRepairableDeviceFailure(deviceReport);
      if (!repairable || round >= MAX_DEVICE_REPAIR_ROUNDS || repeated) {
        this.#writeDeviceRootCauseReport(workspace, {
          rounds: round, signature, report: deviceReport, repeated, repairable,
        });
        this.database.updateTask(this.#ensureDeviceRepairTask(projectId), {
          status: 'failed',
          error: !repairable
            ? 'Cihaz hatası agent tarafından düzeltilemez; PROJECT_SPEC kritik akış sözleşmesi eksik.'
            : repeated
              ? `Aynı cihaz hatası tekrarlandı (${signature}).`
              : `${MAX_DEVICE_REPAIR_ROUNDS} device repair turu sonunda cihaz kapısı geçilemedi.`,
        });
        throw new Error(`Android cihaz kalite kapısı geçilemedi: ${describeDeviceFailure(deviceReport)}`);
      }
      previousSignature = signature;

      // A repair agent writes to the workspace, so anything reading it
      // concurrently must be settled before this point.
      if (beforeRepair) await beforeRepair();
      // The review verdict describes code that is about to change.
      this.database.updateTask(taskId(projectId, 'reviewer'), {
        status: 'pending', final_message: null, error: null,
      });
      const repairTaskId = this.#ensureDeviceRepairTask(projectId);
      this.database.updateTask(repairTaskId, { status: 'pending', error: null });
      this.database.updateProject(projectId, { status: 'device_repair' });
      await this.#runAgent({
        projectId, taskKey: repairTaskId, agentName: 'Device Repair Agent', role: 'device_repair', workspace,
        prompt: `Device repair turu ${round + 1}/${MAX_DEVICE_REPAIR_ROUNDS}. The application failed on a real Android device even though analyze, test and build passed. Failure: ${describeDeviceFailure(deviceReport)}. Read DEVICE_REPORT.json, USER_FLOWS.json and the referenced QUALITY_LOGS/DEVICE_*.log files. Fix only the cause of this device failure across the UI, repository and persistence boundaries of the affected critical flow. Errors must stay diagnosable: keep the caught error, surface a specific message and log or rethrow it. Do not run flutter, dart, pub, adb or Gradle commands; the orchestrator rebuilds and reruns the device gate. Do not change planning documents or expand scope.`,
      });
      git(workspace, ['add', '-A']);
      if (gitChanged(workspace)) git(workspace, ['commit', '-m', 'fix: repair device test failure']);

      // The device gate installs an APK, so the repaired code must be rebuilt.
      const rebuilt = this.#writeQualityReports(
        workspace, await this.#runLocalFlutterChecks(workspace), 'test: verify device repair',
      );
      qualityReport = validateQualityReport(rebuilt, { workspace });
      this.#completeTask(projectId, repairTaskId, workspace, `Device repair turu ${round + 1} uygulandı.`);
      this.database.updateProject(projectId, {
        status: 'device_testing',
        quality_report: JSON.stringify(qualityReport),
        artifact_path: path.join(workspace, qualityReport.checks.apk.path),
      });
    }
  }

  async #executeFeedbackRepair({ id, workspace }) {
    const project = this.database.getProject(id);
    try {
      this.database.updateProject(id, { status: 'building', error: null });
      // A resumed feedback round must not pay for the repair agent twice.
      if (this.database.getTask(taskId(id, 'repair'))?.status !== 'completed') {
        await this.#runAgent({
          projectId: id, taskKey: 'repair', agentName: 'Feedback Repair Agent', role: 'repair', workspace,
          prompt: `Apply only this approved user feedback: ${project.user_feedback}. Keep PROJECT_SPEC.md and planning documents unchanged. Do not run flutter, dart, pub or Gradle commands; the orchestrator runs all checks. Do not expand scope.`,
        });
        git(workspace, ['add', '-A']);
        if (gitChanged(workspace)) git(workspace, ['commit', '-m', 'fix: apply user review feedback']);
      }
      const report = this.#writeQualityReports(
        workspace, await this.#runLocalFlutterChecks(workspace), 'test: verify user feedback repair',
      );
      let verified = validateQualityReport(report, { workspace });
      this.#completeTask(id, 'repair', workspace, 'Kullanıcı geri bildirimi uygulandı ve doğrulandı.');
      this.database.updateProject(id, {
        quality_report: JSON.stringify(verified),
        artifact_path: path.join(workspace, verified.checks.apk.path),
      });

      // Technical checks never prove the critical flows still work; the feedback
      // round must clear the same device gate as the main pipeline.
      if (this.#deviceGateEnabled()) {
        this.database.updateProject(id, { status: 'device_testing' });
        verified = (await this.#runDeviceStage(id, workspace, verified)).qualityReport;
        this.database.updateProject(id, { status: 'device_test_passed' });
      }

      this.database.updateTask(taskId(id, 'reviewer'), { status: 'pending', error: null });
      // The same review contract as the main pipeline: a weaker prompt here would
      // reproduce the false negatives that contract was written to prevent.
      const review = await this.#startReviewer(id, workspace);
      if (review.error) throw review.error;
      const reviewerMessage = review.message;
      const reviewerResult = parseReviewerResult(reviewerMessage);
      if (reviewerResult.status !== 'PASS') {
        const reasons = reviewerResult.issues.map(issue => `- ${issue}`).join('\n')
          || reviewerResult.summary || 'Gerekçe bildirilmedi.';
        this.database.updateTask(taskId(id, 'reviewer'), {
          status: 'failed', error: reasons, final_message: reviewerMessage,
        });
        throw new Error(`Feedback sonrası reviewer kalite kapısını geçemedi:\n${reasons}`);
      }
      this.#completeTask(id, 'reviewer', workspace, reviewerMessage);
      this.database.updateProject(id, {
        status: 'awaiting_user_review', final_message: reviewerResult.summary,
        quality_report: JSON.stringify(verified), artifact_path: path.join(workspace, verified.checks.apk.path),
        user_feedback: null, error: null,
      });
      this.#syncProjectState(id, workspace);
    } catch (error) {
      this.database.updateProject(id, { status: this.#failureStatus(error), error: error.message });
      this.#syncProjectState(id, workspace);
    }
  }

  /** Codex pauses and device waits stay resumable; everything else is a real failure. */
  #failureStatus(error) {
    if (error instanceof PauseError) return `paused_${error.kind}`;
    if (error instanceof DeviceWaitError) return 'awaiting_device_test';
    return 'failed';
  }

  #deviceGateEnabled() {
    return !this.flutterChecker || Boolean(this.deviceTester);
  }

  /**
   * Stores a passing verdict so a resume after a device wait does not pay for the
   * review again. A later device repair clears it, because the code changes.
   */
  #persistReview(projectId, workspace, review) {
    if (!review?.message) return;
    try {
      if (parseReviewerResult(review.message).status !== 'PASS') return;
    } catch {
      return;
    }
    this.#completeTask(projectId, taskId(projectId, 'reviewer'), workspace, review.message);
  }

  /** Starts the read-only review; the caller decides when to settle it. */
  #startReviewer(projectId, workspace) {
    return this.#runAgent({
      projectId, taskKey: 'reviewer', agentName: 'Mobile Reviewer Agent', role: 'reviewer', workspace,
      prompt: `Review the complete Flutter mobile MVP against PROJECT_SPEC.md and USER_FLOWS.json without modifying files.

Authoritative gates already ran and you must not re-judge them: TEST_REPORT.json owns flutter analyze, flutter test, the debug APK build and the swallowed-error scan; DEVICE_REPORT.json owns execution on the Android device. A PASS in those reports is proof. An Android emulator satisfies the device_test requirement; do not ask for physical hardware. If DEVICE_REPORT.json is absent the device gate simply has not run yet, which is never your finding to report.

Toolchain-owned paths are outside product scope: android/app/src/debug/**, android/app/src/profile/**, generated files, and the placeholder test/scaffold_test.dart. The debug manifest legitimately declares INTERNET so the test harness can reach the on-device Dart VM; only android/app/src/main/AndroidManifest.xml carries product permissions.

Your job is what no gate can check: does the implementation actually satisfy PROJECT_SPEC.md, is every critical flow wired end to end across UI, repository and persistence, are foreign key/reference values supplied by entity selection instead of free text, and did the build stay inside scope.

A finding is blocking ONLY if it is a demonstrable defect you can point at in a specific file. Something you could not verify is not a defect: put it in "notes", never in "issues". Missing evidence for a UX_SPEC.md suggestion is a note; UX_SPEC.md is guidance, PROJECT_SPEC.md is the contract. Return FAIL only when "issues" is non-empty.

Your final response must be JSON only: {"status":"PASS","summary":"...","issues":[],"notes":[]} or the same shape with "FAIL".`,
    }).then(message => ({ message }), error => ({ error }));
  }

  #taskCompleted(projectId, key) {
    return this.database.getTask(taskId(projectId, key))?.status === 'completed';
  }

  /** Final message of an already completed task, so a resume can reuse its verdict. */
  #completedTaskMessage(projectId, key) {
    const task = this.database.getTask(taskId(projectId, key));
    return task?.status === 'completed' ? task.final_message || null : null;
  }

  async #execute({ id, projectRoot, workspace, feedbackRepair = false }) {
    if (feedbackRepair) return this.#executeFeedbackRepair({ id, workspace });
    this.database.updateProject(id, { status: 'planning', error: null });
    try {
      ensureProjectGitignore(workspace);
      let warmBuild = null;
      if (!this.flutterChecker) {
        this.#runFlutterPreflight(id, workspace);
        // Scaffold before the worktrees branch, so every agent starts from the
        // same committed skeleton, then hide the cold Gradle build behind them.
        this.#scaffoldApplication(id, workspace);
        warmBuild = this.#startWarmBuild(id, workspace);
      }
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
          prompt: `Read PROJECT_SPEC.md and USER_FLOWS.json when present. Produce only UX_SPEC.md. Define screens, states, interactions, responsive behavior, visual direction, accessibility requirements, copy guidance, and a UI acceptance checklist. For every cross-feature reference, specify whether the user selects an existing entity or enters free text; never present database IDs as text fields. UX_SPEC.md is guidance, not the acceptance contract: PROJECT_SPEC.md is. Put in the acceptance checklist only items a widget or integration test can verify, and place anything needing manual or assistive-technology inspection (screen readers, font scaling, external keyboards) under a clearly marked "Manuel kontrol önerileri" heading so no gate treats it as a requirement. Do not create or edit any other file. Do not implement the application.`,
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
      await this.#produceTaskPlan(id, workspace);
      this.#completeTask(id, 'coordinator', workspace);
      // The warm build owns .dart_tool; let it finish before pub touches it.
      if (warmBuild) await warmBuild;
      if (fs.existsSync(path.join(workspace, 'TASK_PLAN.json'))) {
        this.#installPlanDependencies(
          id, workspace,
          JSON.parse(fs.readFileSync(path.join(workspace, 'TASK_PLAN.json'), 'utf8')).dependencies,
        );
      }
      this.#materializeBuildGraph(id, workspace);

      this.database.updateProject(id, { status: 'building' });
      await this.#runBuilderGraph(id, projectRoot, workspace);

      // A resume must not pay for agents that already finished before the pause.
      if (!this.#taskCompleted(id, 'integration')) {
        this.#readyTasks(id, ['integration'], 1);
        await this.#runAgent({
          projectId: id, taskKey: 'integration', agentName: 'Integration Agent', role: 'integration', workspace,
          prompt: `Inspect the merged Flutter task branches against PROJECT_SPEC.md, USER_FLOWS.json and TASK_PLAN.json. Resolve only concrete integration issues, including cross-feature ID/reference contracts and missing integration tests for critical flows. Keep planning documents unchanged and ensure the project structure is coherent. Do not run flutter, dart, pub or Gradle commands; the orchestrator runs all toolchain checks outside the agent sandbox. Do not expand scope or deploy.`,
        });
        git(workspace, ['add', '-A']);
        if (gitChanged(workspace)) git(workspace, ['commit', '-m', 'chore: integrate parallel Flutter tasks']);
        this.#completeTask(id, 'integration', workspace);
      }

      this.database.updateProject(id, { status: 'testing' });
      this.#readyTasks(id, ['test'], 1);
      let checkReport = this.#writeQualityReports(
        workspace, await this.#runLocalFlutterChecks(workspace), 'test: add structured Flutter quality report',
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
          prompt: `Repair turu ${repairAttempts}/3. Read TEST_REPORT.md and the referenced QUALITY_LOGS files. Fix only the reported Flutter analyze/test/build failures and source diagnostics findings. A diagnostics finding means an error is swallowed: keep the caught error, surface a specific message and log or rethrow it. Do not widen the fix beyond the reported locations. Do not run flutter, dart, pub or Gradle commands; the orchestrator re-runs all checks after your changes. Do not expand scope or change planning documents. Previous failure signature: ${signature}.`,
        });
        git(workspace, ['add', '-A']);
        if (gitChanged(workspace)) git(workspace, ['commit', '-m', 'fix: repair Flutter test failures']);
        checkReport = this.#writeQualityReports(
          workspace, await this.#runLocalFlutterChecks(workspace), 'test: verify repaired Flutter project',
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
      let verifiedReport = validateQualityReport(checkReport, { workspace });
      this.#completeTask(id, 'repair', workspace, checkReport.status === 'PASS' ? 'Kalite kapısı geçti.' : 'Repair completed.');

      this.database.updateProject(id, {
        status: 'technically_verified', quality_report: JSON.stringify(verifiedReport),
        artifact_path: path.join(workspace, verifiedReport.checks.apk.path),
      });
      // The Reviewer only reads the workspace, so it thinks while the device gate
      // installs and exercises the APK. Any device repair writes to the same
      // workspace, so the review is settled first and then redone.
      let reviewerMessage = this.#completedTaskMessage(id, 'reviewer');
      let pendingReview = null;
      if (!reviewerMessage) {
        this.#readyTasks(id, ['reviewer'], 1);
        pendingReview = this.#startReviewer(id, workspace);
      }
      const settleReview = async () => {
        if (!pendingReview) return null;
        const settled = await pendingReview;
        pendingReview = null;
        return settled;
      };

      let review = null;
      if (this.#deviceGateEnabled()) {
        this.database.updateProject(id, { status: 'device_testing' });
        let outcome;
        try {
          outcome = await this.#runDeviceStage(id, workspace, verifiedReport, {
            beforeRepair: async () => { review = await settleReview(); },
          });
        } catch (error) {
          this.#persistReview(id, workspace, await settleReview());
          throw error;
        }
        verifiedReport = outcome.qualityReport;
        // A repair changed the code the concurrent review looked at.
        if (outcome.repairRounds > 0) {
          if (review?.error) throw review.error;
          review = null;
        }
        this.database.updateProject(id, { status: 'device_test_passed' });
      }

      this.database.updateProject(id, { status: 'reviewing' });
      if (!reviewerMessage) {
        // The analyze/test/APK gate gets three repair rounds and the device gate
        // two; the review is a gate too, so a fixable finding must not be fatal.
        let previousFindings = null;
        for (let round = 0; ; round += 1) {
          review = (await settleReview()) ?? review ?? await this.#startReviewer(id, workspace);
          if (review.error) throw review.error;
          reviewerMessage = review.message;
          review = null;
          git(workspace, ['add', '-A']);
          if (gitChanged(workspace)) git(workspace, ['commit', '-m', 'chore: record review state']);

          const verdict = parseReviewerResult(reviewerMessage);
          if (verdict.status === 'PASS') break;

          const findings = verdict.issues.map(issue => `- ${issue}`).join('\n');
          const repeated = findings === previousFindings;
          if (round >= MAX_REVIEW_REPAIR_ROUNDS || repeated) {
            const reasons = findings || verdict.summary || 'Gerekçe bildirilmedi.';
            this.database.updateTask(taskId(id, 'reviewer'), {
              status: 'failed', error: reasons, final_message: reviewerMessage,
            });
            throw new Error(
              `Mobile Reviewer kalite kapısını geçemedi${repeated ? ' (bulgular değişmedi)' : ''}:\n${reasons}`,
            );
          }
          previousFindings = findings;

          const repairTaskId = this.#ensureReviewRepairTask(id);
          this.database.updateTask(repairTaskId, { status: 'pending', error: null });
          this.database.updateProject(id, { status: 'review_repair' });
          await this.#runAgent({
            projectId: id, taskKey: repairTaskId, agentName: 'Review Repair Agent', role: 'review_repair', workspace,
            prompt: `Review repair turu ${round + 1}/${MAX_REVIEW_REPAIR_ROUNDS}. The Mobile Reviewer blocked the MVP with these findings:\n${findings}\nFix exactly these findings and nothing else. Each one names a file; keep the change inside the reported area and preserve behaviour the tests already cover. Do not run flutter, dart, pub, adb or Gradle commands; the orchestrator reruns every gate after your changes. Do not change planning documents or expand scope.`,
          });
          git(workspace, ['add', '-A']);
          if (gitChanged(workspace)) git(workspace, ['commit', '-m', 'fix: apply mobile review findings']);
          this.#completeTask(id, repairTaskId, workspace, `Review repair turu ${round + 1} uygulandı.`);

          // The code changed, so every downstream gate has to speak again.
          this.database.updateProject(id, { status: 'testing' });
          verifiedReport = validateQualityReport(this.#writeQualityReports(
            workspace, await this.#runLocalFlutterChecks(workspace), 'test: verify review repair',
          ), { workspace });
          this.database.updateProject(id, {
            quality_report: JSON.stringify(verifiedReport),
            artifact_path: path.join(workspace, verifiedReport.checks.apk.path),
          });
          if (this.#deviceGateEnabled()) {
            this.database.updateProject(id, { status: 'device_testing' });
            verifiedReport = (await this.#runDeviceStage(id, workspace, verifiedReport)).qualityReport;
            this.database.updateProject(id, { status: 'device_test_passed' });
          }
          this.database.updateProject(id, { status: 'reviewing' });
          this.database.updateTask(taskId(id, 'reviewer'), { status: 'pending', error: null });
        }
        this.#completeTask(id, 'reviewer', workspace, reviewerMessage);
      }
      const reviewerResult = parseReviewerResult(reviewerMessage);

      this.database.updateProject(id, {
        status: 'awaiting_user_review', final_message: reviewerResult.summary || reviewerMessage,
        quality_report: JSON.stringify(verifiedReport),
        artifact_path: path.join(workspace, verifiedReport.checks.apk.path),
        user_feedback: null, accepted_at: null,
      });
      this.#syncProjectState(id, workspace);
    } catch (error) {
      this.database.updateProject(id, { status: this.#failureStatus(error), error: error.message });
    }
  }
}
