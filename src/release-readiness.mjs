import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { parseSpec } from './spec-validator.mjs';

/**
 * Deterministic answer to one question: is this generated MVP technically ready
 * to be handed to a real external user as a release candidate?
 *
 * Nothing here asks a model whether the app "looks ready". Every finding is a
 * fact read out of the generated project or out of a real release build, and
 * every blocker is a rule that can be defended in one sentence.
 *
 * The contract is deliberately thin: PROJECT_SPEC.md stays the single source of
 * *intent* (what this app is supposed to be called and identified as), while the
 * generated Flutter/Android files stay authoritative for what was actually
 * built. This module records both and reports disagreement instead of inventing
 * a third place where the same values are declared.
 */

export const RELEASE_ARTIFACT_PATH = 'build/app/outputs/flutter-apk/app-release.apk';
const MAIN_MANIFEST = 'android/app/src/main/AndroidManifest.xml';
const GRADLE_FILES = ['android/app/build.gradle.kts', 'android/app/build.gradle'];

/** Flutter's own scaffold values. Shipping them means nobody named the product. */
const SCAFFOLD_DESCRIPTION = /^a new flutter project\.?$/i;
const PLACEHOLDER_APPLICATION_ID = /^(?:com\.example\b|com\.yourcompany\b|com\.mycompany\b)/i;

/** Hosts that only resolve on a developer machine or inside an emulator. */
const DEVELOPMENT_HOSTS = /\b(?:localhost|127\.0\.0\.1|0\.0\.0\.0|10\.0\.2\.2)\b/;

/**
 * Gradle and XML both carry comments that legitimately contain the very strings
 * we search for — Flutter's own template ships
 * `// TODO: Specify your own unique Application ID`. Scanning raw text would
 * report the template's advice as a defect of the generated product.
 */
export function stripGradleComments(source) {
  return String(source ?? '')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

export function stripXmlComments(source) {
  return String(source ?? '').replace(/<!--[\s\S]*?-->/g, ' ');
}

/** Handles both the Groovy (`applicationId "x"`) and Kotlin (`= "x"`) DSL. */
export function parseApplicationId(gradleSource) {
  const match = stripGradleComments(gradleSource).match(/\bapplicationId\s*=?\s*["']([^"']+)["']/);
  return match ? match[1].trim() : null;
}

export function parseNamespace(gradleSource) {
  const match = stripGradleComments(gradleSource).match(/\bnamespace\s*=?\s*["']([^"']+)["']/);
  return match ? match[1].trim() : null;
}

/**
 * `pubspec.yaml` is authoritative for both values: the generated Gradle config
 * delegates with `versionCode = flutter.versionCode`, so re-declaring them
 * anywhere else would create a second truth that silently drifts.
 */
export function parsePubspecVersion(pubspecSource) {
  const match = String(pubspecSource ?? '').match(/^version:\s*["']?([^\s"'+]+)(?:\+(\d+))?["']?\s*$/m);
  if (!match) return { version_name: null, version_code: null };
  return { version_name: match[1], version_code: match[2] ? Number(match[2]) : null };
}

export function parsePubspecField(pubspecSource, field) {
  const match = String(pubspecSource ?? '')
    .match(new RegExp(`^${field}:\\s*["']?(.*?)["']?\\s*$`, 'm'));
  return match ? match[1].trim() : null;
}

/**
 * Reads the product manifest. Only `src/main` carries product identity and
 * permissions; the debug and profile manifests are toolchain-owned.
 */
export function parseAndroidManifest(xmlSource) {
  const xml = stripXmlComments(xmlSource);
  const application = xml.match(/<application\b([\s\S]*?)>/);
  const attributes = application?.[1] ?? '';
  const attribute = name => attributes.match(new RegExp(`android:${name}\\s*=\\s*"([^"]*)"`))?.[1] ?? null;
  const permissions = [...xml.matchAll(/<uses-permission[^>]*android:name\s*=\s*"([^"]+)"/g)]
    .map(match => match[1]);
  const components = [...xml.matchAll(/<(activity|service|receiver|provider)\b([\s\S]*?)(?:\/>|>)/g)]
    .map(match => ({
      type: match[1],
      name: match[2].match(/android:name\s*=\s*"([^"]*)"/)?.[1] ?? null,
      exported: match[2].match(/android:exported\s*=\s*"([^"]*)"/)?.[1] === 'true',
    }));
  return {
    label: attribute('label'),
    icon: attribute('icon'),
    permissions: [...new Set(permissions)].sort(),
    components,
    exported_components: components.filter(component => component.exported),
  };
}

