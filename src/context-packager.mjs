import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const ROLE_DOCUMENTS = Object.freeze({
  architecture: ['PROJECT_SPEC.md'],
  ux: ['PROJECT_SPEC.md'],
  coordinator: ['PROJECT_SPEC.md', 'ARCHITECTURE.md', 'UX_SPEC.md'],
  flutter_builder: ['PROJECT_SPEC.md', 'ARCHITECTURE.md', 'UX_SPEC.md', 'TASK_PLAN.json', 'PROJECT_STATE.json'],
  builder: ['PROJECT_SPEC.md', 'ARCHITECTURE.md', 'UX_SPEC.md', 'TASK_PLAN.json', 'PROJECT_STATE.json'],
  integration: ['ARCHITECTURE.md', 'TASK_PLAN.json', 'PROJECT_STATE.json'],
  test: ['PROJECT_SPEC.md', 'TASK_PLAN.json', 'PROJECT_STATE.json'],
  repair: ['PROJECT_SPEC.md', 'TEST_REPORT.md', 'TEST_REPORT.json', 'PROJECT_STATE.json'],
  reviewer: ['PROJECT_SPEC.md', 'TEST_REPORT.md', 'TEST_REPORT.json', 'PROJECT_STATE.json'],
});

const DEFAULT_LIMITS = Object.freeze({ documentChars: 18_000, totalChars: 60_000, diffChars: 12_000 });

function slash(value) {
  return value.replaceAll('\\', '/');
}

function safeRelative(workspace, candidate) {
  const root = path.resolve(workspace);
  const absolute = path.resolve(root, candidate);
  const relative = slash(path.relative(root, absolute));
  if (!relative || relative.startsWith('../') || path.isAbsolute(relative)) return null;
  return relative;
}

function truncate(text, limit) {
  if (text.length <= limit) return { text, truncated: false };
  return { text: `${text.slice(0, Math.max(0, limit - 24))}\n… [context truncated]`, truncated: true };
}

function git(workspace, args) {
  const result = spawnSync('git', ['-C', workspace, ...args], { encoding: 'utf8', windowsHide: true });
  return result.status === 0 ? result.stdout.trim() : '';
}

function patternPrefix(pattern) {
  const normalized = slash(String(pattern || '')).replace(/^\.\//, '');
  const wildcard = normalized.search(/[?*[]/);
  return (wildcard < 0 ? normalized : normalized.slice(0, wildcard)).replace(/\/$/, '');
}

function isAllowed(file, patterns) {
  if (!patterns?.length) return false;
  const normalized = slash(file);
  return patterns.some(pattern => {
    const prefix = patternPrefix(pattern);
    return prefix && (normalized === prefix || normalized.startsWith(`${prefix}/`) || String(pattern).endsWith('/**') && normalized.startsWith(prefix));
  });
}

function roleDocuments(role) {
  return ROLE_DOCUMENTS[role] || ['PROJECT_SPEC.md', 'PROJECT_STATE.json'];
}

function readDocuments(workspace, names, limits) {
  const documents = [];
  let remaining = limits.totalChars;
  for (const name of names) {
    const relative = safeRelative(workspace, name);
    if (!relative || remaining <= 0) break;
    const absolute = path.join(workspace, relative);
    if (!fs.existsSync(absolute) || !fs.statSync(absolute).isFile()) continue;
    const clipped = truncate(fs.readFileSync(absolute, 'utf8'), Math.min(limits.documentChars, remaining));
    documents.push({ path: relative, content: clipped.text, truncated: clipped.truncated });
    remaining -= clipped.text.length;
  }
  return documents;
}

function changedFiles(workspace, baseRef, headRef) {
  if (!baseRef) {
    const output = git(workspace, ['status', '--porcelain', '--untracked-files=all']);
    return output.split(/\r?\n/).filter(Boolean).map(line => ({
      status: line.slice(0, 2).trim() || 'M',
      path: slash(line.slice(3).trim().replace(/^"|"$/g, '')),
    })).filter(entry => entry.path);
  }
  const range = baseRef ? [`${baseRef}..${headRef || 'HEAD'}`] : [];
  const output = git(workspace, ['diff', '--name-status', ...range]);
  return output.split(/\r?\n/).filter(Boolean).map(line => {
    const [status, ...parts] = line.split('\t');
    return { status, path: slash(parts.at(-1) || '') };
  }).filter(entry => entry.path);
}

export function buildContextPackage({
  workspace,
  role,
  task = null,
  baseRef = null,
  headRef = 'HEAD',
  extraDocuments = [],
  limits = {},
} = {}) {
  if (!workspace || !role) throw new Error('workspace ve role gerekli.');
  const resolvedLimits = { ...DEFAULT_LIMITS, ...limits };
  const allowedPaths = (task?.allowed_paths || []).map(String);
  const names = [...new Set([...roleDocuments(role), ...extraDocuments])];
  const documents = readDocuments(workspace, names, resolvedLimits);
  const allChanges = changedFiles(workspace, baseRef, headRef);
  const changes = allowedPaths.length ? allChanges.filter(entry => isAllowed(entry.path, allowedPaths)) : allChanges;
  const diffArgs = baseRef ? [`${baseRef}..${headRef}`] : [];
  const pathspecs = allowedPaths.map(patternPrefix).filter(Boolean);
  let diff = git(workspace, ['diff', '--stat', ...diffArgs, ...(pathspecs.length ? ['--', ...pathspecs] : [])]);
  diff = truncate(diff, resolvedLimits.diffChars).text;

  const manifest = {
    version: 1,
    role,
    task: task ? {
      id: task.id,
      title: task.title || task.name || task.id,
      prompt: task.prompt || '',
      allowed_paths: allowedPaths,
      required_outputs: task.required_outputs || [],
      acceptance_checks: task.acceptance_checks || [],
    } : null,
    documents: documents.map(({ path: documentPath, truncated }) => ({ path: documentPath, truncated })),
    changes,
    diff_stat: diff,
  };

  const sections = documents.map(document => `## ${document.path}\n${document.content}`);
  const taskText = manifest.task ? `## Assigned task\n${JSON.stringify(manifest.task, null, 2)}` : '';
  const changeText = `## Relevant changes\n${diff || '(none)'}`;
  const prompt = [
    `# Context package\nRole: ${role}\nUse only this task-specific context. Inspect additional repository files only when the task explicitly requires it.`,
    taskText,
    ...sections,
    changeText,
  ].filter(Boolean).join('\n\n');

  return { manifest, prompt };
}

export { ROLE_DOCUMENTS };
