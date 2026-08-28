import assert from 'node:assert/strict';
import test from 'node:test';

import {
  compareBuildToolsVersions, ensureBootedDevice, isBootCompleted, isPrereleaseBuildTools,
  parseEmulatorList, probeBuildTools,
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

test('build tools versions order with prereleases below their stable release', () => {
  const versions = ['34.0.0', '36.1.0-rc1', '36.0.0'];
  assert.deepEqual(
    versions.slice().sort((left, right) => compareBuildToolsVersions(right, left)),
    ['36.1.0-rc1', '36.0.0', '34.0.0'],
  );
  assert.equal(isPrereleaseBuildTools('36.1.0-rc1'), true);
  assert.equal(isPrereleaseBuildTools('36.0.0'), false);
});

test('build tools probe reports a crashing aapt and names a stable fallback', () => {
  const options = status => ({
    sdkRoot: 'C:/Sdk',
    readdir: () => ['34.0.0', '36.0.0', '36.1.0-rc1'],
    exists: () => true,
    run: () => ({ status }),
  });
  const healthy = probeBuildTools(options(0));
  assert.equal(healthy.status, 'PASS');
  assert.equal(healthy.checked, '36.1.0-rc1');
  assert.equal(healthy.prerelease, true);

  // The exact failure mode seen once: aapt exits with a Windows crash code.
  const broken = probeBuildTools(options(-1073741502));
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
