import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { DEFAULT_RUN_TIMEOUT_MS } from './codex-runner.mjs';

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
  codexCommand: process.env.MVP_STUDIO_CODEX_COMMAND ?? defaultCodexCommand(),
  root,
  dataDir: path.join(root, 'data'),
  projectsDir: path.join(root, 'projects'),
  databasePath: path.join(root, 'data', 'studio.db'),
});
