import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import {
  parseAcceptanceCriteria, parseCriticalUserFlows, validateSpec,
} from '../src/spec-validator.mjs';

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

test('acceptance criteria become an identified checklist', () => {
  const spec = fs.readFileSync(path.resolve('examples/ders-notu/PROJECT_SPEC.md'), 'utf8');
  const criteria = parseAcceptanceCriteria(spec);
  assert.equal(criteria.length, 7);
  assert.equal(criteria[0].id, 'AC1');
  assert.match(criteria[0].text, /Ders eklenir/);
  assert.match(criteria.at(-1).text, /emülatörde uçtan uca/);
  assert.deepEqual(parseAcceptanceCriteria('# Ürün Özeti\n\nBoş.'), []);
});

test('task-list markers are not part of the criterion text', () => {
  const spec = [
    '# Kabul Kriterleri', '',
    '- [ ] Kullanıcı akışı tamamlanabilir.',
    '- [x] Veri yeniden açılışta korunur.',
    '* Üçüncü madde madde işaretiyle yazılmış.',
    '',
    'Bu satır madde değil, açıklamadır.',
  ].join('\n');
  assert.deepEqual(parseAcceptanceCriteria(spec).map(item => [item.id, item.text]), [
    ['AC1', 'Kullanıcı akışı tamamlanabilir.'],
    ['AC2', 'Veri yeniden açılışta korunur.'],
    ['AC3', 'Üçüncü madde madde işaretiyle yazılmış.'],
  ]);
});

test('templates keep toolchain results out of the acceptance checklist', () => {
  for (const file of ['templates/PROJECT_SPEC.template.md', 'templates/PROJECT_SPEC.mobile.template.md']) {
    const criteria = parseAcceptanceCriteria(fs.readFileSync(path.resolve(file), 'utf8'));
    assert.ok(criteria.length > 0, file);
    // The gates own these; a criterion naming them invites the reviewer to re-judge them.
    for (const item of criteria) {
      assert.doesNotMatch(item.text, /flutter (analyze|test)|APK|integration test/i, `${file} → ${item.id}`);
    }
  }
});
