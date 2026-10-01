import fs from 'node:fs';
import path from 'node:path';

const SCANNED_DIRECTORIES = ['lib', 'integration_test'];
const GENERATED_FILE = /\.(?:g|freezed|gr|config|mocks)\.dart$/i;
const MAX_REPORTED_FINDINGS = 20;

/**
 * Walks Dart source and returns the index right after the block that starts at
 * `start`. Strings and comments are skipped so their braces never unbalance the
 * scan; interpolation braces are balanced code, so counting them is harmless.
 */
function blockEnd(source, start) {
  let depth = 0;
  let index = start;
  while (index < source.length) {
    const character = source[index];
    const pair = source.slice(index, index + 2);
    if (pair === '//') {
      const newline = source.indexOf('\n', index);
      index = newline === -1 ? source.length : newline;
      continue;
    }
    if (pair === '/*') {
      const close = source.indexOf('*/', index + 2);
      index = close === -1 ? source.length : close + 2;
      continue;
    }
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
  return -1;
}

function stringEnd(source, start) {
  const quote = source[start];
  const triple = source.slice(start, start + 3) === quote.repeat(3);
  const delimiter = triple ? quote.repeat(3) : quote;
  let index = start + delimiter.length;
  while (index < source.length) {
    if (source[index] === '\\') {
      index += 2;
      continue;
    }
    if (source.slice(index, index + delimiter.length) === delimiter) return index + delimiter.length;
    index += 1;
  }
  return source.length;
}

function stripCommentsAndStrings(body) {
  let output = '';
  let index = 0;
  while (index < body.length) {
    const pair = body.slice(index, index + 2);
    if (pair === '//') {
      const newline = body.indexOf('\n', index);
      index = newline === -1 ? body.length : newline;
      continue;
    }
    if (pair === '/*') {
      const close = body.indexOf('*/', index + 2);
      index = close === -1 ? body.length : close + 2;
      continue;
    }
    const character = body[index];
    if (character === "'" || character === '"') {
      const end = stringEnd(body, index);
      // Interpolated expressions are code: `log("kayıt: $error")` does surface
      // the error, while the plain word "error" in a message does not.
      output += interpolations(body.slice(index, end));
      index = end;
      continue;
    }
    output += character;
    index += 1;
  }
  return output;
}

function interpolations(literal) {
  const expressions = [...literal.matchAll(/\$\{([^}]*)\}|\$([A-Za-z_$][\w$]*)/g)]
    .map(match => match[1] ?? match[2]);
  return expressions.length ? ` ${expressions.join(' ')} ` : '';
}

const lineOf = (source, index) => source.slice(0, index).split(/\r?\n/).length;

/**
 * Reports catch clauses that make a failure undiagnosable: the error is
 * explicitly discarded, the block is empty, or the block neither inspects the
 * caught error nor rethrows it. This is the defect class that produced
 * "İşlem tamamlanamadı. Tekrar deneyin." with no way to find the real cause.
 */
