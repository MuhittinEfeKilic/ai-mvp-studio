import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  APPLICATION_COMPLETENESS_PATH, findNoopInteractions, findPlaceholderCopy, findScaffoldRemnants,
  findUnfinishedMarkers, findUnimplementedStubs, isActivationHandler, literalContent, maskNonCode,
  runApplicationCompleteness, scanProductionSources, splitDartSegments,
  writeApplicationCompletenessReport,
} from '../src/app-completeness.mjs';

const SPEC = [
  '---',
  'project_name: "Stok Cep"',
  'status: "approved"',
  '---',
  '',
  '# Ürün Özeti',
  '',
  'Küçük işletmeler için çevrimdışı stok takibi.',
].join('\n');

/**
 * Production source of a finished screen. Everything here is an idiom a real
 * generated app uses and none of it may produce a finding: an empty `setState`,
 * a value callback, a disabled button, a sqflite migration hook, a URL whose
 * `//` is not a comment and a comment whose apostrophe is not a string.
 */
const FINISHED_SOURCE = [
  "import 'package:flutter/material.dart';",
  '',
  "const endpoint = 'https://stok.example.com/v1';",
  '',
  'class ProductScreen extends StatefulWidget {',
  '  const ProductScreen({super.key});',
  '  @override',
  '  State<ProductScreen> createState() => _ProductScreenState();',
  '}',
  '',
  'class _ProductScreenState extends State<ProductScreen> {',
  '  final _name = TextEditingController();',
  '  bool _saving = false;',
  '',
  '  Future<void> _save() async {',
  '    setState(() => _saving = true);',
  '    await repository.save(_name.text);',
  '  }',
  '',
  '  @override',
  '  Widget build(BuildContext context) {',
  '    // The list rebuilds itself; there is nothing else to do here.',
  '    return Column(children: [',
  '      TextField(controller: _name, onChanged: (_) => setState(() {})),',
  '      FilledButton(onPressed: _saving ? null : _save, child: const Text(\'Kaydet\')),',
  "      Text('Kayıt yok: ${_name.text}'),",
  '    ]);',
  '  }',
  '}',
  '',
  'Future<Database> open() => openDatabase(',
  "  'stok.db',",
  '  onCreate: (db, version) async { await db.execute(schema); },',
  '  onUpgrade: (db, from, to) async {},',
  ');',
  '',
].join('\n');

function createProject(files) {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'app-completeness-'));
  for (const [relative, contents] of Object.entries(files)) {
    const absolute = path.join(workspace, relative);
    fs.mkdirSync(path.dirname(absolute), { recursive: true });
    fs.writeFileSync(absolute, contents, 'utf8');
  }
  return workspace;
}

test('a finished production screen produces no findings', () => {
  const workspace = createProject({ 'lib/product_screen.dart': FINISHED_SOURCE });
  const report = runApplicationCompleteness({ workspace, specContent: SPEC });
  assert.equal(report.status, 'COMPLETE');
  assert.deepEqual(report.findings, []);
  assert.deepEqual(report.blockers, []);
  assert.deepEqual(report.warnings, []);
  assert.equal(report.scope.files, 1);
  assert.equal(report.checks.find(check => check.id === 'noop_interaction').status, 'PASS');
});

test('the Flutter counter template left in lib/ blocks completeness', () => {
  const workspace = createProject({
    'lib/main.dart': [
      "import 'package:flutter/material.dart';",
      '',
      'class MyApp extends StatelessWidget {',
      '  @override',
      "  Widget build(BuildContext context) => const MaterialApp(title: 'Flutter Demo',",
      "    home: MyHomePage(title: 'Flutter Demo Home Page'));",
      '}',
      '',
      'class MyHomePage extends StatefulWidget {',
      '  const MyHomePage({super.key, required this.title});',
      '  final String title;',
      '}',
      '',
      'void _incrementCounter() {}',
      '',
    ].join('\n'),
  });
  const report = runApplicationCompleteness({ workspace, specContent: SPEC });
  assert.equal(report.status, 'INCOMPLETE');
  const check = report.checks.find(entry => entry.id === 'scaffold_remnant');
  assert.equal(check.status, 'FAIL');
  assert.equal(check.severity, 'blocker');
  assert.ok(report.findings.some(entry => /MyHomePage/.test(entry.reason)));
  assert.ok(report.findings.some(entry => entry.reason.includes('kullanıcı metni')));
  assert.deepEqual(report.blockers.map(entry => entry.id), ['scaffold_remnant']);
});

