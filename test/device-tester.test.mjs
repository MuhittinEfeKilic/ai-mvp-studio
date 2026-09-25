import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  ADB_COMMAND_TIMEOUT_MS, adbCandidates, classifyDeviceFailure, describeDeviceFailure, isRepairableDeviceFailure,
  parseAdbDevices,
  parseDeviceSuite, renderDeviceSuite,
  runAndroidDeviceGate,
  validateFlowCoverage,
  isPackageAbsent, reclaimDeviceStorage, shouldReclaimStorage,
} from '../src/device-tester.mjs';
import { resetAvdToSnapshot } from '../src/android-environment.mjs';

// The gate no longer wipes: it restores a recorded snapshot, and only when the
// measured free space says the device needs reclaiming at all.
const snapshotStubs = {
  knownSnapshot: async () => ({ ok: true, present: true, output: 'studio_clean' }),
  saveSnapshot: async () => ({ ok: true, output: 'OK' }),
  resetSnapshot: async () => ({
    status: 'PASS', mode: 'snapshot', snapshot: 'studio_clean',
    details: 'Cihaz studio_clean anlık görüntüsünden yerinde sıfırlandı.', log: '',
  }),
};
// 2048 MB: above the gate's 1536 MB minimum, below the 3072 MB reclaim
// threshold, so the post-test reset actually runs.
const LOW_SPACE_DF = 'Filesystem 1K-blocks Used Available Use% Mounted on\n/data 8388608 6291456 2097152 75% /data\n';
const events = (file, id = 1, result = 'success') => [
  JSON.stringify({ type: 'testStart', test: { id, name: `${file} scenario` } }),
  JSON.stringify({ type: 'testDone', testID: id, result, skipped: false }),
].join('\n');

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
  const adbOptions = [];
  const calls = [];
  const apk = path.join(workspace, 'app.apk');
  fs.writeFileSync(apk, 'delivery');
  const run = (command, args, options = {}) => {
    calls.push({ command, args });
    if (command === 'flutter') fs.writeFileSync(apk, 'test-apk');
    if (args.includes('install')) assert.equal(fs.readFileSync(apk, 'utf8'), 'delivery');
    if (command === 'adb') adbOptions.push(options);
    if (args[0] === 'devices') return { status: 0, stdout: 'List of devices attached\nemulator-5554 device\n' };
    if (args.includes('sys.boot_completed')) return { status: 0, stdout: '1\n' };
    if (args.includes('df')) return { status: 0, stdout: 'Filesystem 1K-blocks Used Available Use% Mounted on\n/data 8388608 1048576 7340032 13% /data\n' };
    if (args.includes('pidof')) return { status: 0, stdout: '1234\n' };
    if (args.includes('logcat') && args.includes('-d')) return { status: 0, stdout: 'Application started' };
    return { status: 0, stdout: command === 'flutter' ? events('integration_test/main_test.dart') : 'Success' };
  };
  const report = await runAndroidDeviceGate({
    workspace, apkPath: apk, packageName: 'com.example.app', flows: [{}],
    flutterExecutable: 'flutter', adbExecutable: 'adb', run, ...snapshotStubs,
  });
  assert.equal(report.status, 'PASS');
  assert.equal(report.checks.integration_test.status, 'PASS');
  assert.equal(report.checks.launch.process_id, '1234');
  assert.ok(adbOptions.length > 0);
  assert.ok(adbOptions.every(options => options.timeout === ADB_COMMAND_TIMEOUT_MS));
  assert.ok(adbOptions.every(options => options.timeoutLabel === 'ADB_TIMEOUT'));
  assert.equal(calls.filter(call => call.command === 'flutter').length, 1);
  const adbArgs = calls.filter(call => call.command === 'adb').map(call => call.args.join(' '));
  assert.ok(adbArgs.some(args => args.includes('uninstall com.example.app')), 'hedef paket kaldırılmadı');
  // Pulled to the host and then removed from the device instead of piling up.
  assert.ok(adbArgs.some(args => args.includes('rm -f /sdcard/ai_mvp_device_smoke.png')), 'cihaz artefaktları silinmedi');
  // 7168 MB free against a 3072 MB threshold: nothing to reclaim, so no reset.
  assert.equal(report.housekeeping.avd_reset.status, 'SKIPPED');
  assert.equal(report.housekeeping.avd_reset.free_mb, 7168);
  assert.ok(report.durations_ms.integration_test >= 0);
  assert.ok(report.durations_ms.housekeeping >= 0);
  assert.equal(fs.readFileSync(apk, 'utf8'), 'delivery');
  assert.equal(fs.existsSync(`${apk}.studio-backup`), false);
});

