import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { Database } from '../src/database.mjs';
import { Orchestrator } from '../src/orchestrator.mjs';

class FakeRunner {
  async run({ workspace, prompt, onEvent }) {
    if (prompt.includes('Produce only ARCHITECTURE.md')) {
      fs.writeFileSync(path.join(workspace, 'ARCHITECTURE.md'), '# Architecture\n\nMinimal plan.');
    } else if (prompt.includes('Produce only UX_SPEC.md')) {
      fs.writeFileSync(path.join(workspace, 'UX_SPEC.md'), '# UX\n\nAccessible UI plan.');
    } else if (prompt.includes('Produce only TASK_PLAN.json')) {
      fs.writeFileSync(path.join(workspace, 'TASK_PLAN.json'), JSON.stringify({
        version: 1,
        profile: 'flutter_mobile',
        tasks: [{
          id: 'app-shell', title: 'App Shell', prompt: 'Create the test UI.', depends_on: [],
          allowed_paths: ['index.html', 'build/'],
          required_outputs: ['index.html', 'build/app/outputs/flutter-apk/app-debug.apk'],
          acceptance_checks: [],
        }],
      }));
    } else if (prompt.includes('Complete only task')) {
      fs.writeFileSync(path.join(workspace, 'index.html'), '<h1>Test MVP</h1>');
    }
    onEvent('turn.completed', { type: 'turn.completed' });
    return /Review the complete Flutter|response JSON only/i.test(prompt)
      ? '{"status":"PASS","summary":"Fake review passed.","issues":[]}' : 'Agent completed.';
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
  assert.equal(contract.flows.length, 2);
  assert.equal(contract.flows[0].steps.length, 4);
  assert.match(contract.flows[0].expected, /yeniden açılışta korunur/);
  await waitForStatus(database, project.id, ['awaiting_user_review', 'failed']);
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