test('an activation handler bound to an empty callback is a blocker', () => {
  const source = [
    "TextButton(onPressed: () {}, child: const Text('Kaydet'))",
    'MovementTile(movement: movement, onTap: () {})',
    'IconButton(onPressed: () async {}, icon: const Icon(Icons.add))',
    'GestureDetector(onLongPress: () => {}, child: card)',
  ].join('\n');
  const findings = findNoopInteractions(source, 'lib/screen.dart');
  assert.deepEqual(findings.map(entry => entry.line), [1, 2, 3, 4]);
  assert.ok(findings.every(entry => entry.severity === 'blocker'));
  assert.match(findings[1].reason, /onTap boş bir geri çağrıya bağlı/);
  assert.equal(findings[0].file, 'lib/screen.dart');
});

test('disabled controls, value callbacks and lifecycle hooks are not findings', () => {
  const source = [
    'FilledButton(onPressed: null, child: const Text(\'Kaydet\'))',
    'TextField(onChanged: (_) {})',
    'TextFormField(onSaved: (value) {})',
    'PopScope(onPopInvokedWithResult: (didPop, result) {}, child: body)',
    'openDatabase(path, onUpgrade: (db, from, to) async {}, onOpen: (db) {})',
    'TextButton(onPressed: _save, child: const Text(\'Kaydet\'))',
    'ListTile(onTap: () => _open(item))',
    'ListTile(onTap: () { _open(item); })',
  ].join('\n');
  assert.deepEqual(findNoopInteractions(source, 'lib/screen.dart'), []);
  assert.equal(isActivationHandler('onPressed'), true);
  assert.equal(isActivationHandler('onThemeChanged'), false);
  assert.equal(isActivationHandler('onUpgrade'), false);
  assert.equal(isActivationHandler('onSelected'), true);
});

test('an empty callback that explains itself is a warning, not a blocker', () => {
  const source = 'GestureDetector(onTap: () { /* absorbs taps behind the sheet */ }, child: sheet)';
  const [finding] = findNoopInteractions(source, 'lib/sheet.dart');
  assert.equal(finding.severity, 'warning');
  assert.match(finding.reason, /yalnız açıklama/);
  const workspace = createProject({ 'lib/sheet.dart': source });
  const report = runApplicationCompleteness({ workspace, specContent: SPEC });
  assert.equal(report.status, 'COMPLETE');
  assert.equal(report.checks.find(check => check.id === 'noop_interaction').status, 'WARN');
  assert.deepEqual(report.warnings.map(entry => entry.id), ['noop_interaction']);
});

test('placeholder copy blocks unless the spec asks for that exact text', () => {
  const source = [
    "const empty = Text('Yakında');",
    "const filler = Text('Lorem ipsum dolor sit amet');",
    "const real = Text('Bu ürün için henüz hareket yok.');",
    "const soon = Text('Rapor ekranı çok yakında');",
    "const label = Text('Yakında dolacak listeyi burada göreceksiniz.');",
  ].join('\n');
  const findings = findPlaceholderCopy(source, 'lib/screen.dart', { specContent: SPEC });
  assert.deepEqual(findings.map(entry => entry.line), [1, 2, 4]);
  assert.ok(findings.every(entry => entry.severity === 'blocker'));

  const permissive = `${SPEC}\n\n- Rapor ekranı bu MVP'de "Yakında" metnini gösterir.\n`;
  const permitted = findPlaceholderCopy(source, 'lib/screen.dart', { specContent: permissive });
  assert.equal(permitted[0].severity, 'warning');
  assert.equal(permitted[0].spec_permitted, true);
  assert.equal(permitted[1].severity, 'blocker');
});

test('UnimplementedError in production code blocks; the same word in prose does not', () => {
  const source = [
    '// A later round should replace this with UnimplementedError handling.',
    "const note = 'UnimplementedError yazısı sadece metin';",
    'Future<void> export() => throw UnimplementedError();',
  ].join('\n');
  const findings = findUnimplementedStubs(source, 'lib/export.dart');
  assert.deepEqual(findings.map(entry => entry.line), [3]);
  assert.equal(findings[0].severity, 'blocker');
});

