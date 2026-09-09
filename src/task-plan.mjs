import fs from 'node:fs';
import path from 'node:path';

import { pathsOverlap } from './task-scheduler.mjs';

const TASK_ID = /^[a-z0-9][a-z0-9-]{1,48}$/;
const RESERVED_TASK_IDS = new Set([
  'architecture', 'ux', 'data-model', 'test-strategy', 'coordinator',
  'integration', 'test', 'repair', 'reviewer',
]);

/** Files the orchestrator owns; a builder claiming them serialises the graph. */
const ORCHESTRATOR_OWNED_PATHS = ['pubspec.yaml', 'pubspec.lock'];

function assertAcyclic(tasks) {
  const dependencies = new Map(tasks.map(task => [task.id, task.depends_on]));
  const state = new Map();
  const visit = (id, trail) => {
    if (state.get(id) === 'done') return;
    if (state.get(id) === 'open') {
      throw new Error(`TASK_PLAN.json döngüsel bağımlılık içeriyor: ${[...trail, id].join(' -> ')}`);
    }
    state.set(id, 'open');
    for (const dependency of dependencies.get(id) || []) visit(dependency, [...trail, id]);
    state.set(id, 'done');
  };
  for (const task of tasks) visit(task.id, []);
}

function transitiveDependencies(tasks) {
  const direct = new Map(tasks.map(task => [task.id, task.depends_on]));
  const closure = new Map();
  const visit = id => {
    if (closure.has(id)) return closure.get(id);
    const reached = new Set();
    closure.set(id, reached);
    for (const dependency of direct.get(id) || []) {
      reached.add(dependency);
      for (const nested of visit(dependency)) reached.add(nested);
    }
    return reached;
  };
  for (const task of tasks) visit(task.id);
  return closure;
}

/** Task pairs with no dependency path between them, so the scheduler may co-run them. */
export function concurrentTaskPairs(tasks) {
  const closure = transitiveDependencies(tasks);
  const pairs = [];
  for (let left = 0; left < tasks.length; left += 1) {
    for (let right = left + 1; right < tasks.length; right += 1) {
      const a = tasks[left];
      const b = tasks[right];
      if (!closure.get(a.id).has(b.id) && !closure.get(b.id).has(a.id)) pairs.push([a, b]);
    }
  }
  return pairs;
}

/** Widest dependency level: how many builder tasks can ever run at the same time. */
export function taskGraphWidth(tasks) {
  const dependencies = new Map(tasks.map(task => [task.id, task.depends_on]));
  const depth = new Map();
  const compute = id => {
    if (depth.has(id)) return depth.get(id);
    depth.set(id, 0);
    const levels = (dependencies.get(id) || []).map(compute);
    const value = levels.length ? Math.max(...levels) + 1 : 0;
    depth.set(id, value);
    return value;
  };
  const counts = new Map();
  for (const task of tasks) {
    const level = compute(task.id);
    counts.set(level, (counts.get(level) || 0) + 1);
  }
  return Math.max(...counts.values());
}

/**
 * Rejects plans that cannot actually run in parallel. Measured on real runs:
 * three independent builders were serialised to x1.00 because one owned
 * `test/features/products/**` while another owned `test/features/products/detail/**`.
 */
function assertParallelizable(tasks, minParallelTasks = 1, minInitialParallelTasks = 1) {
  const conflicts = [];
  for (const [a, b] of concurrentTaskPairs(tasks)) {
    for (const left of a.allowed_paths) {
      for (const right of b.allowed_paths) {
        if (pathsOverlap(left, right)) conflicts.push(`${a.id} (${left}) ↔ ${b.id} (${right})`);
      }
    }
  }
  if (conflicts.length) {
    throw new Error(
      'Birbirine bağlı olmayan görevler aynı dosyaları sahipleniyor, bu yüzden paralel '
      + 'çalışamazlar. İç içe yollar da çakışma sayılır; her yolun tek sahibi olmalı. '
      + `Çakışmalar: ${conflicts.slice(0, 5).join('; ')}`,
    );
  }
  if (tasks.length >= 3 && taskGraphWidth(tasks) < 2) {
    throw new Error(
      'TASK_PLAN.json tamamen seri: her görev bir öncekine bağlı. Üç veya daha fazla '
      + 'görevde en az iki görev birbirinden bağımsız olmalı ki paralel çalışabilsinler.',
    );
  }
  const width = taskGraphWidth(tasks);
  if (width < minParallelTasks) {
    throw new Error(
      `TASK_PLAN.json hedeflenen paralelliği sağlamıyor: grafik genişliği ${width}, `
      + `gereken en az ${minParallelTasks}. Bağımsız ve ayrık path sahibi görevler oluşturun.`,
    );
  }
  const initialTasks = tasks.filter(task => task.depends_on.length === 0).length;
  if (initialTasks < minInitialParallelTasks) {
    throw new Error(
      `TASK_PLAN.json ilk builder dalgasını seri bırakıyor: başlangıçta ${initialTasks} görev, `
      + `gereken en az ${minInitialParallelTasks}. Ortak foundation görevini bütün özelliklerin `
      + 'önkoşulu yapmayın; sözleşmeleri sahiplerine dağıtıp bağımsız modülleri kökten başlatın.',
    );
  }
}

