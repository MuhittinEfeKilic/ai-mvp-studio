import assert from 'node:assert/strict';
import test from 'node:test';

import { validateTaskPlan } from '../src/task-plan.mjs';

test('task plan normalizes a valid Flutter task graph', () => {
  const plan = validateTaskPlan({ tasks: [
    { id: 'app-shell', allowed_paths: ['lib/app/**'], depends_on: [] },
    { id: 'feature-home', allowed_paths: ['lib/features/home/**'], depends_on: ['app-shell'] },
  ] });
  assert.equal(plan.profile, 'flutter_mobile');
  assert.deepEqual(plan.tasks[1].depends_on, ['app-shell']);
});

test('task plan rejects traversal and unknown dependencies', () => {
  assert.throws(() => validateTaskPlan({ tasks: [
    { id: 'bad-task', allowed_paths: ['../secret'], depends_on: ['missing'] },
  ] }), /allowed_paths/);
});

test('task plan normalizes Coordinator IDs and dependency references', () => {
  const plan = validateTaskPlan({ tasks: [
    { id: 'T01', allowed_paths: ['lib/app/**'] },
    { id: 'T02', allowed_paths: ['lib/data/**'], depends_on: ['T01'] },
  ] });
  assert.deepEqual(plan.tasks.map(task => task.id), ['t01', 't02']);
  assert.deepEqual(plan.tasks[1].depends_on, ['t01']);
});
