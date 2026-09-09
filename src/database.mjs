import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

/**
 * Project statuses that only exist while the pipeline is actively working. If the
 * Studio stops in one of them the project must become resumable again; anything
 * missing here would leave the project stranded outside the resume contract.
 */
export const IN_FLIGHT_PROJECT_STATUSES = Object.freeze([
  'queued', 'planning', 'building', 'testing', 'technically_verified',
  'device_testing', 'device_repair', 'device_test_passed', 'reviewing', 'review_repair',
]);

/** Statuses the panel may restart from. `interrupted` is the recovery landing spot. */
export const RESUMABLE_PROJECT_STATUSES = Object.freeze([
  'paused_context', 'paused_usage', 'interrupted', 'failed', 'awaiting_device_test',
]);

export class Database {
  constructor(filePath) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    this.connection = new DatabaseSync(filePath);
    this.connection.exec(`
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS projects (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        prompt TEXT NOT NULL,
        status TEXT NOT NULL,
        workspace_path TEXT NOT NULL,
        final_message TEXT,
        error TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        project_id TEXT NOT NULL,
        event_type TEXT NOT NULL,
        payload TEXT NOT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY(project_id) REFERENCES projects(id)
      );
      CREATE TABLE IF NOT EXISTS agent_runs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        project_id TEXT NOT NULL,
        agent_name TEXT NOT NULL,
        role TEXT NOT NULL,
        status TEXT NOT NULL,
        workspace_path TEXT NOT NULL,
        final_message TEXT,
        error TEXT,
        started_at TEXT,
        completed_at TEXT,
        FOREIGN KEY(project_id) REFERENCES projects(id)
      );
      CREATE TABLE IF NOT EXISTS tasks (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        name TEXT NOT NULL,
        role TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        allowed_paths TEXT NOT NULL DEFAULT '[]',
        required_outputs TEXT NOT NULL DEFAULT '[]',
        acceptance_checks TEXT NOT NULL DEFAULT '[]',
        workspace_path TEXT,
        branch_name TEXT,
        checkpoint_commit TEXT,
        final_message TEXT,
        error TEXT,
        attempt_count INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        started_at TEXT,
        completed_at TEXT,
        FOREIGN KEY(project_id) REFERENCES projects(id)
      );
      CREATE TABLE IF NOT EXISTS task_dependencies (
        task_id TEXT NOT NULL,
        depends_on_task_id TEXT NOT NULL,
        created_at TEXT NOT NULL,
        PRIMARY KEY(task_id, depends_on_task_id),
        FOREIGN KEY(task_id) REFERENCES tasks(id),
        FOREIGN KEY(depends_on_task_id) REFERENCES tasks(id),
        CHECK(task_id <> depends_on_task_id)
      );
      CREATE INDEX IF NOT EXISTS idx_tasks_project_status ON tasks(project_id, status);
      CREATE INDEX IF NOT EXISTS idx_task_dependencies_dependency
        ON task_dependencies(depends_on_task_id);
    `);
    this.#ensureColumn('agent_runs', 'thread_id', 'TEXT');
    this.#ensureColumn('agent_runs', 'checkpoint_commit', 'TEXT');
    this.#ensureColumn('agent_runs', 'pause_reason', 'TEXT');
    this.#ensureColumn('agent_runs', 'input_tokens', 'INTEGER NOT NULL DEFAULT 0');
    this.#ensureColumn('agent_runs', 'cached_input_tokens', 'INTEGER NOT NULL DEFAULT 0');
    this.#ensureColumn('agent_runs', 'output_tokens', 'INTEGER NOT NULL DEFAULT 0');
    this.#ensureColumn('agent_runs', 'retry_count', 'INTEGER NOT NULL DEFAULT 0');
    this.#ensureColumn('projects', 'project_profile', "TEXT NOT NULL DEFAULT 'flutter_mobile'");
    this.#ensureColumn('tasks', 'prompt', "TEXT NOT NULL DEFAULT ''");
    this.#ensureColumn('tasks', 'priority', 'INTEGER NOT NULL DEFAULT 0');
    this.#ensureColumn('projects', 'quality_report', 'TEXT');
    this.#ensureColumn('projects', 'artifact_path', 'TEXT');
    this.#ensureColumn('projects', 'user_feedback', 'TEXT');
    this.#ensureColumn('projects', 'accepted_at', 'TEXT');
    this.#ensureColumn('projects', 'device_report', 'TEXT');
    this.#ensureColumn('agent_runs', 'context_chars', 'INTEGER NOT NULL DEFAULT 0');
    this.#ensureColumn('agent_runs', 'context_manifest', 'TEXT');
  }

  #ensureColumn(table, column, definition) {
    const columns = this.connection.prepare(`PRAGMA table_info(${table})`).all();
    if (!columns.some(item => item.name === column)) {
      this.connection.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
    }
  }

  createProject(project) {
    const now = new Date().toISOString();
    this.connection.prepare(`
      INSERT INTO projects
      (id, name, prompt, status, workspace_path, project_profile, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(project.id, project.name, project.prompt, project.status, project.workspace_path,
      project.project_profile ?? 'flutter_mobile', now, now);
  }

  listProjects() {
    return this.connection.prepare('SELECT * FROM projects ORDER BY created_at DESC').all();
  }

  getProject(id) {
    return this.connection.prepare('SELECT * FROM projects WHERE id = ?').get(id) ?? null;
  }

  updateProject(id, fields) {
    const allowed = [
      'status', 'final_message', 'error', 'quality_report', 'artifact_path',
      'user_feedback', 'accepted_at', 'device_report',
    ];
    const entries = Object.entries(fields).filter(([key]) => allowed.includes(key));
    if (!entries.length) return;
    entries.push(['updated_at', new Date().toISOString()]);
    const assignments = entries.map(([key]) => `${key} = ?`).join(', ');
    this.connection.prepare(`UPDATE projects SET ${assignments} WHERE id = ?`)
      .run(...entries.map(([, value]) => value), id);
  }

  addEvent(projectId, type, payload) {
    this.connection.prepare(`
      INSERT INTO events (project_id, event_type, payload, created_at) VALUES (?, ?, ?, ?)
    `).run(projectId, type, JSON.stringify(payload), new Date().toISOString());
  }

  /**
   * Returns events oldest-first. The panel polls this a few times a minute, so a
   * long-running project would otherwise re-send hundreds of Codex events each
   * time; `limit` keeps the newest slice.
   */
  listEvents(projectId, { limit = 0 } = {}) {
    const rows = limit > 0
      ? this.connection
        .prepare('SELECT * FROM events WHERE project_id = ? ORDER BY id DESC LIMIT ?')
        .all(projectId, limit).reverse()
      : this.connection.prepare('SELECT * FROM events WHERE project_id = ? ORDER BY id').all(projectId);
    return rows.map(event => ({ ...event, payload: JSON.parse(event.payload) }));
  }

  createAgentRun(projectId, agentName, role, workspacePath) {
    const result = this.connection.prepare(`
      INSERT INTO agent_runs (project_id, agent_name, role, status, workspace_path)
      VALUES (?, ?, ?, 'queued', ?)
    `).run(projectId, agentName, role, workspacePath);
    return Number(result.lastInsertRowid);
  }

  updateAgentRun(id, fields) {
    const allowed = [
      'status', 'final_message', 'error', 'started_at', 'completed_at', 'thread_id',
      'checkpoint_commit', 'pause_reason', 'input_tokens', 'cached_input_tokens',
      'output_tokens', 'retry_count',
      'context_chars', 'context_manifest',
    ];
    const entries = Object.entries(fields).filter(([key]) => allowed.includes(key));
    if (!entries.length) return;
    const assignments = entries.map(([key]) => `${key} = ?`).join(', ');
    this.connection.prepare(`UPDATE agent_runs SET ${assignments} WHERE id = ?`)
      .run(...entries.map(([, value]) => value), id);
  }

  /** Billable usage: cached input is not charged again, so it is subtracted. */
  sumProjectTokens(projectId) {
    const row = this.connection.prepare(`
      SELECT COALESCE(SUM(input_tokens), 0) AS input,
             COALESCE(SUM(cached_input_tokens), 0) AS cached,
             COALESCE(SUM(output_tokens), 0) AS output
      FROM agent_runs WHERE project_id = ?
    `).get(projectId);
    return {
      input: Number(row.input),
      cached: Number(row.cached),
      output: Number(row.output),
      billable: Math.max(0, Number(row.input) - Number(row.cached)) + Number(row.output),
    };
  }

  listAgentRuns(projectId) {
    return this.connection.prepare('SELECT * FROM agent_runs WHERE project_id = ? ORDER BY id')
      .all(projectId);
  }

  getAgentRun(id) {
    return this.connection.prepare('SELECT * FROM agent_runs WHERE id = ?').get(id) ?? null;
  }

  createTask(task) {
    const now = new Date().toISOString();
    this.connection.prepare(`
      INSERT INTO tasks (
        id, project_id, name, role, status, allowed_paths, required_outputs,
        acceptance_checks, workspace_path, branch_name, checkpoint_commit,
        prompt, priority, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      task.id, task.project_id, task.name, task.role, task.status ?? 'pending',
      JSON.stringify(task.allowed_paths ?? []), JSON.stringify(task.required_outputs ?? []),
      JSON.stringify(task.acceptance_checks ?? []), task.workspace_path ?? null,
      task.branch_name ?? null, task.checkpoint_commit ?? null, task.prompt ?? '',
      task.priority ?? 0, now, now,
    );
    for (const dependencyId of task.depends_on ?? []) {
      this.addTaskDependency(task.id, dependencyId);
    }
    return this.getTask(task.id);
  }

  createTasks(tasks) {
    this.connection.exec('BEGIN');
    try {
      const created = tasks.map(task => this.createTask({ ...task, depends_on: [] }));
      for (const task of tasks) {
        for (const dependencyId of task.depends_on ?? []) {
          this.addTaskDependency(task.id, dependencyId);
        }
      }
      this.connection.exec('COMMIT');
      return created.map(task => this.getTask(task.id));
    } catch (error) {
      this.connection.exec('ROLLBACK');
      throw error;
    }
  }

  getTask(id) {
    const task = this.connection.prepare('SELECT * FROM tasks WHERE id = ?').get(id);
    return task ? { ...this.#decodeTask(task), depends_on: this.listTaskDependencies(id) } : null;
  }

  listTasks(projectId) {
    return this.connection.prepare('SELECT * FROM tasks WHERE project_id = ? ORDER BY created_at, id')
      .all(projectId).map(task => ({
        ...this.#decodeTask(task), depends_on: this.listTaskDependencies(task.id),
      }));
  }

  updateTask(id, fields) {
    const jsonFields = new Set(['allowed_paths', 'required_outputs', 'acceptance_checks']);
    const allowed = new Set([
      'name', 'role', 'status', 'allowed_paths', 'required_outputs', 'acceptance_checks',
      'workspace_path', 'branch_name', 'checkpoint_commit', 'final_message', 'error',
      'attempt_count', 'started_at', 'completed_at', 'prompt', 'priority',
    ]);
    const entries = Object.entries(fields)
      .filter(([key]) => allowed.has(key))
      .map(([key, value]) => [key, jsonFields.has(key) ? JSON.stringify(value ?? []) : value]);
    if (!entries.length) return this.getTask(id);
    entries.push(['updated_at', new Date().toISOString()]);
    const assignments = entries.map(([key]) => `${key} = ?`).join(', ');
    this.connection.prepare(`UPDATE tasks SET ${assignments} WHERE id = ?`)
      .run(...entries.map(([, value]) => value), id);
    return this.getTask(id);
  }

  addTaskDependency(taskId, dependsOnTaskId) {
    this.connection.prepare(`
      INSERT OR IGNORE INTO task_dependencies (task_id, depends_on_task_id, created_at)
      VALUES (?, ?, ?)
    `).run(taskId, dependsOnTaskId, new Date().toISOString());
  }

  removeTaskDependency(taskId, dependsOnTaskId) {
    this.connection.prepare(`
      DELETE FROM task_dependencies WHERE task_id = ? AND depends_on_task_id = ?
    `).run(taskId, dependsOnTaskId);
  }

  listTaskDependencies(taskId) {
    return this.connection.prepare(`
      SELECT depends_on_task_id FROM task_dependencies WHERE task_id = ? ORDER BY depends_on_task_id
    `).all(taskId).map(row => row.depends_on_task_id);
  }

  listReadyTasks(projectId) {
    return this.connection.prepare(`
      SELECT task.*
      FROM tasks task
      WHERE task.project_id = ?
        AND task.status IN ('pending', 'ready')
        AND NOT EXISTS (
          SELECT 1
          FROM task_dependencies dependency
          JOIN tasks prerequisite ON prerequisite.id = dependency.depends_on_task_id
          WHERE dependency.task_id = task.id
            AND prerequisite.status <> 'completed'
        )
      ORDER BY task.created_at, task.id
    `).all(projectId).map(task => ({
      ...this.#decodeTask(task), depends_on: this.listTaskDependencies(task.id),
    }));
  }

  #decodeTask(task) {
    return {
      ...task,
      allowed_paths: JSON.parse(task.allowed_paths),
      required_outputs: JSON.parse(task.required_outputs),
      acceptance_checks: JSON.parse(task.acceptance_checks),
    };
  }

  markStaleRunsInterrupted() {
    const now = new Date().toISOString();
    const placeholders = IN_FLIGHT_PROJECT_STATUSES.map(() => '?').join(', ');
    this.connection.prepare(`
      UPDATE projects
      SET status = 'interrupted', error = 'Studio yeniden başlatıldığı için çalışma duraklatıldı.', updated_at = ?
      WHERE status IN (${placeholders})
    `).run(now, ...IN_FLIGHT_PROJECT_STATUSES);
    this.connection.prepare(`
      UPDATE projects
      SET status = 'interrupted',
          error = 'Reviewer final kodu tamamlamadığı için proje güvenli devam noktasına alındı.',
          updated_at = ?
      WHERE status = 'awaiting_user_review'
        AND EXISTS (
          SELECT 1 FROM tasks
          WHERE tasks.project_id = projects.id
            AND tasks.role = 'reviewer'
            AND tasks.status <> 'completed'
        )
    `).run(now);
    this.connection.prepare(`
      UPDATE agent_runs
      SET status = 'interrupted', error = 'Studio yeniden başlatıldığı için agent çalışması kesildi.', completed_at = ?
      WHERE status IN ('queued', 'running')
    `).run(now);
    this.connection.prepare(`
      UPDATE tasks
      SET status = 'interrupted', error = 'Studio yeniden başlatıldığı için görev kesildi.', updated_at = ?
      WHERE status IN ('ready', 'running', 'validating')
    `).run(now);
  }

  close() { this.connection.close(); }
}