test('TODO and FIXME are warnings and never change the status', () => {
  const source = [
    '// TODO: cache the query result once the schema settles.',
    'const label = "FIXME";',
    'const todo = "Yapılacaklar";',
    '/* HACK: sqflite needs the id twice here. */',
  ].join('\n');
  const findings = findUnfinishedMarkers(source, 'lib/repository.dart');
  assert.deepEqual(findings.map(entry => entry.line), [1, 2, 4]);
  assert.ok(findings.every(entry => entry.severity === 'warning'));

  const workspace = createProject({ 'lib/repository.dart': source });
  const report = runApplicationCompleteness({ workspace, specContent: SPEC });
  assert.equal(report.status, 'COMPLETE');
  assert.equal(report.checks.find(check => check.id === 'unfinished_marker').status, 'WARN');
});

test('only production sources are scanned', () => {
  const unfinished = [
    "class FakeRepository implements Repository { @override Future<void> save() => throw UnimplementedError(); }",
    "// TODO: cover the offline case",
    "TextButton(onPressed: () {}, child: const Text('Kaydet'))",
  ].join('\n');
  const workspace = createProject({
    'lib/product_screen.dart': FINISHED_SOURCE,
    'lib/models/product.g.dart': unfinished,
    'test/repository_test.dart': unfinished,
    'integration_test/flow_test.dart': unfinished,
    'android/app/src/main/kotlin/MainActivity.kt': unfinished,
  });
  const scan = scanProductionSources(workspace, { specContent: SPEC });
  assert.deepEqual(scan.findings, []);
  assert.equal(scan.files, 1);
  assert.equal(scan.generated_skipped, 1);
});

test('comments and strings never trade places while scanning', () => {
  const source = [
    "const url = 'https://example.com/todo'; // a URL is not a comment",
    "// a comment's apostrophe does not open a string",
    "const label = 'Yakında'; // placeholder",
    "const message = 'Kayıt: ${count > 0 ? 'var' : 'yok'} tamamlandı';",
  ].join('\n');
  const segments = splitDartSegments(source);
  const strings = segments.filter(segment => segment.kind === 'string');
  // Three literals: the nested quotes belong to the interpolated expression and
  // must not end the literal that contains them.
  assert.equal(strings.length, 3);
  assert.equal(literalContent(strings[0].text), 'https://example.com/todo');
  assert.match(literalContent(strings[2].text), /^Kayıt: \$\{count > 0 \? 'var' : 'yok'\} tamamlandı$/);
  assert.deepEqual(findUnfinishedMarkers(source, 'lib/x.dart'), []);
  assert.deepEqual(findPlaceholderCopy(source, 'lib/x.dart').map(entry => entry.line), [3]);
  assert.equal(maskNonCode(source).split('\n').length, source.split('\n').length);
  assert.equal(maskNonCode(source).length, source.length);
  assert.equal(findScaffoldRemnants(source, 'lib/x.dart').length, 0);
});

test('the report is persisted as machine-readable evidence', () => {
  const workspace = createProject({
    'lib/main.dart': "TextButton(onPressed: () {}, child: const Text('Kaydet'))\n",
  });
  const report = writeApplicationCompletenessReport(
    workspace, runApplicationCompleteness({ workspace, specContent: SPEC }),
  );
  const stored = JSON.parse(fs.readFileSync(path.join(workspace, APPLICATION_COMPLETENESS_PATH), 'utf8'));
  assert.deepEqual(stored, JSON.parse(JSON.stringify(report)));
  assert.equal(stored.version, 1);
  assert.equal(stored.status, 'INCOMPLETE');
  assert.equal(stored.profile, 'flutter_mobile');
  assert.equal(stored.scope.spec_aware, true);
  assert.equal(stored.findings[0].file, 'lib/main.dart');
  assert.equal(stored.findings[0].line, 1);
  assert.match(stored.findings[0].excerpt, /onPressed/);
  assert.equal(stored.truncated_findings, 0);
});

test('a project without production sources reports a warning instead of a verdict', () => {
  const workspace = createProject({ 'test/scaffold_test.dart': 'void main() {}\n' });
  const report = runApplicationCompleteness({ workspace, specContent: SPEC });
  assert.equal(report.status, 'COMPLETE');
  const check = report.checks.find(entry => entry.id === 'production_sources');
  assert.equal(check.status, 'WARN');
  assert.match(check.details, /taranacak Dart dosyası yok/);
});
