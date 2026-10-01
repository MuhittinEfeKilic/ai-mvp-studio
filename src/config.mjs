import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { DEFAULT_RUN_TIMEOUT_MS } from './codex-runner.mjs';

/** Roles an assignment may name; a typo must fail loudly, not silently do nothing. */
export const AGENT_ROLES = Object.freeze([
  'architecture', 'ux', 'data_model', 'test_strategy', 'coordinator',
  'flutter_builder', 'integration', 'repair', 'device_repair', 'review_repair', 'reviewer',
]);

/**
 * Parses `MVP_STUDIO_AGENT_MODELS`, a comma-separated list of
 * `role=model` or `role=model:effort` entries.
 *
 * Measured reason to want this: across two real runs the repair loops and the
 * repeated review took 53% of all billable tokens while first-pass building took
 * 39%, so the expensive half is judging and fixing, not writing. Putting the
 * mechanical roles on a cheaper model is the lever; the judgement roles
 * (coordinator, reviewer) are the ones worth paying for.
 *
 * An unknown role throws. A silent typo would read as "no change", which is
 * indistinguishable from the feature not working at all.
 */
export function parseAgentModels(value, roles = AGENT_ROLES) {
  const assignments = {};
  for (const entry of String(value ?? '').split(',').map(part => part.trim()).filter(Boolean)) {
    const match = entry.match(/^([a-z_]+)\s*=\s*([^:\s]+)(?::\s*([^:\s]+))?$/i);
    if (!match) {
      throw new Error(`MVP_STUDIO_AGENT_MODELS okunamadı: "${entry}". Biçim: role=model veya role=model:effort.`);
    }
    const [, role, model, effort] = match;
    if (!roles.includes(role)) {
      throw new Error(`MVP_STUDIO_AGENT_MODELS bilinmeyen rol: "${role}". Geçerli roller: ${roles.join(', ')}.`);
    }
    if (assignments[role]) {
      throw new Error(`MVP_STUDIO_AGENT_MODELS aynı rolü iki kez atadı: "${role}".`);
    }
    assignments[role] = { model, effort: effort ?? null };
  }
  return Object.freeze(assignments);
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Falls back to PATH when APPDATA is unavailable, so importing never throws. */
function defaultCodexCommand() {
  if (process.platform !== 'win32' || !process.env.APPDATA) return 'codex';
  return path.join(process.env.APPDATA, 'npm', 'node_modules', '@openai', 'codex', 'bin', 'codex.js');
}

export const config = Object.freeze({
  host: process.env.MVP_STUDIO_HOST ?? '127.0.0.1',
  port: Number(process.env.MVP_STUDIO_PORT ?? 8000),
  maxConcurrentRuns: Number(process.env.MVP_STUDIO_MAX_CONCURRENT_RUNS ?? 3),
  maxConcurrentAgents: Number(process.env.MVP_STUDIO_MAX_CONCURRENT_AGENTS ?? 5),
  maxParallelBuilders: Number(process.env.MVP_STUDIO_MAX_PARALLEL_BUILDERS ?? 4),
  codexTimeoutMs: Number(process.env.MVP_STUDIO_CODEX_TIMEOUT_MS ?? DEFAULT_RUN_TIMEOUT_MS),
  flutterTimeoutMs: Number(process.env.MVP_STUDIO_FLUTTER_TIMEOUT_MS ?? 600_000),
  // Billable tokens one uninterrupted run may spend; 0 disables the guard.
  projectTokenBudget: Number(process.env.MVP_STUDIO_PROJECT_TOKEN_BUDGET ?? 1_500_000),
  deviceMinFreeMb: Number(process.env.MVP_STUDIO_DEVICE_MIN_FREE_MB ?? 1536),
  // Which AVD the device gate may launch, wipe and snapshot. Empty keeps the old
  // behaviour of taking whatever is listed first.
  deviceAvd: (process.env.MVP_STUDIO_AVD ?? '').trim() || null,
  // Role-by-role model and reasoning effort. Empty keeps today's behaviour: every
  // role shares whatever ~/.codex/config.toml says.
  agentModels: parseAgentModels(process.env.MVP_STUDIO_AGENT_MODELS),
  // Reclaim the device below this, instead of after every gate. A measured run
  // never fell under 3947 MB, so the unconditional reset reclaimed nothing.
  deviceReclaimBelowMb: Number(process.env.MVP_STUDIO_DEVICE_RECLAIM_BELOW_MB ?? 3072),
  codexCommand: process.env.MVP_STUDIO_CODEX_COMMAND ?? defaultCodexCommand(),
  root,
  dataDir: path.join(root, 'data'),
  projectsDir: path.join(root, 'projects'),
  databasePath: path.join(root, 'data', 'studio.db'),
});
