import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { runProcess } from './async-process-runner.mjs';

import {
  describeDeviceTarget, detectDeviceTarget, ensureBootedDevice, parseAdbDevices,
  hasAvdSnapshot, parseAvailableDataKb, prepareDeviceForTest, resetAvdToSnapshot,
  saveAvdSnapshot, STUDIO_CLEAN_SNAPSHOT, wipeAvdAfterTest,
} from './android-environment.mjs';

export { parseAdbDevices };

const normalizePath = value => String(value || '').replaceAll('\\', '/');
export const ADB_COMMAND_TIMEOUT_MS = 120_000;

// Pulled to the host after every launch check and then left behind on the
// device: small, but they are ours and nothing else ever removes them.
export const DEVICE_ARTIFACTS = Object.freeze([
  '/sdcard/ai_mvp_device_smoke.png',
  '/sdcard/ai_mvp_device_ui.xml',
]);

// Reclaim below this much free space, not on every gate. Across a real run the
// device never fell under 3947 MB while the gate's own minimum is 1536 MB, so
// the unconditional reset reclaimed nothing and paid a full emulator boot for
// it. Double the minimum leaves a gate's worth of headroom.
export const DEFAULT_RECLAIM_BELOW_MB = 3072;

/**
 * Whether the device needs reclaiming before someone uses it again. An
 * unmeasurable device reclaims: "we could not read the free space" is not
 * evidence that there is room.
 */
export function shouldReclaimStorage(freeMb, reclaimBelowMb = DEFAULT_RECLAIM_BELOW_MB) {
  return !Number.isFinite(freeMb) || freeMb < reclaimBelowMb;
}

/**
 * `adb uninstall` on a package that was never installed answers
 * `Failure [DELETE_FAILED_INTERNAL_ERROR]`, which is not the wording the
 * "already gone" check used to look for. Two of three gates in a real run
 * therefore reported a housekeeping failure for doing exactly what was asked.
 * A storage or connectivity failure is still a real failure.
 */
export function isPackageAbsent(uninstallOutput) {
  const text = String(uninstallOutput || '');
  return /unknown package|not installed|delete_failed_internal_error/i.test(text)
    && !/insufficient storage|device offline|device .*not found/i.test(text);
}

export function renderDeviceSuite(files) {
  const literal = value => JSON.stringify(value).replaceAll('$', '\\$');
  return [
    "import 'package:flutter_test/flutter_test.dart';",
    ...files.map((file, i) => `import ${literal('./' + file.slice('integration_test/'.length))} as flow${i};`),
    'void main() {',
    ...files.map((file, i) => `  group(${literal(file)}, flow${i}.main);`),
    '}', '',
  ].join('\n');
}

export function parseDeviceSuite(output, files) {
  const cases = new Map();
  for (const line of output.split(/\r?\n/)) {
    let event;
    try { event = JSON.parse(line); } catch { continue; }
    if (event.type === 'testStart') {
      const file = files.find(file => event.test.name.startsWith(file + ' '));
      if (file) cases.set(event.test.id, { file, name: event.test.name, status: 'RUNNING' });
    }
    if (event.type === 'testDone' && cases.has(event.testID)) {
      cases.get(event.testID).status = event.skipped ? 'SKIPPED'
        : event.result === 'success' ? 'PASS' : 'FAIL';
    }
  }
  const scenarios = [...cases.values()];
  const completed = files.filter(file => {
    const found = scenarios.filter(item => item.file === file);
    return found.length > 0 && found.every(item => item.status === 'PASS');
  });
  return { scenarios, completed_files: completed,
    failed_file: files.find(file => !completed.includes(file)) || null };
}

export function adbCandidates(env = process.env, platform = process.platform) {
  const values = [env.ADB_BIN];
  if (platform === 'win32') {
    if (env.LOCALAPPDATA) values.push(path.join(env.LOCALAPPDATA, 'Android', 'Sdk', 'platform-tools', 'adb.exe'));
  }
  values.push('adb');
  return [...new Set(values.filter(Boolean))];
}

