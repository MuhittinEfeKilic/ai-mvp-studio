import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { ensureProjectGitignore, qualityFailureSignature, runFlutterAsync } from '../src/orchestrator.mjs';

test('quality failure signature ignores timing noise but changes with diagnostics', () => {
  const report = details => ({ checks: {
    analyze: { status: 'PASS', exit_code: 0, details: 'No issues.' },
    test: { status: 'FAIL', exit_code: 1, details },
    apk: { status: 'SKIPPED', exit_code: null, details: 'Previous check failed.' },
  } });
  const first = qualityFailureSignature(report('Error: expected 2 actual 1 (ran in 2.1s)'));
  const timingOnly = qualityFailureSignature(report('Error: expected 2 actual 1 (ran in 9.7s)'));
  const changed = qualityFailureSignature(report('Error: undefined getter label'));
  assert.equal(first, timingOnly);
  assert.notEqual(first, changed);
});

test('project gitignore preserves custom rules and adds generated Flutter paths', () => {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'mvp-ignore-'));
  fs.writeFileSync(path.join(workspace, '.gitignore'), 'custom-secret.txt\n');
  ensureProjectGitignore(workspace);
  const lines = fs.readFileSync(path.join(workspace, '.gitignore'), 'utf8').trim().split(/\r?\n/);
  assert.ok(lines.includes('custom-secret.txt'));
  assert.ok(lines.includes('.dart_tool/'));
  assert.ok(lines.includes('build/'));
  assert.ok(lines.includes('QUALITY_LOGS/'));
  assert.equal(lines.length, new Set(lines).size);
});

test('a hung Flutter command times out without retaining the pipeline slot', async () => {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'mvp-flutter-timeout-'));
  const result = await runFlutterAsync(
    process.execPath, ['-e', 'setInterval(() => {}, 1000)'], workspace, 200,
  );
  assert.equal(result.timedOut, true);
  assert.equal(result.status, null);
  assert.match(result.stderr, /FLUTTER_TIMEOUT/);
});
