import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import {
  evaluateMinSdkCompatibility, parseAcceptanceCriteria, parseCriticalUserFlows, parseSpec,
  validateSpec,
} from '../src/spec-validator.mjs';

test('a spec below the toolchain Android floor is rejected, not left to the agents', () => {
  // Measured case: the spec asked for API 23 while Flutter 3.44 builds from 24.
  // Flutter's MinSdkVersionMigration rewrites any minSdk of 16-23 back to
  // `flutter.minSdkVersion` on every Gradle command, so the reviewer blocked, the
  // repair agent fixed the file, the next gate reverted it and the rounds ran out.
  const blocked = evaluateMinSdkCompatibility({ min_android_sdk: '23' }, 24);
  assert.equal(blocked.status, 'FAIL');
  assert.equal(blocked.spec_min_sdk, 23);
  assert.equal(blocked.toolchain_min_sdk, 24);
  assert.match(blocked.details, /API 24/);

  assert.equal(evaluateMinSdkCompatibility({ min_android_sdk: '24' }, 24).status, 'PASS');
  assert.equal(evaluateMinSdkCompatibility({ min_android_sdk: '26' }, 24).status, 'PASS');

  // Neither side may be invented: an unmeasured floor is not a passed check.
  assert.equal(evaluateMinSdkCompatibility({ min_android_sdk: '23' }, null).status, 'SKIPPED');
  assert.equal(evaluateMinSdkCompatibility({}, 24).status, 'SKIPPED');
  assert.equal(evaluateMinSdkCompatibility({ min_android_sdk: 'lollipop' }, 24).status, 'SKIPPED');
});

test('the mobile template does not ship an Android minimum the toolchain refuses', () => {
  const mobile = fs.readFileSync(path.resolve('templates/PROJECT_SPEC.mobile.template.md'), 'utf8');
  const requested = Number(parseSpec(mobile).metadata.min_android_sdk);
  // Every spec starts as a copy of this file, so a default below the floor would
  // plant the same unsatisfiable requirement in every future project.
  assert.ok(Number.isInteger(requested), 'template `min_android_sdk` okunamıyor');
  assert.ok(requested >= 24, `template minimum Android API ${requested}, Flutter tabanının altında`);
});

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
  assert.equal(parseCriticalUserFlows(spec).length, 3);
  assert.ok(report.checks.some(check => check.name === 'Tasarım Sistemi ve Görsel Yön' && check.passed));
});