export function findIntegrationTests(workspace) {
  const root = path.join(workspace, 'integration_test');
  if (!fs.existsSync(root)) return [];
  const visit = directory => fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) return visit(absolute);
    return entry.isFile() && entry.name.endsWith('_test.dart')
      ? [normalizePath(path.relative(workspace, absolute))] : [];
  });
  return visit(root).sort();
}

export function validateFlowCoverage(workspace, flows = []) {
  const tests = findIntegrationTests(workspace);
  const required = Array.isArray(flows) ? flows.length : 0;
  return {
    status: required > 0 && tests.length >= required ? 'PASS' : 'FAIL',
    required_flows: required,
    integration_tests: tests,
    details: required === 0
      ? 'USER_FLOWS.json içinde kritik akış bulunamadı.'
      : `${required} kritik akış için ${tests.length} integration test dosyası bulundu.`,
  };
}

/**
 * Toolchain, emulator and host failures that say nothing about the produced app.
 * Matching one of these means a retry on a healthy device may still succeed.
 */
const ENVIRONMENT_SIGNALS = [
  /device offline/i,
  /device (?:'[^']*' )?not found/i,
  /Unable to start the app on the device/i,
  /No application found for TargetPlatform/i,
  /The log reader stopped unexpectedly/i,
  /Error waiting for a debug connection/i,
  /Failed to extract manifest from APK/i,
  /exit code -\d{6,}/i,
  /INSTALL_FAILED_(?:INSUFFICIENT_STORAGE|MEDIA_UNAVAILABLE|DEVICE_OFFLINE|UPDATE_INCOMPATIBLE)/i,
  /daemon not running|cannot connect to daemon|adb server/i,
  /Connection refused|Connection reset by peer|Software caused connection abort/i,
  /DEVICE_TEST_TIMEOUT|ADB_TIMEOUT/i,
];

/** Failures that come from the generated application or its tests. */
const PRODUCT_SIGNALS = [
  /EXCEPTION CAUGHT BY FLUTTER TEST FRAMEWORK/i,
  /The following TestFailure was thrown/i,
  /^\s*Expected:\s/m,
  /^\s*Actual:\s/m,
  /Test failed\. See exception logs above/i,
  /FATAL EXCEPTION/,
  /Unhandled Exception/i,
  /\bAssertionError\b/,
];

/** Returns the signal appearing earliest in the log, which is the likely root cause. */
function firstMatch(patterns, text) {
  let earliest = null;
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match && (earliest === null || match.index < earliest.index)) earliest = match;
  }
  return earliest ? earliest[0].trim() : null;
}

/**
 * Separates device-gate failures caused by the host/emulator from failures
 * caused by the generated app. Product signals win, and an unrecognised failure
 * stays 'product' so a real defect is never silently parked as a wait state.
 */
export function classifyDeviceFailure(logText) {
  const text = String(logText || '');
  const product = firstMatch(PRODUCT_SIGNALS, text);
  if (product) return { kind: 'product', signal: product };
  const environment = firstMatch(ENVIRONMENT_SIGNALS, text);
  if (environment) return { kind: 'environment', signal: environment };
  return { kind: 'product', signal: null };
}

const DEVICE_CHECK_ORDER = ['flow_coverage', 'device_storage', 'integration_test', 'apk_install', 'launch'];

/**
 * Post-test cleanup. It runs after the product verdict is already decided, so it
 * is reported outside `checks` and can never change the result: a measured run
 * passed all six critical flows and was still parked as WAITING because the
 * emulator console could not be reached to reset the AVD afterwards.
 */
export const DEVICE_HOUSEKEEPING_ORDER = Object.freeze([
  'app_cleanup', 'device_artifacts', 'avd_reset',
]);