test('a hung adb install becomes an environment wait at the ADB timeout', async () => {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'device-adb-timeout-'));
  fs.mkdirSync(path.join(workspace, 'integration_test'));
  fs.writeFileSync(path.join(workspace, 'integration_test', 'main_test.dart'), 'void main() {}');
  const installCalls = [];
  const report = await runAndroidDeviceGate({
    workspace, apkPath: 'app.apk', packageName: 'com.example.app', flows: [{}],
    flutterExecutable: 'flutter', adbExecutable: 'adb', ...snapshotStubs,
    run: (command, args, options = {}) => {
      if (args[0] === 'devices') return { status: 0, stdout: 'List of devices attached\nemulator-5554 device\n' };
      if (args.includes('sys.boot_completed')) return { status: 0, stdout: '1\n' };
      if (args.includes('df')) return { status: 0, stdout: 'Filesystem 1K-blocks Used Available Use% Mounted on\n/data 8388608 1048576 7340032 13% /data\n' };
      if (command === 'flutter') return { status: 0, stdout: events('integration_test/main_test.dart') };
      if (args.includes('install')) {
        installCalls.push(options);
        return { status: null, stdout: '', stderr: 'ADB_TIMEOUT: süreç sınırı aştı', timedOut: true };
      }
      return { status: 0, stdout: 'Success', stderr: '' };
    },
  });
  assert.equal(report.status, 'WAITING');
  assert.equal(report.failure_kind, 'environment');
  assert.equal(report.checks.apk_install.status, 'FAIL');
  assert.equal(installCalls.length, 1);
  assert.equal(installCalls[0].timeout, ADB_COMMAND_TIMEOUT_MS);
  assert.equal(installCalls[0].timeoutLabel, 'ADB_TIMEOUT');
});

test('device gate uses one suite and reports partial progress on timeout', async () => {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'device-timeout-'));
  fs.mkdirSync(path.join(workspace, 'integration_test'));
  fs.writeFileSync(path.join(workspace, 'integration_test', 'a_test.dart'), 'void main() {}');
  fs.writeFileSync(path.join(workspace, 'integration_test', 'b_test.dart'), 'void main() {}');
  const flutterCalls = [];
  const report = await runAndroidDeviceGate({
    workspace, apkPath: 'app.apk', packageName: 'com.example.app', flows: [{}, {}],
    flutterExecutable: 'flutter', adbExecutable: 'adb', ...snapshotStubs,
    run: (command, args, options = {}) => {
      if (args[0] === 'devices') return { status: 0, stdout: 'List of devices attached\nemulator-5554 device\n' };
      if (args.includes('sys.boot_completed')) return { status: 0, stdout: '1\n' };
      if (args.includes('df')) return { status: 0, stdout: 'Filesystem 1K-blocks Used Available Use% Mounted on\n/data 8388608 1048576 7340032 13% /data\n' };
      if (command === 'flutter') {
        flutterCalls.push({ args, timeout: options.timeout });
        assert.match(fs.readFileSync(path.join(workspace, args[1]), 'utf8'), /as flow1/);
        return { status: null, stdout: events('integration_test/a_test.dart'), stderr: 'DEVICE_TEST_TIMEOUT', timedOut: true };
      }
      return { status: 0, stdout: 'Success', stderr: '' };
    },
  });
  assert.equal(report.status, 'WAITING');
  assert.equal(report.checks.integration_test.failed_file, 'integration_test/b_test.dart');
  assert.equal(report.checks.integration_test.timed_out, true);
  assert.equal(report.checks.integration_test.completed_files.length, 1);
  assert.deepEqual(flutterCalls.map(call => call.timeout), [420_000]);
  assert.equal(fs.readdirSync(path.join(workspace, 'integration_test')).length, 2);
});

