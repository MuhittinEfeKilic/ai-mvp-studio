import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import { parseCriticalUserFlows, validateSpec } from '../src/spec-validator.mjs';

const template = fs.readFileSync(path.resolve('templates/PROJECT_SPEC.template.md'), 'utf8');
const mobileTemplate = fs.readFileSync(path.resolve('templates/PROJECT_SPEC.mobile.template.md'), 'utf8');

test('draft template is not ready', () => {
  const report = validateSpec(template);
  assert.equal(report.ready, false);
  assert.ok(report.blocking_issues.some(issue => issue.section === 'Frontmatter'));
});

test('approved and completed template is ready', () => {
  const spec = template
    .replace('project_name: "PROJE ADI"', 'project_name: "Test Ürünü"')
    .replace('status: "draft"', 'status: "approved"')
    .replace(/# Açık Kararlar[\s\S]*$/, '# Açık Kararlar\n\nYok.');
  const report = validateSpec(spec);
  assert.equal(report.ready, true, JSON.stringify(report.blocking_issues));
  assert.equal(report.project_name, 'Test Ürünü');
});

test('approved mobile template contains all required mobile decisions', () => {
  const spec = mobileTemplate
    .replace('project_name: "MOBİL UYGULAMA ADI"', 'project_name: "Mobil Test"')
    .replace('status: "draft"', 'status: "approved"')
    .replace(/# Açık Kararlar[\s\S]*$/, '# Açık Kararlar\n\nYok.');
  const report = validateSpec(spec);
  assert.equal(report.ready, true, JSON.stringify(report.blocking_issues));
  assert.ok(report.checks.some(check => check.name === 'Mobil Platform Kararları' && check.passed));
  assert.equal(parseCriticalUserFlows(spec).length, 2);
});

test('mobile spec is blocked when critical flows are not executable', () => {
  const spec = mobileTemplate
    .replace('project_name: "MOBİL UYGULAMA ADI"', 'project_name: "Mobil Test"')
    .replace('status: "draft"', 'status: "approved"')
    .replace(/# Kritik Kullanıcı Akışları[\s\S]*?(?=\n# Ekranlar)/, '# Kritik Kullanıcı Akışları\n\n- Kullanıcı kayıt yapar.\n')
    .replace(/# Açık Kararlar[\s\S]*$/, '# Açık Kararlar\n\nYok.');
  const report = validateSpec(spec);
  assert.equal(report.ready, false);
  assert.ok(report.blocking_issues.some(issue => issue.section === 'Kritik Kullanıcı Akışları'));
});

test('mobile device test decision must remain required', () => {
  const spec = mobileTemplate
    .replace('project_name: "MOBİL UYGULAMA ADI"', 'project_name: "Mobil Test"')
    .replace('status: "draft"', 'status: "approved"')
    .replace('device_test: "required"', 'device_test: "optional"')
    .replace(/# Açık Kararlar[\s\S]*$/, '# Açık Kararlar\n\nYok.');
  const report = validateSpec(spec);
  assert.equal(report.ready, false);
  assert.ok(report.blocking_issues.some(issue => issue.message.includes('`device_test`')));
});

test('mobile spec is blocked when a platform decision is missing', () => {
  const spec = mobileTemplate
    .replace('project_name: "MOBİL UYGULAMA ADI"', 'project_name: "Mobil Test"')
    .replace('status: "draft"', 'status: "approved"')
    .replace('package_name: "com.example.app"\n', '')
    .replace(/# Açık Kararlar[\s\S]*$/, '# Açık Kararlar\n\nYok.');
  const report = validateSpec(spec);
  assert.equal(report.ready, false);
  assert.ok(report.blocking_issues.some(issue => issue.message.includes('`package_name`')));
});