const DEVICE_CHECK_LABELS = Object.freeze({
  flow_coverage: 'Kritik akış kapsamı',
  device_storage: 'AVD depolama hazırlığı',
  integration_test: 'Cihazda integration test',
  apk_install: 'APK kurulumu',
  launch: 'Uygulama açılışı',
  app_cleanup: 'Test sonrası hedef paket kaldırma',
  device_artifacts: 'Cihazdaki ekran görüntüsü/UI dökümü temizliği',
  avd_reset: 'Test sonrası cihaz sıfırlaması',
});

const DEVICE_CHECK_LOGS = Object.freeze({
  integration_test: ['QUALITY_LOGS/DEVICE_INTEGRATION_TEST.log'],
  apk_install: ['QUALITY_LOGS/DEVICE_APK_INSTALL.log'],
  launch: ['QUALITY_LOGS/DEVICE_LAUNCH.log', 'QUALITY_LOGS/DEVICE_LOGCAT.log'],
});

/**
 * Stable fingerprint of a device failure. Timing, clock and address noise is
 * removed so an unchanged failure across two rounds stops the repair loop
 * instead of burning another Codex turn on the same problem.
 */
export function deviceFailureSignature(report) {
  const checks = Object.entries(report?.checks || {})
    .map(([name, check]) => `${name}:${check?.status}:${check?.exit_code ?? ''}`)
    .sort()
    .join('|');
  const logs = Object.values(report?.logs || {}).join('\n')
    .replaceAll('\\', '/')
    .replace(/\b\d+(?:[.,]\d+)?\s*s\b/g, '<time>')
    .replace(/\b\d{2}:\d{2}(?::\d{2})?\b/g, '<clock>')
    .replace(/\b0x[0-9a-f]+\b/gi, '<addr>')
    .split(/\r?\n/)
    .filter(line => /error|fail|exception|cannot|unable|\[e\]/i.test(line))
    .slice(-40)
    .join('\n');
  return crypto.createHash('sha256').update(`${checks}\n${logs}`).digest('hex').slice(0, 16);
}

/**
 * A repair agent can write missing integration tests, but it cannot invent the
 * critical-flow contract itself. Without USER_FLOWS.json the fix belongs to the
 * spec, so repair rounds would only burn tokens.
 */
export function isRepairableDeviceFailure(report) {
  const coverage = report?.checks?.flow_coverage;
  return !(coverage && coverage.status !== 'PASS' && !coverage.required_flows);
}

/**
 * Describes why a device gate report is not PASS, naming the check that actually
 * failed instead of the first check recorded in the report.
 */
export function describeDeviceFailure(report) {
  const reason = String(report?.reason || '').trim();
  if (reason) return reason;
  const checks = report?.checks || {};
  const names = [
    ...DEVICE_CHECK_ORDER.filter(name => name in checks),
    ...Object.keys(checks).filter(name => !DEVICE_CHECK_ORDER.includes(name)),
  ];
  const failed = names.find(name => checks[name]?.status && checks[name].status !== 'PASS');
  if (!failed) return 'DEVICE_REPORT.json dosyasını inceleyin.';
  const check = checks[failed];
  const parts = [`${DEVICE_CHECK_LABELS[failed] || failed}: ${check.status}`];
  if (Number.isInteger(check.exit_code)) parts.push(`exit ${check.exit_code}`);
  if (check.details) parts.push(String(check.details).trim());
  if (check.fatal_log) parts.push('logcat içinde fatal kayıt var');
  if (DEVICE_CHECK_LOGS[failed]) parts.push(`Log: ${DEVICE_CHECK_LOGS[failed].join(', ')}`);
  return parts.join(' · ');
}

/**
 * Async on purpose: an adb/flutter device run takes minutes and spawnSync would
 * hold Node's event loop for all of it, stalling every other project's agents.
 */
function defaultRun(command, args, options = {}) {
  const invocation = process.platform === 'win32' && /\.(?:bat|cmd)$/i.test(command)
    ? { command: process.env.ComSpec || 'cmd.exe', args: ['/d', '/s', '/c', command, ...args] }
    : { command, args };
  return runProcess(invocation.command, invocation.args, {
    ...options,
    timeout: Number(options.timeout) || 600_000,
    timeoutLabel: options.timeoutLabel || 'DEVICE_TEST_TIMEOUT',
  });
}

