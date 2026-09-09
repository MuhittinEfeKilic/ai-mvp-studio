import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  Database, IN_FLIGHT_PROJECT_STATUSES, RESUMABLE_PROJECT_STATUSES,
} from '../src/database.mjs';

test('project round-trip works', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'mvp-studio-'));
  const database = new Database(path.join(directory, 'test.db'));
  database.createProject({
    id: 'project-1', name: 'Test MVP', prompt: 'Build a useful test MVP',
    status: 'queued', workspace_path: path.join(directory, 'project-1'),
  });
  const project = database.getProject('project-1');
  assert.equal(project.name, 'Test MVP');
  assert.equal(project.status, 'queued');
  database.close();
});

test('every in-flight project status becomes resumable after a restart', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'mvp-stale-'));
  const database = new Database(path.join(directory, 'test.db'));
  const keep = ['awaiting_user_review', 'accepted', 'failed', 'paused_context', 'awaiting_device_test'];
  for (const status of [...IN_FLIGHT_PROJECT_STATUSES, ...keep]) {
    database.createProject({
      id: `project-${status}`, name: status, prompt: 'spec', status,
      workspace_path: path.join(directory, status),
    });
  }
  database.createProject({
    id: 'project-stale-review', name: 'stale review', prompt: 'spec',
    status: 'awaiting_user_review', workspace_path: path.join(directory, 'stale-review'),
  });
  database.createTasks([{
    id: 'project-stale-review:reviewer', project_id: 'project-stale-review',
    name: 'Reviewer', role: 'reviewer', status: 'pending', allowed_paths: ['**'],
  }]);

  database.markStaleRunsInterrupted();

  for (const status of IN_FLIGHT_PROJECT_STATUSES) {
    const project = database.getProject(`project-${status}`);
    assert.equal(project.status, 'interrupted', `${status} kurtarılamadı`);
    assert.ok(RESUMABLE_PROJECT_STATUSES.includes(project.status));
  }
  for (const status of keep) {
    assert.equal(database.getProject(`project-${status}`).status, status);
  }
  assert.equal(database.getProject('project-stale-review').status, 'interrupted');
  assert.match(database.getProject('project-stale-review').error, /Reviewer final kodu tamamlamadığı/);
  database.close();
});
