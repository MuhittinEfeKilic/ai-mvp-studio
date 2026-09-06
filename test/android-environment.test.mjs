import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  compareBuildToolsVersions, ensureBootedDevice, isBootCompleted, isPrereleaseBuildTools,
  parseAvailableDataKb, parseEmulatorList, prepareDeviceForTest, probeBuildTools, wipeAvdAfterTest,
} from '../src/android-environment.mjs';

const CONNECTED = 'List of devices attached\nemulator-5554 device product:sdk\n';

test('emulator ids are read from the flutter emulators listing', () => {
  const output = [
    '1 available emulator:',
    '',
    // Real listings start with this header, which parses as a valid id.
    'Id                    • Name                  • Manufacturer • Platform',
    '',
    'Medium_Phone_API_36.0 • Medium Phone API 36.0 • Generic • android',
    'Pixel_7 • Pixel 7 • Google • android',
    '',
    "To run an emulator, run 'flutter emulators --launch <emulator id>'.",
  ].join('\n');
  assert.deepEqual(parseEmulatorList(output), ['Medium_Phone_API_36.0', 'Pixel_7']);
  assert.deepEqual(parseEmulatorList('No emulators available'), []);
});

test('boot completion is only accepted for the exact property value', () => {
  assert.equal(isBootCompleted('1\n'), true);
  assert.equal(isBootCompleted(''), false);
  assert.equal(isBootCompleted('Success'), false);
});

test('AVD data capacity is parsed and insufficient storage stops before testing', async () => {
  const df = 'Filesystem 1K-blocks Used Available Use% Mounted on\n/dev/block/dm-8 6291456 5767168 524288 92% /data\n';
  assert.equal(parseAvailableDataKb(df), 524288);
  const calls = [];
  const result = await prepareDeviceForTest({
    adb: 'adb', device: 'emulator-5554', packageName: 'com.example.app', minimumFreeMb: 1024,
    run: async (_command, args) => {
      calls.push(args.join(' '));
      return args.includes('df') ? { status: 0, stdout: df } : { status: 0, stdout: 'Success' };
    },
  });
  assert.equal(result.status, 'WAITING');
  assert.equal(result.free_mb, 512);
  assert.match(result.reason, /512 MB boş, en az 1024 MB/);
  assert.ok(calls[0].includes('uninstall com.example.app'));
});

test('AVD preparation removes only the target package and accepts healthy storage', async () => {
  const calls = [];
  const result = await prepareDeviceForTest({
    adb: 'adb', device: 'emulator-5554', packageName: 'com.example.app', minimumFreeMb: 1024,
    run: async (_command, args) => {
      calls.push(args.join(' '));
      if (args.includes('df')) return { status: 0, stdout: 'Filesystem 1K-blocks Used Available Use% Mounted on\n/data 8388608 1048576 7340032 13% /data\n' };
      return { status: 0, stdout: 'Success' };
    },
  });
  assert.equal(result.status, 'PASS');
  assert.equal(result.free_mb, 7168);
  assert.deepEqual(calls, [
    '-s emulator-5554 uninstall com.example.app',
    '-s emulator-5554 shell df -k /data',
  ]);
});

test('test cleanup factory-resets only emulator devices', async () => {
  const sdk = fs.mkdtempSync(path.join(os.tmpdir(), 'android-sdk-'));
  const adb = path.join(sdk, 'platform-tools', process.platform === 'win32' ? 'adb.exe' : 'adb');
  const emulator = path.join(sdk, 'emulator', process.platform === 'win32' ? 'emulator.exe' : 'emulator');
  fs.mkdirSync(path.dirname(adb), { recursive: true });
  fs.mkdirSync(path.dirname(emulator), { recursive: true });
  fs.writeFileSync(emulator, 'test');
  const calls = [];
  const launched = [];
  const wiped = await wipeAvdAfterTest({
    adb, device: 'emulator-5554', workspace: sdk, sleep: async () => {},
    run: async (_command, args) => {
      calls.push(args.join(' '));
      return args.includes('name')
        ? { status: 0, stdout: 'AI_MVP_Test\nOK\n' }
        : { status: 0, stdout: 'OK' };
    },
    launch: async (command, args) => {
      launched.push([command, ...args].join(' '));
      return { status: 'STARTED' };
    },
  });
  assert.equal(wiped.status, 'PASS');
  assert.ok(calls.includes('-s emulator-5554 emu kill'));
  assert.match(launched[0], /-avd AI_MVP_Test -wipe-data -no-snapshot-save/);

  const physical = await wipeAvdAfterTest({ adb, device: 'R58M123', workspace: sdk, run: async () => { throw new Error('should not run'); } });
  assert.equal(physical.status, 'SKIPPED');
});

