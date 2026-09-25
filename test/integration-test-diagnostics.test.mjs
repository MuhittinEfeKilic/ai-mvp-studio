import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  INTEGRATION_DIAGNOSTICS_ID, runIntegrationTestDiagnostics, scanIntegrationTestSource,
} from '../src/integration-test-diagnostics.mjs';

/** The shape that failed twice on a real device and cost two repair rounds. */
const FRAGILE = [
  "  testWidgets('CF7 search returns exact durable IDs', (tester) async {",
  '    await tester.pumpApp(tester);',
  "    await tester.enterText(find.byKey(const Key('subscription-search')), 'spotify');",
  '    await tester.pumpAndSettle();',
  "    expect(find.byKey(const ValueKey<String>('open-1')), findsOneWidget);",
  '  });',
].join('\n');

test('an assertion made while the keyboard may be up is reported', () => {
  const findings = scanIntegrationTestSource('integration_test/search_test.dart', FRAGILE);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].id, INTEGRATION_DIAGNOSTICS_ID);
  assert.equal(findings[0].severity, 'warning');
  assert.equal(findings[0].file, 'integration_test/search_test.dart:5');
  assert.match(findings[0].test, /CF7 search/);
  assert.match(findings[0].details, /klavye/i);
});

test('dismissing focus or scrolling the target into view clears the risk', () => {
  // Both are what the repair agents actually did to fix the measured failures:
  // `unfocus()` in the product for CF7, `tester.ensureVisible` in the test for CF4.
  for (const remedy of [
    '    FocusManager.instance.primaryFocus?.unfocus();',
    "    await tester.ensureVisible(find.byKey(const Key('save')));",
    "    await tester.scrollUntilVisible(find.byKey(const Key('row')), 80);",
    "    await tester.dragUntilVisible(find.byKey(const Key('row')), find.byType(ListView), Offset.zero);",
  ]) {
    const source = FRAGILE.split('\n');
    source.splice(4, 0, remedy);
    assert.deepEqual(
      scanIntegrationTestSource('integration_test/search_test.dart', source.join('\n')),
      [],
      remedy,
    );
  }
});

test('an absence assertion is not reported, because it cannot fail this way', () => {
  // An unbuilt widget is also not found, so `findsNothing` passes either way.
  // That is a false-pass risk, not a failure, and flagging it would be noise.
  const source = FRAGILE.replace('findsOneWidget', 'findsNothing');
  assert.deepEqual(scanIntegrationTestSource('integration_test/search_test.dart', source), []);
});

test('each test is reported once, and a later test starts from a clean device', () => {
  const source = [
    FRAGILE,
    '',
    "  testWidgets('CF8 unsaved changes warn', (tester) async {",
    "    expect(find.text('Kaydedilmedi'), findsOneWidget);",
    '  });',
  ].join('\n');
  const findings = scanIntegrationTestSource('integration_test/suite_test.dart', source);
  // Six rows asserted in one test is one problem, not six; and the second test
  // never typed anything, so its assertion is not at risk.
  assert.equal(findings.length, 1);
  assert.match(findings[0].test, /CF7/);
});

test('a commented-out example is not a finding', () => {
  const source = [
    "  testWidgets('CF1 creates a record', (tester) async {",
    "    // await tester.enterText(find.byKey(const Key('name')), 'x');",
    "    // expect(find.byKey(const Key('row')), findsOneWidget);",
    "    expect(find.byKey(const Key('row')), findsOneWidget);",
    '  });',
  ].join('\n');
  assert.deepEqual(scanIntegrationTestSource('integration_test/create_test.dart', source), []);
});

test('a workspace without device tests scans clean instead of failing', () => {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'mvp-itd-empty-'));
  const report = runIntegrationTestDiagnostics(workspace);
  assert.equal(report.status, 'CLEAN');
  assert.equal(report.scanned_files, 0);
  assert.deepEqual(report.findings, []);
});

test('the scan walks nested test directories and names files relative to the repository', () => {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'mvp-itd-'));
  const nested = path.join(workspace, 'integration_test', 'flows');
  fs.mkdirSync(nested, { recursive: true });
  fs.writeFileSync(path.join(nested, 'search_test.dart'), FRAGILE);
  fs.writeFileSync(path.join(workspace, 'integration_test', 'support.dart'), 'void helper() {}\n');

  const report = runIntegrationTestDiagnostics(workspace);
  assert.equal(report.scanned_files, 2);
  assert.equal(report.status, 'FINDINGS');
  assert.equal(report.findings.length, 1);
  assert.equal(report.findings[0].file, 'integration_test/flows/search_test.dart:5');
});
