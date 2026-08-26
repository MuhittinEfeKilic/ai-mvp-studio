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
  const report = passingReport();
  report.checks.tests = 'skipped';
  assert.throws(() => validateQualityReport(report), /test: kalite kapısı için PASS/);
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
  assert.match(renderQualityReportMarkdown(report), /build\/app-debug\.apk/);
});

test('reviewer result accepts structured JSON or explicit PASS/FAIL only', () => {
  assert.deepEqual(parseReviewerResult('```json\n{"status":"PASS","summary":"Uygun"}\n```'), {
    status: 'PASS', summary: 'Uygun', issues: [],
  });
  assert.equal(parseReviewerResult('FAIL — Buton bozuk').status, 'FAIL');
  assert.throws(() => parseReviewerResult('Looks good to me'), /PASS\/FAIL/);
  assert.throws(() => parseReviewerResult({ status: 'PASS', issues: ['broken'] }), /issue içeremez/);
});