export function findSilentErrorHandling(source, filePath = '') {
  const text = String(source ?? '');
  const findings = [];
  const clause = /\bcatch\s*\(\s*([A-Za-z_$][\w$]*)\s*(?:,\s*([A-Za-z_$][\w$]*)\s*)?\)\s*\{/g;
  let match = clause.exec(text);
  while (match) {
    const openBrace = match.index + match[0].length - 1;
    const end = blockEnd(text, openBrace);
    const body = end === -1 ? text.slice(openBrace + 1) : text.slice(openBrace + 1, end - 1);
    const code = stripCommentsAndStrings(body);
    const error = match[1];
    const stack = match[2] || null;
    const usesError = new RegExp(`\\b${error}\\b`).test(code)
      || (stack ? new RegExp(`\\b${stack}\\b`).test(code) : false);
    const rethrows = /\brethrow\b|\bthrow\b/.test(code);

    // `catch (_) { cleanup(); rethrow; }` keeps the original error intact, so the
    // discarded name alone is not a defect; losing the failure is.
    let reason = null;
    if (!code.trim()) reason = 'catch bloğu boş';
    else if (!usesError && !rethrows) reason = 'catch bloğu hatayı ne inceliyor ne yeniden fırlatıyor';

    if (reason) {
      findings.push({
        file: String(filePath).replaceAll('\\', '/'),
        line: lineOf(text, match.index),
        identifier: error,
        reason,
      });
    }
    clause.lastIndex = end === -1 ? clause.lastIndex : end;
    match = clause.exec(text);
  }
  return findings;
}

/**
 * A lead byte of a two-byte UTF-8 sequence followed by a continuation byte, both
 * read as Latin-1 characters. This is what double encoding leaves behind: the
 * bytes `C3 BC` (ü) become `C3 83 C2 BC`, which decodes as `Ã¼` — U+00C3 then
 * U+00BC. The second character is restricted to U+0080–U+00BF, a range no real
 * word uses after a capital letter, so legitimate text cannot match.
 */
const MOJIBAKE = /[Â-Å][\u0080-¿]/g;

/**
 * Reports text an agent double-encoded while writing the file.
 *
 * The measured failure: a repair agent rewrote `günlük seri` as `gÃ¼nlÃ¼k seri`.
 * Nothing mechanical saw it — analyze, test, the APK build and the completeness
 * scan all pass on mojibake, because it is valid Dart and a valid string. The
 * reviewer caught it only because that string happened to be in a file it read,
 * and the detour cost 106.506 tokens.
 *
 * This blocks rather than warns, because the output criterion is not a matter of
 * taste: a Dart source carrying `Ã` + a continuation character is never what
 * anyone wrote on purpose.
 */
export function findBrokenEncoding(source, filePath = '') {
  const text = String(source ?? '');
  const findings = [];
  const seen = new Set();
  for (const match of text.matchAll(MOJIBAKE)) {
    const line = lineOf(text, match.index);
    // One finding per line: a corrupted word usually trips the pattern twice.
    if (seen.has(line)) continue;
    seen.add(line);
    findings.push({
      file: String(filePath).replaceAll('\\', '/'),
      line,
      identifier: match[0],
      reason: `metin kodlaması bozuk (${JSON.stringify(match[0])} — çift kodlanmış UTF-8)`,
    });
  }
  return findings;
}

function dartFiles(root) {
  if (!fs.existsSync(root)) return [];
  return fs.readdirSync(root, { withFileTypes: true }).flatMap(entry => {
    const absolute = path.join(root, entry.name);
    if (entry.isDirectory()) return dartFiles(absolute);
    return entry.isFile() && entry.name.endsWith('.dart') && !GENERATED_FILE.test(entry.name)
      ? [absolute] : [];
  });
}

/** Scans a generated project and returns a quality-report check for its sources. */
export function runSourceDiagnostics(workspace) {
  const findings = SCANNED_DIRECTORIES.flatMap(directory => {
    const root = path.join(workspace, directory);
    return dartFiles(root).flatMap(file => {
      const source = fs.readFileSync(file, 'utf8');
      const relative = path.relative(workspace, file);
      return [...findSilentErrorHandling(source, relative), ...findBrokenEncoding(source, relative)];
    });
  }).sort((left, right) => left.file.localeCompare(right.file, 'en') || left.line - right.line);

  const lines = findings.map(finding => `${finding.file}:${finding.line} — ${finding.reason}`);
  const summary = findings.length
    ? [
      `${findings.length} noktada teşhis edilemeyen hata yönetimi veya bozuk metin kodlaması bulundu.`,
      ...lines.slice(0, MAX_REPORTED_FINDINGS),
      findings.length > MAX_REPORTED_FINDINGS
        ? `… ${findings.length - MAX_REPORTED_FINDINGS} kayıt daha: QUALITY_LOGS/diagnostics.log`
        : 'Tam liste: QUALITY_LOGS/diagnostics.log',
    ].join('\n')
    : 'Sessiz hata yutma veya bozuk kodlama bulunmadı.';

  return {
    check: {
      status: findings.length ? 'FAIL' : 'PASS',
      command: 'source diagnostics',
      exit_code: findings.length ? 1 : 0,
      details: summary,
    },
    findings,
    log: lines.length ? lines.join('\n') : 'Sessiz hata yutma veya bozuk kodlama bulunmadı.',
  };
}
