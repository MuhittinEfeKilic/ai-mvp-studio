import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  DESIGN_REPORT_PATH, evaluateDesignChecks, measureDesignUsage, runDesignDiagnostics,
  writeDesignReport,
} from '../src/design-diagnostics.mjs';

function tokens(overrides = {}) {
  return {
    font_family: 'Roboto',
    signature_element: {
      name: 'Odak Şeridi',
      description: 'Kalan süreyi gösteren şerit.',
      surfaces: ['Görev listesi', 'Görev detayı'],
    },
    typography: [
      { role: 'display', size: 32, weight: 700, lineHeight: 1.15, letterSpacing: -0.5 },
      { role: 'title', size: 20, weight: 600, lineHeight: 1.3, letterSpacing: 0 },
      { role: 'body', size: 15, weight: 400, lineHeight: 1.5, letterSpacing: 0.1 },
      { role: 'label', size: 13, weight: 500, lineHeight: 1.4, letterSpacing: 0.5 },
      { role: 'numeric', size: 15, weight: 600, lineHeight: 1.2, letterSpacing: 0 },
    ],
    spacing: [4, 8, 16],
    radius: [4, 8, 16],
    elevation: [0, 1, 6],
    motion: { fast: 150 },
    ...overrides,
  };
}

const idsOf = findings => findings.map(item => item.id);

function project(files) {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'mvp-design-'));
  for (const [relative, source] of Object.entries(files)) {
    const absolute = path.join(workspace, relative);
    fs.mkdirSync(path.dirname(absolute), { recursive: true });
    fs.writeFileSync(absolute, source, 'utf8');
  }
  return workspace;
}

test('a contract nothing uses is reported as drift, not as success', () => {
  // The measured failure this exists for: two accepted MVPs carried a real token
  // file and a real signature widget while every surface stayed flat.
  const workspace = project({
    'lib/app/theme/app_theme.dart': 'const primary = Color(0xFF1B5E20);\n',
    'lib/features/home/home_page.dart': 'Widget build(c) => Column(children: const [Text("x")]);\n',
  });
  const report = runDesignDiagnostics({ workspace, tokens: tokens() });
  assert.equal(report.gate, false, 'bu bir kapı olmamalı');
  assert.equal(report.status, 'DRIFT');
  assert.deepEqual(
    idsOf(report.warnings).sort(),
    ['depth_unused', 'motion_unused', 'radius_unused', 'typography_unused'],
  );
  // Every warning carries what was declared next to what was found.
  for (const warning of report.warnings) assert.ok(warning.evidence, warning.id);
});

test('a contract the code actually applies reports no drift', () => {
  const workspace = project({
    'lib/app/theme/app_theme.dart': 'const primary = Color(0xFF1B5E20);\n',
    'lib/features/home/home_page.dart': [
      'Widget build(BuildContext c) => AnimatedContainer(',
      '  duration: const Duration(milliseconds: 150),',
      '  decoration: BoxDecoration(borderRadius: BorderRadius.circular(8)),',
      '  child: Material(elevation: 1, child: Text("x", style: Theme.of(c).textTheme.bodyMedium)),',
      ');',
    ].join('\n'),
  });
  const report = runDesignDiagnostics({ workspace, tokens: tokens() });
  assert.equal(report.status, 'APPLIED');
  assert.deepEqual(report.warnings, []);
  assert.equal(report.contract.signature_element, 'Odak Şeridi');
});

test('literal colours are the theme\'s job and a leak everywhere else', () => {
  const workspace = project({
    // The theme is where the contract becomes Flutter values.
    'lib/app/theme/tokens.dart': 'const a = Color(0xFF112233); const b = Colors.red;\n',
    'lib/features/a/page.dart': 'final c = Color(0xFFAABBCC); final d = Colors.blue;\n',
    'lib/features/b/panel.dart': 'final e = Colors.green;\n',
  });
  const usage = measureDesignUsage(workspace);
  assert.equal(usage.hardcoded_colors, 3, 'tema dışı sabit renkler');
  assert.deepEqual(usage.hardcoded_color_files.map(item => item.count), [2, 1]);
  assert.ok(usage.hardcoded_color_files.every(item => !item.file.includes('theme')));
});

