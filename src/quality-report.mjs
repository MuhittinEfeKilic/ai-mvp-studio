import fs from 'node:fs';
import path from 'node:path';

export const CHECK_NAMES = ['analyze', 'test', 'apk', 'diagnostics'];
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
      diagnostics: normalizeCheck(checks.diagnostics ?? checks.source_diagnostics, 'diagnostics'),
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
  const labels = {
    analyze: 'Flutter analyze', test: 'Flutter test', apk: 'Android debug APK',
    diagnostics: 'Kaynak teşhis kontrolü',
  };
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

export function parseReviewerResult(value, options = {}) {
  if (value && typeof value === 'object') return validateReviewerResult(value, options);
  const text = String(value ?? '').trim();
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced?.[1] || text;
  try {
    return validateReviewerResult(JSON.parse(candidate), options);
  } catch (error) {
    if (error?.code === 'INVALID_REVIEWER_RESULT') throw error;
    const structured = candidate.match(/^\s*(PASS|FAIL)\s*(?:[-—:]\s*(.*))?$/is);
    if (!structured) throw reviewerError('Reviewer çıktısı JSON veya tek satırlık PASS/FAIL olmalı.');
    const summary = structured[2] || '';
    // The one-line form cannot answer a criteria checklist, so it is only valid
    // when no checklist is expected.
    return validateReviewerResult({
      status: structured[1],
      summary,
      issues: /fail/i.test(structured[1]) ? [summary || 'Gerekçe bildirilmedi.'] : [],
    }, options);
  }
}

/**
 * Reviewers report findings either as plain strings or as `{file, description}`
 * objects. Coercing the object form with String() would render it as
 * "[object Object]" and lose the only actionable part of the verdict.
 */
export function normalizeReviewerFindings(value) {
  if (!Array.isArray(value)) return [];
  return value.map(entry => {
    if (entry && typeof entry === 'object') {
      const location = entry.file || entry.path || entry.location || '';
      const text = entry.description || entry.message || entry.issue || entry.detail || '';
      return [location, text].filter(Boolean).join(': ') || JSON.stringify(entry);
    }
    return String(entry ?? '').trim();
  }).filter(Boolean);
}

function normalizeCriteriaVerdicts(value) {
  if (!Array.isArray(value)) return [];
  return value.map(entry => ({
    id: String(entry?.id ?? entry?.criterion ?? '').trim(),
    status: normalizeStatus(entry?.status ?? entry?.result),
    evidence: String(entry?.evidence ?? entry?.detail ?? entry?.description ?? '').trim(),
  })).filter(entry => entry.id);
}

/**
 * @param {object} raw parsed reviewer output
 * @param {string[]} expectedCriteria acceptance criterion ids the review must answer
 */
export function validateReviewerResult(raw = {}, { expectedCriteria = [] } = {}) {
  const status = normalizeStatus(raw.status ?? raw.result);
  if (!['PASS', 'FAIL'].includes(status)) throw reviewerError('Reviewer status yalnızca PASS veya FAIL olabilir.');
  const issues = normalizeReviewerFindings(raw.issues);
  // Observations the reviewer could not verify belong here, not in issues.
  const notes = normalizeReviewerFindings(raw.notes);
  const criteria = normalizeCriteriaVerdicts(raw.criteria);

  if (expectedCriteria.length) {
    const answered = new Set(criteria.map(entry => entry.id));
    const missing = expectedCriteria.filter(id => !answered.has(id));
    if (missing.length) {
      throw reviewerError(`Reviewer şu kabul kriterlerini yanıtlamadı: ${missing.join(', ')}.`);
    }
    const invalid = criteria.filter(entry => !['PASS', 'FAIL'].includes(entry.status));
    if (invalid.length) {
      throw reviewerError(`Kabul kriteri sonucu PASS veya FAIL olmalı: ${invalid.map(e => e.id).join(', ')}.`);
    }
    // A blocking verdict must point at a criterion; anything else is a note.
    const failed = criteria.filter(entry => entry.status === 'FAIL').map(entry => entry.id);
    if (status === 'FAIL' && !failed.length) {
      throw reviewerError('FAIL sonucu en az bir kabul kriterini FAIL olarak işaretlemelidir.');
    }
    if (status === 'PASS' && failed.length) {
      throw reviewerError(`PASS sonucu FAIL kriter içeremez: ${failed.join(', ')}.`);
    }
  }

  if (status === 'PASS' && issues.length) throw reviewerError('PASS reviewer sonucu engelleyici issue içeremez.');
  if (status === 'FAIL' && !issues.length) {
    throw reviewerError('FAIL reviewer sonucu en az bir engelleyici issue bildirmelidir.');
  }
  return { status, summary: String(raw.summary || raw.message || ''), issues, notes, criteria };
}

function reviewerError(message) {
  const error = new Error(message);
  error.code = 'INVALID_REVIEWER_RESULT';
  return error;
}
