import fs from 'node:fs';
import path from 'node:path';

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
export function probeBuildTools({ sdkRoot, run, readdir = fs.readdirSync, exists = fs.existsSync } = {}) {
  if (!sdkRoot) return { status: 'SKIPPED', details: 'Android SDK yolu bilinmiyor.', versions: [] };
  const root = path.join(sdkRoot, 'build-tools');
  if (!exists(root)) return { status: 'FAIL', details: `build-tools dizini yok: ${root}`, versions: [] };
  const versions = readdir(root).sort((left, right) => compareBuildToolsVersions(right, left));
  if (!versions.length) return { status: 'FAIL', details: 'Kurulu build-tools sürümü yok.', versions };

  const newest = versions[0];
  const executable = path.join(root, newest, process.platform === 'win32' ? 'aapt.exe' : 'aapt');
  const probe = run(executable, ['version']);
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

function readyDevice(run, adb) {
  const listed = run(adb, ['devices', '-l']);
  const device = parseAdbDevices(listed.stdout).find(item => item.state === 'device');
  if (!device) return null;
  const booted = run(adb, ['-s', device.id, 'shell', 'getprop', 'sys.boot_completed']);
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
  const immediate = readyDevice(run, adb);
  if (immediate) return { device: immediate, launched: false, log };

  let launched = false;
  if (flutter) {
    const listed = run(flutter, ['emulators']);
    const emulators = parseEmulatorList(listed.stdout);
    log.push(`Bulunan emülatörler: ${emulators.join(', ') || '(yok)'}`);
    if (emulators.length) {
      const result = run(flutter, ['emulators', '--launch', emulators[0]]);
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
    const device = readyDevice(run, adb);
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
