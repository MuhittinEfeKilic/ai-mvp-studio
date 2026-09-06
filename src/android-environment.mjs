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

/** Factory-resets only an Android Studio AVD and leaves physical devices alone. */
export async function wipeAvdAfterTest({
  run, adb, device, workspace, launch = launchEmulator, sleep = wait,
}) {
  if (!String(device || '').startsWith('emulator-')) {
    return { status: 'SKIPPED', details: 'Fiziksel cihaz otomatik olarak sıfırlanmadı.', log: '' };
  }
  const named = await run(adb, ['-s', device, 'emu', 'avd', 'name']);
  const avdName = String(named.stdout || '').split(/\r?\n/).map(value => value.trim())
    .find(value => value && value !== 'OK');
  if (named.status !== 0 || !avdName) {
    return { status: 'FAIL', details: 'Test AVD adı belirlenemedi; otomatik wipe yapılamadı.', log: [named.stdout, named.stderr].filter(Boolean).join('\n') };
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
    status: 'PASS', avd_name: avdName,
    details: `${avdName} test sonrasında sıfırlandı ve temiz olarak yeniden başlatıldı.`,
    log: `AVD wipe başlatıldı: ${avdName}`,
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