const outputOf = result => [result.stdout, result.stderr, result.error?.message]
  .filter(Boolean).join('\n').trim();

let cachedAdb;

/** Memoised like the Flutter lookup; each probe is a real `adb version` spawn. */
export async function resolveAdb({ env = process.env, platform = process.platform, run = defaultRun, cache = true } = {}) {
  if (cache && cachedAdb !== undefined) return cachedAdb;
  let resolved = null;
  for (const candidate of adbCandidates(env, platform)) {
    const result = await run(candidate, ['version']);
    if (result.status === 0) {
      resolved = candidate;
      break;
    }
  }
  if (cache) cachedAdb = resolved;
  return resolved;
}

export function resetAdbCache() {
  cachedAdb = undefined;
}

/**
 * Turns a host/emulator failure into a resumable WAITING report so that a broken
 * device never marks the generated application as defective.
 */
function environmentWait(report, checkName, logText) {
  const { kind, signal } = classifyDeviceFailure(logText);
  if (kind !== 'environment') return null;
  const label = DEVICE_CHECK_LABELS[checkName] || checkName;
  return {
    ...report,
    status: 'WAITING',
    failure_kind: 'environment',
    reason: `${label} cihaz/ortam arızası nedeniyle tamamlanamadı: ${signal}. `
      + 'Emülatörü yeniden başlatıp cihaz testini tekrar deneyin.',
  };
}

const productFailure = report => ({ ...report, failure_kind: 'product' });

/**
 * `flutter test` overwrites the delivery APK with the instrumented test build,
 * so the gate keeps a backup and restores it afterwards. A Studio restart
 * between those two steps leaves the backup on disk while the file at apkPath
 * is the test build. The backup is the pristine delivery APK by construction,
 * so a stale one is restored and removed before the fresh copy is taken.
 * Refusing to overwrite it instead broke every later device run for that
 * project until the file was deleted by hand.
 */
export function reclaimApkBackup(apkPath, backupPath) {
  if (!fs.existsSync(backupPath)) return null;
  const replacedExistingApk = fs.existsSync(apkPath);
  fs.copyFileSync(backupPath, apkPath);
  fs.rmSync(backupPath, { force: true });
  return { restored_delivery_apk: true, replaced_existing_apk: replacedExistingApk };
}

/** Restores the delivery APK; tolerates a backup an outside process removed. */
export function restoreApkBackup(apkPath, backupPath) {
  if (!fs.existsSync(backupPath)) return false;
  fs.copyFileSync(backupPath, apkPath);
  fs.rmSync(backupPath, { force: true });
  return true;
}

