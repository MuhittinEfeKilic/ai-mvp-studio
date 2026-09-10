import fs from 'node:fs';
import path from 'node:path';

/**
 * Deterministic answer to one question: does this generated application still
 * carry obvious signs of being unfinished, even though analyze, test, APK,
 * device and review gates all reported success?
 *
 * The existing gates prove that the code compiles, that the declared tests and
 * critical flows run, and that the acceptance criteria were answered. None of
 * them looks at the residue of an unfinished build: scaffold code nobody
 * replaced, a control wired to an empty callback, a screen that says "Yakında",
 * a stub that throws `UnimplementedError`, a TODO left in production source.
 *
 * Nothing here asks a model whether the app "feels finished". Every finding is a
 * fact read out of the generated Dart source, and the severity of every rule can
 * be defended in one sentence:
 *
 * - `blocker` — at this point the app mechanically cannot be doing what the
 *   product promised: the code is still the template, the control does nothing,
 *   the path throws, or the text the user reads is a placeholder.
 * - `warning` — a real trace of unfinished work that may still be a deliberate
 *   decision, so it is reported and never decides anything on its own.
 *
 * This slice measures; it does not repair and it does not change project state.
 * Scope is production source only (`lib/`): test, integration-test and toolchain
 * files legitimately contain stubs, empty callbacks and fixtures, and scanning
 * them would trade the whole report's credibility for noise.
 */

export const APPLICATION_COMPLETENESS_PATH = 'APPLICATION_COMPLETENESS.json';
export const PRODUCTION_ROOT = 'lib';

const GENERATED_FILE = /\.(?:g|freezed|gr|config|mocks)\.dart$/i;
const MAX_CHECK_EVIDENCE = 20;
const MAX_REPORTED_FINDINGS = 200;
const EXCERPT_LENGTH = 160;

/** `flutter create` output that a builder was supposed to replace. */
const SCAFFOLD_IDENTIFIERS = [/\bMyHomePage\b/, /\b_MyHomePageState\b/, /\b_incrementCounter\b/];
const SCAFFOLD_STRINGS = [/flutter demo/i, /you have pushed the button/i];

/**
 * Placeholder copy. Every pattern either names something no product ships
 * (`lorem ipsum`) or matches the *whole* string literal, because "Yakında" as a
 * complete label is a coming-soon screen while the same word inside a sentence
 * is ordinary product text.
 */
const PLACEHOLDER_COPY = [
  { pattern: /lorem ipsum/i, reason: 'lorem ipsum dolgu metni' },
  { pattern: /coming soon/i, reason: '"coming soon" yer tutucusu' },
  { pattern: /yakında geliyor|çok yakında/i, reason: '"yakında" yer tutucusu' },
  { pattern: /^\s*(?:çok\s+)?yakında[\s.!…]*$/i, reason: 'yalnız "Yakında" yazan ekran metni' },
  { pattern: /^\s*not (?:yet )?implemented[\s.!…]*$/i, reason: '"not implemented" yer tutucusu' },
  { pattern: /henüz uygulanmadı|henüz eklenmedi/i, reason: 'tamamlanmadığını söyleyen kullanıcı metni' },
  {
    pattern: /^\s*(?:placeholder|dummy|tbd|test text|örnek metin|deneme metni)[\s.!…]*$/i,
    reason: 'yer tutucu etiket',
  },
];

/** Comment markers. `XXX` is left out on purpose: it collides with input masks. */
const COMMENT_MARKER = /\b(TODO|FIXME|HACK)\b/;
const STRING_MARKER = /\b(TODO|FIXME)\b/;

/**
 * Callback properties whose empty body is a known-legitimate decision rather
 * than an unfinished control:
 *
 * - anything ending in `Changed`/`Update`/`Invoked` is a value or gesture
 *   stream, not an activation: `onChanged: (_) {}` wastes a rebuild, it does not
 *   break a promise;
 * - sqflite's `onCreate`/`onConfigure`/`onOpen`/`onUpgrade`/`onDowngrade` are
 *   required parameters, and an empty `onUpgrade` is how "no migrations yet" is
 *   spelled;
 * - framework lifecycle hooks are passed to satisfy an API, not to react to a
 *   tap.
 *
 * `onOpen` stays on this list even though a custom "open item" handler shares
 * the name: missing one real finding costs less than a blocker nobody trusts.
 */