test('suite reporting rejects skipped, empty and unfinished flows', () => {
  const files = ['integration_test/a_test.dart', 'integration_test/b_test.dart'];
  assert.match(renderDeviceSuite(files), /group\("integration_test\/b_test.dart", flow1.main\)/);
  const parsed = parseDeviceSuite(events(files[0]) + '\n' + events(files[1], 2, 'error'), files);
  assert.deepEqual(parsed.completed_files, [files[0]]);
  assert.equal(parsed.failed_file, files[1]);
  assert.equal(parseDeviceSuite('All tests passed', files).completed_files.length, 0);
  const skipped = events(files[0]).replace('"skipped":false', '"skipped":true');
  assert.equal(parseDeviceSuite(skipped, files).completed_files.length, 0);
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
    flutterExecutable: 'flutter', adbExecutable: 'adb', ...snapshotStubs,
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

test('a reset that cannot run never downgrades an otherwise passing device verdict', async () => {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'device-cleanup-'));
  fs.mkdirSync(path.join(workspace, 'integration_test'));
  fs.writeFileSync(path.join(workspace, 'integration_test', 'main_test.dart'), 'void main() {}');
  const apk = path.join(workspace, 'app.apk');
  fs.writeFileSync(apk, 'delivery');
  const report = await runAndroidDeviceGate({
    workspace, apkPath: apk, packageName: 'com.example.app', flows: [{}],
    flutterExecutable: 'flutter', adbExecutable: 'adb',
    ...snapshotStubs,
    // The measured failure: the emulator console refuses the connection after
    // every critical flow has already passed.
    resetSnapshot: async () => ({
      status: 'UNAVAILABLE', mode: 'none', snapshot: 'studio_clean',
      details: 'studio_clean anlık görüntüsü yüklenemedi; tam wipe gerekiyor.',
      log: 'could not connect to TCP port 5554',
    }),
    run: (command, args) => {
      if (args[0] === 'devices') return { status: 0, stdout: 'List of devices attached\nemulator-5554 device\n' };
      if (args.includes('sys.boot_completed')) return { status: 0, stdout: '1\n' };
      if (args.includes('df')) return { status: 0, stdout: LOW_SPACE_DF };
      if (args.includes('pidof')) return { status: 0, stdout: '1234\n' };
      if (args.includes('logcat') && args.includes('-d')) return { status: 0, stdout: 'Application started' };
      return { status: 0, stdout: command === 'flutter' ? events('integration_test/main_test.dart') : 'Success' };
    },
  });
  assert.equal(report.status, 'PASS');
  assert.equal(report.failure_kind, undefined);
  assert.equal(report.reason, undefined);
  // Housekeeping stays fully visible: a host that can no longer reset its AVD
  // is a real problem, just not a defect of the generated application.
  assert.equal(report.housekeeping.avd_reset.status, 'UNAVAILABLE');
  assert.equal(report.housekeeping.app_cleanup.status, 'PASS');
  assert.match(report.notes.join('\n'), /cihaz sıfırlaması/i);
  assert.equal('avd_reset' in report.checks, false);
  // The run is told to reclaim the device once, at the end, instead of here.
  assert.equal(report.needs_full_wipe, true);
});