export async function runAndroidDeviceGate({
  workspace, apkPath, packageName, flows, flutterExecutable, adbExecutable,
  run = defaultRun, acquireDevice = ensureBootedDevice,
  prepareDevice = prepareDeviceForTest, minimumFreeMb = 1536,
  reclaimBelowMb = DEFAULT_RECLAIM_BELOW_MB, resetSnapshot = resetAvdToSnapshot,
  saveSnapshot = saveAvdSnapshot, knownSnapshot = hasAvdSnapshot,
  detectTarget = detectDeviceTarget,
}) {
  const runDeviceCommand = (command, args) => run(command, args, {
    cwd: workspace,
    ...(command === adbExecutable
      ? { timeout: ADB_COMMAND_TIMEOUT_MS, timeoutLabel: 'ADB_TIMEOUT' } : {}),
  });
  const runAdb = args => runDeviceCommand(adbExecutable, args);
  const coverage = validateFlowCoverage(workspace, flows);
  const report = {
    version: 1, generated_at: new Date().toISOString(), status: 'FAIL',
    device: null, package_name: packageName, checks: { flow_coverage: coverage },
    // Every phase is timed. Without this the only way to ask where a device run
    // spends its minutes was to subtract event timestamps, which cannot separate
    // waiting for a boot from running the tests.
    durations_ms: {}, logs: {},
  };
  const timed = async (phase, action) => {
    const startedAt = Date.now();
    try {
      return await action();
    } finally {
      report.durations_ms[phase] = Date.now() - startedAt;
    }
  };
  if (!packageName) return { ...report, reason: 'PROJECT_SPEC package_name alanı eksik.' };
  if (!flutterExecutable) return { ...report, reason: 'Flutter executable bulunamadı.' };
  if (!adbExecutable) return { ...report, status: 'WAITING', reason: 'ADB bulunamadı.' };
  // Starts an emulator when none is connected and waits for boot completion.
  const acquired = await timed('device_acquire', () => acquireDevice({
    run: runDeviceCommand,
    adb: adbExecutable,
    flutter: flutterExecutable,
  }));
  report.logs.adb_devices = (acquired.log || []).join('\n');
  if (!acquired.device) {
    return {
      ...report,
      status: 'WAITING',
      reason: acquired.reason || 'Bağlı ve hazır Android cihaz/emülatör bulunamadı.',
    };
  }
  const device = { id: acquired.device };
  report.device = device.id;
  // Which supported Android runtime the product was actually validated against.
  // Naming it keeps the report honest and decides which target-specific
  // operations — an AVD wipe today — are allowed to run at all.
  const target = await detectTarget({ run: runDeviceCommand, adb: adbExecutable, device: device.id });
  report.target = target;
  report.logs.device_target = describeDeviceTarget(target);
  /** Same measurement the storage gate uses, re-read after cleanup. */
  const measureFreeMb = async () => {
    const disk = await runAdb(['-s', device.id, 'shell', 'df', '-k', '/data']);
    const availableKb = parseAvailableDataKb(disk.stdout);
    return availableKb === null ? null : Math.floor(availableKb / 1024);
  };
  /**
   * Runs the post-test cleanup and records it in `housekeeping`. The product
   * verdict is already decided at this point, so a failure here becomes a
   * warning note instead of downgrading the result. It stays fully visible: a
   * host whose emulator can no longer be reset is a real problem, just not a
   * defect of the generated application.
   *
   * Cleanup removes what this gate put on the device and then decides whether
   * the device needs reclaiming at all. It used to reset unconditionally, which
   * across a measured run reclaimed nothing three times over and paid a 48
   * second emulator boot each time. The full wipe is no longer done here: it is
   * the run's last act, so no gate waits for a boot it did not need.
   */
  const finish = async result => {
    const startedAt = Date.now();
    const removed = await runAdb(['-s', device.id, 'uninstall', packageName]);
    result.logs.app_cleanup = outputOf(removed);
    const absent = isPackageAbsent(outputOf(removed));
    const cleanup = {
      status: removed.status === 0 || absent ? 'PASS' : 'FAIL',
      exit_code: removed.status,
      details: removed.status === 0 ? 'Hedef paket cihazdan kaldırıldı.'
        : absent ? 'Hedef paket cihazda zaten yoktu.'
          : outputOf(removed) || 'Hedef uygulama kaldırılamadı.',
    };
    const artifacts = await runAdb(['-s', device.id, 'shell', 'rm', '-f', ...DEVICE_ARTIFACTS]);
    const freeMb = await measureFreeMb();
    const reclaim = shouldReclaimStorage(freeMb, reclaimBelowMb);
    const reset = reclaim
      ? await resetSnapshot({ run: runDeviceCommand, adb: adbExecutable, device: device.id, target })
      : {
        status: 'SKIPPED', mode: 'none',
        details: `${freeMb} MB boş, eşik ${reclaimBelowMb} MB; sıfırlamaya gerek yok.`, log: '',
      };
    result.logs.avd_reset = [outputOf(artifacts), reset.log || reset.details]
      .filter(Boolean).join('\n');
    result.housekeeping = {
      app_cleanup: cleanup,
      device_artifacts: {
        status: artifacts.status === 0 ? 'PASS' : 'FAIL', exit_code: artifacts.status,
        paths: [...DEVICE_ARTIFACTS],
        details: artifacts.status === 0 ? 'Cihazdaki ekran görüntüsü ve UI dökümü silindi.'
          : outputOf(artifacts) || 'Cihaz artefaktları silinemedi.',
      },
      avd_reset: {
        status: reset.status, mode: reset.mode ?? 'none',
        target_type: reset.target_type ?? target.type,
        free_mb: freeMb, reclaim_below_mb: reclaimBelowMb,
        snapshot: reset.snapshot ?? null,
        details: reset.details || 'Test sonrası cihaz sıfırlaması tamamlanamadı.',
      },
    };
    // A device that could not be reclaimed must be wiped before anyone uses it
    // again, and that is the run's problem, not this gate's verdict.
    result.needs_full_wipe = reclaim && reset.status !== 'PASS' && reset.status !== 'SKIPPED';
    // Not just FAIL: a reset that could not run at all ("no snapshot, wipe
    // needed") is a housekeeping problem the run should surface too.
    const warnings = DEVICE_HOUSEKEEPING_ORDER
      .filter(name => !['PASS', 'SKIPPED'].includes(result.housekeeping[name]?.status))
      .map(name => `${DEVICE_CHECK_LABELS[name]}: ${result.housekeeping[name].details}`);
    if (warnings.length) result.notes = [...(result.notes || []), ...warnings];
    result.durations_ms = { ...(result.durations_ms || {}), housekeeping: Date.now() - startedAt };
    return result;
  };
  if (coverage.status !== 'PASS') return finish(productFailure(report));

  const prepared = await timed('storage_prepare', () => prepareDevice({
    run: runDeviceCommand,
    adb: adbExecutable, device: device.id, packageName, minimumFreeMb,
  }));
  report.logs.device_storage = prepared.log || prepared.details || prepared.reason || '';
  report.checks.device_storage = {
    status: prepared.status, free_mb: prepared.free_mb,
    required_mb: prepared.required_mb, details: prepared.details || prepared.reason,
  };
  if (prepared.status !== 'PASS') {
    return finish({
      ...report, status: 'WAITING', failure_kind: 'environment',
      reason: prepared.reason || 'AVD test hazırlığı tamamlanamadı.',
    });
  }

  // The reset point is recorded from the state the gate just verified: target
  // package absent and free space above the minimum. Restoring it later takes 3
  // seconds against 48 for a wipe-and-boot, so the one-off 31 second save pays
  // for itself on the very next gate of the same run.
  if (String(device.id).startsWith('emulator-') && target.supports_avd_wipe) {
    const known = await timed('snapshot_record', async () => {
      const listed = await knownSnapshot({ run: runDeviceCommand, adb: adbExecutable, device: device.id });
      if (!listed.ok || listed.present) return listed;
      return saveSnapshot({ run: runDeviceCommand, adb: adbExecutable, device: device.id });
    });
    report.snapshot = {
      name: STUDIO_CLEAN_SNAPSHOT,
      status: known.ok === false ? 'UNAVAILABLE' : 'PASS',
      recorded: Boolean(known.ok) && !known.present,
    };
    report.logs.avd_snapshot = known.output || '';
  }

  const integrationTests = coverage.integration_tests;
  const suitePath = `integration_test/studio_suite_${crypto.randomUUID().replaceAll('-', '')}.dart`;
  const savedApk = `${apkPath}.studio-backup`;
  const reclaimed = reclaimApkBackup(apkPath, savedApk);
  if (reclaimed) {
    report.notes = [...(report.notes || []),
      'Önceki cihaz koşusundan kalan teslim APK yedeği geri yüklendi.'];
    report.recovered_apk_backup = reclaimed;
  }
  const hasApk = fs.existsSync(apkPath);
  if (hasApk) fs.copyFileSync(apkPath, savedApk, fs.constants.COPYFILE_EXCL);
  let integration;
  try {
    fs.writeFileSync(path.join(workspace, suitePath), renderDeviceSuite(integrationTests), { flag: 'wx' });
    integration = await timed('integration_test', () => run(
      flutterExecutable, ['test', suitePath, '-d', device.id, '--reporter', 'json', '--timeout', '120s'],
      { cwd: workspace, timeout: 180_000 + integrationTests.length * 120_000 },
    ));
  } finally {
    fs.rmSync(path.join(workspace, suitePath), { force: true });
    restoreApkBackup(apkPath, savedApk);
  }
  const results = parseDeviceSuite(outputOf(integration), integrationTests);
  const passed = integration.status === 0 && !results.failed_file;
  report.logs.integration_test = outputOf(integration);
  report.checks.integration_test = {
    status: passed ? 'PASS' : 'FAIL', exit_code: integration.status,
    ...results, timed_out: Boolean(integration.timedOut), mode: 'single_suite',
    details: passed ? `${results.completed_files.length} dosya tek test kurulumunda geçti.`
      : `Toplu cihaz testi tamamlanamadı: ${results.failed_file || 'test süreci'}.`,
  };
  if (!passed) {
    return finish(environmentWait(report, 'integration_test', report.logs.integration_test)
      ?? productFailure(report));
  }

  await runAdb(['-s', device.id, 'logcat', '-c']);
  const install = await timed('apk_install', () => runAdb(['-s', device.id, 'install', '-r', '-t', apkPath]));
  report.logs.apk_install = outputOf(install);
  report.checks.apk_install = { status: install.status === 0 ? 'PASS' : 'FAIL', exit_code: install.status };
  if (install.status !== 0) {
    return finish(environmentWait(report, 'apk_install', report.logs.apk_install) ?? productFailure(report));
  }
  const { launch, pid, logcat } = await timed('launch', async () => {
    await runAdb(['-s', device.id, 'shell', 'am', 'force-stop', packageName]);
    const started = await runAdb(['-s', device.id, 'shell', 'monkey', '-p', packageName,
      '-c', 'android.intent.category.LAUNCHER', '1']);
    await runAdb(['-s', device.id, 'shell', 'sleep', '2']);
    return {
      launch: started,
      pid: await runAdb(['-s', device.id, 'shell', 'pidof', packageName]),
      logcat: await runAdb(['-s', device.id, 'logcat', '-d', '-t', '800']),
    };
  });
  report.logs.launch = outputOf(launch);
  report.logs.logcat = outputOf(logcat);
  const fatal = /FATAL EXCEPTION|E\/flutter|Unhandled Exception/i.test(report.logs.logcat);
  report.checks.launch = {
    status: launch.status === 0 && pid.status === 0 && String(pid.stdout).trim() && !fatal ? 'PASS' : 'FAIL',
    process_id: String(pid.stdout || '').trim() || null, fatal_log: fatal,
  };

  const [remoteScreenshot, remoteUi] = DEVICE_ARTIFACTS;
  await runAdb(['-s', device.id, 'shell', 'screencap', '-p', remoteScreenshot]);
  await runAdb(['-s', device.id, 'shell', 'uiautomator', 'dump', remoteUi]);
  const logDir = path.join(workspace, 'QUALITY_LOGS');
  fs.mkdirSync(logDir, { recursive: true });
  await runAdb(['-s', device.id, 'pull', remoteScreenshot, path.join(logDir, 'DEVICE_SCREEN.png')]);
  await runAdb(['-s', device.id, 'pull', remoteUi, path.join(logDir, 'DEVICE_UI.xml')]);
  report.status = Object.values(report.checks).every(check => check.status === 'PASS') ? 'PASS' : 'FAIL';
  if (report.status !== 'PASS') {
    return finish(environmentWait(report, 'launch', `${report.logs.launch}\n${report.logs.logcat}`)
      ?? productFailure(report));
  }
  return finish(report);
}