const NON_ACTIVATION_SUFFIX = /(?:Changed|Update|Invoked|InvokedWithResult)$/;
const NON_ACTIVATION_HANDLERS = new Set([
  'onSaved', 'onEditingComplete', 'onCreate', 'onConfigure', 'onOpen', 'onUpgrade', 'onDowngrade',
  'onWillPop', 'onHover', 'onFocusChange', 'onEnter', 'onExit', 'onInit', 'onDispose', 'onDone',
  'onError', 'onListen', 'onCancel', 'onGenerateRoute', 'onUnknownRoute', 'onResume', 'onPause',
  'onPanStart', 'onPanEnd', 'onDragStart', 'onDragEnd', 'onLongPressMoveUpdate',
]);

const HANDLER_PROPERTY = /\b(on[A-Z][A-Za-z0-9_]*)\s*:\s*/g;

export function isActivationHandler(name) {
  const handler = String(name ?? '');
  return /^on[A-Z]/.test(handler)
    && !NON_ACTIVATION_SUFFIX.test(handler)
    && !NON_ACTIVATION_HANDLERS.has(handler);
}

/**
 * Returns the index just past the string literal that starts at `start`.
 * Interpolated expressions are parsed as code, so `'${a ?? 'b'}'` does not end
 * the literal at the inner quote and leave the rest of the file misread.
 */
export function stringEnd(source, start) {
  const raw = start > 0 && (source[start - 1] === 'r' || source[start - 1] === 'R');
  const quote = source[start];
  const triple = source.slice(start, start + 3) === quote.repeat(3);
  const delimiter = triple ? quote.repeat(3) : quote;
  let index = start + delimiter.length;
  while (index < source.length) {
    if (!raw && source[index] === '\\') {
      index += 2;
      continue;
    }
    if (!raw && source.slice(index, index + 2) === '${') {
      index = interpolationEnd(source, index + 1);
      continue;
    }
    if (source.slice(index, index + delimiter.length) === delimiter) return index + delimiter.length;
    index += 1;
  }
  return source.length;
}

function interpolationEnd(source, braceIndex) {
  let depth = 0;
  let index = braceIndex;
  while (index < source.length) {
    const character = source[index];
    if (character === "'" || character === '"') {
      index = stringEnd(source, index);
      continue;
    }
    if (character === '{') depth += 1;
    if (character === '}') {
      depth -= 1;
      if (depth === 0) return index + 1;
    }
    index += 1;
  }
  return source.length;
}

/**
 * Splits Dart source into `code`, `comment` and `string` segments. Every segment
 * keeps its absolute offset, so a finding reports the line it was really on.
 */
export function splitDartSegments(source) {
  const text = String(source ?? '');
  const segments = [];
  let index = 0;
  let codeStart = 0;
  const flushCode = end => {
    if (end > codeStart) segments.push({ kind: 'code', start: codeStart, text: text.slice(codeStart, end) });
  };
  while (index < text.length) {
    const pair = text.slice(index, index + 2);
    const character = text[index];
    if (pair === '//' || pair === '/*') {
      flushCode(index);
      const close = pair === '//' ? text.indexOf('\n', index) : text.indexOf('*/', index + 2);
      const end = close === -1 ? text.length : (pair === '//' ? close : close + 2);
      segments.push({ kind: 'comment', start: index, text: text.slice(index, end) });
      index = end;
      codeStart = index;
      continue;
    }
    if (character === "'" || character === '"') {
      flushCode(index);
      const end = stringEnd(text, index);
      segments.push({ kind: 'string', start: index, text: text.slice(index, end) });
      index = end;
      codeStart = index;
      continue;
    }
    index += 1;
  }
  flushCode(text.length);
  return segments;
}

/**
 * Blanks out comments and string literals while keeping every other character at
 * its original offset, so code-level patterns can be matched with a plain regex
 * and still report the right line.
 */
export function maskNonCode(source) {
  let masked = '';
  for (const segment of splitDartSegments(source)) {
    masked += segment.kind === 'code' ? segment.text : segment.text.replace(/[^\n]/g, ' ');
  }
  return masked;
}

/** Strips the quotes (and the raw prefix) from a literal segment. */
export function literalContent(literal) {
  const text = String(literal ?? '');
  const quote = text[0];
  if (quote !== "'" && quote !== '"') return text;
  const delimiter = text.slice(0, 3) === quote.repeat(3) ? quote.repeat(3) : quote;
  return text.slice(delimiter.length, Math.max(delimiter.length, text.length - delimiter.length));
}