test('a stale delivery APK backup from an interrupted run is reclaimed', async () => {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'device-stale-backup-'));
  fs.mkdirSync(path.join(workspace, 'integration_test'));
  fs.writeFileSync(path.join(workspace, 'integration_test', 'main_test.dart'), 'void main() {}');
  const apk = path.join(workspace, 'app.apk');
  // A Studio restart during the previous device gate: the file at apkPath is the
  // instrumented test build and the delivery APK survives only in the backup.
  fs.writeFileSync(apk, 'stale-test-apk');
  fs.writeFileSync(`${apk}.studio-backup`, 'delivery');
  const report = await runAndroidDeviceGate({
    workspace, apkPath: apk, packageName: 'com.example.app', flows: [{}],
    flutterExecutable: 'flutter', adbExecutable: 'adb', ...snapshotStubs,
    run: (command, args) => {
      if (command === 'flutter') fs.writeFileSync(apk, 'test-apk');
      if (args.includes('install')) assert.equal(fs.readFileSync(apk, 'utf8'), 'delivery');
      if (args[0] === 'devices') return { status: 0, stdout: 'List of devices attached\nemulator-5554 device\n' };
      if (args.includes('sys.boot_completed')) return { status: 0, stdout: '1\n' };
      if (args.includes('df')) return { status: 0, stdout: 'Filesystem 1K-blocks Used Available Use% Mounted on\n/data 8388608 1048576 7340032 13% /data\n' };
      if (args.includes('pidof')) return { status: 0, stdout: '1234\n' };
      if (args.includes('logcat') && args.includes('-d')) return { status: 0, stdout: 'Application started' };
      return { status: 0, stdout: command === 'flutter' ? events('integration_test/main_test.dart') : 'Success' };
    },
  });
  assert.equal(report.status, 'PASS');
  assert.equal(report.recovered_apk_backup.restored_delivery_apk, true);
  assert.match(report.notes.join('\n'), /yedeği geri yüklendi/);
  assert.equal(fs.readFileSync(apk, 'utf8'), 'delivery');
  assert.equal(fs.existsSync(`${apk}.studio-backup`), false);
});

test('the device report names the Android runtime the product was validated on', async () => {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'device-target-'));
  fs.mkdirSync(path.join(workspace, 'integration_test'));
  fs.writeFileSync(path.join(workspace, 'integration_test', 'main_test.dart'), 'void main() {}');
  const apk = path.join(workspace, 'app.apk');
  fs.writeFileSync(apk, 'delivery');
  let wipeTarget = null;
  const report = await runAndroidDeviceGate({
    workspace, apkPath: apk, packageName: 'com.example.app', flows: [{}],
    flutterExecutable: 'flutter', adbExecutable: 'adb',
    // A third-party emulator: a supported target, but not an AVD.
    detectTarget: async () => ({
      type: 'third_party_emulator', label: 'Üçüncü taraf Android emülatörü',
      device: 'emulator-5554', hardware: 'qcom', model: 'V2266A', manufacturer: 'vivo',
      android_release: '9', supports_avd_wipe: false,
    }),
    ...snapshotStubs,
    resetSnapshot: async options => {
      wipeTarget = options.target;
      return { status: 'SKIPPED', mode: 'none', target_type: options.target.type, details: 'AVD sıfırlaması uygulanmaz.', log: '' };
    },
    run: (command, args) => {
      if (args[0] === 'devices') return { status: 0, stdout: 'List of devices attached\nemulator-5554 device\n' };
      if (args.includes('sys.boot_completed')) return { status: 0, stdout: '1\n' };
      if (args.includes('df')) return { status: 0, stdout: LOW_SPACE_DF };
      if (args.includes('pidof')) return { status: 0, stdout: '1234\n' };
      if (args.includes('logcat') && args.includes('-d')) return { status: 0, stdout: 'Application started' };
      return { status: 0, stdout: command === 'flutter' ? events('integration_test/main_test.dart') : 'Success' };
    },
  });
  assert.equal(report.status, 'PASS');
  // The report says what it ran on instead of calling everything an AVD.
  assert.equal(report.target.type, 'third_party_emulator');
  assert.equal(report.target.supports_avd_wipe, false);
  assert.match(report.logs.device_target, /Üçüncü taraf Android emülatörü/);
  // The classification is made once and handed to the target-specific operation.
  assert.equal(wipeTarget.type, 'third_party_emulator');
  assert.equal(report.housekeeping.avd_reset.status, 'SKIPPED');
  assert.equal(report.housekeeping.avd_reset.target_type, 'third_party_emulator');
  // A skipped target-specific step is not a warning.
  assert.equal(report.notes, undefined);
});

