const COMPLETED_STATUSES = new Set(['completed', 'succeeded']);

function normalizePathPattern(pattern) {
  const normalized = String(pattern ?? '')
    .trim()
    .replace(/\\/g, '/')
    .replace(/^\.\//, '')
    .replace(/^\/+|\/+$/g, '');
  const wildcardIndex = normalized.search(/[?*[]/);
  return (wildcardIndex === -1 ? normalized : normalized.slice(0, wildcardIndex))
    .replace(/\/+$/g, '');
}

/**
 * Conservatively reports whether two allowed-path patterns may address the
 * same file. Glob syntax is reduced to its non-wildcard directory prefix.
 */
export function pathsOverlap(left, right) {
  const leftPrefix = normalizePathPattern(left);
  const rightPrefix = normalizePathPattern(right);
  if (!leftPrefix || !rightPrefix) return true;
  if (leftPrefix === rightPrefix) return true;
  return leftPrefix.startsWith(`${rightPrefix}/`) || rightPrefix.startsWith(`${leftPrefix}/`);
}

function taskPaths(task) {
  const paths = task.allowed_paths ?? task.allowedPaths ?? [];
  return Array.isArray(paths) ? paths : [];
}

function tasksOverlap(left, right) {
  const leftPaths = taskPaths(left);
  const rightPaths = taskPaths(right);
  if (leftPaths.length === 0 || rightPaths.length === 0) return true;
  return leftPaths.some(a => rightPaths.some(b => pathsOverlap(a, b)));
}

function dependenciesOf(task) {
  const dependencies = task.depends_on ?? task.dependsOn ?? [];
  return Array.isArray(dependencies) ? dependencies : [];
}

function stableTaskOrder(left, right) {
  const priorityDifference = Number(right.priority ?? 0) - Number(left.priority ?? 0);
  if (priorityDifference !== 0) return priorityDifference;
  return String(left.id).localeCompare(String(right.id), 'en');
}

/**
 * Selects tasks that can start now.
 *
 * A task is eligible when it is pending/ready and all dependencies completed.
 * Selected tasks cannot overlap paths with running tasks or each other.
 */
export function selectReadyTasks(tasks, { capacity = 1 } = {}) {
  if (!Array.isArray(tasks)) throw new TypeError('tasks must be an array');
  if (!Number.isInteger(capacity) || capacity < 0) {
    throw new RangeError('capacity must be a non-negative integer');
  }

  const byId = new Map(tasks.map(task => [task.id, task]));
  const running = tasks.filter(task => task.status === 'running');
  const availableSlots = Math.max(0, capacity - running.length);
  if (availableSlots === 0) return [];

  const eligible = tasks
    .filter(task => task.status === 'pending' || task.status === 'ready')
    .filter(task => dependenciesOf(task).every(id => {
      const dependency = byId.get(id);
      return dependency && COMPLETED_STATUSES.has(dependency.status);
    }))
    .sort(stableTaskOrder);

  const selected = [];
  for (const candidate of eligible) {
    if (running.some(task => tasksOverlap(candidate, task))) continue;
    if (selected.some(task => tasksOverlap(candidate, task))) continue;
    selected.push(candidate);
    if (selected.length === availableSlots) break;
  }
  return selected;
}
