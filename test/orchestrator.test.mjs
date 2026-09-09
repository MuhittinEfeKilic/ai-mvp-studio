import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

import { Database } from '../src/database.mjs';
import { Orchestrator } from '../src/orchestrator.mjs';

/**
 * Builds a review verdict that answers the project's acceptance checklist, the
 * way the contract now requires. Specs without criteria produce an empty list.
 */
function fakeReview(workspace, { status = 'PASS', issues = [], notes = [] } = {}) {
  const filePath = path.join(workspace, 'ACCEPTANCE_CRITERIA.json');
  const list = fs.existsSync(filePath)
    ? JSON.parse(fs.readFileSync(filePath, 'utf8')).criteria : [];
  const criteria = list.map((item, index) => ({
    id: item.id,
    status: status === 'FAIL' && index === 0 ? 'FAIL' : 'PASS',
    evidence: 'fake review',
  }));
  return JSON.stringify({ status, summary: 'Fake review.', criteria, issues, notes });
}

class FakeRunner {
  async run({ workspace, prompt, onEvent }) {
    if (prompt.includes('Produce only ARCHITECTURE.md')) {
      fs.writeFileSync(path.join(workspace, 'ARCHITECTURE.md'), '# Architecture\n\nMinimal plan.');
    } else if (prompt.includes('Produce only UX_SPEC.md')) {
      fs.writeFileSync(path.join(workspace, 'UX_SPEC.md'), '# UX\n\nAccessible UI plan.');
    } else if (prompt.includes('Produce only DATA_MODEL.md')) {
      fs.writeFileSync(path.join(workspace, 'DATA_MODEL.md'), '# Data model\n\nTyped contracts.');
    } else if (prompt.includes('Produce only TEST_STRATEGY.md')) {
      fs.writeFileSync(path.join(workspace, 'TEST_STRATEGY.md'), '# Test strategy\n\nTraceable coverage.');
    } else if (prompt.includes('Produce only TASK_PLAN.json')) {
      const advanced = prompt.includes('Create 4 to 8 coarse');
      fs.writeFileSync(path.join(workspace, 'TASK_PLAN.json'), JSON.stringify({
        version: 1,
        profile: 'flutter_mobile',
        tasks: advanced ? ['shell', 'records', 'insights', 'settings'].map((id, index) => ({
          id: `feature-${id}`, title: `Feature ${id}`, prompt: `Create ${id}.`, depends_on: [],
          allowed_paths: index === 0 ? ['index.html'] : [`lib/features/${id}.dart`],
          required_outputs: index === 0 ? ['index.html'] : [`lib/features/${id}.dart`],
          acceptance_checks: ['file exists'], priority: index,
        })) : [{
          id: 'app-shell', title: 'App Shell', prompt: 'Create the test UI.', depends_on: [],
          allowed_paths: ['index.html', 'build/'],
          required_outputs: ['index.html', 'build/app/outputs/flutter-apk/app-debug.apk'],
          acceptance_checks: [],
        }],
      }));
    } else if (prompt.includes('Complete only task')) {
      const output = prompt.match(/Required outputs: ([^,.\s]+\.dart)/)?.[1];
      if (output) {
        fs.mkdirSync(path.dirname(path.join(workspace, output)), { recursive: true });
        fs.writeFileSync(path.join(workspace, output), 'class Feature {}\n');
      } else {
        fs.writeFileSync(path.join(workspace, 'index.html'), '<h1>Test MVP</h1>');
      }
    }
    onEvent('turn.completed', { type: 'turn.completed' });
    return /Review the complete Flutter|response JSON only/i.test(prompt)
      ? fakeReview(workspace) : 'Agent completed.';
  }
}

class ContextLimitedRunner extends FakeRunner {
  constructor() {
    super();
    this.builderAttempts = 0;
  }

  async run(options) {
    if (options.prompt.includes('Complete only task')) {
      this.builderAttempts += 1;
      if (this.builderAttempts === 1) {
        fs.writeFileSync(path.join(options.workspace, 'index.html'), '<!-- partial checkpoint -->');
        throw new Error('maximum context window exceeded');
      }
    }
    return super.run(options);
  }
}

async function waitForStatus(database, id, statuses) {
  const deadline = Date.now() + 10_000;
  while (!statuses.includes(database.getProject(id).status) && Date.now() < deadline) {
    await new Promise(resolve => setTimeout(resolve, 20));
  }
  return database.getProject(id);
}

function createFakeApk(workspace) {
  const relative = path.join('build', 'app', 'outputs', 'flutter-apk', 'app-debug.apk');
  const absolute = path.join(workspace, relative);
  fs.mkdirSync(path.dirname(absolute), { recursive: true });
  fs.writeFileSync(absolute, 'fake apk');
  return relative;
}

