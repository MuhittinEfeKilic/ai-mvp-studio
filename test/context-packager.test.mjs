import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

import { buildContextPackage } from '../src/context-packager.mjs';

function fixture() {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'context-packager-'));
  fs.mkdirSync(path.join(workspace, 'lib', 'features', 'today'), { recursive: true });
  fs.mkdirSync(path.join(workspace, 'lib', 'secret'), { recursive: true });
  fs.writeFileSync(path.join(workspace, 'PROJECT_SPEC.md'), '# Product\nA tiny app.\n');
  fs.writeFileSync(path.join(workspace, 'ARCHITECTURE.md'), '# Architecture\nFeature-first.\n');
  fs.writeFileSync(path.join(workspace, 'UX_SPEC.md'), '# UX\nOne screen.\n');
  fs.writeFileSync(path.join(workspace, 'SECRET.md'), 'must never be included');
  spawnSync('git', ['init'], { cwd: workspace });
  spawnSync('git', ['config', 'user.email', 'test@example.com'], { cwd: workspace });
  spawnSync('git', ['config', 'user.name', 'Test'], { cwd: workspace });
  spawnSync('git', ['add', '.'], { cwd: workspace });
  spawnSync('git', ['commit', '-m', 'initial'], { cwd: workspace });
  fs.writeFileSync(path.join(workspace, 'lib', 'features', 'today', 'screen.dart'), 'class Today {}\n');
  fs.writeFileSync(path.join(workspace, 'lib', 'secret', 'token.dart'), 'const token = "no";\n');
  return workspace;
}

test('architecture receives only the product specification', () => {
  const workspace = fixture();
  const result = buildContextPackage({ workspace, role: 'architecture' });
  assert.deepEqual(result.manifest.documents.map(item => item.path), ['PROJECT_SPEC.md']);
  assert.match(result.prompt, /A tiny app/);
  assert.doesNotMatch(result.prompt, /Feature-first|must never be included/);
});

test('builder context filters git changes using task-owned paths', () => {
  const workspace = fixture();
  const result = buildContextPackage({
    workspace,
    role: 'flutter_builder',
    task: { id: 'today', allowed_paths: ['lib/features/today/**'], acceptance_checks: ['flutter test'] },
  });
  assert.deepEqual(result.manifest.changes, [{ status: '??', path: 'lib/features/today/screen.dart' }]);
  assert.doesNotMatch(JSON.stringify(result.manifest), /lib\/secret/);
  assert.match(result.prompt, /flutter test/);
});

test('document and total limits truncate oversized selected content', () => {
  const workspace = fixture();
  fs.writeFileSync(path.join(workspace, 'PROJECT_SPEC.md'), 'x'.repeat(1000));
  const result = buildContextPackage({ workspace, role: 'architecture', limits: { documentChars: 100, totalChars: 100 } });
  assert.equal(result.manifest.documents[0].truncated, true);
  assert.ok(result.prompt.length < 500);
  assert.match(result.prompt, /context truncated/);
});
