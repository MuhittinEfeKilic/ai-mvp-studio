import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  adbCandidates, classifyDeviceFailure, describeDeviceFailure, isRepairableDeviceFailure,
  parseAdbDevices,
  runAndroidDeviceGate,
  validateFlowCoverage,
} from '../src/device-tester.mjs';

const successfulWipe = async () => ({ status: 'PASS', avd_name: 'Test_AVD', details: 'temizlendi' });

test('ADB candidates prefer explicit configuration and never include LDPlayer', () => {
  const candidates = adbCandidates({ ADB_BIN: 'D:\\tools\\adb.exe', LOCALAPPDATA: 'C:\\Local' }, 'win32');
  assert.equal(candidates[0], 'D:\\tools\\adb.exe');
  assert.ok(candidates.includes('C:\\Local\\Android\\Sdk\\platform-tools\\adb.exe'));
  assert.ok(!candidates.some(candidate => /LDPlayer/i.test(candidate)));
});

test('ADB device output excludes offline devices from ready selection', () => {
  assert.deepEqual(parseAdbDevices('List of devices attached\nemulator-5554 device product:x\nabc offline\n'), [
    { id: 'emulator-5554', state: 'device' }, { id: 'abc', state: 'offline' },
  ]);
});

test('critical flow coverage requires one integration test file per flow', () => {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'flow-coverage-'));
  fs.mkdirSync(path.join(workspace, 'integration_test'));
  fs.writeFileSync(path.join(workspace, 'integration_test', 'create_test.dart'), 'void main() {}');
  assert.equal(validateFlowCoverage(workspace, [{}, {}]).status, 'FAIL');
  fs.writeFileSync(path.join(workspace, 'integration_test', 'validation_test.dart'), 'void main() {}');
  assert.equal(validateFlowCoverage(workspace, [{}, {}]).status, 'PASS');
});

test('device gate waits without failing when no emulator is connected', async () => {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'device-wait-'));
  const report = await runAndroidDeviceGate({
    workspace, apkPath: 'app.apk', packageName: 'com.example.app', flows: [{}],
    flutterExecutable: 'flutter', adbExecutable: 'adb',
    run: (_command, args) => args[0] === 'devices'
      ? { status: 0, stdout: 'List of devices attached\n' }
      : { status: 0, stdout: '' },
  });
  assert.equal(report.status, 'WAITING');
  assert.match(report.reason, /başlatılabilecek emülatör bulunamadı/);
});

test('device gate runs integration, installs APK, launches app and rejects fatal logs', async () => {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'device-gate-'));
  fs.mkdirSync(path.join(workspace, 'integration_test'));
  fs.writeFileSync(path.join(workspace, 'integration_test', 'main_test.dart'), 'void main() {}');
  const run = (command, args) => {
    if (args[0] === 'devices') return { status: 0, stdout: 'List of devices attached\nemulator-5554 device\n' };
    if (args.includes('sys.boot_completed')) return { status: 0, stdout: '1\n' };
    if (args.includes('df')) return { status: 0, stdout: 'Filesystem 1K-blocks Used Available Use% Mounted on\n/data 8388608 1048576 7340032 13% /data\n' };
    if (args.includes('pidof')) return { status: 0, stdout: '1234\n' };
    if (args.includes('logcat') && args.includes('-d')) return { status: 0, stdout: 'Application started' };
    return { status: 0, stdout: command === 'flutter' ? 'All tests passed' : 'Success' };
  };
  const report = await runAndroidDeviceGate({
    workspace, apkPath: 'app.apk', packageName: 'com.example.app', flows: [{}],
    flutterExecutable: 'flutter', adbExecutable: 'adb', run, wipeDevice: successfulWipe,
  });
  assert.equal(report.status, 'PASS');
  assert.equal(report.checks.integration_test.status, 'PASS');
  assert.equal(report.checks.launch.process_id, '1234');
});

test('device gate runs integration files separately and reports the timed-out file', async () => {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'device-timeout-'));
  fs.mkdirSync(path.join(workspace, 'integration_test'));
  fs.writeFileSync(path.join(workspace, 'integration_test', 'a_test.dart'), 'void main() {}');
  fs.writeFileSync(path.join(workspace, 'integration_test', 'b_test.dart'), 'void main() {}');
  const flutterCalls = [];
  const report = await runAndroidDeviceGate({
    workspace, apkPath: 'app.apk', packageName: 'com.example.app', flows: [{}, {}],
    flutterExecutable: 'flutter', adbExecutable: 'adb', wipeDevice: successfulWipe,
    run: (command, args, options = {}) => {
      if (args[0] === 'devices') return { status: 0, stdout: 'List of devices attached\nemulator-5554 device\n' };
      if (args.includes('sys.boot_completed')) return { status: 0, stdout: '1\n' };
      if (args.includes('df')) return { status: 0, stdout: 'Filesystem 1K-blocks Used Available Use% Mounted on\n/data 8388608 1048576 7340032 13% /data\n' };
      if (command === 'flutter') {
        flutterCalls.push({ args, timeout: options.timeout });
        if (args.some(arg => arg.endsWith('b_test.dart'))) return { status: null, stdout: '', stderr: 'DEVICE_TEST_TIMEOUT', timedOut: true };
      }
      return { status: 0, stdout: 'Success', stderr: '' };
    },
  });
  assert.equal(report.status, 'WAITING');
  assert.equal(report.checks.integration_test.failed_file, 'integration_test/b_test.dart');
  assert.equal(report.checks.integration_test.timed_out, true);
  assert.equal(report.checks.integration_test.completed_files.length, 1);
  assert.deepEqual(flutterCalls.map(call => call.timeout), [180_000, 180_000]);
});