test('coordinated mobile flow creates a dynamic task graph and completes it', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'mvp-orchestrator-'));
  const database = new Database(path.join(directory, 'studio.db'));
  const orchestrator = new Orchestrator({
    database,
    runner: new FakeRunner(),
    projectsDir: path.join(directory, 'projects'),
    maxConcurrentRuns: 1,
    flutterChecker: workspace => ({ checks: {
      analyze: { status: 'PASS', exit_code: 0 }, test: { status: 'PASS', exit_code: 0 },
      apk: { status: 'PASS', exit_code: 0, path: createFakeApk(workspace) },
    } }),
  });
  const approvedMobileSpec = fs.readFileSync(path.resolve(
    path.dirname(fileURLToPath(import.meta.url)), '..', 'examples', 'odak-mini', 'PROJECT_SPEC.md',
  ), 'utf8');
  const project = orchestrator.createProject('Odak Mini', approvedMobileSpec);

  assert.equal(fs.existsSync(path.join(project.workspace_path, 'USER_FLOWS.json')), true);

  const deadline = Date.now() + 10_000;
  while (database.getProject(project.id).status !== 'awaiting_user_review' && Date.now() < deadline) {
    await new Promise(resolve => setTimeout(resolve, 20));
  }

  const completed = database.getProject(project.id);
  const runs = database.listAgentRuns(project.id);
  assert.equal(completed.status, 'awaiting_user_review', completed.error);
  assert.deepEqual(runs.map(run => run.role), [
    'architecture', 'ux', 'coordinator', 'flutter_builder', 'integration', 'reviewer',
  ]);
  assert.ok(runs.every(run => run.status === 'completed'));
  assert.ok(fs.existsSync(path.join(project.workspace_path, 'ARCHITECTURE.md')));
  assert.ok(fs.existsSync(path.join(project.workspace_path, 'UX_SPEC.md')));
  assert.ok(fs.existsSync(path.join(project.workspace_path, 'index.html')));
  assert.ok(fs.existsSync(path.join(project.workspace_path, 'TASK_PLAN.json')));
  assert.ok(fs.existsSync(path.join(project.workspace_path, 'PROJECT_STATE.json')));
  assert.ok(completed.artifact_path);
  assert.equal(JSON.parse(completed.quality_report).status, 'PASS');

  assert.equal(orchestrator.acceptProject(project.id).status, 'accepted');
  orchestrator.submitFeedback(project.id, 'Başlıktaki metni gözden geçir.');
  const reviewedAgain = await waitForStatus(database, project.id, ['awaiting_user_review', 'failed']);
  assert.equal(reviewedAgain.status, 'awaiting_user_review', reviewedAgain.error);
  assert.equal(database.listAgentRuns(project.id).filter(run => run.agent_name === 'Feedback Repair Agent').length, 1);
  assert.equal(orchestrator.acceptProject(project.id).status, 'accepted');
  database.close();
});

test('project creation persists executable user flows as an agent contract', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'mvp-user-flows-'));
  const database = new Database(path.join(directory, 'studio.db'));
  const orchestrator = new Orchestrator({
    database, runner: new FakeRunner(), projectsDir: path.join(directory, 'projects'),
    flutterChecker: workspace => ({ checks: {
      analyze: { status: 'PASS', exit_code: 0 }, test: { status: 'PASS', exit_code: 0 },
      apk: { status: 'PASS', exit_code: 0, path: createFakeApk(workspace) },
    } }),
  });
  const spec = fs.readFileSync(path.resolve('templates/PROJECT_SPEC.mobile.template.md'), 'utf8');
  const project = orchestrator.createProject('Flow Contract', spec);
  const contract = JSON.parse(fs.readFileSync(path.join(project.workspace_path, 'USER_FLOWS.json'), 'utf8'));
  assert.equal(contract.version, 1);
  assert.equal(contract.flows.length, 3);
  assert.equal(contract.flows[0].steps.length, 4);
  assert.match(contract.flows[0].expected, /yeniden açılışta korunur/);
  const completed = await waitForStatus(database, project.id, ['awaiting_user_review', 'failed']);
  assert.equal(completed.status, 'awaiting_user_review', completed.error);
  assert.deepEqual(database.listAgentRuns(project.id).slice(0, 4).map(run => run.role).sort(), [
    'architecture', 'data_model', 'test_strategy', 'ux',
  ]);
  assert.ok(fs.existsSync(path.join(project.workspace_path, 'DATA_MODEL.md')));
  assert.ok(fs.existsSync(path.join(project.workspace_path, 'TEST_STRATEGY.md')));
});

test('context exhaustion pauses at a Git checkpoint and resumes without rerunning plans', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'mvp-checkpoint-'));
  const database = new Database(path.join(directory, 'studio.db'));
  const runner = new ContextLimitedRunner();
  const orchestrator = new Orchestrator({
    database,
    runner,
    projectsDir: path.join(directory, 'projects'),
    maxConcurrentRuns: 1,
    flutterChecker: workspace => ({ checks: {
      analyze: { status: 'PASS', exit_code: 0 }, test: { status: 'PASS', exit_code: 0 },
      apk: { status: 'PASS', exit_code: 0, path: createFakeApk(workspace) },
    } }),
  });
  const project = orchestrator.createProject('Checkpoint MVP', '# Approved specification');

  const paused = await waitForStatus(database, project.id, ['paused_context']);
  assert.equal(paused.status, 'paused_context', paused.error);
  assert.equal(database.listAgentRuns(project.id).filter(run => run.role === 'architecture').length, 1);
  const pausedBuilder = database.listTasks(project.id).find(task => task.status === 'paused_context');
  assert.match(fs.readFileSync(path.join(pausedBuilder.workspace_path, 'index.html'), 'utf8'), /partial checkpoint/);

  // A process can fail after the agent finishes but before validation commits.
  // Resume must recover that stale transient task state instead of deadlocking the graph.
  database.updateProject(project.id, { status: 'failed', error: 'validation interrupted' });
  database.updateTask(pausedBuilder.id, { status: 'validating', error: null });
  orchestrator.resumeProject(project.id);
  const completed = await waitForStatus(database, project.id, ['awaiting_user_review', 'failed']);
  assert.equal(completed.status, 'awaiting_user_review', completed.error);
  const runs = database.listAgentRuns(project.id);
  assert.equal(runs.filter(run => run.role === 'architecture').length, 1);
  assert.deepEqual(runs.filter(run => run.role === 'flutter_builder').map(run => run.status), [
    'paused_context', 'completed',
  ]);
  assert.ok(runs.every(run => run.checkpoint_commit));
  database.close();
});

