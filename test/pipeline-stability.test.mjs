import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  builderTaskPolicy, ensureFlutterToolingManifests, ensureProjectGitignore,
  qualityFailureSignature, runFlutterAsync,
} from '../src/orchestrator.mjs';

test('builder policy scales v2 advanced specs without changing legacy limits', () => {
  assert.deepEqual(builderTaskPolicy('short legacy spec'), {
    tier: 'legacy', minTasks: 1, maxTasks: 3, targetParallelism: 1,
  });
  const advanced = builderTaskPolicy('---\nspec_version: "2.0"\ncomplexity_tier: "advanced"\ntarget_parallelism: "5"\n---');
  assert.deepEqual(advanced, { tier: 'advanced', minTasks: 5, maxTasks: 8, targetParallelism: 5 });
});

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

test('Flutter tooling manifests retain VM Service permission without changing main', () => {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'mvp-manifests-'));
  const manifest = '<manifest xmlns:android="http://schemas.android.com/apk/res/android">\n</manifest>\n';
  for (const mode of ['main', 'debug', 'profile']) {
    const directory = path.join(workspace, 'android', 'app', 'src', mode);
    fs.mkdirSync(directory, { recursive: true });
    fs.writeFileSync(path.join(directory, 'AndroidManifest.xml'), manifest);
  }

  assert.deepEqual(ensureFlutterToolingManifests(workspace), [
    'android/app/src/debug/AndroidManifest.xml',
    'android/app/src/profile/AndroidManifest.xml',
  ]);
  assert.doesNotMatch(
    fs.readFileSync(path.join(workspace, 'android/app/src/main/AndroidManifest.xml'), 'utf8'),
    /android\.permission\.INTERNET/,
  );
  for (const mode of ['debug', 'profile']) {
    assert.match(
      fs.readFileSync(path.join(workspace, `android/app/src/${mode}/AndroidManifest.xml`), 'utf8'),
      /android\.permission\.INTERNET/,
    );
  }
  assert.deepEqual(ensureFlutterToolingManifests(workspace), []);
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

test('a slow toolchain command leaves the event loop free for other work', async () => {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'mvp-event-loop-'));
  let ticks = 0;
  const ticker = setInterval(() => { ticks += 1; }, 10);
  const started = Date.now();
  // Stands in for `flutter pub get` on a cold cache: an external command that
  // takes real time. Under spawnSync the loop would be frozen for all of it and
  // no timer could fire, taking the panel and every other project with it.
  const result = await runFlutterAsync(
    process.execPath, ['-e', 'setTimeout(() => process.exit(0), 600)'], workspace, 10_000,
  );
  clearInterval(ticker);
  const elapsed = Date.now() - started;
  assert.equal(result.status, 0);
  assert.ok(elapsed >= 500, `komut gerçekten beklemedi: ${elapsed}ms`);
  assert.ok(ticks >= 10, `komut sırasında event loop bloke oldu: ${ticks} tick / ${elapsed}ms`);
});

test('two toolchain commands overlap instead of running one after another', async () => {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'mvp-overlap-'));
  const slow = () => runFlutterAsync(
    process.execPath, ['-e', 'setTimeout(() => process.exit(0), 500)'], workspace, 10_000,
  );
  const started = Date.now();
  const results = await Promise.all([slow(), slow()]);
  const elapsed = Date.now() - started;
  assert.ok(results.every(result => result.status === 0));
  // Serialised they would need ~1000ms; overlapping they need a little over 500.
  assert.ok(elapsed < 900, `komutlar seri çalıştı: ${elapsed}ms`);
});

test('orchestration runs no toolchain command synchronously', () => {
  const source = fs.readFileSync(new URL('../src/orchestrator.mjs', import.meta.url), 'utf8');
  const syncCalls = source.split(/\r?\n/)
    .map((line, index) => ({ line: line.trim(), number: index + 1 }))
    .filter(entry => entry.line.includes('spawnSync(') && !entry.line.startsWith('*'));
  // Only local Git plumbing may stay synchronous: bounded, offline, milliseconds.
  // Every Flutter/Gradle/adb/aapt command goes through the async runner, because
  // one stuck toolchain process must not freeze unrelated MVP runs.
  assert.ok(syncCalls.length > 0, 'test kendini doğrulayamıyor');
  for (const entry of syncCalls) {
    assert.match(entry.line, /spawnSync\('git'/, `senkron toolchain çağrısı: ${entry.number}: ${entry.line}`);
  }
});

test('an HTTP server keeps answering while a toolchain command is running', async () => {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'mvp-http-liveness-'));
  const server = http.createServer((request, response) => {
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ status: 'ok' }));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  try {
    const started = Date.now();
    // The request is in flight before the command starts and is answered only
    // by this process's event loop. Run the child synchronously instead and the
    // response cannot be delivered until the command has finished — that is the
    // panel freezing while another project builds.
    const pending = fetch(`http://127.0.0.1:${port}/api/health`)
      .then(response => response.json())
      .then(body => ({ status: body.status, answeredAfterMs: Date.now() - started }));
    const command = runFlutterAsync(
      process.execPath, ['-e', 'setTimeout(() => process.exit(0), 700)'], workspace, 10_000,
    );
    const answer = await pending;
    const result = await command;
    assert.equal(result.status, 0);
    assert.equal(answer.status, 'ok');
    assert.ok(
      answer.answeredAfterMs < 400,
      `panel isteği komutun bitmesini bekledi: ${answer.answeredAfterMs}ms`,
    );
    assert.ok(Date.now() - started >= 600, 'komut gerçekten paralel çalışmadı');
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});