const lineOf = (source, index) => source.slice(0, index).split(/\r?\n/).length;

const excerptAt = (source, index) => {
  const start = source.lastIndexOf('\n', index) + 1;
  const end = source.indexOf('\n', index);
  return source.slice(start, end === -1 ? source.length : end).trim().slice(0, EXCERPT_LENGTH);
};

const finding = (check, severity, source, index, file, reason) => ({
  check,
  severity,
  file: String(file).replaceAll('\\', '/'),
  line: lineOf(source, index),
  reason,
  excerpt: excerptAt(source, index),
});

/** Template code from `flutter create` that survived into the delivered app. */
export function findScaffoldRemnants(source, filePath = '') {
  const text = String(source ?? '');
  const masked = maskNonCode(text);
  const findings = [];
  for (const pattern of SCAFFOLD_IDENTIFIERS) {
    for (const match of masked.matchAll(new RegExp(pattern.source, 'g'))) {
      findings.push(finding('scaffold_remnant', 'blocker', text, match.index, filePath,
        `flutter create şablonundan kalan tanımlayıcı: ${match[0]}`));
    }
  }
  for (const segment of splitDartSegments(text)) {
    if (segment.kind !== 'string') continue;
    const content = literalContent(segment.text);
    if (SCAFFOLD_STRINGS.some(pattern => pattern.test(content))) {
      findings.push(finding('scaffold_remnant', 'blocker', text, segment.start, filePath,
        'flutter create şablonundan kalan kullanıcı metni'));
    }
  }
  return findings;
}

/**
 * Finds activation callbacks bound to an empty function literal: a control the
 * user can see and press that does nothing at all.
 *
 * `onPressed: null` is never a finding — that is how Flutter spells a disabled
 * control. An empty body that carries a comment drops to a warning, because
 * someone wrote down why it is empty.
 */
export function findNoopInteractions(source, filePath = '') {
  const text = String(source ?? '');
  const masked = maskNonCode(text);
  const findings = [];
  for (const match of masked.matchAll(HANDLER_PROPERTY)) {
    const handler = match[1];
    if (!isActivationHandler(handler)) continue;
    const empty = emptyCallbackAt(masked, match.index + match[0].length);
    if (!empty) continue;
    const documented = empty.bodyStart !== null
      && text.slice(empty.bodyStart, empty.bodyEnd).trim().length > 0;
    findings.push(finding(
      'noop_interaction', documented ? 'warning' : 'blocker', text, match.index, filePath,
      documented
        ? `${handler} gövdesi yalnız açıklama içeriyor; bir eylem çalıştırmıyor`
        : `${handler} boş bir geri çağrıya bağlı; kontrol hiçbir şey yapmıyor`,
    ));
  }
  return findings;
}

/**
 * Recognises `() {}`, `(value) async {}` and `() => {}` at `index` in masked
 * source, and reports the body offsets so the caller can see whether the
 * original source had a comment in there.
 */
function emptyCallbackAt(masked, index) {
  let cursor = skipSpace(masked, index);
  if (masked[cursor] !== '(') return null;
  const parameters = matchingBracket(masked, cursor, '(', ')');
  if (parameters === -1) return null;
  cursor = skipSpace(masked, parameters);
  if (masked.startsWith('async', cursor)) cursor = skipSpace(masked, cursor + 5);
  if (masked[cursor] === '{') {
    const end = matchingBracket(masked, cursor, '{', '}');
    if (end === -1 || masked.slice(cursor + 1, end - 1).trim()) return null;
    return { bodyStart: cursor + 1, bodyEnd: end - 1 };
  }
  if (masked.startsWith('=>', cursor)) {
    cursor = skipSpace(masked, cursor + 2);
    if (masked[cursor] !== '{') return null;
    const end = matchingBracket(masked, cursor, '{', '}');
    if (end === -1 || masked.slice(cursor + 1, end - 1).trim()) return null;
    return { bodyStart: null, bodyEnd: null };
  }
  return null;
}

const skipSpace = (text, index) => {
  let cursor = index;
  while (cursor < text.length && /\s/.test(text[cursor])) cursor += 1;
  return cursor;
};

function matchingBracket(text, start, open, close) {
  let depth = 0;
  for (let index = start; index < text.length; index += 1) {
    if (text[index] === open) depth += 1;
    if (text[index] === close) {
      depth -= 1;
      if (depth === 0) return index + 1;
    }
  }
  return -1;
}