test('user feedback round must clear the same device gate as the main pipeline', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'mvp-feedback-device-'));
  const database = new Database(path.join(directory, 'studio.db'));
  const deviceCalls = [];
  let deviceOutcome = { status: 'PASS', checks: { flow_coverage: { status: 'PASS' } }, logs: {} };
  const orchestrator = new Orchestrator({
    database,
    runner: new FakeRunner(),
    projectsDir: path.join(directory, 'projects'),
    maxConcurrentRuns: 1,
    flutterChecker: workspace => ({ checks: {
      analyze: { status: 'PASS', exit_code: 0 }, test: { status: 'PASS', exit_code: 0 },
      apk: { status: 'PASS', exit_code: 0, path: createFakeApk(workspace) },
    } }),
    deviceTester: ({ packageName }) => {
      deviceCalls.push(packageName);
      return deviceOutcome;
    },
  });
  const spec = fs.readFileSync(path.resolve(
    path.dirname(fileURLToPath(import.meta.url)), '..', 'examples', 'odak-mini', 'PROJECT_SPEC.md',
  ), 'utf8');
  const project = orchestrator.createProject('Odak Mini', spec);

  const built = await waitForStatus(database, project.id, ['awaiting_user_review', 'failed']);
  assert.equal(built.status, 'awaiting_user_review', built.error);
  assert.equal(deviceCalls.length, 1);

  // A broken emulator during the feedback round must park the project, not fail it.
  deviceOutcome = {
    status: 'WAITING', failure_kind: 'environment', reason: 'Emülatör koptu.',
    checks: { flow_coverage: { status: 'PASS' } }, logs: {},
  };
  orchestrator.submitFeedback(project.id, 'Ana ekrandaki başlığı sadeleştir.');
  const waiting = await waitForStatus(database, project.id, [
    'awaiting_device_test', 'awaiting_user_review', 'failed',
  ]);
  assert.equal(waiting.status, 'awaiting_device_test', waiting.error);
  assert.equal(deviceCalls.length, 2);
  assert.equal(database.getProject(project.id).status, 'awaiting_device_test');

  // Resuming stays on the feedback path and does not pay for the repair agent twice.
  deviceOutcome = { status: 'PASS', checks: { flow_coverage: { status: 'PASS' } }, logs: {} };
  orchestrator.resumeProject(project.id);
  const reviewed = await waitForStatus(database, project.id, ['awaiting_user_review', 'failed']);
  assert.equal(reviewed.status, 'awaiting_user_review', reviewed.error);
  assert.equal(deviceCalls.length, 3);
  const runs = database.listAgentRuns(project.id);
  assert.equal(runs.filter(run => run.agent_name === 'Feedback Repair Agent').length, 1);
  assert.equal(database.getProject(project.id).user_feedback, null);
  database.close();
});

test('a task plan over the builder limit is rejected and requested again', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'mvp-plan-limit-'));
  const database = new Database(path.join(directory, 'studio.db'));
  const coordinatorPrompts = [];

  class OverEagerCoordinator extends FakeRunner {
    async run(options) {
      if (!options.prompt.includes('Produce only TASK_PLAN.json')) return super.run(options);
      coordinatorPrompts.push(options.prompt);
      if (coordinatorPrompts.length > 1) return super.run(options);
      fs.writeFileSync(path.join(options.workspace, 'TASK_PLAN.json'), JSON.stringify({
        version: 1,
        profile: 'flutter_mobile',
        tasks: ['one', 'two', 'three', 'four'].map((id, index) => ({
          id, title: id, prompt: 'Build it.', depends_on: [],
          allowed_paths: [`lib/${id}/`], required_outputs: [], acceptance_checks: [], priority: index,
        })),
      }));
      options.onEvent('turn.completed', { type: 'turn.completed' });
      return 'Agent completed.';
    }
  }

  const orchestrator = new Orchestrator({
    database,
    runner: new OverEagerCoordinator(),
    projectsDir: path.join(directory, 'projects'),
    maxConcurrentRuns: 1,
    flutterChecker: workspace => ({ checks: {
      analyze: { status: 'PASS', exit_code: 0 }, test: { status: 'PASS', exit_code: 0 },
      apk: { status: 'PASS', exit_code: 0, path: createFakeApk(workspace) },
    } }),
  });
  const spec = fs.readFileSync(path.resolve(
    path.dirname(fileURLToPath(import.meta.url)), '..', 'examples', 'odak-mini', 'PROJECT_SPEC.md',
  ), 'utf8');
  const project = orchestrator.createProject('Odak Mini', spec);
  const completed = await waitForStatus(database, project.id, ['awaiting_user_review', 'failed']);

  assert.equal(completed.status, 'awaiting_user_review', completed.error);
  assert.equal(coordinatorPrompts.length, 2);
  // The prompt states the same limit the validator enforces.
  assert.match(coordinatorPrompts[0], /Create 2 to 3 coarse/);
  assert.match(coordinatorPrompts[1], /previous TASK_PLAN\.json was rejected: .*en fazla 3 görev/);
  assert.equal(database.listEvents(project.id).filter(e => e.event_type === 'task_plan.rejected').length, 1);
  assert.equal(JSON.parse(fs.readFileSync(path.join(project.workspace_path, 'TASK_PLAN.json'), 'utf8')).tasks.length, 1);
  database.close();
});

