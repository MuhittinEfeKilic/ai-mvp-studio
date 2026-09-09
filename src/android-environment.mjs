import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

const PRERELEASE = /-(?:rc|alpha|beta)/i;

export function parseAdbDevices(output) {
  return String(output || '').split(/\r?\n/).slice(1).map(line => line.trim())
    .filter(Boolean).map(line => {
      const [id, state] = line.split(/\s+/, 2);
      return { id, state };
    });
}

/**
 * Reads `flutter emulators` rows; the id is the first bullet-separated field.
 * The listing starts with an `Id • Name • Manufacturer • Platform` header that
 * parses as a perfectly valid id, so it is dropped explicitly.
 */
export function parseEmulatorList(output) {
  return String(output || '').split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => line.includes('•'))
    .filter(line => !/^Id\s*•\s*Name\s*•/i.test(line))
    .map(line => line.split('•')[0].trim())
    .filter(id => /^[\w.-]+$/.test(id));
}

/** `adb devices` reports a booting emulator as `device` long before it is usable. */
export function isBootCompleted(output) {
  return /(^|\s)1(\s|$)/.test(String(output ?? '').trim());
}

/** Parses toybox `df -k /data`; returns available KiB or null. */
export function parseAvailableDataKb(output) {
  const lines = String(output || '').trim().split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return null;
  const headers = lines[0].trim().split(/\s+/).map(value => value.toLowerCase());
  const availableIndex = headers.findIndex(value => /^(available|avail)$/.test(value));
  if (availableIndex < 0) return null;
  const values = lines.at(-1).trim().split(/\s+/);
  const available = Number(values[availableIndex]);
  return Number.isFinite(available) && available >= 0 ? available : null;
}

/** Removes only the target package and verifies AVD /data capacity. */
export async function prepareDeviceForTest({
  run, adb, device, packageName, minimumFreeMb = 1536,
}) {
  const uninstall = await run(adb, ['-s', device, 'uninstall', packageName]);
  const uninstallLog = [uninstall.stdout, uninstall.stderr, uninstall.error?.message]
    .filter(Boolean).join('\n').trim();
  const packageWasAbsent = /unknown package|not installed|delete_failed_internal_error/i.test(uninstallLog)
    && !/insufficient storage|device offline|device .*not found/i.test(uninstallLog);
  if (uninstall.status !== 0 && !packageWasAbsent) {
    return {
      status: 'WAITING', free_mb: null, required_mb: minimumFreeMb,
      reason: `AVD hedef paket temizliği başarısız: ${uninstallLog || `exit ${uninstall.status}`}`,
      log: uninstallLog,
    };
  }
  const disk = await run(adb, ['-s', device, 'shell', 'df', '-k', '/data']);
  const availableKb = parseAvailableDataKb(disk.stdout);
  const freeMb = availableKb === null ? null : Math.floor(availableKb / 1024);
  const log = [uninstallLog, disk.stdout, disk.stderr].filter(Boolean).join('\n').trim();
  if (disk.status !== 0 || availableKb === null) {
    return {
      status: 'WAITING', free_mb: freeMb, required_mb: minimumFreeMb,
      reason: 'AVD /data kullanılabilir alanı ölçülemedi.', log,
    };
  }
  if (freeMb < minimumFreeMb) {
    return {
      status: 'WAITING', free_mb: freeMb, required_mb: minimumFreeMb,
      reason: `AVD depolama alanı yetersiz: ${freeMb} MB boş, en az ${minimumFreeMb} MB gerekli.`, log,
    };
  }
  return {
    status: 'PASS', free_mb: freeMb, required_mb: minimumFreeMb,
    details: `AVD hazır: ${freeMb} MB boş alan.`, log,
  };
}

export function compareBuildToolsVersions(left, right) {
  const parts = value => String(value).split('-')[0].split('.').map(Number);
  const [a, b] = [parts(left), parts(right)];
  for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
    const difference = (a[index] || 0) - (b[index] || 0);
    if (difference !== 0) return difference;
  }
  return PRERELEASE.test(left) === PRERELEASE.test(right) ? 0 : (PRERELEASE.test(left) ? -1 : 1);
}

