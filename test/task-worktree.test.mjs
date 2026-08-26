import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  getGitChangedPaths,
  orderTasksForIntegration,
  pathMatchesAllowedPattern,
  validateChangedPaths,
} from '../src/task-worktree.mjs';

test('matches repository paths using glob-like task patterns', () => {
  assert.equal(pathMatchesAllowedPattern('lib/features/tasks/view.dart', 'lib/features/tasks/**'), true);
  assert.equal(pathMatchesAllowedPattern('lib\\features\\tasks\\view.dart', './lib/features/*/*.dart'), true);
  assert.equal(pathMatchesAllowedPattern('test/widget.dart', 'lib/**'), false);
  assert.equal(pathMatchesAllowedPattern('../outside.txt', '**'), false);
  assert.equal(pathMatchesAllowedPattern('C:\\outside.txt', '**'), false);
});

test('treats trailing-slash task paths as directory ownership', () => {
  assert.equal(pathMatchesAllowedPattern('android/app/build.gradle', 'android/'), true);
  assert.equal(pathMatchesAllowedPattern('lib/app/router.dart', 'lib/app/'), true);
  assert.equal(pathMatchesAllowedPattern('lib/core/database/db.dart', 'lib/core/'), true);
  assert.equal(pathMatchesAllowedPattern('lib/features/example.dart', 'lib/app/'), false);
  assert.deepEqual(
    validateChangedPaths(
      ['android/app/build.gradle', 'lib/app/router.dart', 'lib/core/database/db.dart'],
      ['android/', 'lib/app/', 'lib/core/'],
    ),
    {
      ok: true,
      changedPaths: ['android/app/build.gradle', 'lib/app/router.dart', 'lib/core/database/db.dart'],
      allowedPaths: ['android/**', 'lib/app/**', 'lib/core/**'],
      violations: [],
    },
  );
});

test('reports stable path ownership violations and rejects an empty allow-list', () => {
  assert.deepEqual(
    validateChangedPaths(
      ['test/z_test.dart', 'lib/features/tasks/view.dart', 'lib/features/tasks/view.dart'],
      ['lib/features/tasks/**'],
    ),
    {
      ok: false,
      changedPaths: ['lib/features/tasks/view.dart', 'test/z_test.dart'],
      allowedPaths: ['lib/features/tasks/**'],
      violations: ['test/z_test.dart'],
    },
  );
  assert.deepEqual(validateChangedPaths(['README.md'], []).violations, ['README.md']);
});

test('discovers tracked and untracked worktree changes relative to a checkpoint', () => {
  const workspace = mkdtempSync(path.join(tmpdir(), 'mvp-task-worktree-'));
  execFileSync('git', ['init', '-q'], { cwd: workspace });
  execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd: workspace });
  execFileSync('git', ['config', 'user.name', 'Test'], { cwd: workspace });
  writeFileSync(path.join(workspace, 'README.md'), 'before\n');
  execFileSync('git', ['add', '.'], { cwd: workspace });
  execFileSync('git', ['commit', '-qm', 'initial'], { cwd: workspace });

  writeFileSync(path.join(workspace, 'README.md'), 'after\n');
  mkdirSync(path.join(workspace, 'lib'));
  writeFileSync(path.join(workspace, 'lib', 'app.dart'), 'void main() {}\n');

  assert.deepEqual(getGitChangedPaths(workspace), ['lib/app.dart', 'README.md']);
});

test('integration order is deterministic and excludes unfinished tasks', () => {
  const tasks = [
    { id: 'zeta', status: 'completed', priority: 1 },
    { id: 'alpha', status: 'validated', priority: 1 },
    { id: 'first', status: 'succeeded', integration_order: 1 },
    { id: 'pending', status: 'pending', integration_order: 0 },
  ];
  assert.deepEqual(orderTasksForIntegration(tasks).map(task => task.id), ['first', 'alpha', 'zeta']);
  assert.deepEqual(orderTasksForIntegration([...tasks].reverse()).map(task => task.id), ['first', 'alpha', 'zeta']);
});

test('rejects invalid validation and ordering inputs', () => {
  assert.throws(() => validateChangedPaths('README.md', []), TypeError);
  assert.throws(() => orderTasksForIntegration(null), TypeError);
});
