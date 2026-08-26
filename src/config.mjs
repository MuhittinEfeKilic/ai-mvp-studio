import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const config = Object.freeze({
  host: process.env.MVP_STUDIO_HOST ?? '127.0.0.1',
  port: Number(process.env.MVP_STUDIO_PORT ?? 8000),
  maxConcurrentRuns: Number(process.env.MVP_STUDIO_MAX_CONCURRENT_RUNS ?? 3),
  codexCommand: process.env.MVP_STUDIO_CODEX_COMMAND ?? (
    process.platform === 'win32'
      ? path.join(process.env.APPDATA, 'npm', 'node_modules', '@openai', 'codex', 'bin', 'codex.js')
      : 'codex'
  ),
  root,
  dataDir: path.join(root, 'data'),
  projectsDir: path.join(root, 'projects'),
  databasePath: path.join(root, 'data', 'studio.db'),
});