export function isPrereleaseBuildTools(version) {
  return PRERELEASE.test(String(version));
}

/**
 * Verifies that the build-tools Gradle would reach for actually run. A crashing
 * `aapt` (observed once as exit -1073741502 under a release candidate) fails the
 * device stage in a way that looks like an application defect.
 */
export async function probeBuildTools({ sdkRoot, run, readdir = fs.readdirSync, exists = fs.existsSync } = {}) {
  if (!sdkRoot) return { status: 'SKIPPED', details: 'Android SDK yolu bilinmiyor.', versions: [] };
  const root = path.join(sdkRoot, 'build-tools');
  if (!exists(root)) return { status: 'FAIL', details: `build-tools dizini yok: ${root}`, versions: [] };
  const versions = readdir(root).sort((left, right) => compareBuildToolsVersions(right, left));
  if (!versions.length) return { status: 'FAIL', details: 'Kurulu build-tools sürümü yok.', versions };

  const newest = versions[0];
  const executable = path.join(root, newest, process.platform === 'win32' ? 'aapt.exe' : 'aapt');
  const probe = await run(executable, ['version']);
  const healthy = probe.status === 0;
  const stableFallback = versions.find(version => !isPrereleaseBuildTools(version)) || null;
  return {
    status: healthy ? 'PASS' : 'FAIL',
    versions,
    checked: newest,
    prerelease: isPrereleaseBuildTools(newest),
    stable_fallback: stableFallback,
    details: healthy
      ? `aapt çalışıyor (build-tools ${newest}).`
      : `build-tools ${newest} içindeki aapt çalışmıyor (exit ${probe.status}).`
        + (stableFallback && stableFallback !== newest
          ? ` Stabil alternatif kurulu: ${stableFallback}.` : ' Stabil bir sürüm kurun.'),
  };
}

const wait = milliseconds => new Promise(resolve => { setTimeout(resolve, milliseconds); });

function launchEmulator(executable, args) {
  return new Promise(resolve => {
    let child;
    try {
      child = spawn(executable, args, { detached: true, stdio: 'ignore', windowsHide: true });
    } catch (error) {
      resolve({ status: 'FAIL', error: error.message });
      return;
    }
    child.once('error', error => resolve({ status: 'FAIL', error: error.message }));
    child.once('spawn', () => {
      child.unref();
      resolve({ status: 'STARTED' });
    });
  });
}

/**
 * System properties that also carry the AVD name. `adb emu avd name` talks to
 * the emulator console over TCP, which a real run could not reach ("could not
 * connect to TCP port 5554") after every critical flow had already passed.
 * Properties are readable over the ordinary adb shell, so they answer when the
 * console does not.
 */
const AVD_NAME_PROPERTIES = Object.freeze(['ro.boot.qemu.avd_name', 'ro.kernel.qemu.avd_name']);

const isUsableAvdName = value => Boolean(value)
  && value !== 'OK' && !/^KO\b/.test(value) && !/^error\b/i.test(value);

/**
 * Resolves the name of the running AVD. The emulator console stays the primary
 * source because it answers for every image; the properties are a fallback, not
 * a replacement. The winning source is reported so a host that only answers
 * through the fallback stays visible instead of silently working.
 */
export async function resolveAvdName({ run, adb, device }) {
  const log = [];
  const consoleResult = await run(adb, ['-s', device, 'emu', 'avd', 'name']);
  log.push([consoleResult.stdout, consoleResult.stderr].filter(Boolean).join('\n').trim());
  const fromConsole = String(consoleResult.stdout || '').split(/\r?\n/)
    .map(value => value.trim()).find(isUsableAvdName);
  if (consoleResult.status === 0 && fromConsole) {
    return { name: fromConsole, source: 'emu avd name', log: log.filter(Boolean).join('\n') };
  }
  for (const property of AVD_NAME_PROPERTIES) {
    const probe = await run(adb, ['-s', device, 'shell', 'getprop', property]);
    const value = String(probe.stdout || '').split(/\r?\n/).map(entry => entry.trim()).find(Boolean);
    log.push(`getprop ${property}: ${value || '(boş)'}`);
    if (probe.status === 0 && isUsableAvdName(value)) {
      return { name: value, source: `getprop ${property}`, log: log.filter(Boolean).join('\n') };
    }
  }
  return { name: null, source: null, log: log.filter(Boolean).join('\n') };
}