test('resuming after a device wait does not rerun agents that already completed', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'mvp-resume-skip-'));
  const database = new Database(path.join(directory, 'studio.db'));
  let deviceOutcome = {
    status: 'WAITING', failure_kind: 'environment', reason: 'Emülatör koptu.',
    checks: { flow_coverage: { status: 'PASS' } }, logs: {},
  };
  const orchestrator = new Orchestrator({
    database,
    runner: new FakeRunner(),
    projectsDir: path.join(directory, 'projects'),
    maxConcurrentRuns: 1,
    flutterChecker: workspace => ({ checks: {
      analyze: { status: 'PASS', exit_code: 0 }, test: { status: 'PASS', exit_code: 0 },
      apk: { status: 'PASS', exit_code: 0, path: createFakeApk(workspace) },
    } }),
    deviceTester: () => deviceOutcome,
  });
  const spec = fs.readFileSync(path.resolve(
    path.dirname(fileURLToPath(import.meta.url)), '..', 'examples', 'odak-mini', 'PROJECT_SPEC.md',
  ), 'utf8');
  const project = orchestrator.createProject('Odak Mini', spec);

  const waiting = await waitForStatus(database, project.id, ['awaiting_device_test', 'failed', 'awaiting_user_review']);
  assert.equal(waiting.status, 'awaiting_device_test', waiting.error);
  assert.equal(database.getTask(`${project.id}:integration`).status, 'completed');
  const waitingStatus = spawnSync('git', ['status', '--porcelain'], {
    cwd: project.workspace_path, encoding: 'utf8', windowsHide: true,
  });
  assert.equal(waitingStatus.status, 0, waitingStatus.stderr);
  assert.equal(waitingStatus.stdout.trim(), '', 'WAITING cihaz raporu repository\'yi kirli bıraktı');

  // A failed on-demand repair left by an older run must not take the single
  // ready slot from reviewer when the checkpoint resumes.
  database.createTasks([{
    id: `${project.id}:device_repair`, project_id: project.id, name: 'Device Repair',
    role: 'device_repair', status: 'pending', allowed_paths: ['**'],
    depends_on: [`${project.id}:repair`],
  }]);

  deviceOutcome = { status: 'PASS', checks: { flow_coverage: { status: 'PASS' } }, logs: {} };
  orchestrator.resumeProject(project.id);
  const completed = await waitForStatus(database, project.id, ['awaiting_user_review', 'failed']);
  assert.equal(completed.status, 'awaiting_user_review', completed.error);

  const byRole = role => database.listAgentRuns(project.id).filter(run => run.role === role).length;
  assert.equal(byRole('architecture'), 1);
  assert.equal(byRole('coordinator'), 1);
  assert.equal(byRole('integration'), 1, 'tamamlanmış Integration agent yeniden çalıştırıldı');
  assert.equal(byRole('reviewer'), 1);
  const reportHistory = spawnSync(
    'git', ['log', '--format=%s', '--', 'DEVICE_REPORT.json'],
    { cwd: project.workspace_path, encoding: 'utf8', windowsHide: true },
  );
  assert.equal(reportHistory.status, 0, reportHistory.stderr);
  assert.deepEqual(
    reportHistory.stdout.trim().split(/\r?\n/),
    ['test: record Android device report', 'test: record Android device report'],
  );
  database.close();
});

test('a project already in flight cannot be queued a second time', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'mvp-busy-'));
  const database = new Database(path.join(directory, 'studio.db'));
  let release = null;
  const blocked = new Promise(resolve => { release = resolve; });
  let entered = 0;

  class BlockingRunner extends FakeRunner {
    async run(options) {
      entered += 1;
      await blocked;
      return super.run(options);
    }
  }

  const orchestrator = new Orchestrator({
    database,
    runner: new BlockingRunner(),
    projectsDir: path.join(directory, 'projects'),
    maxConcurrentRuns: 1,
    flutterChecker: workspace => ({ checks: {
      analyze: { status: 'PASS', exit_code: 0 }, test: { status: 'PASS', exit_code: 0 },
      apk: { status: 'PASS', exit_code: 0, path: createFakeApk(workspace) },
    } }),
  });
  const project = orchestrator.createProject('Busy MVP', '# Approved specification');

  const deadline = Date.now() + 5_000;
  while (entered === 0 && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 10));
  assert.ok(entered > 0, 'pipeline hiç başlamadı');

  // A task failing while the project is still executing must not start a second run
  // over the same worktrees.
  database.updateTask(`${project.id}:ux`, { status: 'failed', error: 'boom' });
  assert.throws(
    () => orchestrator.retryTask(project.id, `${project.id}:ux`),
    /zaten bir çalışma sürüyor/,
  );
  assert.throws(() => orchestrator.resumeProject(project.id), /durumundayken devam ettirilemez|zaten bir çalışma sürüyor/);

  release();
  const completed = await waitForStatus(database, project.id, ['awaiting_user_review', 'failed']);
  assert.equal(completed.status, 'awaiting_user_review', completed.error);
  database.close();
});

test('the global agent limit caps Codex processes across parallel stages', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'mvp-agent-limit-'));
  const database = new Database(path.join(directory, 'studio.db'));
  let concurrent = 0;
  let peak = 0;

  class TrackingRunner extends FakeRunner {
    async run(options) {
      concurrent += 1;
      peak = Math.max(peak, concurrent);
      try {
        await new Promise(resolve => setTimeout(resolve, 25));
        return await super.run(options);
      } finally {
        concurrent -= 1;
      }
    }
  }

  const orchestrator = new Orchestrator({
    database,
    runner: new TrackingRunner(),
    projectsDir: path.join(directory, 'projects'),
    maxConcurrentRuns: 3,
    maxConcurrentAgents: 1,
    flutterChecker: workspace => ({ checks: {
      analyze: { status: 'PASS', exit_code: 0 }, test: { status: 'PASS', exit_code: 0 },
      apk: { status: 'PASS', exit_code: 0, path: createFakeApk(workspace) },
    } }),
  });
  // Architecture and UX are launched together, so an uncapped run would peak at 2.
  const project = orchestrator.createProject('Limit MVP', '# Approved specification');
  const completed = await waitForStatus(database, project.id, ['awaiting_user_review', 'failed']);

  assert.equal(completed.status, 'awaiting_user_review', completed.error);
  assert.equal(peak, 1, `eşzamanlı agent sayısı ${peak} oldu`);
  database.close();
});

