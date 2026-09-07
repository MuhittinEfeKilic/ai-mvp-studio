import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourceDir = path.join(root, 'src');
const files = fs.readdirSync(sourceDir, { withFileTypes: true })
  .filter(entry => entry.isFile() && entry.name.endsWith('.mjs'))
  .map(entry => path.join(sourceDir, entry.name))
  .sort();

for (const file of files) {
  const result = spawnSync(process.execPath, ['--check', file], {
    cwd: root, encoding: 'utf8', windowsHide: true,
  });
  if (result.status !== 0) {
    process.stderr.write(result.stderr || result.stdout || `${file} kontrol edilemedi.\n`);
    process.exit(result.status || 1);
  }
}

process.stdout.write(`${files.length} kaynak modülü doğrulandı.\n`);
