import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

import {
  ensureBootedDevice, parseAdbDevices, prepareDeviceForTest, wipeAvdAfterTest,
} from './android-environment.mjs';

export { parseAdbDevices };

const normalizePath = value => String(value || '').replaceAll('\\', '/');

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
  /DEVICE_TEST_TIMEOUT/i,
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

const DEVICE_CHECK_ORDER = ['flow_coverage', 'device_storage', 'integration_test', 'apk_install', 'launch', 'avd_wipe'];

const DEVICE_CHECK_LABELS = Object.freeze({
  flow_coverage: 'Kritik akış kapsamı',
  device_storage: 'AVD depolama hazırlığı',
  integration_test: 'Cihazda integration test',
  apk_install: 'APK kurulumu',
  launch: 'Uygulama açılışı',
  avd_wipe: 'Test sonrası AVD temizliği',
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
  return new Promise(resolve => {
    let child;
    let settled = false;
    const timeoutMs = Number(options.timeout) || 600_000;
    const spawnOptions = { ...options };
    delete spawnOptions.timeout;
    try {
      child = spawn(invocation.command, invocation.args, {
        windowsHide: true, ...spawnOptions,
      });
    } catch (error) {
      resolve({ status: null, stdout: '', stderr: '', error });
      return;
    }
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', chunk => { stdout += chunk; });
    child.stderr.on('data', chunk => { stderr += chunk; });
    const finish = result => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(result);
    };
    child.once('error', error => finish({ status: null, stdout, stderr, error }));
    child.once('close', status => finish({ status, stdout, stderr }));
    const timer = setTimeout(() => {
      const timeoutMessage = `DEVICE_TEST_TIMEOUT: süreç ${Math.round(timeoutMs / 1000)} saniyede tamamlanmadı.`;
      if (process.platform === 'win32' && child.pid) {
        const killer = spawn('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], {
          windowsHide: true, stdio: 'ignore',
        });
        killer.once('close', () => finish({
          status: null, stdout, stderr: [stderr, timeoutMessage].filter(Boolean).join('\n'), timedOut: true,
        }));
        killer.once('error', error => {
          child.kill('SIGKILL');
          finish({ status: null, stdout, stderr: [stderr, timeoutMessage].filter(Boolean).join('\n'), timedOut: true, error });
        });
      } else {
        child.kill('SIGKILL');
        finish({ status: null, stdout, stderr: [stderr, timeoutMessage].filter(Boolean).join('\n'), timedOut: true });
      }
    }, timeoutMs);
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

export async function runAndroidDeviceGate({
  workspace, apkPath, packageName, flows, flutterExecutable, adbExecutable,
  run = defaultRun, acquireDevice = ensureBootedDevice,
  prepareDevice = prepareDeviceForTest, minimumFreeMb = 1536,
  wipeDevice = wipeAvdAfterTest,
}) {
  const coverage = validateFlowCoverage(workspace, flows);
  const report = {
    version: 1, generated_at: new Date().toISOString(), status: 'FAIL',
    device: null, package_name: packageName, checks: { flow_coverage: coverage }, logs: {},
  };
  if (!packageName) return { ...report, reason: 'PROJECT_SPEC package_name alanı eksik.' };
  if (!flutterExecutable) return { ...report, reason: 'Flutter executable bulunamadı.' };
  if (!adbExecutable) return { ...report, status: 'WAITING', reason: 'ADB bulunamadı.' };
  // Starts an emulator when none is connected and waits for boot completion.
  const acquired = await acquireDevice({
    run: (command, args) => run(command, args, { cwd: workspace }),
    adb: adbExecutable,
    flutter: flutterExecutable,
  });
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
  const finish = async result => {
    const wiped = await wipeDevice({
      run: (command, args) => run(command, args, { cwd: workspace }),
      adb: adbExecutable, device: device.id, workspace,
    });
    result.logs.avd_wipe = wiped.log || wiped.details || '';
    result.checks.avd_wipe = { status: wiped.status, avd_name: wiped.avd_name, details: wiped.details };
    if (wiped.status === 'FAIL' && result.status === 'PASS') {
      return {
        ...result, status: 'WAITING', failure_kind: 'environment',
        reason: wiped.details || 'Test sonrası AVD temizliği tamamlanamadı.',
      };
    }
    return result;
  };
  if (coverage.status !== 'PASS') return finish(productFailure(report));

  const prepared = await prepareDevice({
    run: (command, args) => run(command, args, { cwd: workspace }),
    adb: adbExecutable, device: device.id, packageName, minimumFreeMb,
  });
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

  const integrationTests = coverage.integration_tests;
  const integrationLogs = [];
  const completedFiles = [];
  let integration = { status: 0, stdout: '', stderr: '' };
  let failedFile = null;
  for (const testFile of integrationTests) {
    integration = await run(
      flutterExecutable, ['test', testFile, '-d', device.id],
      { cwd: workspace, timeout: 180_000 },
    );
    integrationLogs.push(`===== ${testFile} =====\n${outputOf(integration) || '(çıktı yok)'}`);
    if (integration.status !== 0) {
      failedFile = testFile;
      break;
    }
    completedFiles.push(testFile);
  }
  report.logs.integration_test = integrationLogs.join('\n\n');
  report.checks.integration_test = {
    status: integration.status === 0 ? 'PASS' : 'FAIL', exit_code: integration.status,
    completed_files: completedFiles, failed_file: failedFile, timed_out: Boolean(integration.timedOut),
    details: failedFile
      ? `${failedFile} cihaz testi${integration.timedOut ? ' 180 saniyede zaman aşımına uğradı' : ' başarısız oldu'}.`
      : `${completedFiles.length} cihaz testi dosyası ayrı süreçlerde geçti.`,
  };
  if (integration.status !== 0) {
    return finish(environmentWait(report, 'integration_test', report.logs.integration_test)
      ?? productFailure(report));
  }

  await run(adbExecutable, ['-s', device.id, 'logcat', '-c'], { cwd: workspace });
  const install = await run(adbExecutable, ['-s', device.id, 'install', '-r', '-t', apkPath], { cwd: workspace });
  report.logs.apk_install = outputOf(install);
  report.checks.apk_install = { status: install.status === 0 ? 'PASS' : 'FAIL', exit_code: install.status };
  if (install.status !== 0) {
    return finish(environmentWait(report, 'apk_install', report.logs.apk_install) ?? productFailure(report));
  }
  await run(adbExecutable, ['-s', device.id, 'shell', 'am', 'force-stop', packageName], { cwd: workspace });
  const launch = await run(adbExecutable, ['-s', device.id, 'shell', 'monkey', '-p', packageName,
    '-c', 'android.intent.category.LAUNCHER', '1'], { cwd: workspace });
  await run(adbExecutable, ['-s', device.id, 'shell', 'sleep', '2'], { cwd: workspace });
  const pid = await run(adbExecutable, ['-s', device.id, 'shell', 'pidof', packageName], { cwd: workspace });
  const logcat = await run(adbExecutable, ['-s', device.id, 'logcat', '-d', '-t', '800'], { cwd: workspace });
  report.logs.launch = outputOf(launch);
  report.logs.logcat = outputOf(logcat);
  const fatal = /FATAL EXCEPTION|E\/flutter|Unhandled Exception/i.test(report.logs.logcat);
  report.checks.launch = {
    status: launch.status === 0 && pid.status === 0 && String(pid.stdout).trim() && !fatal ? 'PASS' : 'FAIL',
    process_id: String(pid.stdout || '').trim() || null, fatal_log: fatal,
  };

  const remoteScreenshot = '/sdcard/ai_mvp_device_smoke.png';
  const remoteUi = '/sdcard/ai_mvp_device_ui.xml';
  await run(adbExecutable, ['-s', device.id, 'shell', 'screencap', '-p', remoteScreenshot], { cwd: workspace });
  await run(adbExecutable, ['-s', device.id, 'shell', 'uiautomator', 'dump', remoteUi], { cwd: workspace });
  const logDir = path.join(workspace, 'QUALITY_LOGS');
  fs.mkdirSync(logDir, { recursive: true });
  await run(adbExecutable, ['-s', device.id, 'pull', remoteScreenshot, path.join(logDir, 'DEVICE_SCREEN.png')], { cwd: workspace });
  await run(adbExecutable, ['-s', device.id, 'pull', remoteUi, path.join(logDir, 'DEVICE_UI.xml')], { cwd: workspace });
  report.status = Object.values(report.checks).every(check => check.status === 'PASS') ? 'PASS' : 'FAIL';
  if (report.status !== 'PASS') {
    return finish(environmentWait(report, 'launch', `${report.logs.launch}\n${report.logs.logcat}`)
      ?? productFailure(report));
  }
  return finish(report);
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