test('an agent writing a look-alike file does not pass the artifact check', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'mvp-artifact-guard-'));
  const database = new Database(path.join(directory, 'studio.db'));

  class SloppyArchitect extends FakeRunner {
    async run(options) {
      const result = await super.run(options);
      if (options.prompt.includes('Produce only ARCHITECTURE.md')) {
        fs.writeFileSync(path.join(options.workspace, 'DRAFT_ARCHITECTURE.md'), '# Kaçak dosya');
      }
      return result;
    }
  }

  const orchestrator = new Orchestrator({
    database,
    runner: new SloppyArchitect(),
    projectsDir: path.join(directory, 'projects'),
    maxConcurrentRuns: 1,
    flutterChecker: () => ({ checks: {} }),
  });
  const project = orchestrator.createProject('Guard MVP', '# Approved specification');
  const failed = await waitForStatus(database, project.id, ['failed', 'awaiting_user_review']);

  assert.equal(failed.status, 'failed');
  assert.match(failed.error, /izin verilmeyen dosyaları değiştirdi.*DRAFT_ARCHITECTURE\.md/s);
  database.close();
});

test('a product failure on the device triggers a targeted repair and a rebuild', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'mvp-device-repair-'));
  const database = new Database(path.join(directory, 'studio.db'));
  const deviceRuns = [];
  const repairPrompts = [];
  let reviewerRuns = 0;
  let builds = 0;

  class RepairingRunner extends FakeRunner {
    async run(options) {
      if (/Review the complete|response JSON only/i.test(options.prompt)) reviewerRuns += 1;
      if (options.prompt.includes('Device repair turu')) {
        repairPrompts.push(options.prompt);
        fs.writeFileSync(path.join(options.workspace, 'device-fix.txt'), `fix ${repairPrompts.length}`);
        options.onEvent('turn.completed', { type: 'turn.completed' });
        return 'Cihaz hatası düzeltildi.';
      }
      return super.run(options);
    }
  }

  const orchestrator = new Orchestrator({
    database,
    runner: new RepairingRunner(),
    projectsDir: path.join(directory, 'projects'),
    maxConcurrentRuns: 1,
    flutterChecker: workspace => {
      builds += 1;
      return { checks: {
        analyze: { status: 'PASS', exit_code: 0 }, test: { status: 'PASS', exit_code: 0 },
        apk: { status: 'PASS', exit_code: 0, path: createFakeApk(workspace) },
      } };
    },
    // Fails once with a real product defect, then passes on the rebuilt APK.
    deviceTester: () => {
      deviceRuns.push(Date.now());
      return deviceRuns.length === 1
        ? {
          status: 'FAIL', failure_kind: 'product',
          checks: {
            flow_coverage: { status: 'PASS' },
            integration_test: { status: 'FAIL', exit_code: 1 },
          },
          logs: { integration_test: 'EXCEPTION CAUGHT BY FLUTTER TEST FRAMEWORK\nExpected: <1>' },
        }
        : { status: 'PASS', checks: { flow_coverage: { status: 'PASS' } }, logs: {} };
    },
  });
  const spec = fs.readFileSync(path.resolve(
    path.dirname(fileURLToPath(import.meta.url)), '..', 'examples', 'odak-mini', 'PROJECT_SPEC.md',
  ), 'utf8');
  const project = orchestrator.createProject('Odak Mini', spec);
  const completed = await waitForStatus(database, project.id, ['awaiting_user_review', 'failed']);

  assert.equal(completed.status, 'awaiting_user_review', completed.error);
  assert.equal(deviceRuns.length, 2, 'cihaz kapısı düzeltmeden sonra tekrar çalışmadı');
  assert.equal(repairPrompts.length, 1);
  assert.match(repairPrompts[0], /Cihazda integration test: FAIL/);
  assert.match(repairPrompts[0], /Device repair turu 1\/2/);
  assert.equal(builds, 2, 'düzeltmeden sonra APK yeniden üretilmedi');
  assert.equal(database.getTask(`${project.id}:device_repair`).status, 'completed');
  assert.equal(reviewerRuns, 2, 'device repair final kodu yeniden reviewer incelemesine göndermedi');
  assert.equal(database.getTask(`${project.id}:reviewer`).status, 'completed');
  const gitStatus = spawnSync('git', ['status', '--porcelain'], {
    cwd: project.workspace_path, encoding: 'utf8', windowsHide: true,
  });
  assert.equal(gitStatus.status, 0, gitStatus.stderr);
  assert.equal(gitStatus.stdout.trim(), '', 'cihaz raporu generated repository\'yi kirli bıraktı');
  const reportHistory = spawnSync(
    'git', ['log', '--format=%s', '--', 'DEVICE_REPORT.json'],
    { cwd: project.workspace_path, encoding: 'utf8', windowsHide: true },
  );
  assert.equal(reportHistory.status, 0, reportHistory.stderr);
  assert.deepEqual(
    reportHistory.stdout.trim().split(/\r?\n/),
    ['test: record Android device report', 'test: record Android device report'],
  );
  database.close();
});