/**
 * Reports what the release build type is configured to sign with. Flutter's
 * template deliberately signs release builds with the debug key so
 * `flutter run --release` works, which is fine for sideloading and is NOT store
 * distribution. This function never claims a signature was verified — it reads
 * configuration, nothing more.
 */
export function detectSigningState(gradleSource) {
  const source = stripGradleComments(gradleSource);
  const release = source.match(/\brelease\s*\{([\s\S]*?)\n\s*\}/);
  const block = release?.[1] ?? '';
  const configured = block.match(/signingConfig\s*=?\s*signingConfigs\.(?:getByName\(\s*["'](\w+)["']\s*\)|(\w+))/);
  const name = configured?.[1] ?? configured?.[2] ?? null;
  if (name === 'debug') {
    return {
      state: 'debug_signing',
      release_config: false,
      details: 'Release derlemesi Flutter şablonunun debug anahtarıyla imzalanıyor. '
        + 'Sideload/harici test için yeterlidir; mağaza dağıtımı için geçerli değildir.',
    };
  }
  if (name) {
    return {
      state: 'release_config_referenced',
      release_config: true,
      details: `Release derlemesi "${name}" signingConfig'ini kullanıyor. `
        + 'Yapılandırma okundu; imzanın kendisi doğrulanmadı.',
    };
  }
  return {
    state: 'unspecified',
    release_config: false,
    details: 'Release build type için signingConfig bulunamadı; Gradle varsayılanı geçerli olur.',
  };
}

const dartFiles = root => (fs.existsSync(root)
  ? fs.readdirSync(root, { withFileTypes: true }).flatMap(entry => {
    const absolute = path.join(root, entry.name);
    if (entry.isDirectory()) return dartFiles(absolute);
    return entry.isFile() && entry.name.endsWith('.dart') && !/\.(?:g|freezed)\.dart$/i.test(entry.name)
      ? [absolute] : [];
  })
  : []);

/**
 * Narrow on purpose: only product code under `lib/`, only after comments are
 * removed. A build that talks to localhost cannot serve an external user, but a
 * source-wide grep would flag documentation and test fixtures and make the whole
 * report untrustworthy.
 */
export function findDevelopmentEndpoints(workspace) {
  return dartFiles(path.join(workspace, 'lib')).flatMap(file => {
    const source = fs.readFileSync(file, 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, ' ')
      .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
    return source.split(/\r?\n/).flatMap((line, index) => (DEVELOPMENT_HOSTS.test(line)
      ? [{
        file: path.relative(workspace, file).replaceAll('\\', '/'),
        line: index + 1,
        match: line.trim().slice(0, 160),
      }] : []));
  });
}

/** Launcher icon resources the manifest's `android:icon` reference resolves to. */
export function findLauncherIcons(workspace, iconReference) {
  const match = String(iconReference ?? '').match(/^@(mipmap|drawable)\/(\w+)$/);
  if (!match) return [];
  const [, kind, name] = match;
  const resourceRoot = path.join(workspace, 'android', 'app', 'src', 'main', 'res');
  if (!fs.existsSync(resourceRoot)) return [];
  return fs.readdirSync(resourceRoot, { withFileTypes: true })
    .filter(entry => entry.isDirectory() && entry.name.startsWith(kind))
    .flatMap(entry => fs.readdirSync(path.join(resourceRoot, entry.name))
      .filter(file => file.replace(/\.\w+$/, '') === name)
      .map(file => ({
        density: entry.name,
        path: `android/app/src/main/res/${entry.name}/${file}`,
        size_bytes: fs.statSync(path.join(resourceRoot, entry.name, file)).size,
      })));
}

const read = (workspace, relative) => {
  const filePath = path.join(workspace, relative);
  return fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : null;
};

/**
 * Everything the report knows before a build runs: what the spec asked for
 * (desired) and what the generated project actually declares (observed).
 */
export function collectReleaseIdentity(workspace, specContent) {
  const { metadata } = parseSpec(specContent);
  const gradlePath = GRADLE_FILES.find(candidate => fs.existsSync(path.join(workspace, candidate))) ?? null;
  const gradle = gradlePath ? read(workspace, gradlePath) : null;
  const manifestSource = read(workspace, MAIN_MANIFEST);
  const pubspec = read(workspace, 'pubspec.yaml');
  const manifest = manifestSource ? parseAndroidManifest(manifestSource) : null;
  const version = parsePubspecVersion(pubspec);
  return {
    desired: {
      display_name: metadata.project_name?.trim() || null,
      application_id: metadata.package_name?.trim() || null,
      version_name: metadata.version_name?.trim() || null,
      version_code: metadata.version_code ? Number(metadata.version_code) : null,
      short_description: metadata.short_description?.trim() || null,
      release_notes: metadata.release_notes?.trim() || null,
    },
    observed: {
      display_name: manifest?.label ?? null,
      application_id: gradle ? parseApplicationId(gradle) : null,
      namespace: gradle ? parseNamespace(gradle) : null,
      version_name: version.version_name,
      version_code: version.version_code,
      description: pubspec ? parsePubspecField(pubspec, 'description') : null,
    },
    manifest,
    signing: gradle ? detectSigningState(gradle) : {
      state: 'unknown', release_config: false, details: 'Gradle yapılandırması bulunamadı.',
    },
    sources: { gradle: gradlePath, manifest: manifestSource ? MAIN_MANIFEST : null, pubspec: pubspec ? 'pubspec.yaml' : null },
  };
}

const check = (id, severity, status, title, details, evidence = null) => ({
  id, severity, status, title, details, ...(evidence === null ? {} : { evidence }),
});

/**
 * Static checks. A blocker is a mechanically verifiable fact that makes the
 * build unusable or misidentified for an external user; a warning is real but
 * does not stop you handing the APK to a tester; info records facts without
 * judging them. Warnings never change the status.
 */
export function evaluateStaticChecks(identity, endpoints, icons) {
  const { desired, observed, manifest, signing } = identity;
  const checks = [];

  const applicationId = observed.application_id;
  checks.push(applicationId && /^[a-z][\w]*(\.[a-z0-9][\w]*)+$/i.test(applicationId)
    ? check('application_id', 'blocker', 'PASS', 'Uygulama kimliği geçerli', applicationId)
    : check('application_id', 'blocker', 'FAIL', 'Uygulama kimliği geçersiz veya okunamadı',
      applicationId
        ? `"${applicationId}" geçerli bir Android application id değil.`
        : 'android/app/build.gradle[.kts] içinde applicationId bulunamadı.'));

  if (applicationId) {
    checks.push(PLACEHOLDER_APPLICATION_ID.test(applicationId)
      ? check('application_id_placeholder', 'blocker', 'FAIL', 'Uygulama kimliği örnek/şablon değeri',
        `"${applicationId}" örnek bir kimlik. Gerçek kullanıcıya dağıtılan bir yapı kendi kimliğini taşımalıdır.`)
      : check('application_id_placeholder', 'blocker', 'PASS', 'Uygulama kimliği örnek değeri değil', applicationId));
  }

  if (desired.application_id) {
    checks.push(desired.application_id === applicationId
      ? check('application_id_matches_spec', 'blocker', 'PASS', 'Kimlik spec ile uyuşuyor', applicationId)
      : check('application_id_matches_spec', 'blocker', 'FAIL', 'Kimlik spec ile uyuşmuyor',
        `PROJECT_SPEC "${desired.application_id}" istiyor, derleme "${applicationId ?? 'yok'}" kullanıyor.`));
  }

  const label = observed.display_name;
  const labelUnresolved = label && (/\$\{/.test(label) || /^(?:TODO|TBD|BELİRLENECEK|UYGULAMA ADI|MOBİL UYGULAMA ADI)$/i.test(label.trim()));
  checks.push(label && !labelUnresolved
    ? check('display_name', 'blocker', 'PASS', 'Uygulama adı tanımlı', label)
    : check('display_name', 'blocker', 'FAIL', 'Uygulama adı eksik veya çözülmemiş',
      label ? `AndroidManifest android:label değeri "${label}" çözülmemiş bir yer tutucu.`
        : 'AndroidManifest içinde android:label bulunamadı.'));

  const versionValid = Boolean(observed.version_name)
    && /^\d+\.\d+\.\d+/.test(observed.version_name)
    && Number.isInteger(observed.version_code) && observed.version_code >= 1;
  checks.push(versionValid
    ? check('version', 'blocker', 'PASS', 'Sürüm çözülebilir ve geçerli',
      `${observed.version_name} (versionCode ${observed.version_code})`)
    : check('version', 'blocker', 'FAIL', 'Sürüm çözülemedi',
      `pubspec.yaml "version: <ad>+<kod>" biçiminde olmalı; okunan: ${observed.version_name ?? 'yok'}`
      + `+${observed.version_code ?? 'yok'}`));

  if (desired.version_name || desired.version_code !== null) {
    const matches = (!desired.version_name || desired.version_name === observed.version_name)
      && (desired.version_code === null || desired.version_code === observed.version_code);
    checks.push(matches
      ? check('version_matches_spec', 'warning', 'PASS', 'Sürüm spec ile uyuşuyor', observed.version_name)
      : check('version_matches_spec', 'warning', 'WARN', 'Sürüm spec ile uyuşmuyor',
        `PROJECT_SPEC ${desired.version_name ?? '—'}+${desired.version_code ?? '—'} istiyor, `
        + `pubspec ${observed.version_name ?? '—'}+${observed.version_code ?? '—'} bildiriyor. `
        + 'pubspec.yaml yetkilidir.'));
  }

  const description = observed.description;
  checks.push(description && !SCAFFOLD_DESCRIPTION.test(description)
    ? check('product_description', 'warning', 'PASS', 'Ürün açıklaması yazılmış', description)
    : check('product_description', 'warning', 'WARN', 'Ürün açıklaması iskelet varsayılanı',
      description
        ? `pubspec.yaml açıklaması hâlâ "${description}". Dağıtımda ürünü tanıtan bir metin gerekir.`
        : 'pubspec.yaml içinde description bulunamadı.'));

  checks.push(icons.length && icons.every(icon => icon.size_bytes > 0)
    ? check('launcher_icon', 'blocker', 'PASS', 'Uygulama simgesi yapılandırılmış',
      `${manifest?.icon ?? '?'} → ${icons.length} yoğunluk`, icons)
    : check('launcher_icon', 'blocker', 'FAIL', 'Uygulama simgesi eksik',
      manifest?.icon
        ? `android:icon="${manifest.icon}" hiçbir kaynak dosyasına çözülmüyor.`
        : 'AndroidManifest içinde android:icon bulunamadı.'));

  checks.push(endpoints.length === 0
    ? check('development_endpoints', 'blocker', 'PASS', 'Geliştirme adresi bulunmadı',
      'lib/ altında localhost/loopback adresi yok.')
    : check('development_endpoints', 'blocker', 'FAIL', 'Üründe geliştirme adresi kaldı',
      `${endpoints.length} yerde yalnız geliştirme makinesinde çözülen adres var; harici kullanıcıda çalışmaz.`,
      endpoints));

  checks.push(signing.state === 'debug_signing' || signing.state === 'unspecified'
    ? check('signing', 'warning', 'WARN', 'Mağaza imzası doğrulanmadı', signing.details)
    : check('signing', 'warning', 'PASS', 'Release signingConfig tanımlı', signing.details));

  checks.push(check('manifest_permissions', 'info', 'INFO', 'İstenen izinler',
    manifest?.permissions.length ? manifest.permissions.join(', ') : 'Ürün manifesti izin istemiyor.',
    manifest?.permissions ?? []));

  checks.push(check('exported_components', 'info', 'INFO', 'Dışa açık bileşenler',
    manifest?.exported_components.length
      ? manifest.exported_components.map(item => `${item.type} ${item.name}`).join(', ')
      : 'Dışa açık bileşen yok.',
    manifest?.exported_components ?? []));

  return checks;
}

/** SHA-256 of the produced file, so a distributed build can be identified later. */
export function describeArtifact(workspace, relativePath, buildMode = 'release') {
  const absolute = path.join(workspace, relativePath);
  if (!fs.existsSync(absolute) || !fs.statSync(absolute).isFile()) return null;
  const contents = fs.readFileSync(absolute);
  return {
    type: 'apk',
    build_mode: buildMode,
    path: relativePath,
    size_bytes: contents.length,
    sha256: crypto.createHash('sha256').update(contents).digest('hex'),
  };
}

const hasBlockingFailure = checks =>
  checks.some(entry => entry.severity === 'blocker' && entry.status === 'FAIL');

const summarize = (checks, severity, status) => checks
  .filter(entry => entry.severity === severity && entry.status === status)
  .map(({ id, title, details }) => ({ id, title, details }));

/**
 * Runs the whole evaluation. The release build is injected so the evaluator can
 * be exercised without a Flutter toolchain, and so a project whose identity is
 * already broken does not pay for a multi-minute Gradle build first.
 */
export async function runReleaseReadiness({
  workspace, specContent, buildRelease, artifactPath = RELEASE_ARTIFACT_PATH,
}) {
  const identity = collectReleaseIdentity(workspace, specContent);
  const endpoints = findDevelopmentEndpoints(workspace);
  const icons = findLauncherIcons(workspace, identity.manifest?.icon);
  const checks = evaluateStaticChecks(identity, endpoints, icons);

  let artifact = null;
  if (hasBlockingFailure(checks)) {
    checks.push(check('release_build', 'blocker', 'SKIPPED', 'Release derlemesi çalıştırılmadı',
      'Kimlik/yapılandırma engelleri giderilmeden release derlemesi denenmedi.'));
    checks.push(check('release_artifact', 'blocker', 'SKIPPED', 'Release artefaktı üretilmedi',
      'Derleme çalıştırılmadığı için artefakt yok.'));
  } else {
    const build = await buildRelease();
    const failed = build?.status !== 0;
    checks.push(failed
      ? check('release_build', 'blocker', 'FAIL', 'Release derlemesi başarısız',
        [`exit ${build?.status ?? '—'}`, [build?.stdout, build?.stderr, build?.error?.message]
          .filter(Boolean).join('\n').trim().slice(-4000)].filter(Boolean).join('\n'))
      : check('release_build', 'blocker', 'PASS', 'Release derlemesi tamamlandı',
        `flutter build apk --release · exit ${build.status}`));

    artifact = failed ? null : describeArtifact(workspace, artifactPath);
    if (!failed) {
      checks.push(artifact && artifact.size_bytes > 0
        ? check('release_artifact', 'blocker', 'PASS', 'Release artefaktı üretildi',
          `${artifact.path} · ${artifact.size_bytes} bayt · sha256 ${artifact.sha256.slice(0, 16)}…`)
        : check('release_artifact', 'blocker', 'FAIL', 'Release artefaktı bulunamadı veya boş',
          artifact ? `${artifact.path} 0 bayt.` : `${artifactPath} üretilmedi.`));
      if (artifact && artifact.size_bytes === 0) artifact = null;
    } else {
      checks.push(check('release_artifact', 'blocker', 'SKIPPED', 'Release artefaktı üretilmedi',
        'Derleme başarısız olduğu için artefakt yok.'));
    }
  }

  return {
    version: 1,
    profile: 'flutter_mobile',
    generated_at: new Date().toISOString(),
    status: hasBlockingFailure(checks) ? 'BLOCKED' : 'READY',
    identity: {
      application_id: identity.observed.application_id,
      display_name: identity.observed.display_name,
      version_name: identity.observed.version_name,
      version_code: identity.observed.version_code,
      desired: identity.desired,
      sources: identity.sources,
    },
    artifact,
    signing: {
      ...identity.signing,
      // Never claimed, only measured: this slice reads configuration and does
      // not verify a signature or any store requirement.
      store_distribution_verified: false,
      sideload_ready: Boolean(artifact),
    },
    manifest: identity.manifest
      ? {
        label: identity.manifest.label,
        icon: identity.manifest.icon,
        permissions: identity.manifest.permissions,
        exported_components: identity.manifest.exported_components,
      }
      : null,
    checks,
    blockers: summarize(checks, 'blocker', 'FAIL'),
    warnings: summarize(checks, 'warning', 'WARN'),
  };
}

export function renderReleaseReadinessJson(report) {
  return `${JSON.stringify(report, null, 2)}\n`;
}

export function writeReleaseReadinessReport(workspace, report) {
  fs.writeFileSync(
    path.join(workspace, 'RELEASE_READINESS.json'), renderReleaseReadinessJson(report), 'utf8',
  );
  return report;
}