/** A production path that throws instead of doing the work. */
export function findUnimplementedStubs(source, filePath = '') {
  const text = String(source ?? '');
  return [...maskNonCode(text).matchAll(/\bUnimplementedError\b/g)].map(match => finding(
    'unimplemented_stub', 'blocker', text, match.index, filePath,
    'üretim kodunda UnimplementedError; bu yol henüz yazılmamış',
  ));
}

/**
 * Placeholder text a user would actually read.
 *
 * Spec awareness: when PROJECT_SPEC.md contains the literal itself, the product
 * asked for that text and the finding drops to a warning. The comparison uses
 * the whole literal on purpose — a spec that merely mentions the word must not
 * silence a real coming-soon screen.
 */
export function findPlaceholderCopy(source, filePath = '', { specContent = '' } = {}) {
  const text = String(source ?? '');
  const spec = String(specContent ?? '').toLocaleLowerCase('tr-TR');
  const findings = [];
  for (const segment of splitDartSegments(text)) {
    if (segment.kind !== 'string') continue;
    const content = literalContent(segment.text);
    const trimmed = content.trim();
    if (!trimmed) continue;
    const rule = PLACEHOLDER_COPY.find(entry => entry.pattern.test(content));
    if (!rule) continue;
    const permitted = trimmed.length >= 3 && spec.includes(trimmed.toLocaleLowerCase('tr-TR'));
    findings.push({
      ...finding('placeholder_copy', permitted ? 'warning' : 'blocker', text, segment.start, filePath,
        permitted
          ? `${rule.reason}; PROJECT_SPEC bu metni birebir istiyor`
          : `kullanıcıya gösterilen ${rule.reason}`),
      ...(permitted ? { spec_permitted: true } : {}),
    });
  }
  return findings;
}

/** TODO/FIXME left in production source, in a comment or in a string. */
export function findUnfinishedMarkers(source, filePath = '') {
  const text = String(source ?? '');
  const findings = [];
  for (const segment of splitDartSegments(text)) {
    if (segment.kind === 'code') continue;
    const marker = segment.kind === 'comment'
      ? segment.text.match(COMMENT_MARKER)
      : literalContent(segment.text).match(STRING_MARKER);
    if (!marker) continue;
    findings.push(finding('unfinished_marker', 'warning', text, segment.start, filePath,
      segment.kind === 'comment'
        ? `üretim kaynağında ${marker[1]} yorumu`
        : `kullanıcı metninde ${marker[1]} işareti`));
  }
  return findings;
}

export function scanDartSource(source, filePath = '', options = {}) {
  return [
    ...findScaffoldRemnants(source, filePath),
    ...findNoopInteractions(source, filePath),
    ...findUnimplementedStubs(source, filePath),
    ...findPlaceholderCopy(source, filePath, options),
    ...findUnfinishedMarkers(source, filePath),
  ];
}

function dartFiles(root) {
  if (!fs.existsSync(root)) return [];
  return fs.readdirSync(root, { withFileTypes: true }).flatMap(entry => {
    const absolute = path.join(root, entry.name);
    if (entry.isDirectory()) return dartFiles(absolute);
    return entry.isFile() && entry.name.endsWith('.dart') ? [absolute] : [];
  });
}

/** Walks `lib/`, skipping code-generation output nobody hand-writes. */
export function scanProductionSources(workspace, { specContent = '' } = {}) {
  const files = dartFiles(path.join(workspace, PRODUCTION_ROOT));
  const scanned = files.filter(file => !GENERATED_FILE.test(path.basename(file)));
  const findings = scanned.flatMap(file => scanDartSource(
    fs.readFileSync(file, 'utf8'), path.relative(workspace, file), { specContent },
  )).sort((left, right) => left.file.localeCompare(right.file, 'en')
    || left.line - right.line
    || left.check.localeCompare(right.check, 'en'));
  return {
    root: PRODUCTION_ROOT,
    files: scanned.length,
    generated_skipped: files.length - scanned.length,
    findings,
  };
}