test('an unfixable device failure stops after the allowed rounds with a root cause report', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'mvp-device-stuck-'));
  const database = new Database(path.join(directory, 'studio.db'));
  let deviceRuns = 0;

  class RepairingRunner extends FakeRunner {
    async run(options) {
      if (!options.prompt.includes('Device repair turu')) return super.run(options);
      fs.writeFileSync(path.join(options.workspace, `attempt-${deviceRuns}.txt`), 'denendi');
      options.onEvent('turn.completed', { type: 'turn.completed' });
      return 'Denendi.';
    }
  }

  const orchestrator = new Orchestrator({
    database,
    runner: new RepairingRunner(),
    projectsDir: path.join(directory, 'projects'),
    maxConcurrentRuns: 1,
    flutterChecker: workspace => ({ checks: {
      analyze: { status: 'PASS', exit_code: 0 }, test: { status: 'PASS', exit_code: 0 },
      apk: { status: 'PASS', exit_code: 0, path: createFakeApk(workspace) },
    } }),
    deviceTester: () => {
      deviceRuns += 1;
      return {
        status: 'FAIL', failure_kind: 'product',
        checks: { flow_coverage: { status: 'PASS' }, integration_test: { status: 'FAIL', exit_code: 1 } },
        // Same signature every round: the loop must stop early.
        logs: { integration_test: 'EXCEPTION CAUGHT BY FLUTTER TEST FRAMEWORK\nExpected: <1>' },
      };
    },
  });
  const spec = fs.readFileSync(path.resolve(
    path.dirname(fileURLToPath(import.meta.url)), '..', 'examples', 'odak-mini', 'PROJECT_SPEC.md',
  ), 'utf8');
  const project = orchestrator.createProject('Odak Mini', spec);
  const failed = await waitForStatus(database, project.id, ['failed', 'awaiting_user_review']);

  assert.equal(failed.status, 'failed');
  assert.match(failed.error, /Android cihaz kalite kapısı geçilemedi/);
  assert.equal(deviceRuns, 2, 'aynı hata imzasında döngü erken durmalı');
  const rootCause = fs.readFileSync(
    path.join(project.workspace_path, 'DEVICE_ROOT_CAUSE_REPORT.md'), 'utf8',
  );
  assert.match(rootCause, /Aynı cihaz hatası iki ardışık koşuda/);
  assert.match(rootCause, /Arıza türü: product/);
  assert.equal(database.getTask(`${project.id}:device_repair`).status, 'failed');
  database.close();
});

test('independent builders overlap instead of waiting for the slowest of a wave', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'mvp-parallel-'));
  const database = new Database(path.join(directory, 'studio.db'));
  let active = 0;
  let peak = 0;
  const finishOrder = [];

  class TimedRunner extends FakeRunner {
    async run(options) {
      if (options.prompt.includes('Produce only TASK_PLAN.json')) {
        fs.writeFileSync(path.join(options.workspace, 'TASK_PLAN.json'), JSON.stringify({
          version: 1,
          profile: 'flutter_mobile',
          tasks: [
            { id: 'shell', title: 'Shell', prompt: 'x', depends_on: [], allowed_paths: ['lib/app/**'], required_outputs: [], acceptance_checks: [], priority: 3 },
            { id: 'slow', title: 'Slow', prompt: 'x', depends_on: ['shell'], allowed_paths: ['lib/features/slow/**'], required_outputs: [], acceptance_checks: [], priority: 2 },
            { id: 'quick', title: 'Quick', prompt: 'x', depends_on: ['shell'], allowed_paths: ['lib/features/quick/**'], required_outputs: [], acceptance_checks: [], priority: 1 },
          ],
        }));
        options.onEvent('turn.completed', { type: 'turn.completed' });
        return 'Agent completed.';
      }
      if (options.prompt.includes('Complete only task')) {
        // TASK_PLAN.json is part of the context package, so match the assignment line.
        const assignment = options.prompt.match(/Complete only task "([^"]+)"/)[1];
        const slow = assignment === 'Slow';
        const folder = slow ? 'slow' : assignment === 'Quick' ? 'quick' : 'app';
        active += 1;
        peak = Math.max(peak, active);
        try {
          await new Promise(resolve => setTimeout(resolve, slow ? 600 : 20));
          fs.mkdirSync(path.join(options.workspace, 'lib', folder === 'app' ? 'app' : `features/${folder}`), { recursive: true });
          fs.writeFileSync(
            path.join(options.workspace, 'lib', folder === 'app' ? 'app/shell.dart' : `features/${folder}/${folder}.dart`),
            '// generated',
          );
          finishOrder.push(folder);
        } finally {
          active -= 1;
        }
        options.onEvent('turn.completed', { type: 'turn.completed' });
        return 'Agent completed.';
      }
      return super.run(options);
    }
  }

  const orchestrator = new Orchestrator({
    database,
    runner: new TimedRunner(),
    projectsDir: path.join(directory, 'projects'),
    maxConcurrentRuns: 1,
    maxParallelBuilders: 3,
    maxConcurrentAgents: 3,
    flutterChecker: workspace => ({ checks: {
      analyze: { status: 'PASS', exit_code: 0 }, test: { status: 'PASS', exit_code: 0 },
      apk: { status: 'PASS', exit_code: 0, path: createFakeApk(workspace) },
    } }),
  });
  const project = orchestrator.createProject('Parallel MVP', '# Approved specification');
  const completed = await waitForStatus(database, project.id, ['awaiting_user_review', 'failed']);

  assert.equal(completed.status, 'awaiting_user_review', completed.error);
  assert.ok(peak >= 2, `bağımsız builder'lar örtüşmedi (zirve ${peak})`);
  // The quick task must not be held back by the slow one it does not depend on.
  assert.equal(finishOrder[0], 'app');
  assert.ok(
    finishOrder.indexOf('quick') < finishOrder.indexOf('slow'),
    `hızlı görev yavaş olanı bekledi: ${finishOrder.join(' -> ')}`,
  );
  database.close();
});