/**
 * The run's last act, and the only place a full AVD wipe still happens.
 *
 * A snapshot restore returns the guest to a clean state in 3 seconds but cannot
 * shrink the host image: `userdata-qemu.img.qcow2` grows with every written
 * block and never gives the space back when files are deleted inside the guest.
 * That is what a wipe reclaims, and it costs a 48 second boot paid by whoever
 * needs the device next — so it runs once, after the run has finished, instead
 * of after every gate, where it used to reclaim nothing three times over.
 *
 * Best effort by contract: it never launches an emulator, never throws and
 * never touches a project's verdict. A host with no device attached simply has
 * nothing to reclaim.
 */
export async function reclaimDeviceStorage({
  workspace, adbExecutable, run = defaultRun, reclaimBelowMb = DEFAULT_RECLAIM_BELOW_MB,
  force = false, wipeDevice = wipeAvdAfterTest, detectTarget = detectDeviceTarget,
} = {}) {
  const adb = adbExecutable || await resolveAdb();
  if (!adb) return { status: 'SKIPPED', details: 'ADB bulunamadı; sıfırlanacak bir şey yok.' };
  // Two shapes on purpose: helpers like detectTarget and wipeDevice are given
  // the (command, args) runner they expect, while runAdb is the local shorthand.
  const runCommand = (command, args) => run(command, args, {
    cwd: workspace,
    ...(command === adb ? { timeout: ADB_COMMAND_TIMEOUT_MS, timeoutLabel: 'ADB_TIMEOUT' } : {}),
  });
  const runAdb = args => runCommand(adb, args);
  const listed = await runAdb(['devices', '-l']);
  const device = parseAdbDevices(listed.stdout).find(item => item.state === 'device');
  if (!device) return { status: 'SKIPPED', details: 'Bağlı cihaz yok; sıfırlanacak bir şey yok.' };
  const target = await detectTarget({ run: runCommand, adb, device: device.id });
  if (!target.supports_avd_wipe) {
    return {
      status: 'SKIPPED', device: device.id, target_type: target.type,
      details: `${describeDeviceTarget(target)} için wipe uygulanmaz.`,
    };
  }
  const disk = await runAdb(['-s', device.id, 'shell', 'df', '-k', '/data']);
  const availableKb = parseAvailableDataKb(disk.stdout);
  const freeMb = availableKb === null ? null : Math.floor(availableKb / 1024);
  if (!force && !shouldReclaimStorage(freeMb, reclaimBelowMb)) {
    return {
      status: 'SKIPPED', device: device.id, target_type: target.type, free_mb: freeMb,
      reclaim_below_mb: reclaimBelowMb,
      details: `${freeMb} MB boş, eşik ${reclaimBelowMb} MB; wipe gerekmiyor.`,
    };
  }
  const wiped = await wipeDevice({ run: runCommand, adb, device: device.id, workspace, target });
  return {
    status: wiped.status, device: device.id, target_type: wiped.target_type ?? target.type,
    free_mb: freeMb, reclaim_below_mb: reclaimBelowMb, forced: Boolean(force),
    avd_name: wiped.avd_name ?? null,
    details: wiped.details || 'AVD wipe tamamlanamadı.',
  };
}

export function writeDeviceReport(workspace, report) {
  const logDir = path.join(workspace, 'QUALITY_LOGS');
  fs.mkdirSync(logDir, { recursive: true });
  for (const [name, value] of Object.entries(report.logs || {})) {
    fs.writeFileSync(path.join(logDir, `DEVICE_${name.toUpperCase()}.log`), `${value || '(çıktı yok)'}\n`, 'utf8');
  }
  fs.writeFileSync(path.join(workspace, 'DEVICE_REPORT.json'), `${JSON.stringify({ ...report, logs: undefined }, null, 2)}\n`, 'utf8');
  return report;
}