test('device failure description names the check that actually failed', () => {
  // Shape recorded for project b9c53b9a14bf: coverage passed, the device run did not.
  const message = describeDeviceFailure({
    status: 'FAIL',
    checks: {
      flow_coverage: { status: 'PASS', details: '4 kritik akış için 4 integration test dosyası bulundu.' },
      integration_test: { status: 'FAIL', exit_code: 1 },
    },
  });
  assert.match(message, /integration test/i);
  assert.match(message, /exit 1/);
  assert.match(message, /DEVICE_INTEGRATION_TEST\.log/);
  assert.doesNotMatch(message, /4 integration test dosyası bulundu/);
});

test('device failure description reports coverage, launch and early-exit reasons', () => {
  assert.match(
    describeDeviceFailure({ status: 'FAIL', checks: {
      flow_coverage: { status: 'FAIL', details: '3 kritik akış için 1 integration test dosyası bulundu.' },
    } }),
    /Kritik akış kapsamı: FAIL · 3 kritik akış için 1 integration test dosyası bulundu\./,
  );
  assert.match(
    describeDeviceFailure({ status: 'FAIL', checks: {
      flow_coverage: { status: 'PASS' }, integration_test: { status: 'PASS' },
      apk_install: { status: 'PASS' },
      launch: { status: 'FAIL', process_id: null, fatal_log: true },
    } }),
    /Uygulama açılışı: FAIL · logcat içinde fatal kayıt var · Log: .*DEVICE_LOGCAT\.log/,
  );
  assert.equal(
    describeDeviceFailure({ status: 'WAITING', reason: 'Bağlı ve hazır Android cihaz/emülatör bulunamadı.', checks: {} }),
    'Bağlı ve hazır Android cihaz/emülatör bulunamadı.',
  );
  assert.equal(describeDeviceFailure({ status: 'FAIL', checks: {} }), 'DEVICE_REPORT.json dosyasını inceleyin.');
});

test('device failures are classified as environment or product', () => {
  const realEmulatorCrash = [
    'Failed to load "integration_test/product_search_empty_test.dart":',
    ' No application found for TargetPlatform.android_x64.',
    'Error waiting for a debug connection: The log reader stopped unexpectedly',
    'adb.exe: device offline',
    'Some tests failed.',
  ].join('\n');
  assert.equal(classifyDeviceFailure(realEmulatorCrash).kind, 'environment');
  assert.match(classifyDeviceFailure(realEmulatorCrash).signal, /No application found for TargetPlatform/);

  const assertionFailure = [
    '00:03 +0 -1: stok akışı [E]',
    '  EXCEPTION CAUGHT BY FLUTTER TEST FRAMEWORK',
    '  Expected: exactly one matching candidate',
    '  Actual: _TextFinder:<zero widgets>',
    'adb.exe: device offline',
  ].join('\n');
  assert.equal(classifyDeviceFailure(assertionFailure).kind, 'product');

  // An unrecognised failure stays a product defect so nothing is silently parked.
  assert.deepEqual(classifyDeviceFailure('flutter: something unexpected'), { kind: 'product', signal: null });
});

test('device gate waits instead of failing when the emulator breaks mid-run', async () => {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'device-env-'));
  fs.mkdirSync(path.join(workspace, 'integration_test'));
  fs.writeFileSync(path.join(workspace, 'integration_test', 'main_test.dart'), 'void main() {}');
  const gate = integrationOutput => runAndroidDeviceGate({
    workspace, apkPath: 'app.apk', packageName: 'com.example.app', flows: [{}],
    flutterExecutable: 'flutter', adbExecutable: 'adb', wipeDevice: successfulWipe,
    run: (command, args) => {
      if (args[0] === 'devices') return { status: 0, stdout: 'List of devices attached\nemulator-5554 device\n' };
      if (args.includes('sys.boot_completed')) return { status: 0, stdout: '1\n' };
      if (args.includes('df')) return { status: 0, stdout: 'Filesystem 1K-blocks Used Available Use% Mounted on\n/data 8388608 1048576 7340032 13% /data\n' };
      if (command === 'flutter') return { status: 1, stdout: integrationOutput };
      return { status: 0, stdout: '' };
    },
  });

  const broken = await gate('Unable to start the app on the device\nadb.exe: device offline');
  assert.equal(broken.status, 'WAITING');
  assert.equal(broken.failure_kind, 'environment');
  assert.match(broken.reason, /Cihazda integration test cihaz\/ortam arızası/);

  const defective = await gate('EXCEPTION CAUGHT BY FLUTTER TEST FRAMEWORK\nExpected: <1>');
  assert.equal(defective.status, 'FAIL');
  assert.equal(defective.failure_kind, 'product');
});

test('a missing critical-flow contract is not worth a repair round', () => {
  const missingContract = {
    status: 'FAIL',
    checks: { flow_coverage: {
      status: 'FAIL', required_flows: 0,
      details: 'USER_FLOWS.json içinde kritik akış bulunamadı.',
    } },
  };
  assert.equal(isRepairableDeviceFailure(missingContract), false);

  // Missing tests for known flows are exactly what a repair agent can write.
  assert.equal(isRepairableDeviceFailure({
    status: 'FAIL',
    checks: { flow_coverage: { status: 'FAIL', required_flows: 3, integration_tests: [] } },
  }), true);
  assert.equal(isRepairableDeviceFailure({
    status: 'FAIL',
    checks: { flow_coverage: { status: 'PASS' }, integration_test: { status: 'FAIL' } },
  }), true);
});