/** Kernels the Android Studio emulator runs on; a wipeable AVD reports one. */
const AVD_HARDWARE = /^(?:goldfish|ranchu)/i;

/** Supported Android runtime targets a device validation may run against. */
export const DEVICE_TARGET_TYPES = Object.freeze({
  avd: 'android_studio_avd',
  thirdPartyEmulator: 'third_party_emulator',
  physical: 'physical_device',
});

const DEVICE_TARGET_LABELS = Object.freeze({
  android_studio_avd: 'Android Studio AVD',
  third_party_emulator: 'Üçüncü taraf Android emülatörü',
  physical_device: 'Fiziksel Android cihaz',
});

export function describeDeviceTarget(target) {
  if (!target) return 'Bilinmeyen Android hedefi';
  const label = DEVICE_TARGET_LABELS[target.type] || target.type;
  const identity = [target.manufacturer, target.model].filter(Boolean).join(' ');
  const details = [identity, target.hardware && `ro.hardware=${target.hardware}`].filter(Boolean);
  return details.length ? `${label} (${details.join(', ')})` : label;
}

/**
 * Classifies the Android runtime the validation runs against. Device validation
 * is not AVD-only: a third-party emulator and a physical device are supported
 * targets too, and calling either one an AVD would be a lie the reports repeat.
 *
 * The device id cannot decide it. Third-party emulators take `emulator-NNNN`
 * too, answer none of the AVD console commands and spoof a real device profile —
 * a measured host reports `ro.hardware=qcom` with a vivo model behind
 * `emulator-5554`. Only the AVD category may receive AVD-specific operations.
 */
export async function detectDeviceTarget({ run, adb, device }) {
  const read = async property => {
    const result = await run(adb, ['-s', device, 'shell', 'getprop', property]);
    return result.status === 0 ? String(result.stdout || '').trim() : '';
  };
  const hardware = await read('ro.hardware');
  const isAvd = AVD_HARDWARE.test(hardware)
    // Older images expose the emulator only through the qemu boot properties.
    || (await read('ro.kernel.qemu')) === '1' || (await read('ro.boot.qemu')) === '1';
  const type = isAvd ? DEVICE_TARGET_TYPES.avd
    : String(device || '').startsWith('emulator-') ? DEVICE_TARGET_TYPES.thirdPartyEmulator
      : DEVICE_TARGET_TYPES.physical;
  const target = {
    type,
    label: DEVICE_TARGET_LABELS[type],
    device: device || null,
    hardware: hardware || null,
    model: (await read('ro.product.model')) || null,
    manufacturer: (await read('ro.product.manufacturer')) || null,
    android_release: (await read('ro.build.version.release')) || null,
    supports_avd_wipe: type === DEVICE_TARGET_TYPES.avd,
  };
  return target;
}

/**
 * Factory-resets the test AVD. Wiping is an AVD-specific operation, so every
 * other supported target is skipped rather than reported as broken: there is
 * nothing to reset on a third-party emulator or a physical device, and the run
 * that validated the product is not worse for it.
 */