test('the reviewer runs while the device gate exercises the APK', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'mvp-review-overlap-'));
  const database = new Database(path.join(directory, 'studio.db'));
  let reviewerActive = false;
  let overlapped = false;

  class SlowReviewer extends FakeRunner {
    async run(options) {
      if (!/response JSON only|Review the complete/i.test(options.prompt)) return super.run(options);
      reviewerActive = true;
      try {
        await new Promise(resolve => setTimeout(resolve, 150));
        return await super.run(options);
      } finally {
        reviewerActive = false;
      }
    }
  }

  const orchestrator = new Orchestrator({
    database,
    runner: new SlowReviewer(),
    projectsDir: path.join(directory, 'projects'),
    maxConcurrentRuns: 1,
    flutterChecker: workspace => ({ checks: {
      analyze: { status: 'PASS', exit_code: 0 }, test: { status: 'PASS', exit_code: 0 },
      apk: { status: 'PASS', exit_code: 0, path: createFakeApk(workspace) },
    } }),
    deviceTester: () => {
      overlapped = overlapped || reviewerActive;
      return { status: 'PASS', checks: { flow_coverage: { status: 'PASS' } }, logs: {} };
    },
  });
  const spec = fs.readFileSync(path.resolve(
    path.dirname(fileURLToPath(import.meta.url)), '..', 'examples', 'odak-mini', 'PROJECT_SPEC.md',
  ), 'utf8');
  const project = orchestrator.createProject('Odak Mini', spec);
  const completed = await waitForStatus(database, project.id, ['awaiting_user_review', 'failed']);

  assert.equal(completed.status, 'awaiting_user_review', completed.error);
  assert.ok(overlapped, 'cihaz kapısı reviewer ile örtüşmedi');
  assert.equal(database.listAgentRuns(project.id).filter(run => run.role === 'reviewer').length, 1);
  database.close();
});

test('a fixable review finding gets a repair round instead of failing the project', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'mvp-review-repair-'));
  const database = new Database(path.join(directory, 'studio.db'));
  const repairPrompts = [];
  let reviews = 0;
  let gateRuns = 0;

  class BlockingReviewer extends FakeRunner {
    async run(options) {
      if (options.prompt.includes('Review repair turu')) {
        repairPrompts.push(options.prompt);
        fs.writeFileSync(path.join(options.workspace, 'review-fix.txt'), 'düzeltildi');
        options.onEvent('turn.completed', { type: 'turn.completed' });
        return 'Bulgu giderildi.';
      }
      if (!/Review the complete|response JSON only/i.test(options.prompt)) return super.run(options);
      reviews += 1;
      options.onEvent('turn.completed', { type: 'turn.completed' });
      // The reviewer reports findings as objects, exactly like the real one did.
      return reviews === 1
        ? fakeReview(options.workspace, {
          status: 'FAIL',
          issues: [{ file: 'lib/grade_add_page.dart:313', description: 'digitsOnly doğrulamadan önce uygulanıyor.' }],
          notes: ['Kapılar yetkili kabul edildi.'],
        })
        : fakeReview(options.workspace);
    }
  }

  const orchestrator = new Orchestrator({
    database,
    runner: new BlockingReviewer(),
    projectsDir: path.join(directory, 'projects'),
    maxConcurrentRuns: 1,
    flutterChecker: workspace => {
      gateRuns += 1;
      return { checks: {
        analyze: { status: 'PASS', exit_code: 0 }, test: { status: 'PASS', exit_code: 0 },
        apk: { status: 'PASS', exit_code: 0, path: createFakeApk(workspace) },
      } };
    },
    deviceTester: () => ({ status: 'PASS', checks: { flow_coverage: { status: 'PASS' } }, logs: {} }),
  });
  const spec = fs.readFileSync(path.resolve(
    path.dirname(fileURLToPath(import.meta.url)), '..', 'examples', 'odak-mini', 'PROJECT_SPEC.md',
  ), 'utf8');
  const project = orchestrator.createProject('Odak Mini', spec);
  const completed = await waitForStatus(database, project.id, ['awaiting_user_review', 'failed']);

  assert.equal(completed.status, 'awaiting_user_review', completed.error);
  assert.equal(repairPrompts.length, 1);
  // The object-shaped finding must reach the repair agent as readable text.
  assert.match(repairPrompts[0], /lib\/grade_add_page\.dart:313: digitsOnly doğrulamadan önce uygulanıyor\./);
  assert.equal(reviews, 2, 'düzeltmeden sonra yeniden inceleme yapılmadı');
  assert.equal(gateRuns, 2, 'düzeltmeden sonra kalite kapısı yeniden koşmadı');
  assert.equal(database.getTask(`${project.id}:review_repair`).status, 'completed');
  database.close();
});

test('a review finding that survives its repair rounds fails with the reasons attached', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'mvp-review-stuck-'));
  const database = new Database(path.join(directory, 'studio.db'));
  let reviews = 0;

  class StubbornReviewer extends FakeRunner {
    async run(options) {
      if (options.prompt.includes('Review repair turu')) {
        fs.writeFileSync(path.join(options.workspace, `try-${reviews}.txt`), 'denendi');
        options.onEvent('turn.completed', { type: 'turn.completed' });
        return 'Denendi.';
      }
      if (!/Review the complete|response JSON only/i.test(options.prompt)) return super.run(options);
      reviews += 1;
      options.onEvent('turn.completed', { type: 'turn.completed' });
      return JSON.stringify({
        status: 'FAIL',
        summary: 'Aynı kusur duruyor.',
        issues: [{ file: 'lib/a.dart:10', description: 'Hâlâ bozuk.' }],
      });
    }
  }

  const orchestrator = new Orchestrator({
    database,
    runner: new StubbornReviewer(),
    projectsDir: path.join(directory, 'projects'),
    maxConcurrentRuns: 1,
    flutterChecker: workspace => ({ checks: {
      analyze: { status: 'PASS', exit_code: 0 }, test: { status: 'PASS', exit_code: 0 },
      apk: { status: 'PASS', exit_code: 0, path: createFakeApk(workspace) },
    } }),
  });
  const project = orchestrator.createProject('Stuck MVP', '# Approved specification');
  const failed = await waitForStatus(database, project.id, ['failed', 'awaiting_user_review']);

  assert.equal(failed.status, 'failed');
  // Identical findings stop the loop early instead of spending every round.
  assert.equal(reviews, 2);
  assert.match(failed.error, /bulgular değişmedi/);
  assert.match(failed.error, /lib\/a\.dart:10: Hâlâ bozuk\./);
  assert.doesNotMatch(failed.error, /\[object Object\]/);
  database.close();
});

