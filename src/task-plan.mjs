import fs from 'node:fs';
import path from 'node:path';

const TASK_ID = /^[a-z0-9][a-z0-9-]{1,48}$/;
const RESERVED_TASK_IDS = new Set([
  'architecture', 'ux', 'coordinator', 'integration', 'test', 'repair', 'reviewer',
]);

function normalizeTaskId(value) {
  return String(value ?? '').trim().toLowerCase().replace(/[_\s]+/g, '-');
}

function normalizedPatterns(patterns) {
  return [...new Set((patterns || []).map(value => String(value).replaceAll('\\', '/').trim()))]
    .filter(value => value && !value.startsWith('/') && !value.includes('..'));
}

export function validateTaskPlan(rawPlan, { maxTasks = 5 } = {}) {
  const tasks = Array.isArray(rawPlan?.tasks) ? rawPlan.tasks : [];
  if (!tasks.length) throw new Error('TASK_PLAN.json en az bir görev içermeli.');
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
  return { version: 1, profile: rawPlan.profile || 'flutter_mobile', tasks: normalized };
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