test('reading a colour from the theme is not a hard-coded colour', () => {
  // The first real run produced exactly this: the agents moved the product
  // palette into a theme extension, every screen then read `colors.<role>`, and
  // the scanner called all twelve reads leaks because its `i` flag also made
  // `Colors` case-insensitive. The correct pattern must not be punished.
  const workspace = project({
    'lib/features/a/page.dart': [
      'final colors = Theme.of(context).extension<HabitColors>()!;',
      'final shade = switch (role) {',
      '  HabitColorRole.orman => colors.orman,',
      '  HabitColorRole.deniz => colors.deniz,',
      '};',
      'final leak = Colors.amber;',
      'final alsoLeak = Color(0XFF112233);',
    ].join('\n'),
  });
  const usage = measureDesignUsage(workspace);
  assert.equal(usage.hardcoded_colors, 2, 'yalnız gerçek literaller sayılmalı');
});

test('a colour named in a comment or a string is not a hard-coded colour', () => {
  const workspace = project({
    'lib/features/a/page.dart': [
      '// Colors.red kullanmayın, tema üzerinden geçin.',
      'const label = "Color(0xFF000000) yazısı bir örnektir";',
      'final real = Colors.amber;',
    ].join('\n'),
  });
  assert.equal(measureDesignUsage(workspace).hardcoded_colors, 1);
});

test('generated files are not authored design decisions', () => {
  const workspace = project({
    'lib/models/habit.g.dart': 'final a = Colors.red;\n',
    'lib/models/habit.freezed.dart': 'final b = Colors.blue;\n',
    'lib/features/a/page.dart': 'final c = Colors.green;\n',
  });
  const usage = measureDesignUsage(workspace);
  assert.equal(usage.scanned_files, 1);
  assert.equal(usage.hardcoded_colors, 1);
});

test('a project from before the contract is left alone instead of failed', () => {
  const workspace = project({ 'lib/main.dart': 'void main() {}\n' });
  const report = runDesignDiagnostics({ workspace, tokens: null });
  assert.equal(report.status, 'UNMEASURED');
  assert.deepEqual(report.warnings, []);
  assert.deepEqual(idsOf(report.findings), ['no_design_contract']);
  assert.equal(report.contract, null);
});

test('an all-zero elevation scale is a decision, not missing depth', () => {
  // "Everything is flat" is a legitimate design; the check only fires when the
  // contract promised depth and the code has none.
  const flat = evaluateDesignChecks(
    { scanned_files: 1, depth: 0, motion: 1, radius: 1, shape: 0, text_style: 1, hardcoded_colors: 0, hardcoded_color_files: [] },
    tokens({ elevation: [0, 0, 0] }),
  );
  assert.equal(idsOf(flat).includes('depth_unused'), false);
});

test('the counts a later run is compared against are always recorded', () => {
  const workspace = project({ 'lib/features/a/page.dart': 'final a = 1;\n' });
  const report = runDesignDiagnostics({ workspace, tokens: tokens() });
  const counts = report.findings.find(item => item.id === 'usage_counts');
  assert.equal(counts.severity, 'info', 'sayımlar yargı değildir');
  assert.equal(counts.evidence.scanned_files, 1);
  assert.equal(report.usage.scanned_files, 1);
});

test('the report is written to the generated repository', () => {
  const workspace = project({ 'lib/main.dart': 'void main() {}\n' });
  const report = writeDesignReport(workspace, runDesignDiagnostics({ workspace, tokens: tokens() }));
  const onDisk = JSON.parse(fs.readFileSync(path.join(workspace, DESIGN_REPORT_PATH), 'utf8'));
  assert.deepEqual(onDisk, JSON.parse(JSON.stringify(report)));
  assert.equal(onDisk.gate, false);
});
