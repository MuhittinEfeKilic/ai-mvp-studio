import assert from 'node:assert/strict';
import test from 'node:test';

import {
  normalizePackageDependencies, taskGraphWidth, validateTaskPlan,
} from '../src/task-plan.mjs';

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

const parallelPlan = () => ({
  version: 1,
  profile: 'flutter_mobile',
  dependencies: ['sqflite', 'go_router: ^14.0.0', 'Geçersiz Paket', 'sqflite'],
  tasks: [
    { id: 'app-shell', allowed_paths: ['lib/app/**'], depends_on: [] },
    { id: 'catalog', allowed_paths: ['lib/features/catalog/**', 'test/features/catalog/**'], depends_on: ['app-shell'] },
    { id: 'inventory', allowed_paths: ['lib/features/inventory/**', 'test/features/inventory/**'], depends_on: ['app-shell'] },
  ],
});

test('a plan whose independent tasks share file ownership is rejected', () => {
  const plan = parallelPlan();
  // Exactly the nesting that serialised three real builders to x1.00.
  plan.tasks[1].allowed_paths = ['lib/features/catalog/**', 'test/features/**'];
  plan.tasks[2].allowed_paths = ['lib/features/inventory/**', 'test/features/inventory/detail/**'];
  assert.throws(() => validateTaskPlan(plan), /aynı dosyaları sahipleniyor/);

  // Tasks that can never co-run may still share paths.
  const withDependentPair = parallelPlan();
  withDependentPair.tasks.push({
    id: 'catalog-polish',
    allowed_paths: ['lib/features/catalog/widgets/**', 'test/features/catalog/**'],
    depends_on: ['catalog'],
  });
  assert.equal(validateTaskPlan(withDependentPair).tasks.length, 4);
});

test('a fully serial plan of three or more tasks is rejected', () => {
  const plan = parallelPlan();
  plan.tasks[2].depends_on = ['catalog'];
  plan.tasks[2].allowed_paths = ['lib/features/inventory/**'];
  assert.equal(taskGraphWidth(plan.tasks), 1);
  assert.throws(() => validateTaskPlan(plan), /tamamen seri/);

  assert.equal(taskGraphWidth(parallelPlan().tasks), 2);
  assert.equal(validateTaskPlan(parallelPlan()).tasks.length, 3);
});

test('advanced policy enforces task count and real graph width', () => {
  const plan = parallelPlan();
  assert.throws(
    () => validateTaskPlan(plan, { minTasks: 4, maxTasks: 8, minParallelTasks: 4 }),
    /en az 4 görev/,
  );
  plan.tasks.push({
    id: 'reports', allowed_paths: ['lib/features/reports/**'], depends_on: ['app-shell'],
  });
  assert.throws(
    () => validateTaskPlan(plan, { minTasks: 4, maxTasks: 8, minParallelTasks: 4 }),
    /grafik genişliği 3, gereken en az 4/,
  );
  plan.tasks[0].depends_on = [];
  plan.tasks[1].depends_on = [];
  plan.tasks[2].depends_on = [];
  plan.tasks[3].depends_on = [];
  assert.equal(validateTaskPlan(plan, {
    minTasks: 4, maxTasks: 8, minParallelTasks: 4,
  }).tasks.length, 4);
});

test('builders cannot own orchestrator files and dependencies are normalized', () => {
  const plan = parallelPlan();
  plan.tasks[0].allowed_paths = ['lib/app/**', 'pubspec.yaml'];
  assert.throws(() => validateTaskPlan(plan), /orchestrator'a ait dosyaları sahiplenemez/);

  assert.deepEqual(validateTaskPlan(parallelPlan()).dependencies, ['sqflite', 'go_router: ^14.0.0']);
});

test('a cyclic plan is reported instead of deadlocking the scheduler', () => {
  const plan = parallelPlan();
  plan.tasks[0].depends_on = ['inventory'];
  assert.throws(() => validateTaskPlan(plan), /döngüsel bağımlılık/);
});

test('Flutter SDK packages are never installed from pub.dev', () => {
  // `flutter pub add integration_test` resolves an unrelated pre null-safety
  // package and breaks version solving; the scaffold provides the SDK one.
  assert.deepEqual(
    normalizePackageDependencies(['sqflite', 'integration_test', 'path', 'flutter_test', 'flutter']),
    ['sqflite', 'path'],
  );
  const plan = parallelPlan();
  plan.dependencies = ['integration_test', 'sqflite', 'sqflite'];
  assert.deepEqual(validateTaskPlan(plan).dependencies, ['sqflite']);
});
