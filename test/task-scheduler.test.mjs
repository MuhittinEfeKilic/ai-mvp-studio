import assert from 'node:assert/strict';
import test from 'node:test';

import { pathsOverlap, selectReadyTasks } from '../src/task-scheduler.mjs';

const task = (id, overrides = {}) => ({
  id,
  status: 'pending',
  depends_on: [],
  allowed_paths: [`lib/features/${id}/**`],
  ...overrides,
});

test('selects only tasks whose dependencies are completed', () => {
  const tasks = [
    task('architecture', { status: 'completed' }),
    task('feature', { depends_on: ['architecture'] }),
    task('blocked', { depends_on: ['missing'] }),
  ];

  assert.deepEqual(selectReadyTasks(tasks, { capacity: 3 }).map(item => item.id), ['feature']);
});

test('respects remaining concurrency capacity', () => {
  const tasks = [
    task('running', { status: 'running' }),
    task('alpha'),
    task('beta'),
    task('gamma'),
  ];

  assert.deepEqual(selectReadyTasks(tasks, { capacity: 3 }).map(item => item.id), ['alpha', 'beta']);
  assert.deepEqual(selectReadyTasks(tasks, { capacity: 1 }), []);
});

test('avoids path overlap with running and newly selected tasks', () => {
  const tasks = [
    task('running', { status: 'running', allowed_paths: ['lib/core/**'] }),
    task('core-child', { allowed_paths: ['lib/core/navigation/**'] }),
    task('feature-a', { allowed_paths: ['lib/features/a/**'] }),
    task('feature-a-test', { allowed_paths: ['lib/features/a/tests/**'] }),
    task('feature-b', { allowed_paths: ['lib/features/b/**'] }),
  ];

  assert.deepEqual(
    selectReadyTasks(tasks, { capacity: 4 }).map(item => item.id),
    ['feature-a', 'feature-b'],
  );
});

test('selection is deterministic by priority then task id', () => {
  const tasks = [task('zeta'), task('beta', { priority: 2 }), task('alpha', { priority: 2 })];

  assert.deepEqual(selectReadyTasks(tasks, { capacity: 3 }).map(item => item.id), [
    'alpha', 'beta', 'zeta',
  ]);
  assert.deepEqual(selectReadyTasks([...tasks].reverse(), { capacity: 3 }).map(item => item.id), [
    'alpha', 'beta', 'zeta',
  ]);
});

test('path comparison handles separators, globs, siblings, and unrestricted tasks', () => {
  assert.equal(pathsOverlap('lib\\core\\**', './lib/core/navigation/**'), true);
  assert.equal(pathsOverlap('lib/features/a/**', 'lib/features/b/**'), false);
  assert.equal(pathsOverlap('**', 'lib/features/a/**'), true);

  const unrestricted = task('unrestricted', { allowed_paths: [] });
  const scoped = task('scoped');
  assert.deepEqual(selectReadyTasks([unrestricted, scoped], { capacity: 2 }).map(item => item.id), [
    'scoped',
  ]);
});

test('rejects invalid capacity values', () => {
  assert.throws(() => selectReadyTasks([], { capacity: -1 }), RangeError);
  assert.throws(() => selectReadyTasks([], { capacity: 1.5 }), RangeError);
});