const CHECK_DEFINITIONS = [
  {
    id: 'scaffold_remnant',
    severity: 'blocker',
    title: 'Flutter iskelet artığı',
    pass: 'Üretim kaynağında flutter create şablonundan kalan kod yok.',
  },
  {
    id: 'noop_interaction',
    severity: 'blocker',
    title: 'Hiçbir şey yapmayan kontrol',
    pass: 'Görünen her eylem kontrolü bir davranışa bağlı.',
  },
  {
    id: 'unimplemented_stub',
    severity: 'blocker',
    title: 'Yazılmamış kod yolu',
    pass: 'Üretim kodunda UnimplementedError yok.',
  },
  {
    id: 'placeholder_copy',
    severity: 'blocker',
    title: 'Yer tutucu kullanıcı metni',
    pass: 'Kullanıcıya gösterilen metinlerde yer tutucu bulunmadı.',
  },
  {
    id: 'unfinished_marker',
    severity: 'warning',
    title: 'Tamamlanmamış iş işareti',
    pass: 'Üretim kaynağında TODO/FIXME işareti yok.',
  },
];

const summarizeFindings = findings => findings.slice(0, MAX_CHECK_EVIDENCE)
  .map(({ file, line, reason, excerpt, spec_permitted: permitted }) => ({
    file, line, reason, excerpt, ...(permitted ? { spec_permitted: true } : {}),
  }));

/**
 * A check fails only when it holds a blocker-severity finding; findings that
 * were downgraded — a documented empty callback, spec-permitted copy — leave it
 * at WARN, which never changes the report status.
 */
export function evaluateCompletenessChecks(scan) {
  const checks = CHECK_DEFINITIONS.map(definition => {
    const findings = scan.findings.filter(entry => entry.check === definition.id);
    const blockers = findings.filter(entry => entry.severity === 'blocker');
    const status = blockers.length ? 'FAIL' : (findings.length ? 'WARN' : 'PASS');
    const locations = findings.slice(0, 3).map(entry => `${entry.file}:${entry.line}`).join(', ');
    return {
      id: definition.id,
      severity: definition.severity,
      status,
      title: definition.title,
      details: status === 'PASS'
        ? definition.pass
        : `${findings.length} bulgu (${blockers.length} engel): ${locations}`
          + (findings.length > 3 ? ` … +${findings.length - 3}` : ''),
      ...(findings.length ? { evidence: summarizeFindings(findings) } : {}),
    };
  });

  checks.push(scan.files
    ? {
      id: 'production_sources',
      severity: 'info',
      status: 'INFO',
      title: 'Taranan üretim kaynağı',
      details: `${scan.root}/ altında ${scan.files} Dart dosyası tarandı`
        + (scan.generated_skipped ? `; ${scan.generated_skipped} üretilmiş dosya atlandı.` : '.'),
    }
    : {
      id: 'production_sources',
      severity: 'warning',
      status: 'WARN',
      title: 'Üretim kaynağı bulunamadı',
      details: `${scan.root}/ altında taranacak Dart dosyası yok; bütünlük ölçülemedi.`,
    });
  return checks;
}

const summarize = (checks, status) => checks
  .filter(entry => entry.status === status)
  .map(({ id, title, details }) => ({ id, title, details }));

/**
 * Runs the whole evaluation. Cheap on purpose: it reads the generated sources
 * and nothing else, so it can run at the end of every pipeline without adding a
 * toolchain command, a device or an agent turn to the critical path.
 */
export function runApplicationCompleteness({ workspace, specContent = '' }) {
  const scan = scanProductionSources(workspace, { specContent });
  const checks = evaluateCompletenessChecks(scan);
  const blocked = checks.some(entry => entry.severity === 'blocker' && entry.status === 'FAIL');
  return {
    version: 1,
    profile: 'flutter_mobile',
    generated_at: new Date().toISOString(),
    // COMPLETE means "no mechanical sign of an unfinished app was found", not
    // "the product is finished": this slice only reads deterministic hygiene.
    status: blocked ? 'INCOMPLETE' : 'COMPLETE',
    scope: {
      root: scan.root,
      files: scan.files,
      generated_skipped: scan.generated_skipped,
      spec_aware: Boolean(String(specContent ?? '').trim()),
    },
    checks,
    blockers: summarize(checks, 'FAIL'),
    warnings: summarize(checks, 'WARN'),
    findings: scan.findings.slice(0, MAX_REPORTED_FINDINGS),
    truncated_findings: Math.max(0, scan.findings.length - MAX_REPORTED_FINDINGS),
  };
}

export function renderApplicationCompletenessJson(report) {
  return `${JSON.stringify(report, null, 2)}\n`;
}

export function writeApplicationCompletenessReport(workspace, report) {
  fs.writeFileSync(
    path.join(workspace, APPLICATION_COMPLETENESS_PATH),
    renderApplicationCompletenessJson(report),
    'utf8',
  );
  return report;
}