function normalizeTaskId(value) {
  return String(value ?? '').trim().toLowerCase().replace(/[_\s]+/g, '-');
}

function normalizedPatterns(patterns) {
  return [...new Set((patterns || []).map(value => String(value).replaceAll('\\', '/').trim()))]
    .filter(value => value && !value.startsWith('/') && !value.includes('..'));
}

export function validateTaskPlan(rawPlan, {
  maxTasks = 5, minTasks = 1, minParallelTasks = 1, minInitialParallelTasks = 1,
} = {}) {
  const tasks = Array.isArray(rawPlan?.tasks) ? rawPlan.tasks : [];
  if (tasks.length < minTasks) throw new Error(`TASK_PLAN.json en az ${minTasks} görev içermeli.`);
  if (tasks.length > maxTasks) throw new Error(`TASK_PLAN.json en fazla ${maxTasks} görev içerebilir.`);
  const ids = new Set();
  const normalized = tasks.map((task, index) => {
    const id = normalizeTaskId(task.id);
    if (!TASK_ID.test(id)) throw new Error(`Geçersiz görev kimliği: ${id || index}`);
    if (ids.has(id)) throw new Error(`Tekrarlanan görev kimliği: ${id}`);
    if (RESERVED_TASK_IDS.has(id)) {
      throw new Error(`Ayrılmış görev kimliği kullanılamaz: ${id}`);
    }
    ids.add(id);
    const allowedPaths = normalizedPatterns(task.allowed_paths);
    if (!allowedPaths.length) throw new Error(`${id} için allowed_paths gerekli.`);
    const owned = allowedPaths.filter(value => ORCHESTRATOR_OWNED_PATHS.includes(value));
    if (owned.length) {
      throw new Error(
        `${id} orchestrator'a ait dosyaları sahiplenemez: ${owned.join(', ')}. `
        + 'Paket bağımlılıkları plan içindeki `dependencies` alanında bildirilir.',
      );
    }
    return {
      id,
      title: String(task.title || id),
      role: String(task.role || 'flutter_builder'),
      prompt: String(task.prompt || ''),
      depends_on: [...new Set((task.depends_on || []).map(normalizeTaskId))],
      allowed_paths: allowedPaths,
      required_outputs: (task.required_outputs || []).map(String),
      acceptance_checks: (task.acceptance_checks || []).map(String),
      priority: Number.isFinite(task.priority) ? Number(task.priority) : index,
    };
  });
  for (const task of normalized) {
    for (const dependency of task.depends_on) {
      if (!ids.has(dependency)) throw new Error(`${task.id} bilinmeyen göreve bağlı: ${dependency}`);
      if (dependency === task.id) throw new Error(`${task.id} kendisine bağlı olamaz.`);
    }
  }
  assertAcyclic(normalized);
  assertParallelizable(normalized, minParallelTasks, minInitialParallelTasks);
  return {
    version: 1,
    profile: rawPlan.profile || 'flutter_mobile',
    dependencies: normalizePackageDependencies(rawPlan.dependencies),
    tasks: normalized,
  };
}

/**
 * Packages that ship with the Flutter SDK. `flutter pub add <name>` would resolve
 * them from pub.dev instead, where `integration_test` is an unrelated, pre
 * null-safety package that breaks version solving. The scaffold provides these.
 */
const SDK_PACKAGES = new Set([
  'flutter', 'flutter_test', 'flutter_driver', 'flutter_localizations',
  'flutter_web_plugins', 'integration_test',
]);

/** Package names the orchestrator installs with `flutter pub add` before building. */
export function normalizePackageDependencies(value) {
  const entries = Array.isArray(value) ? value : [];
  const seen = new Set();
  return entries
    .map(entry => String(entry ?? '').trim())
    .filter(entry => /^[a-z_][a-z0-9_]*(?::\s*\S+)?$/i.test(entry))
    .filter(entry => {
      const name = entry.split(':')[0].trim();
      if (SDK_PACKAGES.has(name) || seen.has(name)) return false;
      seen.add(name);
      return true;
    });
}

export function readTaskPlan(workspace, options) {
  const filePath = path.join(workspace, 'TASK_PLAN.json');
  return validateTaskPlan(JSON.parse(fs.readFileSync(filePath, 'utf8')), options);
}

export function writeProjectState(workspace, project, tasks) {
  const state = {
    version: 1,
    project_id: project.id,
    profile: project.project_profile || 'flutter_mobile',
    project_status: project.status,
    updated_at: new Date().toISOString(),
    tasks: tasks.map(task => ({
      id: task.id,
      title: task.name,
      status: task.status,
      checkpoint: task.checkpoint_commit || null,
      branch: task.branch_name || null,
      attempts: task.attempt_count || 0,
      error: task.error || null,
    })),
  };
  fs.writeFileSync(path.join(workspace, 'PROJECT_STATE.json'), `${JSON.stringify(state, null, 2)}\n`);
  return state;
}