export async function wipeAvdAfterTest({
  run, adb, device, workspace, target = null, launch = launchEmulator, sleep = wait,
}) {
  // Cheap and definitive: adb only issues `emulator-NNNN` on the local emulator
  // console ports, so a different id is never an AVD and needs no probing.
  if (!String(device || '').startsWith('emulator-')) {
    return {
      status: 'SKIPPED', target_type: DEVICE_TARGET_TYPES.physical,
      details: 'Fiziksel Android cihaz otomatik olarak sıfırlanmadı.', log: '',
    };
  }
  const resolvedTarget = target ?? await detectDeviceTarget({ run, adb, device });
  if (!resolvedTarget.supports_avd_wipe) {
    return {
      status: 'SKIPPED', target_type: resolvedTarget.type,
      details: `${describeDeviceTarget(resolvedTarget)} için AVD wipe uygulanmaz.`,
      log: '',
    };
  }
  const named = await resolveAvdName({ run, adb, device });
  const avdName = named.name;
  if (!avdName) {
    // A real AVD whose name no source can answer stays a reported problem.
    return {
      status: 'FAIL', target_type: resolvedTarget.type,
      details: 'Test AVD adı ne emülatör konsolundan ne de cihaz özelliklerinden okunabildi; otomatik wipe yapılamadı.',
      log: named.log,
    };
  }
  const sdkRoot = path.dirname(path.dirname(adb));
  const emulator = path.join(sdkRoot, 'emulator', process.platform === 'win32' ? 'emulator.exe' : 'emulator');
  if (!fs.existsSync(emulator)) {
    return { status: 'FAIL', details: `Android Emulator bulunamadı: ${emulator}`, log: '' };
  }
  const stopped = await run(adb, ['-s', device, 'emu', 'kill']);
  if (stopped.status !== 0) {
    return { status: 'FAIL', details: 'Test AVD kapatılamadı; otomatik wipe yapılamadı.', log: [stopped.stdout, stopped.stderr].filter(Boolean).join('\n') };
  }
  await sleep(1500);
  const started = await launch(emulator, ['-avd', avdName, '-wipe-data', '-no-snapshot-save'], { cwd: workspace });
  if (started.status !== 'STARTED') {
    return { status: 'FAIL', details: `Test AVD temiz başlatılamadı: ${started.error || 'bilinmeyen hata'}`, log: started.error || '' };
  }
  return {
    status: 'PASS', target_type: resolvedTarget.type,
    avd_name: avdName, avd_name_source: named.source,
    details: `${avdName} test sonrasında sıfırlandı ve temiz olarak yeniden başlatıldı.`,
    log: [named.log, `AVD wipe başlatıldı: ${avdName} (${named.source})`].filter(Boolean).join('\n'),
  };
}

async function readyDevice(run, adb) {
  const listed = await run(adb, ['devices', '-l']);
  const device = parseAdbDevices(listed.stdout).find(item => item.state === 'device');
  if (!device) return null;
  const booted = await run(adb, ['-s', device.id, 'shell', 'getprop', 'sys.boot_completed']);
  return isBootCompleted(booted.stdout) ? device.id : null;
}

/**
 * Returns a device that has finished booting, launching the first available
 * emulator when nothing is connected. Waiting for `sys.boot_completed` matters:
 * `adb devices` reports a still-booting emulator as ready and the integration
 * run then fails with "Unable to start the app on the device".
 */
export async function ensureBootedDevice({
  run, adb, flutter = null, timeoutMs = 240_000, pollMs = 3000, sleep = wait, now = Date.now,
}) {
  const log = [];
  const immediate = await readyDevice(run, adb);
  if (immediate) return { device: immediate, launched: false, log };

  let launched = false;
  if (flutter) {
    const listed = await run(flutter, ['emulators']);
    const emulators = parseEmulatorList(listed.stdout);
    log.push(`Bulunan emülatörler: ${emulators.join(', ') || '(yok)'}`);
    if (emulators.length) {
      const result = await run(flutter, ['emulators', '--launch', emulators[0]]);
      launched = true;
      log.push(`Emülatör başlatıldı: ${emulators[0]} (exit ${result.status})`);
    }
  }
  if (!launched) {
    return { device: null, launched, log, reason: 'Bağlı cihaz yok ve başlatılabilecek emülatör bulunamadı.' };
  }

  const deadline = now() + timeoutMs;
  while (now() < deadline) {
    await sleep(pollMs);
    const device = await readyDevice(run, adb);
    if (device) {
      log.push(`Cihaz hazır: ${device}`);
      return { device, launched, log };
    }
  }
  log.push('Emülatör zaman aşımına uğradı.');
  return {
    device: null,
    launched,
    log,
    reason: `Emülatör ${Math.round(timeoutMs / 1000)} saniyede açılış tamamlamadı.`,
  };
}
