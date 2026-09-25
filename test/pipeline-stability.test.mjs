import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  builderTaskPolicy, commitPaths, ensureFlutterToolingManifests, ensureProjectGitignore,
  qualityFailureSignature, runFlutterAsync,
} from '../src/orchestrator.mjs';

function gitRepository(prefix) {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  const run = (...args) => {
    const result = spawnSync('git', args, { cwd: workspace, encoding: 'utf8', windowsHide: true });
    assert.equal(result.status, 0, `git ${args.join(' ')}: ${result.stderr}`);
    return result.stdout.trim();
  };
  run('init', '--initial-branch=main');
  run('config', 'user.email', 'studio@localhost');
  run('config', 'user.name', 'AI MVP Studio');
  fs.writeFileSync(path.join(workspace, 'pubspec.yaml'), 'name: app\n');
  run('add', '-A');
  run('commit', '-m', 'init');
  return { workspace, run };
}

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

test('a targeted commit survives an unrelated dirty file and leaves it alone', () => {
  const { workspace, run } = gitRepository('mvp-commit-scope-');
  // The Flutter tool rewrites android/app/build.gradle.kts during the warm build
  // and nothing in the pipeline owns that file. A resume then reinstalls packages
  // that are already installed, so pubspec.yaml has no change to stage: the
  // worktree is dirty, the index is empty, and a pathspec-less `git commit` exits
  // 1 with "no changes added to commit", failing a run that had nothing wrong.
  fs.writeFileSync(path.join(workspace, 'toolchain-rewrote-this.txt'), 'unowned\n');
  assert.equal(commitPaths(workspace, ['pubspec.yaml'], 'chore: install planned dependencies'), false);
  assert.equal(run('log', '--oneline').split('\n').length, 1);

  fs.writeFileSync(path.join(workspace, 'pubspec.yaml'), 'name: app\ndependencies:\n  sqflite: ^2.0.0\n');
  assert.equal(commitPaths(workspace, ['pubspec.yaml'], 'chore: install planned dependencies'), true);
  assert.match(run('log', '-1', '--pretty=%s'), /install planned dependencies/);
  // The unrelated file stays out of the commit, which is what the narrow add meant.
  assert.equal(run('show', '--name-only', '--pretty=', 'HEAD'), 'pubspec.yaml');
  assert.match(run('status', '--porcelain'), /toolchain-rewrote-this\.txt/);
});

test('a targeted commit records a new file and a deletion without a whole-tree sweep', () => {
  const { workspace, run } = gitRepository('mvp-commit-new-');
  fs.writeFileSync(path.join(workspace, 'noise.txt'), 'unowned\n');

  fs.writeFileSync(path.join(workspace, 'TEST_REPORT.json'), '{"status":"PASS"}\n');
  assert.equal(commitPaths(workspace, ['TEST_REPORT.json', 'TEST_REPORT.md'], 'test: record report'), true);
  assert.equal(run('show', '--name-only', '--pretty=', 'HEAD'), 'TEST_REPORT.json');

  fs.rmSync(path.join(workspace, 'TEST_REPORT.json'));
  assert.equal(commitPaths(workspace, ['TEST_REPORT.json'], 'chore: discard report'), true);
  assert.equal(run('ls-files', 'TEST_REPORT.json'), '');
  assert.match(run('status', '--porcelain'), /noise\.txt/);
});

test('the quality gate reports analyzer infos instead of failing on them', () => {
  const source = fs.readFileSync(new URL('../src/orchestrator.mjs', import.meta.url), 'utf8');
  // `flutter analyze` exits 1 on any finding, info level included. Measured on
  // Flutter 3.44.6: one `use_null_aware_elements` info exits 1, and the same run
  // with --no-fatal-infos exits 0 while still printing the info. Without the flag
  // a style suggestion fails the gate, skips `test` and `apk` because the loop
  // breaks on the first failure, and burns all three repair rounds.
  assert.match(source, /\['analyze', '--no-fatal-infos'\]/);
});

test('the failure signature separates two different lint-only failures', () => {
  const report = details => ({ checks: {
    analyze: { status: 'FAIL', exit_code: 1, details },
    test: { status: 'SKIPPED', exit_code: null, details: 'Önceki kontrol başarısız olduğu için çalıştırılmadı.' },
    apk: { status: 'SKIPPED', exit_code: null, details: 'Önceki kontrol başarısız olduğu için çalıştırılmadı.' },
    diagnostics: { status: 'PASS', exit_code: 0, details: 'Sessiz hata yutma bulunmadı.' },
  } });
  const nullAware = report("   info - Use the null-aware marker - lib/a.dart:757:13 - use_null_aware_elements");
  const sameLint = report("   info - Use the null-aware marker - lib/a.dart:757:13 - use_null_aware_elements");
  const otherLint = report('   info - Unused import - lib/b.dart:3:8 - unused_import');
  // An unchanged lint must still stop the repair loop early...
  assert.equal(qualityFailureSignature(nullAware), qualityFailureSignature(sameLint));
  // ...but a different one is progress, not a repeat. These lines carry none of
  // the error words the filter looks for, so both used to hash to the same value
  // and the loop could stop on "the same error" after a real fix.
  assert.notEqual(qualityFailureSignature(nullAware), qualityFailureSignature(otherLint));
});