test('mobile spec v2 rejects invalid complexity and parallelism controls', () => {
  const spec = mobileTemplate
    .replace('project_name: "MOBİL UYGULAMA ADI"', 'project_name: "Mobil Test"')
    .replace('status: "draft"', 'status: "approved"')
    .replace('complexity_tier: "advanced"', 'complexity_tier: "huge"')
    .replace('target_parallelism: "4"', 'target_parallelism: "12"')
    .replace(/# Açık Kararlar[\s\S]*$/, '# Açık Kararlar\n\nYok.');
  const report = validateSpec(spec);
  assert.equal(report.ready, false);
  assert.ok(report.blocking_issues.some(issue => issue.message.includes('`complexity_tier`')));
  assert.ok(report.blocking_issues.some(issue => issue.message.includes('`target_parallelism`')));
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

test('acceptance criteria are parsed from headings as well as bullets', () => {
  // Measured: a real spec wrote all ten criteria as `### AC1 — …` headings. The
  // bullet-only parser returned zero, so ACCEPTANCE_CRITERIA.json was never
  // written, expectedCriteria was empty and the reviewer id contract switched
  // itself off — the reviewer then invented a `Q1` criterion and blocked on it.
  const spec = [
    '# Kabul Kriterleri',
    '',
    '### AC1 — CRUD ve kalıcılık',
    'Kayıt oluşturulur ve yeniden açılışta korunur.',
    '',
    '### AC2 — Maliyet hesaplama',
    'Yıllık tutar 12 ile bölünür.',
    '',
    '# Kalite Gereksinimleri',
    '',
    '- flutter analyze temiz olmalıdır.',
  ].join('\n');
  const criteria = parseAcceptanceCriteria(spec);
  assert.deepEqual(criteria.map(item => item.id), ['AC1', 'AC2']);
  assert.match(criteria[0].text, /CRUD ve kalıcılık/);
  assert.match(criteria[0].text, /yeniden açılışta korunur/);
  // The next section must not leak into the last criterion.
  assert.doesNotMatch(criteria[1].text, /flutter analyze/);
});

test('heading criteria keep the ids the spec declared, not their position', () => {
  // The reviewer reads the same document. Renumbering here would make it answer
  // ids the contract has never heard of, and every answer would be rejected.
  const spec = [
    '# Kabul Kriterleri',
    '',
    '### AC3 — Üçüncü',
    'Gözlemlenebilir davranış.',
    '',
    '### AC7 — Yedinci',
    'Başka bir davranış.',
  ].join('\n');
  assert.deepEqual(parseAcceptanceCriteria(spec).map(item => item.id), ['AC3', 'AC7']);
});

test('bullet criteria keep their existing sequential ids', () => {
  const spec = [
    '# Kabul Kriterleri',
    '',
    '- Ana akış baştan sona tamamlanabilir.',
    '- [ ] Kalıcı veri yeniden açılışta korunur.',
  ].join('\n');
  assert.deepEqual(parseAcceptanceCriteria(spec), [
    { id: 'AC1', text: 'Ana akış baştan sona tamamlanabilir.' },
    { id: 'AC2', text: 'Kalıcı veri yeniden açılışta korunur.' },
  ]);
});

test('a full but unparseable acceptance section is blocked, not accepted', () => {
  // The old check only asked whether the section had text in it, so a prose
  // checklist passed validation and produced no contract at all.
  const spec = template
    .replace('project_name: "PROJE ADI"', 'project_name: "Test Ürünü"')
    .replace('status: "draft"', 'status: "approved"')
    .replace(
      /# Kabul Kriterleri[\s\S]*?(?=\n# )/,
      '# Kabul Kriterleri\n\nUygulama düzgün çalışmalı ve kullanıcıyı memnun etmelidir.\n\n',
    )
    .replace(/# Açık Kararlar[\s\S]*$/, '# Açık Kararlar\n\nYok.');
  assert.equal(parseAcceptanceCriteria(spec).length, 0, 'test kendini doğrulayamıyor');
  const report = validateSpec(spec);
  assert.equal(report.ready, false);
  assert.ok(
    report.blocking_issues.some(issue => issue.section === 'Kabul Kriterleri'
      && /ayrıştırılamadı/i.test(issue.message)),
    JSON.stringify(report.blocking_issues),
  );
});

test('a repeated criterion id is blocked before it can confuse the reviewer', () => {
  const spec = template
    .replace('project_name: "PROJE ADI"', 'project_name: "Test Ürünü"')
    .replace('status: "draft"', 'status: "approved"')
    .replace(
      /# Kabul Kriterleri[\s\S]*?(?=\n# )/,
      '# Kabul Kriterleri\n\n### AC1 — Bir\nDavranış.\n\n### AC1 — Yine bir\nBaşka davranış.\n\n',
    )
    .replace(/# Açık Kararlar[\s\S]*$/, '# Açık Kararlar\n\nYok.');
  const report = validateSpec(spec);
  assert.equal(report.ready, false);
  assert.ok(
    report.blocking_issues.some(issue => /AC1/.test(issue.message)),
    JSON.stringify(report.blocking_issues),
  );
});

test('both shipped templates produce a usable acceptance contract', () => {
  // Whatever else changes in these files, the list the reviewer is limited to
  // must keep parsing — an empty one silently removes that limit.
  for (const source of [template, mobileTemplate]) {
    const criteria = parseAcceptanceCriteria(source);
    assert.ok(criteria.length > 0);
    assert.equal(criteria.length, new Set(criteria.map(item => item.id)).size);
  }
});
