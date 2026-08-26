import { spawnSync } from 'node:child_process';

function normalizeRepositoryPath(value) {
  const path = String(value ?? '').trim().replace(/\\/g, '/').replace(/^\.\//, '');
  if (!path || path.startsWith('/') || /^[A-Za-z]:\//.test(path)) return null;

  const segments = path.split('/').filter(segment => segment && segment !== '.');
  if (segments.some(segment => segment === '..')) return null;
  return segments.join('/');
}

function escapeRegExp(value) {
  return value.replace(/[|\\{}()[\]^$+?.]/g, '\\$&');
}

function globRegExp(pattern) {
  let expression = '';
  for (let index = 0; index < pattern.length; index += 1) {
    const character = pattern[index];
    if (character !== '*') {
      expression += character === '?' ? '[^/]' : escapeRegExp(character);
      continue;
    }

    if (pattern[index + 1] === '*') {
      index += 1;
      if (pattern[index + 1] === '/') {
        index += 1;
        expression += '(?:.*/)?';
      } else {
        expression += '.*';
      }
    } else {
      expression += '[^/]*';
    }
  }
  return new RegExp(`^${expression}$`);
}

/** Returns true only for repository-relative paths matched by the pattern. */
export function pathMatchesAllowedPattern(filePath, pattern) {
  const path = normalizeRepositoryPath(filePath);
  const rawPattern = String(pattern ?? '').trim().replace(/\\/g, '/').replace(/^\.\//, '');
  const normalizedPattern = normalizeRepositoryPath(rawPattern);
  if (!path || !normalizedPattern) return false;
  const effectivePattern = rawPattern.endsWith('/') ? `${normalizedPattern}/**` : normalizedPattern;
  return globRegExp(effectivePattern).test(path);
}

/**
 * Validates a task's changed paths. An empty allow-list grants no file access.
 * The stable, structured result is suitable for persistence and UI reporting.
 */
export function validateChangedPaths(changedPaths, allowedPaths) {
  if (!Array.isArray(changedPaths) || !Array.isArray(allowedPaths)) {
    throw new TypeError('changedPaths and allowedPaths must be arrays');
  }

  const normalizedAllowedPaths = allowedPaths
    .map(value => {
      const rawPattern = String(value ?? '').trim().replace(/\\/g, '/').replace(/^\.\//, '');
      const normalized = normalizeRepositoryPath(rawPattern);
      if (!normalized) return null;
      return rawPattern.endsWith('/') ? `${normalized}/**` : normalized;
    })
    .filter(Boolean);
  const invalidPaths = [];
  const normalizedChangedPaths = [];

  for (const candidate of changedPaths) {
    const path = normalizeRepositoryPath(candidate);
    if (!path) {
      invalidPaths.push(String(candidate));
      continue;
    }
    normalizedChangedPaths.push(path);
  }

  const violations = normalizedChangedPaths
    .filter(path => !normalizedAllowedPaths.some(pattern => pathMatchesAllowedPattern(path, pattern)))
    .concat(invalidPaths)
    .sort((left, right) => left.localeCompare(right, 'en'));

  return {
    ok: violations.length === 0,
    changedPaths: [...new Set(normalizedChangedPaths)].sort((a, b) => a.localeCompare(b, 'en')),
    allowedPaths: [...new Set(normalizedAllowedPaths)].sort((a, b) => a.localeCompare(b, 'en')),
    violations: [...new Set(violations)],
  };
}

function runGit(workspace, args) {
  const result = spawnSync('git', args, { cwd: workspace, encoding: 'utf8' });
  if (result.status !== 0) {
    throw new Error(result.stderr.trim() || `git ${args.join(' ')} failed`);
  }
  return result.stdout;
}

/** Lists committed, staged, unstaged, and untracked paths changed from baseRef. */
export function getGitChangedPaths(workspace, { baseRef = 'HEAD' } = {}) {
  const tracked = runGit(workspace, ['diff', '--name-only', '--diff-filter=ACMRTUXB', baseRef]);
  const untracked = runGit(workspace, ['ls-files', '--others', '--exclude-standard']);
  return [...new Set(`${tracked}\n${untracked}`
    .split(/\r?\n/)
    .map(normalizeRepositoryPath)
    .filter(Boolean))]
    .sort((left, right) => left.localeCompare(right, 'en'));
}

/** Deterministic merge order: explicit integration order, then priority, then id. */
export function orderTasksForIntegration(tasks) {
  if (!Array.isArray(tasks)) throw new TypeError('tasks must be an array');
  return [...tasks]
    .filter(task => ['completed', 'succeeded', 'validated'].includes(task.status))
    .sort((left, right) => {
      const order = Number(left.integration_order ?? left.integrationOrder ?? Number.MAX_SAFE_INTEGER)
        - Number(right.integration_order ?? right.integrationOrder ?? Number.MAX_SAFE_INTEGER);
      if (order !== 0) return order;
      const priority = Number(right.priority ?? 0) - Number(left.priority ?? 0);
      if (priority !== 0) return priority;
      return String(left.id).localeCompare(String(right.id), 'en');
    });
}
