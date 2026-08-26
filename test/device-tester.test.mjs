import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  adbCandidates, parseAdbDevices, runAndroidDeviceGate, validateFlowCoverage,
} from '../src/device-tester.mjs';

test('ADB candidates prefer explicit configuration and include LDPlayer on Windows', () => {
  const candidates = adbCandidates({ ADB_BIN: 'D:\\tools\\adb.exe', LOCALAPPDATA: 'C:\\Local' }, 'win32');
  assert.equal(candidates[0], 'D:\\tools\\adb.exe');
  assert.ok(candidates.includes('C:\\LDPlayer\\LDPlayer9\\adb.exe'));
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

test('device gate waits without failing when no emulator is connected', () => {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'device-wait-'));
  const report = runAndroidDeviceGate({
    workspace, apkPath: 'app.apk', packageName: 'com.example.app', flows: [{}],
    flutterExecutable: 'flutter', adbExecutable: 'adb',
    run: (_command, args) => args[0] === 'devices'
      ? { status: 0, stdout: 'List of devices attached\n' }
      : { status: 0, stdout: '' },
  });
  assert.equal(report.status, 'WAITING');
  assert.match(report.reason, /cihaz\/emülatör/);
});

test('device gate runs integration, installs APK, launches app and rejects fatal logs', () => {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'device-gate-'));
  fs.mkdirSync(path.join(workspace, 'integration_test'));
  fs.writeFileSync(path.join(workspace, 'integration_test', 'main_test.dart'), 'void main() {}');
  const run = (command, args) => {
    if (args[0] === 'devices') return { status: 0, stdout: 'List of devices attached\nemulator-5554 device\n' };
    if (args.includes('pidof')) return { status: 0, stdout: '1234\n' };
    if (args.includes('logcat') && args.includes('-d')) return { status: 0, stdout: 'Application started' };
    return { status: 0, stdout: command === 'flutter' ? 'All tests passed' : 'Success' };
  };
  const report = runAndroidDeviceGate({
    workspace, apkPath: 'app.apk', packageName: 'com.example.app', flows: [{}],
    flutterExecutable: 'flutter', adbExecutable: 'adb', run,
  });
  assert.equal(report.status, 'PASS');
  assert.equal(report.checks.integration_test.status, 'PASS');
  assert.equal(report.checks.launch.process_id, '1234');
});
