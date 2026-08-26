import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { Database } from '../src/database.mjs';

function createDatabase() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'mvp-studio-tasks-'));
  const database = new Database(path.join(directory, 'test.db'));
  database.createProject({
    id: 'mobile-app', name: 'Mobile App', prompt: 'Build it', status: 'queued',
    workspace_path: path.join(directory, 'repository'),
  });
  return database;
}

test('tasks persist structured contracts and can be updated', () => {
  const database = createDatabase();
  database.createTask({
    id: 'app-shell', project_id: 'mobile-app', name: 'App shell', role: 'flutter_builder',
    allowed_paths: ['lib/app/**'], required_outputs: ['lib/app/app.dart'],
    acceptance_checks: ['flutter analyze'], branch_name: 'agent/app-shell',
  });

  assert.deepEqual(database.getTask('app-shell').allowed_paths, ['lib/app/**']);
  assert.deepEqual(database.listTasks('mobile-app')[0].acceptance_checks, ['flutter analyze']);
  const updated = database.updateTask('app-shell', {
    status: 'running', attempt_count: 1, required_outputs: ['lib/app/app.dart', 'test/app_test.dart'],
  });
  assert.equal(updated.status, 'running');
  assert.equal(updated.attempt_count, 1);
  assert.deepEqual(updated.required_outputs, ['lib/app/app.dart', 'test/app_test.dart']);
  database.close();
});

test('ready tasks are unblocked only after every dependency completes', () => {
  const database = createDatabase();
  database.createTasks([
    { id: 'architecture', project_id: 'mobile-app', name: 'Architecture', role: 'architect' },
    { id: 'ux', project_id: 'mobile-app', name: 'UX', role: 'ux' },
    {
      id: 'builder', project_id: 'mobile-app', name: 'Builder', role: 'flutter_builder',
      depends_on: ['architecture', 'ux'],
    },
  ]);

  assert.deepEqual(database.listTaskDependencies('builder'), ['architecture', 'ux']);
  assert.deepEqual(database.listReadyTasks('mobile-app').map(task => task.id), ['architecture', 'ux']);
  database.updateTask('architecture', { status: 'completed' });
  assert.deepEqual(database.listReadyTasks('mobile-app').map(task => task.id), ['ux']);
  database.updateTask('ux', { status: 'completed' });
  assert.deepEqual(database.listReadyTasks('mobile-app').map(task => task.id), ['builder']);

  database.removeTaskDependency('builder', 'ux');
  assert.deepEqual(database.listTaskDependencies('builder'), ['architecture']);
  database.close();
});

test('schema initialization is safe on an existing database', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'mvp-studio-migration-'));
  const file = path.join(directory, 'test.db');
  new Database(file).close();
  const database = new Database(file);
  assert.deepEqual(database.listTasks('missing-project'), []);
  database.close();
});
