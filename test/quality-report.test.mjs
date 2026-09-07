import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  normalizeQualityReport,
  parseReviewerResult,
  renderQualityReportJson,
  renderQualityReportMarkdown,
  validateQualityReport,
} from '../src/quality-report.mjs';

function passingReport(apkPath = 'build/app/outputs/flutter-apk/app-debug.apk') {
  return {
    checks: {
      flutter_analyze: { result: 'passed', exit_code: 0 },
      tests: 'success',
      android_build: { status: 'PASS', artifact_path: apkPath },
      diagnostics: { status: 'PASS', exit_code: 0, details: 'Sessiz hata yutma bulunmadı.' },
    },
  };
}

test('quality report normalizes aliases and derives overall PASS', () => {
  const report = normalizeQualityReport(passingReport());
  assert.equal(report.status, 'PASS');
  assert.equal(report.checks.analyze.status, 'PASS');
  assert.equal(report.checks.apk.path, 'build/app/outputs/flutter-apk/app-debug.apk');
});

test('quality gate requires every check to pass', () => {
  const skippedTests = passingReport();
  skippedTests.checks.tests = 'skipped';
  assert.throws(() => validateQualityReport(skippedTests), /test: kalite kapısı için PASS/);

  // Swallowed errors block the gate exactly like a failing toolchain check.
  const swallowed = passingReport();
  swallowed.checks.diagnostics = { status: 'FAIL', exit_code: 1, details: 'lib/a.dart:4 catch' };
  assert.throws(() => validateQualityReport(swallowed), /diagnostics: kalite kapısı için PASS/);

  const missingDiagnostics = passingReport();
  delete missingDiagnostics.checks.diagnostics;
  assert.equal(normalizeQualityReport(missingDiagnostics).status, 'FAIL');
});

test('quality gate verifies that APK exists inside workspace', () => {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'quality-report-'));
  const relativeApk = 'build/app-debug.apk';
  fs.mkdirSync(path.join(workspace, 'build'), { recursive: true });
  fs.writeFileSync(path.join(workspace, relativeApk), 'apk');
  assert.equal(validateQualityReport(passingReport(relativeApk), { workspace }).status, 'PASS');
  assert.throws(() => validateQualityReport(passingReport('../outside.apk'), { workspace }), /workspace dışında/);
  assert.throws(() => validateQualityReport(passingReport('missing.apk'), { workspace }), /dosya bulunamadı/);
});

test('quality report renders stable JSON and readable Markdown', () => {
  const report = passingReport('build/app-debug.apk');
  assert.equal(JSON.parse(renderQualityReportJson(report)).status, 'PASS');
  assert.match(renderQualityReportMarkdown(report), /\| Flutter test \| PASS \|/);
  assert.match(renderQualityReportMarkdown(report), /\| Kaynak teşhis kontrolü \| PASS \|/);
  assert.match(renderQualityReportMarkdown(report), /build\/app-debug\.apk/);
});

test('reviewer result accepts structured JSON or explicit PASS/FAIL only', () => {
  assert.deepEqual(
    parseReviewerResult('```json\n{"status":"PASS","summary":"Uygun","notes":["küçük not"]}\n```'),
    { status: 'PASS', summary: 'Uygun', issues: [], notes: ['küçük not'], criteria: [] },
  );
  // A one-line FAIL carries its reason as the single blocking issue.
  assert.deepEqual(parseReviewerResult('FAIL — Buton bozuk'), {
    status: 'FAIL', summary: 'Buton bozuk', issues: ['Buton bozuk'], notes: [], criteria: [],
  });
  assert.throws(() => parseReviewerResult('Looks good to me'), /PASS\/FAIL/);
  assert.throws(() => parseReviewerResult({ status: 'PASS', issues: ['broken'] }), /issue içeremez/);
  // Something the reviewer could not verify must not block the pipeline.
  assert.throws(
    () => parseReviewerResult({ status: 'FAIL', summary: 'kanıt yok', notes: ['cihazda bakılmadı'] }),
    /en az bir engelleyici issue/,
  );
});

test('the review may only block on the acceptance checklist it answered', () => {
  const expectedCriteria = ['AC1', 'AC2'];
  const answer = (status, criteria, extra = {}) => parseReviewerResult(
    { status, summary: 'x', criteria, ...extra }, { expectedCriteria },
  );

  // Every criterion has to be answered, so a verdict is comparable across runs.
  assert.throws(
    () => answer('PASS', [{ id: 'AC1', status: 'PASS' }]),
    /yanıtlamadı: AC2/,
  );
  const passing = answer('PASS', [
    { id: 'AC1', status: 'PASS', evidence: 'integration_test/a_test.dart' },
    { id: 'AC2', status: 'PASS', evidence: 'TEST_REPORT.json' },
  ]);
  assert.equal(passing.status, 'PASS');
  assert.equal(passing.criteria.length, 2);

  assert.throws(
    () => answer('FAIL', [
      { id: 'AC1', status: 'PASS' }, { id: 'AC2', status: 'PASS' },
      { id: 'AC999', status: 'FAIL' },
    ], { issues: ['kapsam dışı bulgu'] }),
    /bilinmeyen kabul kriterleri.*AC999/,
  );
  assert.throws(
    () => answer('PASS', [
      { id: 'AC1', status: 'PASS' }, { id: 'AC1', status: 'PASS' },
      { id: 'AC2', status: 'PASS' },
    ]),
    /birden fazla kez.*AC1/,
  );

  // Blocking without failing a criterion is exactly the drift this prevents.
  assert.throws(
    () => answer('FAIL', [
      { id: 'AC1', status: 'PASS' }, { id: 'AC2', status: 'PASS' },
    ], { issues: ['stil önerisi'] }),
    /en az bir kabul kriterini FAIL/,
  );
  assert.throws(
    () => answer('PASS', [
      { id: 'AC1', status: 'FAIL' }, { id: 'AC2', status: 'PASS' },
    ]),
    /PASS sonucu FAIL kriter içeremez: AC1/,
  );

  const blocking = answer('FAIL', [
    { id: 'AC1', status: 'FAIL', evidence: 'lib/a.dart:10' }, { id: 'AC2', status: 'PASS' },
  ], { issues: [{ criterion: 'AC1', file: 'lib/a.dart:10', description: 'Kaydetmiyor.' }] });
  assert.equal(blocking.status, 'FAIL');
  assert.deepEqual(blocking.issues, ['lib/a.dart:10: Kaydetmiyor.']);
});
