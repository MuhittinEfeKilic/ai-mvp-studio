import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { Database } from '../src/database.mjs';

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