test('reclaim runs on a measurement, not on every gate', () => {
  // Across a real run the device reported 3966, 3947 and 5045 MB free against a
  // 1536 MB gate minimum, so the old unconditional reset reclaimed nothing three
  // times and charged a 48 second emulator boot to the gate that came next.
  assert.equal(shouldReclaimStorage(3966), false);
  assert.equal(shouldReclaimStorage(5045), false);
  assert.equal(shouldReclaimStorage(3071), true);
  assert.equal(shouldReclaimStorage(2048, 1800), false);
  // Not measurable is not the same as "there is room".
  assert.equal(shouldReclaimStorage(null), true);
  assert.equal(shouldReclaimStorage(undefined), true);
});

test('an uninstall of a package that was never there is not a cleanup failure', () => {
  // Measured: two of three gates in one run reported a housekeeping failure for
  // removing an app the failing integration test had never installed.
  assert.equal(isPackageAbsent('Failure [DELETE_FAILED_INTERNAL_ERROR]'), true);
  assert.equal(isPackageAbsent('Failure [not installed for 0]'), true);
  assert.equal(isPackageAbsent('Unknown package: com.example.app'), true);
  assert.equal(isPackageAbsent('Success'), false);
  // A device that is gone or full is still a real failure.
  assert.equal(isPackageAbsent('Failure [INSUFFICIENT_STORAGE]'), false);
  assert.equal(isPackageAbsent('error: device offline'), false);
});

test('end-of-run reclaim wipes only when it has to and never starts an emulator', async () => {
  const calls = [];
  const run = (command, args) => {
    calls.push(args.join(' '));
    if (args[0] === 'devices') return { status: 0, stdout: 'List of devices attached\nemulator-5554 device\n' };
    if (args.includes('df')) return { status: 0, stdout: 'Filesystem 1K-blocks Used Available Use% Mounted on\n/data 8388608 1048576 7340032 13% /data\n' };
    return { status: 0, stdout: '' };
  };
  const avdTarget = async () => ({ type: 'android_studio_avd', supports_avd_wipe: true });
  let wipes = 0;
  const wipeDevice = async () => { wipes += 1; return { status: 'PASS', avd_name: 'Test_AVD', details: 'sıfırlandı' }; };

  const roomy = await reclaimDeviceStorage({
    workspace: '.', adbExecutable: 'adb', run, detectTarget: avdTarget, wipeDevice,
  });
  assert.equal(roomy.status, 'SKIPPED');
  assert.equal(roomy.free_mb, 7168);
  assert.equal(wipes, 0, 'yer varken wipe çalıştı');

  // A gate that could not restore the snapshot leaves the device dirty, and a
  // dirty device has to be wiped however much room it has.
  const forced = await reclaimDeviceStorage({
    workspace: '.', adbExecutable: 'adb', run, detectTarget: avdTarget, wipeDevice, force: true,
  });
  assert.equal(forced.status, 'PASS');
  assert.equal(forced.forced, true);
  assert.equal(wipes, 1);

  // Nothing attached: nothing to reclaim, and emphatically no emulator launch.
  const idle = await reclaimDeviceStorage({
    workspace: '.', adbExecutable: 'adb', detectTarget: avdTarget, wipeDevice,
    run: () => ({ status: 0, stdout: 'List of devices attached\n' }),
  });
  assert.equal(idle.status, 'SKIPPED');
  assert.equal(wipes, 1);
  assert.equal(calls.some(args => args.includes('-launch') || args.includes('emulators')), false);
});

