import fs from 'node:fs';
import path from 'node:path';

const CHECK_NAMES = ['analyze', 'test', 'apk'];
const VALID_STATUSES = new Set(['PASS', 'FAIL', 'SKIPPED']);

function normalizeStatus(value) {
  const status = String(value ?? '').trim().toUpperCase();
  if (status === 'PASSED' || status === 'SUCCESS' || status === 'OK') return 'PASS';
  if (status === 'FAILED' || status === 'ERROR') return 'FAIL';
  if (status === 'SKIP' || status === 'NOT_RUN' || status === 'NOT RUN') return 'SKIPPED';
  return status;
}

function normalizeCheck(value, name) {
  const source = typeof value === 'string' ? { status: value } : (value || {});
  const result = {
    status: normalizeStatus(source.status ?? source.result),
    command: source.command ? String(source.command) : null,
    exit_code: Number.isInteger(source.exit_code) ? source.exit_code : null,
    details: source.details || source.message ? String(source.details || source.message) : null,
  };
  if (name === 'apk') {
    result.path = source.path || source.artifact_path
      ? String(source.path || source.artifact_path).replaceAll('\\', '/')
      : null;
  }
  return result;
}

export function normalizeQualityReport(raw = {}) {
  const checks = raw.checks || raw;
  const report = {
    version: 1,
    profile: String(raw.profile || 'flutter_mobile'),
    generated_at: raw.generated_at || new Date().toISOString(),
    checks: {
      analyze: normalizeCheck(checks.analyze ?? checks.flutter_analyze, 'analyze'),
      test: normalizeCheck(checks.test ?? checks.tests ?? checks.flutter_test, 'test'),
      apk: normalizeCheck(checks.apk ?? checks.build ?? checks.android_build, 'apk'),
    },
  };
  report.status = CHECK_NAMES.every(name => report.checks[name].status === 'PASS') ? 'PASS' : 'FAIL';
  return report;
}

export function validateQualityReport(raw, { workspace } = {}) {
  const report = normalizeQualityReport(raw);
  const errors = [];
  for (const name of CHECK_NAMES) {
    const check = report.checks[name];
    if (!VALID_STATUSES.has(check.status)) errors.push(`${name}: geçerli status gerekli (PASS/FAIL/SKIPPED).`);
    if (check.status !== 'PASS') errors.push(`${name}: kalite kapısı için PASS olmalı; mevcut: ${check.status || 'eksik'}.`);
    if (check.exit_code !== null && check.status === 'PASS' && check.exit_code !== 0) {
      errors.push(`${name}: PASS sonucu sıfır olmayan exit_code ile çelişiyor.`);
    }
  }

  if (!report.checks.apk.path) {
    errors.push('apk: üretilen APK yolu gerekli.');
  } else if (workspace) {
    const workspaceRoot = path.resolve(workspace);
    const apkPath = path.resolve(workspaceRoot, report.checks.apk.path);
    const relative = path.relative(workspaceRoot, apkPath);
    if (relative.startsWith('..') || path.isAbsolute(relative)) {
      errors.push('apk: APK yolu workspace dışında olamaz.');
    } else if (!fs.existsSync(apkPath) || !fs.statSync(apkPath).isFile()) {
      errors.push(`apk: dosya bulunamadı: ${report.checks.apk.path}`);
    }
  }

  if (errors.length) {
    const error = new Error(`Kalite raporu geçersiz:\n- ${errors.join('\n- ')}`);
    error.errors = errors;
    error.report = report;
    throw error;
  }
  return report;
}

export function renderQualityReportJson(report) {
  return `${JSON.stringify(normalizeQualityReport(report), null, 2)}\n`;
}

export function renderQualityReportMarkdown(report) {
  const normalized = normalizeQualityReport(report);
  const labels = { analyze: 'Flutter analyze', test: 'Flutter test', apk: 'Android debug APK' };
  const rows = CHECK_NAMES.map(name => {
    const check = normalized.checks[name];
    const detail = name === 'apk' && check.path ? check.path : (check.details || '—');
    return `| ${labels[name]} | ${check.status || 'EKSİK'} | ${detail.replaceAll('|', '\\|')} |`;
  });
  return [
    '# Quality Report', '', `**Overall:** ${normalized.status}`, '',
    '| Kontrol | Sonuç | Detay |', '|---|---|---|', ...rows, '',
  ].join('\n');
}

export function parseReviewerResult(value) {
  if (value && typeof value === 'object') return validateReviewerResult(value);
  const text = String(value ?? '').trim();
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced?.[1] || text;
  try {
    return validateReviewerResult(JSON.parse(candidate));
  } catch (error) {
    if (error?.code === 'INVALID_REVIEWER_RESULT') throw error;
    const structured = candidate.match(/^\s*(PASS|FAIL)\s*(?:[-—:]\s*(.*))?$/is);
    if (!structured) throw reviewerError('Reviewer çıktısı JSON veya tek satırlık PASS/FAIL olmalı.');
    return validateReviewerResult({ status: structured[1], summary: structured[2] || '' });
  }
}

export function validateReviewerResult(raw = {}) {
  const status = normalizeStatus(raw.status ?? raw.result);
  if (!['PASS', 'FAIL'].includes(status)) throw reviewerError('Reviewer status yalnızca PASS veya FAIL olabilir.');
  const issues = Array.isArray(raw.issues) ? raw.issues.map(String).filter(Boolean) : [];
  if (status === 'PASS' && issues.length) throw reviewerError('PASS reviewer sonucu engelleyici issue içeremez.');
  return { status, summary: String(raw.summary || raw.message || ''), issues };
}

function reviewerError(message) {
  const error = new Error(message);
  error.code = 'INVALID_REVIEWER_RESULT';
  return error;
}
