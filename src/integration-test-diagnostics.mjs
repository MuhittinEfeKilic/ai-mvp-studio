import fs from 'node:fs';
import path from 'node:path';

/**
 * Deterministic scan of the generated device tests for one measured failure
 * class: asserting that a widget is present while the soft keyboard may still
 * be covering the list that would contain it.
 *
 * Why this exists. Three device-gate failures across two real runs of the same
 * project — `active_filter`, `edit_subscription`, `search_subscription` — were
 * all the same shape. The test enters text, which focuses a field and raises the
 * IME; `MediaQuery.viewInsets.bottom` grows, the list viewport shrinks, and a
 * lazily built `SliverList`/`ListView.builder` never builds the row that no
 * longer fits. `find.byKey` only sees widgets that exist, so the assertion fails
 * on a product that is perfectly correct. The fix that finally worked was one
 * line — `FocusManager.instance.primaryFocus?.unfocus()` — but it cost four
 * device repair rounds to find, because nothing pointed at the cause.
 *
 * This is not a gate and does not judge the product. It reads the generated test
 * sources only, costs no toolchain command, no device and no agent turn, and is
 * attached to the device report so a repair agent starts from the real
 * hypothesis instead of guessing.
 *
 * Deliberately narrow, because a noisy diagnostic is worse than none:
 * - only assertions that require a widget to be PRESENT are reported.
 *   `findsNothing` cannot fail this way (an unbuilt widget is also not found),
 *   so flagging it would be noise — it is a false-pass risk, not a failure.
 * - the risk is cleared by any focus dismissal or any scroll-into-view, which is
 *   exactly what makes such an assertion safe.
 * - one finding per test, naming the first assertion at risk. A test that
 *   asserts six rows has one problem, not six.
 */

const TEST_START = /\b(?:testWidgets|test)\s*\(/;
const ENTER_TEXT = /\.enterText\s*\(/;
const PRESENCE_ASSERTION = /\bexpect\s*\(|\bfindsOneWidget\b|\bfindsWidgets\b|\bfindsNWidgets\s*\(/;
const PRESENCE_MATCHER = /\bfindsOneWidget\b|\bfindsWidgets\b|\bfindsNWidgets\s*\(/;
const FINDER = /\bfind\s*\./;

// Anything that puts the keyboard away or brings the target into view makes the
// assertion independent of how much room the IME left.
const RISK_CLEARED = new RegExp([
  'unfocus\\s*\\(',
  'primaryFocus',
  'FocusScope',
  'FocusManager',
  'scrollUntilVisible',
  'dragUntilVisible',
  'ensureVisible',
  'scrollTo\\s*\\(',
  'hideKeyboard',
  'receiveAction',
  'TextInputAction',
  'closeKeyboard',
].join('|'));

export const INTEGRATION_DIAGNOSTICS_ID = 'keyboard_obscured_assertion';

/** Strips line comments so a commented-out example never becomes a finding. */
function codeOf(line) {
  const withoutComment = line.replace(/\/\/.*$/, '');
  return withoutComment.trim();
}

/**
 * @param {string} filePath repository-relative path, used only for reporting
 * @param {string} source Dart source of one integration test file
 */
export function scanIntegrationTestSource(filePath, source) {
  const lines = String(source ?? '').split(/\r?\n/);
  const findings = [];
  let testName = null;
  let testLine = 0;
  let keyboardRaised = false;
  let reported = false;

  for (let index = 0; index < lines.length; index += 1) {
    const code = codeOf(lines[index]);
    if (!code) continue;

    if (TEST_START.test(code)) {
      // A new test starts from a clean device: whatever the previous one typed
      // is gone, and its finding — if any — has already been recorded.
      testName = code.match(/["'`](.+?)["'`]/)?.[1] ?? null;
      testLine = index + 1;
      keyboardRaised = false;
      reported = false;
    }

    if (RISK_CLEARED.test(code)) keyboardRaised = false;
    if (ENTER_TEXT.test(code)) keyboardRaised = true;

    if (!keyboardRaised || reported) continue;
    if (!PRESENCE_ASSERTION.test(code) || !PRESENCE_MATCHER.test(code) || !FINDER.test(code)) continue;

    reported = true;
    findings.push({
      id: INTEGRATION_DIAGNOSTICS_ID,
      severity: 'warning',
      file: `${filePath}:${index + 1}`,
      test: testName,
      test_line: testLine,
      evidence: code.slice(0, 200),
      details: 'Metin girildikten sonra odak bırakılmadan ve kaydırma yapılmadan bir widget\'ın '
        + 'varlığı iddia ediliyor. Gerçek cihazda klavye viewport\'u daraltır; tembel inşa edilen '
        + 'liste o satırı hiç oluşturmaz ve ürün doğru olduğu hâlde iddia başarısız olur. '
        + 'İddiadan önce odağı bırakın (`FocusManager.instance.primaryFocus?.unfocus()`) veya '
        + 'hedefi görünür yapın (`scrollUntilVisible` / `ensureVisible`).',
    });
  }
  return findings;
}

/** Collects every `integration_test/**\/*.dart` file, newest-run order irrelevant. */
function listIntegrationTests(workspace) {
  const root = path.join(workspace, 'integration_test');
  if (!fs.existsSync(root)) return [];
  const files = [];
  const walk = directory => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) walk(absolute);
      else if (entry.name.endsWith('.dart')) files.push(absolute);
    }
  };
  walk(root);
  return files.sort();
}

/**
 * Scans the generated device tests. Returns findings only — the caller decides
 * what to do with them, and today every caller only reports them.
 */
export function runIntegrationTestDiagnostics(workspace) {
  const files = listIntegrationTests(workspace);
  const findings = files.flatMap(absolute => scanIntegrationTestSource(
    path.relative(workspace, absolute).replaceAll('\\', '/'),
    fs.readFileSync(absolute, 'utf8'),
  ));
  return {
    version: 1,
    scanned_files: files.length,
    findings,
    status: findings.length ? 'FINDINGS' : 'CLEAN',
  };
}