test('a physical device is never wiped by the end-of-run reclaim', async () => {
  const result = await reclaimDeviceStorage({
    workspace: '.', adbExecutable: 'adb', force: true,
    detectTarget: async () => ({ type: 'physical_device', supports_avd_wipe: false }),
    wipeDevice: async () => { throw new Error('fiziksel cihaz sıfırlandı'); },
    run: (command, args) => (args[0] === 'devices'
      ? { status: 0, stdout: 'List of devices attached\nR5CT30 device\n' }
      : { status: 0, stdout: '' }),
  });
  assert.equal(result.status, 'SKIPPED');
  assert.equal(result.target_type, 'physical_device');
});

test('reclaim hands its helpers a (command, args) runner, not the adb shorthand', async () => {
  // Measured live: passing the one-argument adb helper made detectTarget read
  // the properties of nothing and report a real Android Studio AVD as a
  // third-party emulator, which silently disables every AVD-specific step.
  const seen = [];
  const result = await reclaimDeviceStorage({
    workspace: '.', adbExecutable: 'adb', force: true,
    run: (command, args) => {
      if (args[0] === 'devices') return { status: 0, stdout: 'List of devices attached\nemulator-5554 device\n' };
      if (args.includes('ro.hardware')) return { status: 0, stdout: 'ranchu\n' };
      return { status: 0, stdout: '' };
    },
    detectTarget: async ({ run, adb, device }) => {
      const probe = await run(adb, ['-s', device, 'shell', 'getprop', 'ro.hardware']);
      seen.push({ command: adb, hardware: probe.stdout.trim() });
      return { type: 'android_studio_avd', supports_avd_wipe: true };
    },
    wipeDevice: async ({ run, adb, device }) => {
      const probe = await run(adb, ['-s', device, 'emu', 'kill']);
      seen.push({ command: adb, wiped: probe.status === 0 });
      return { status: 'PASS', avd_name: 'Test_AVD', details: 'sıfırlandı' };
    },
  });
  assert.equal(result.status, 'PASS');
  assert.equal(result.target_type, 'android_studio_avd');
  // Both helpers reached the real adb with the real device, rather than being
  // handed the device id as if it were the executable.
  assert.deepEqual(seen, [
    { command: 'adb', hardware: 'ranchu' },
    { command: 'adb', wiped: true },
  ]);
});

test('a snapshot reset waits for the device to come back before handing it over', async () => {
  const calls = [];
  const run = (command, args) => {
    calls.push(args.join(' '));
    return { status: 0, stdout: args.includes('load') ? 'OK' : '' };
  };
  const reset = await resetAvdToSnapshot({
    run, adb: 'adb', device: 'emulator-5554',
    target: { type: 'android_studio_avd', supports_avd_wipe: true },
  });
  assert.equal(reset.status, 'PASS');
  assert.equal(reset.mode, 'snapshot');
  // Measured live: the first command after a load can answer "device still
  // authorizing", and a device handed back in that state reads as unplugged.
  assert.deepEqual(calls, [
    '-s emulator-5554 emu avd snapshot load studio_clean',
    '-s emulator-5554 wait-for-device',
  ]);
});

test('the emulator console reports failure in its output, not its exit code', async () => {
  // `adb emu avd snapshot load` exits 0 while printing KO, so reading only the
  // exit code would call a missing snapshot a successful reset.
  const reset = await resetAvdToSnapshot({
    run: async () => ({ status: 0, stdout: "KO: Snapshot load failure: snapshot doesn't exist" }),
    adb: 'adb', device: 'emulator-5554',
    target: { type: 'android_studio_avd', supports_avd_wipe: true },
  });
  assert.equal(reset.status, 'UNAVAILABLE');
  assert.equal(reset.mode, 'none');
});