test('build tools versions order with prereleases below their stable release', () => {
  const versions = ['34.0.0', '36.1.0-rc1', '36.0.0'];
  assert.deepEqual(
    versions.slice().sort((left, right) => compareBuildToolsVersions(right, left)),
    ['36.1.0-rc1', '36.0.0', '34.0.0'],
  );
  assert.equal(isPrereleaseBuildTools('36.1.0-rc1'), true);
  assert.equal(isPrereleaseBuildTools('36.0.0'), false);
});

test('build tools probe reports a crashing aapt and names a stable fallback', async () => {
  const options = status => ({
    sdkRoot: 'C:/Sdk',
    readdir: () => ['34.0.0', '36.0.0', '36.1.0-rc1'],
    exists: () => true,
    run: async () => ({ status }),
  });
  const healthy = await probeBuildTools(options(0));
  assert.equal(healthy.status, 'PASS');
  assert.equal(healthy.checked, '36.1.0-rc1');
  assert.equal(healthy.prerelease, true);

  // The exact failure mode seen once: aapt exits with a Windows crash code.
  const broken = await probeBuildTools(options(-1073741502));
  assert.equal(broken.status, 'FAIL');
  assert.equal(broken.stable_fallback, '36.0.0');
  assert.match(broken.details, /Stabil alternatif kurulu: 36\.0\.0/);
});

test('an already booted device is used without launching an emulator', async () => {
  const calls = [];
  const result = await ensureBootedDevice({
    adb: 'adb',
    flutter: 'flutter',
    run: (command, args) => {
      calls.push(`${command} ${args.join(' ')}`);
      if (args[0] === 'devices') return { status: 0, stdout: CONNECTED };
      return { status: 0, stdout: '1\n' };
    },
  });
  assert.equal(result.device, 'emulator-5554');
  assert.equal(result.launched, false);
  assert.ok(!calls.some(call => call.includes('--launch')), 'gereksiz emülatör başlatıldı');
});

test('a missing device launches the first emulator and waits for boot completion', async () => {
  const calls = [];
  let booted = false;
  const result = await ensureBootedDevice({
    adb: 'adb',
    flutter: 'flutter',
    sleep: async () => { booted = true; },
    run: (command, args) => {
      calls.push(args.join(' '));
      if (args[0] === 'devices') return { status: 0, stdout: booted ? CONNECTED : 'List of devices attached\n' };
      if (args[0] === 'emulators' && args.length === 1) {
        return { status: 0, stdout: 'Medium_Phone_API_36.0 • Medium Phone • Generic • android' };
      }
      if (args.includes('--launch')) return { status: 0, stdout: '' };
      // adb reports `device` while still booting, so this gate matters.
      return { status: 0, stdout: booted ? '1\n' : '' };
    },
  });
  assert.equal(result.device, 'emulator-5554');
  assert.equal(result.launched, true);
  assert.ok(calls.includes('emulators --launch Medium_Phone_API_36.0'));
});

test('waiting for a device that never boots ends as a wait, not a failure', async () => {
  let clock = 0;
  const result = await ensureBootedDevice({
    adb: 'adb',
    flutter: 'flutter',
    timeoutMs: 30_000,
    now: () => clock,
    sleep: async () => { clock += 10_000; },
    run: (command, args) => {
      if (args[0] === 'emulators' && args.length === 1) {
        return { status: 0, stdout: 'Medium_Phone_API_36.0 • Medium Phone • Generic • android' };
      }
      if (args[0] === 'devices') return { status: 0, stdout: 'List of devices attached\n' };
      return { status: 0, stdout: '' };
    },
  });
  assert.equal(result.device, null);
  assert.match(result.reason, /açılış tamamlamadı/);
});

test('without any emulator the caller is told what was missing', async () => {
  const result = await ensureBootedDevice({
    adb: 'adb',
    flutter: 'flutter',
    run: (command, args) => (args[0] === 'devices'
      ? { status: 0, stdout: 'List of devices attached\n' }
      : { status: 0, stdout: 'No emulators available' }),
  });
  assert.equal(result.device, null);
  assert.match(result.reason, /başlatılabilecek emülatör bulunamadı/);
});
