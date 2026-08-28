import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { findSilentErrorHandling, runSourceDiagnostics } from '../src/source-diagnostics.mjs';

test('swallowed errors are reported with their location and reason', () => {
  const source = [
    'Future<void> save() async {',
    '  try {',
    '    await repository.insert(order);',
    '  } catch (_) {',
    '    emit(const OrderError("İşlem tamamlanamadı. Tekrar deneyin."));',
    '  }',
    '}',
    '',
    'void wipe() {',
    '  try { db.clear(); } catch (error) {}',
    '}',
    '',
    'void report() {',
    '  try { db.clear(); } catch (error) { emit(GenericFailure()); }',
    '}',
  ].join('\n');

  const findings = findSilentErrorHandling(source, 'lib/order_cubit.dart');
  assert.deepEqual(findings.map(finding => [finding.line, finding.reason]), [
    [4, 'catch bloğu hatayı ne inceliyor ne yeniden fırlatıyor'],
    [10, 'catch bloğu boş'],
    [14, 'catch bloğu hatayı ne inceliyor ne yeniden fırlatıyor'],
  ]);
  assert.equal(findings[0].file, 'lib/order_cubit.dart');
});

test('diagnosable error handling is accepted', () => {
  const source = [
    'void a() { try { x(); } catch (error, stackTrace) { log(error, stackTrace); } }',
    'void b() { try { x(); } catch (error) { throw StorageFailure(error.toString()); } }',
    'void c() { try { x(); } catch (error) { rethrow; } }',
    // A discarded name is fine as long as the original error still propagates.
    'void e() { try { x(); } catch (_) { cleanup(); rethrow; } }',
    'void d() { try { x(); } catch (error) { emit(Failure("Kayıt başarısız: $error")); } }',
  ].join('\n');
  assert.deepEqual(findSilentErrorHandling(source, 'lib/ok.dart'), []);
});

test('braces inside strings and comments do not confuse the scan', () => {
  const source = [
    'void a() {',
    '  try {',
    '    run();',
    '  } catch (error) {',
    '    // } this brace is a comment',
    '    log("kapanış } süslü parantezi: $error");',
    '  }',
    '}',
    'void b() { try { run(); } catch (_) { return; } }',
  ].join('\n');
  const findings = findSilentErrorHandling(source, 'lib/strings.dart');
  assert.deepEqual(findings.map(finding => finding.line), [9]);
});

test('source diagnostics scans lib and integration_test and skips generated files', () => {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'diagnostics-'));
  fs.mkdirSync(path.join(workspace, 'lib', 'data'), { recursive: true });
  fs.mkdirSync(path.join(workspace, 'integration_test'), { recursive: true });
  fs.writeFileSync(path.join(workspace, 'lib', 'main.dart'), 'void main() { runApp(App()); }');
  fs.writeFileSync(
    path.join(workspace, 'lib', 'data', 'orders.g.dart'),
    'void generated() { try { x(); } catch (_) {} }',
  );

  assert.equal(runSourceDiagnostics(workspace).check.status, 'PASS');

  fs.writeFileSync(
    path.join(workspace, 'lib', 'data', 'orders.dart'),
    'void save() { try { x(); } catch (_) {} }',
  );
  const failed = runSourceDiagnostics(workspace);
  assert.equal(failed.check.status, 'FAIL');
  assert.equal(failed.check.exit_code, 1);
  assert.equal(failed.findings.length, 1, 'üretilmiş dosya taranmamalı');
  assert.match(failed.check.details, /lib\/data\/orders\.dart:1/);
});
