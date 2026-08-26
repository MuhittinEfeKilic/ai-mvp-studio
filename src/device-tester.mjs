import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const normalizePath = value => String(value || '').replaceAll('\\', '/');

export function adbCandidates(env = process.env, platform = process.platform) {
  const values = [env.ADB_BIN];
  if (platform === 'win32') {
    if (env.LOCALAPPDATA) values.push(path.join(env.LOCALAPPDATA, 'Android', 'Sdk', 'platform-tools', 'adb.exe'));
    values.push('C:\\LDPlayer\\LDPlayer9\\adb.exe');
  }
  values.push('adb');
  return [...new Set(values.filter(Boolean))];
}

export function parseAdbDevices(output) {
  return String(output || '').split(/\r?\n/).slice(1).map(line => line.trim())
    .filter(Boolean).map(line => {
      const [id, state] = line.split(/\s+/, 2);
      return { id, state };
    });
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

function defaultRun(command, args, options = {}) {
  const invocation = process.platform === 'win32' && /\.(?:bat|cmd)$/i.test(command)
    ? { command: process.env.ComSpec || 'cmd.exe', args: ['/d', '/s', '/c', command, ...args] }
    : { command, args };
  return spawnSync(invocation.command, invocation.args, {
    encoding: 'utf8', windowsHide: true, timeout: 600_000, ...options,
  });
}

const outputOf = result => [result.stdout, result.stderr, result.error?.message]
  .filter(Boolean).join('\n').trim();

export function resolveAdb({ env = process.env, platform = process.platform, run = defaultRun } = {}) {
  for (const candidate of adbCandidates(env, platform)) {
    const result = run(candidate, ['version']);
    if (result.status === 0) return candidate;
  }
  return null;
}

export function runAndroidDeviceGate({
  workspace, apkPath, packageName, flows, flutterExecutable, adbExecutable,
  run = defaultRun,
}) {
  const coverage = validateFlowCoverage(workspace, flows);
  const report = {
    version: 1, generated_at: new Date().toISOString(), status: 'FAIL',
    device: null, package_name: packageName, checks: { flow_coverage: coverage }, logs: {},
  };
  if (!packageName) return { ...report, reason: 'PROJECT_SPEC package_name alanı eksik.' };
  if (!flutterExecutable) return { ...report, reason: 'Flutter executable bulunamadı.' };
  if (!adbExecutable) return { ...report, status: 'WAITING', reason: 'ADB bulunamadı.' };
  const listed = run(adbExecutable, ['devices', '-l'], { cwd: workspace });
  report.logs.adb_devices = outputOf(listed);
  const device = parseAdbDevices(listed.stdout).find(item => item.state === 'device');
  if (!device) return { ...report, status: 'WAITING', reason: 'Bağlı ve hazır Android cihaz/emülatör bulunamadı.' };
  report.device = device.id;
  if (coverage.status !== 'PASS') return report;

  const integration = run(flutterExecutable, ['test', 'integration_test', '-d', device.id], { cwd: workspace });
  report.logs.integration_test = outputOf(integration);
  report.checks.integration_test = {
    status: integration.status === 0 ? 'PASS' : 'FAIL', exit_code: integration.status,
  };
  if (integration.status !== 0) return report;

  run(adbExecutable, ['-s', device.id, 'logcat', '-c'], { cwd: workspace });
  const install = run(adbExecutable, ['-s', device.id, 'install', '-r', '-t', apkPath], { cwd: workspace });
  report.logs.apk_install = outputOf(install);
  report.checks.apk_install = { status: install.status === 0 ? 'PASS' : 'FAIL', exit_code: install.status };
  if (install.status !== 0) return report;
  run(adbExecutable, ['-s', device.id, 'shell', 'am', 'force-stop', packageName], { cwd: workspace });
  const launch = run(adbExecutable, ['-s', device.id, 'shell', 'monkey', '-p', packageName,
    '-c', 'android.intent.category.LAUNCHER', '1'], { cwd: workspace });
  run(adbExecutable, ['-s', device.id, 'shell', 'sleep', '2'], { cwd: workspace });
  const pid = run(adbExecutable, ['-s', device.id, 'shell', 'pidof', packageName], { cwd: workspace });
  const logcat = run(adbExecutable, ['-s', device.id, 'logcat', '-d', '-t', '800'], { cwd: workspace });
  report.logs.launch = outputOf(launch);
  report.logs.logcat = outputOf(logcat);
  const fatal = /FATAL EXCEPTION|E\/flutter|Unhandled Exception/i.test(report.logs.logcat);
  report.checks.launch = {
    status: launch.status === 0 && pid.status === 0 && String(pid.stdout).trim() && !fatal ? 'PASS' : 'FAIL',
    process_id: String(pid.stdout || '').trim() || null, fatal_log: fatal,
  };

  const remoteScreenshot = '/sdcard/ai_mvp_device_smoke.png';
  const remoteUi = '/sdcard/ai_mvp_device_ui.xml';
  run(adbExecutable, ['-s', device.id, 'shell', 'screencap', '-p', remoteScreenshot], { cwd: workspace });
  run(adbExecutable, ['-s', device.id, 'shell', 'uiautomator', 'dump', remoteUi], { cwd: workspace });
  const logDir = path.join(workspace, 'QUALITY_LOGS');
  fs.mkdirSync(logDir, { recursive: true });
  run(adbExecutable, ['-s', device.id, 'pull', remoteScreenshot, path.join(logDir, 'DEVICE_SCREEN.png')], { cwd: workspace });
  run(adbExecutable, ['-s', device.id, 'pull', remoteUi, path.join(logDir, 'DEVICE_UI.xml')], { cwd: workspace });
  report.status = Object.values(report.checks).every(check => check.status === 'PASS') ? 'PASS' : 'FAIL';
  return report;
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