test('a rerun review is shown its own previous findings and the acceptance checklist', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'mvp-review-memory-'));
  const database = new Database(path.join(directory, 'studio.db'));
  const reviewPrompts = [];
  let reviews = 0;

  class RememberingReviewer extends FakeRunner {
    async run(options) {
      if (options.prompt.includes('Review repair turu')) {
        fs.writeFileSync(path.join(options.workspace, 'fix.txt'), 'düzeltildi');
        options.onEvent('turn.completed', { type: 'turn.completed' });
        return 'Bulgu giderildi.';
      }
      if (!/Review the complete Flutter/i.test(options.prompt)) return super.run(options);
      reviewPrompts.push(options.prompt);
      reviews += 1;
      options.onEvent('turn.completed', { type: 'turn.completed' });
      return reviews === 1
        ? fakeReview(options.workspace, {
          status: 'FAIL',
          issues: [{ file: 'lib/score_field.dart:12', description: 'Ondalık girdi sessizce dönüştürülüyor.' }],
        })
        : fakeReview(options.workspace);
    }
  }

  const orchestrator = new Orchestrator({
    database,
    runner: new RememberingReviewer(),
    projectsDir: path.join(directory, 'projects'),
    maxConcurrentRuns: 1,
    flutterChecker: workspace => ({ checks: {
      analyze: { status: 'PASS', exit_code: 0 }, test: { status: 'PASS', exit_code: 0 },
      apk: { status: 'PASS', exit_code: 0, path: createFakeApk(workspace) },
    } }),
  });
  const spec = fs.readFileSync(path.resolve(
    path.dirname(fileURLToPath(import.meta.url)), '..', 'examples', 'odak-mini', 'PROJECT_SPEC.md',
  ), 'utf8');
  const project = orchestrator.createProject('Odak Mini', spec);
  const completed = await waitForStatus(database, project.id, ['awaiting_user_review', 'failed']);

  assert.equal(completed.status, 'awaiting_user_review', completed.error);
  assert.ok(fs.existsSync(path.join(project.workspace_path, 'ACCEPTANCE_CRITERIA.json')));

  // The checklist is stated up front, so blocking authority is bounded.
  assert.match(reviewPrompts[0], /kabul kriterleri, senin yanıtlaman gereken liste budur/);
  assert.match(reviewPrompts[0], /AC1: /);
  assert.doesNotMatch(reviewPrompts[0], /previous review blocked/);

  // The rerun cannot silently reverse the earlier verdict.
  assert.match(reviewPrompts[1], /previous review blocked this project/);
  assert.match(reviewPrompts[1], /lib\/score_field\.dart:12: Ondalık girdi sessizce dönüştürülüyor\./);
  database.close();
});

test('a runaway pipeline stops at the token budget instead of spending on', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'mvp-budget-'));
  const database = new Database(path.join(directory, 'studio.db'));
  let agentRuns = 0;

  class CostlyRunner extends FakeRunner {
    async run(options) {
      agentRuns += 1;
      // Each agent reports a large uncached turn, like a real Codex call.
      options.onEvent('turn.completed', {
        type: 'turn.completed',
        usage: { input_tokens: 90_000, cached_input_tokens: 10_000, output_tokens: 5_000 },
      });
      return super.run(options);
    }
  }

  const orchestrator = new Orchestrator({
    database,
    runner: new CostlyRunner(),
    projectsDir: path.join(directory, 'projects'),
    maxConcurrentRuns: 1,
    tokenBudget: 200_000,
    flutterChecker: workspace => ({ checks: {
      analyze: { status: 'PASS', exit_code: 0 }, test: { status: 'PASS', exit_code: 0 },
      apk: { status: 'PASS', exit_code: 0, path: createFakeApk(workspace) },
    } }),
  });
  const project = orchestrator.createProject('Costly MVP', '# Approved specification');
  const stopped = await waitForStatus(database, project.id, ['failed', 'awaiting_user_review']);

  assert.equal(stopped.status, 'failed');
  assert.match(stopped.error, /Token bütçesi aşıldı/);
  assert.match(stopped.error, /MVP_STUDIO_PROJECT_TOKEN_BUDGET/);
  // Each run bills 85k, so the guard must bite before the pipeline finishes.
  assert.ok(agentRuns >= 2 && agentRuns <= 4, `beklenmeyen agent sayısı: ${agentRuns}`);

  // Resuming grants a fresh budget: continuing is the user's decision.
  const spentBefore = database.sumProjectTokens(project.id).billable;
  assert.ok(spentBefore >= 200_000);
  orchestrator.resumeProject(project.id);
  await waitForStatus(database, project.id, ['failed', 'awaiting_user_review']);
  assert.ok(database.sumProjectTokens(project.id).billable > spentBefore, 'resume yeni bütçe açmadı');
  database.close();
});
