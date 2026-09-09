import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  RELEASE_ARTIFACT_PATH, collectReleaseIdentity, describeArtifact, detectSigningState,
  findDevelopmentEndpoints, findLauncherIcons, parseAndroidManifest, parseApplicationId,
  parsePubspecVersion, runReleaseReadiness,
} from '../src/release-readiness.mjs';

const SPEC = [
  '---',
  'project_name: "Akış Cep"',
  'package_name: "com.aimvpstudio.akiscep"',
  'status: "approved"',
  '---',
  '',
  '# Ürün Özeti',
].join('\n');

/**
 * Builds the same file layout `flutter create` produces, including the template
 * comments that a naive scanner would misread as product defects.
 */
function createProject({
  applicationId = 'com.aimvpstudio.akiscep',
  label = 'Akış Cep',
  version = '1.0.0+1',
  description = 'Enerjine göre günlük plan.',
  icon = '@mipmap/ic_launcher',
  densities = ['mipmap-hdpi', 'mipmap-mdpi', 'mipmap-xhdpi'],
  releaseSigning = 'signingConfig = signingConfigs.getByName("debug")',
  permissions = [],
  dartSource = "const title = 'Akış Cep';\n",
} = {}) {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'release-readiness-'));
  const write = (relative, contents) => {
    fs.mkdirSync(path.dirname(path.join(workspace, relative)), { recursive: true });
    fs.writeFileSync(path.join(workspace, relative), contents, 'utf8');
  };
  write('pubspec.yaml', [
    'name: akiscep',
    `description: "${description}"`,
    'publish_to: "none"',
    `version: ${version}`,
    '',
  ].join('\n'));
  write('android/app/build.gradle.kts', [
    'android {',
    `    namespace = "${applicationId}"`,
    '    defaultConfig {',
    '        // TODO: Specify your own unique Application ID (https://developer.android.com/studio/build/application-id.html).',
    `        applicationId = "${applicationId}"`,
    '        versionCode = flutter.versionCode',
    '    }',
    '    buildTypes {',
    '        release {',
    '            // TODO: Add your own signing config for the release build.',
    `            ${releaseSigning}`,
    '        }',
    '    }',
    '}',
    '',
  ].join('\n'));
  write('android/app/src/main/AndroidManifest.xml', [
    '<manifest xmlns:android="http://schemas.android.com/apk/res/android">',
    ...permissions.map(name => `    <uses-permission android:name="${name}"/>`),
    '    <!-- The comment below mentions localhost and com.example on purpose. -->',
    `    <application android:label="${label}" android:name="\${applicationName}" android:icon="${icon}">`,
    '        <activity android:name=".MainActivity" android:exported="true">',
    '            <intent-filter>',
    '                <action android:name="android.intent.action.MAIN"/>',
    '            </intent-filter>',
    '        </activity>',
    '        <service android:name=".SyncService" android:exported="false"/>',
    '    </application>',
    '</manifest>',
    '',
  ].join('\n'));
  write('lib/main.dart', dartSource);
  for (const density of densities) {
    write(`android/app/src/main/res/${density}/ic_launcher.png`, 'icon-bytes');
  }
  return workspace;
}

const buildsArtifact = (workspace, contents = 'release-apk-bytes') => async () => {
  fs.mkdirSync(path.join(workspace, path.dirname(RELEASE_ARTIFACT_PATH)), { recursive: true });
  fs.writeFileSync(path.join(workspace, RELEASE_ARTIFACT_PATH), contents);
  return { status: 0, stdout: 'Built build/app/outputs/flutter-apk/app-release.apk', stderr: '' };
};

const checkOf = (report, id) => report.checks.find(entry => entry.id === id);

test('gradle, manifest and pubspec identity is read past the template comments', () => {
  const workspace = createProject();
  const identity = collectReleaseIdentity(workspace, SPEC);
  assert.equal(identity.observed.application_id, 'com.aimvpstudio.akiscep');
  assert.equal(identity.observed.display_name, 'Akış Cep');
  assert.equal(identity.observed.version_name, '1.0.0');
  assert.equal(identity.observed.version_code, 1);
  assert.equal(identity.desired.application_id, 'com.aimvpstudio.akiscep');
  assert.equal(identity.desired.display_name, 'Akış Cep');
  // Flutter's own template carries `// TODO: Specify your own unique Application
  // ID` and the word com.example; reading it raw would report the advice as a defect.
  assert.equal(identity.sources.gradle, 'android/app/build.gradle.kts');
});

test('both Gradle DSL dialects and the version suffix are parsed', () => {
  assert.equal(parseApplicationId('applicationId = "com.a.b"'), 'com.a.b');
  assert.equal(parseApplicationId('    applicationId "com.a.b"'), 'com.a.b');
  assert.equal(parseApplicationId('// applicationId "com.example.ignored"'), null);
  assert.deepEqual(parsePubspecVersion('version: 2.3.4+17\n'), { version_name: '2.3.4', version_code: 17 });
  assert.deepEqual(parsePubspecVersion('version: 2.3.4\n'), { version_name: '2.3.4', version_code: null });
  assert.deepEqual(parsePubspecVersion('name: x\n'), { version_name: null, version_code: null });
});

test('manifest parsing records permissions, icon and exported components only', () => {
  const workspace = createProject({ permissions: ['android.permission.INTERNET', 'android.permission.CAMERA'] });
  const manifest = parseAndroidManifest(
    fs.readFileSync(path.join(workspace, 'android/app/src/main/AndroidManifest.xml'), 'utf8'),
  );
  assert.deepEqual(manifest.permissions, ['android.permission.CAMERA', 'android.permission.INTERNET']);
  assert.equal(manifest.label, 'Akış Cep');
  assert.equal(manifest.icon, '@mipmap/ic_launcher');
  assert.deepEqual(manifest.exported_components.map(item => item.name), ['.MainActivity']);
  assert.equal(manifest.components.length, 2);
});

test('signing configuration is reported truthfully and never as store-ready', () => {
  assert.equal(detectSigningState('buildTypes {\n  release {\n    signingConfig = signingConfigs.getByName("debug")\n  }\n}').state, 'debug_signing');
  assert.equal(detectSigningState('buildTypes {\n  release {\n    signingConfig signingConfigs.release\n  }\n}').state, 'release_config_referenced');
  assert.equal(detectSigningState('buildTypes {\n  release {\n    minifyEnabled false\n  }\n}').state, 'unspecified');
});

test('development endpoints are found in product code but not in comments', () => {
  const withEndpoint = createProject({
    dartSource: [
      "// Dev note: we used to call http://localhost:8080 here.",
      "const api = 'http://10.0.2.2:3000/routines';",
      '',
    ].join('\n'),
  });
  const found = findDevelopmentEndpoints(withEndpoint);
  assert.equal(found.length, 1, 'yorumdaki adres de sayıldı');
  assert.equal(found[0].line, 2);
  assert.match(found[0].match, /10\.0\.2\.2/);

  const clean = createProject({ dartSource: "// http://localhost is only mentioned here.\nconst x = 1;\n" });
  assert.deepEqual(findDevelopmentEndpoints(clean), []);
});

test('launcher icons resolve through the manifest reference', () => {
  const workspace = createProject({ densities: ['mipmap-hdpi', 'mipmap-xxhdpi'] });
  const icons = findLauncherIcons(workspace, '@mipmap/ic_launcher');
  assert.deepEqual(icons.map(icon => icon.density).sort(), ['mipmap-hdpi', 'mipmap-xxhdpi']);
  assert.ok(icons.every(icon => icon.size_bytes > 0));
  assert.deepEqual(findLauncherIcons(workspace, '@mipmap/missing'), []);
  assert.deepEqual(findLauncherIcons(workspace, null), []);
});

test('a release-ready project reports READY with a checksummed artifact', async () => {
  const workspace = createProject();
  const report = await runReleaseReadiness({
    workspace, specContent: SPEC, buildRelease: buildsArtifact(workspace),
  });
  assert.equal(report.status, 'READY');
  assert.deepEqual(report.blockers, []);
  assert.equal(report.identity.application_id, 'com.aimvpstudio.akiscep');
  assert.equal(report.identity.version_name, '1.0.0');
  assert.equal(report.artifact.path, RELEASE_ARTIFACT_PATH);
  assert.equal(report.artifact.build_mode, 'release');
  assert.equal(report.artifact.size_bytes, 'release-apk-bytes'.length);
  // Checksum is computed from the real bytes, not declared by the builder.
  assert.equal(report.artifact.sha256,
    crypto.createHash('sha256').update('release-apk-bytes').digest('hex'));
  // Signing is read, never asserted as verified.
  assert.equal(report.signing.state, 'debug_signing');
  assert.equal(report.signing.store_distribution_verified, false);
  assert.equal(report.signing.sideload_ready, true);
});

test('a warning never turns a passing evaluation into a blocked one', async () => {
  // Scaffold description plus debug signing: two real warnings, no blocker.
  const workspace = createProject({ description: 'A new Flutter project.' });
  const report = await runReleaseReadiness({
    workspace, specContent: SPEC, buildRelease: buildsArtifact(workspace),
  });
  assert.equal(report.status, 'READY');
  assert.deepEqual(report.blockers, []);
  assert.deepEqual(report.warnings.map(item => item.id).sort(), ['product_description', 'signing']);
  assert.equal(checkOf(report, 'product_description').severity, 'warning');
});

test('a placeholder application id blocks and skips the release build', async () => {
  const workspace = createProject({ applicationId: 'com.example.akiscep' });
  let built = false;
  const report = await runReleaseReadiness({
    workspace,
    specContent: SPEC,
    buildRelease: async () => { built = true; return { status: 0 }; },
  });
  assert.equal(report.status, 'BLOCKED');
  assert.equal(built, false, 'engelli projede release derlemesi çalıştırıldı');
  assert.equal(report.artifact, null);
  const ids = report.blockers.map(item => item.id);
  assert.ok(ids.includes('application_id_placeholder'));
  // The spec asked for a different id, so the mismatch is reported as well.
  assert.ok(ids.includes('application_id_matches_spec'));
  assert.equal(checkOf(report, 'release_build').status, 'SKIPPED');
});

test('missing application identity blocks without a Gradle file', async () => {
  const workspace = createProject();
  fs.rmSync(path.join(workspace, 'android/app/build.gradle.kts'));
  const report = await runReleaseReadiness({
    workspace, specContent: SPEC, buildRelease: buildsArtifact(workspace),
  });
  assert.equal(report.status, 'BLOCKED');
  assert.equal(checkOf(report, 'application_id').status, 'FAIL');
  assert.equal(report.signing.state, 'unknown');
});

test('a failing release build blocks and records the diagnostics', async () => {
  const workspace = createProject();
  const report = await runReleaseReadiness({
    workspace,
    specContent: SPEC,
    buildRelease: async () => ({ status: 1, stdout: '', stderr: 'FAILURE: Execution failed for task :app:lintVitalRelease' }),
  });
  assert.equal(report.status, 'BLOCKED');
  assert.equal(report.artifact, null);
  assert.equal(checkOf(report, 'release_build').status, 'FAIL');
  assert.match(checkOf(report, 'release_build').details, /lintVitalRelease/);
  assert.equal(checkOf(report, 'release_artifact').status, 'SKIPPED');
  assert.deepEqual(report.blockers.map(item => item.id), ['release_build']);
});

test('a build that reports success without producing an artifact is blocked', async () => {
  const workspace = createProject();
  const report = await runReleaseReadiness({
    workspace, specContent: SPEC, buildRelease: async () => ({ status: 0, stdout: 'done' }),
  });
  assert.equal(report.status, 'BLOCKED');
  assert.equal(checkOf(report, 'release_build').status, 'PASS');
  assert.equal(checkOf(report, 'release_artifact').status, 'FAIL');
  assert.equal(report.artifact, null);
  assert.equal(report.signing.sideload_ready, false);
});

test('an empty artifact is blocked instead of being reported as shippable', async () => {
  const workspace = createProject();
  const report = await runReleaseReadiness({
    workspace, specContent: SPEC, buildRelease: buildsArtifact(workspace, ''),
  });
  assert.equal(report.status, 'BLOCKED');
  assert.equal(checkOf(report, 'release_artifact').status, 'FAIL');
  assert.equal(report.artifact, null);
});

test('a development endpoint in product code blocks distribution', async () => {
  const workspace = createProject({ dartSource: "const api = 'http://127.0.0.1:8080/api';\n" });
  const report = await runReleaseReadiness({
    workspace, specContent: SPEC, buildRelease: buildsArtifact(workspace),
  });
  assert.equal(report.status, 'BLOCKED');
  assert.deepEqual(report.blockers.map(item => item.id), ['development_endpoints']);
  assert.equal(checkOf(report, 'development_endpoints').evidence[0].file, 'lib/main.dart');
});

test('an unresolved display name and a broken icon reference block', async () => {
  const workspace = createProject({ label: 'MOBİL UYGULAMA ADI', icon: '@mipmap/nothing' });
  const report = await runReleaseReadiness({
    workspace, specContent: SPEC, buildRelease: buildsArtifact(workspace),
  });
  assert.equal(report.status, 'BLOCKED');
  const ids = report.blockers.map(item => item.id);
  assert.ok(ids.includes('display_name'));
  assert.ok(ids.includes('launcher_icon'));
});

test('an unparseable version blocks and a spec version mismatch only warns', async () => {
  const blocked = createProject({ version: 'nightly' });
  const blockedReport = await runReleaseReadiness({
    workspace: blocked, specContent: SPEC, buildRelease: buildsArtifact(blocked),
  });
  assert.equal(blockedReport.status, 'BLOCKED');
  assert.equal(checkOf(blockedReport, 'version').status, 'FAIL');

  const drifted = createProject({ version: '1.4.0+9' });
  const specWithVersion = SPEC.replace('status: "approved"', 'version_name: "2.0.0"\nversion_code: "12"\nstatus: "approved"');
  const driftedReport = await runReleaseReadiness({
    workspace: drifted, specContent: specWithVersion, buildRelease: buildsArtifact(drifted),
  });
  // pubspec.yaml stays authoritative, so drift is a warning, not a blocker.
  assert.equal(driftedReport.status, 'READY');
  assert.ok(driftedReport.warnings.some(item => item.id === 'version_matches_spec'));
  assert.equal(driftedReport.identity.version_name, '1.4.0');
  assert.equal(driftedReport.identity.desired.version_name, '2.0.0');
});

test('artifact description is null for a missing file and exact for a real one', () => {
  const workspace = createProject();
  assert.equal(describeArtifact(workspace, RELEASE_ARTIFACT_PATH), null);
  fs.mkdirSync(path.join(workspace, path.dirname(RELEASE_ARTIFACT_PATH)), { recursive: true });
  fs.writeFileSync(path.join(workspace, RELEASE_ARTIFACT_PATH), 'abc');
  const artifact = describeArtifact(workspace, RELEASE_ARTIFACT_PATH);
  assert.equal(artifact.size_bytes, 3);
  assert.equal(artifact.sha256, crypto.createHash('sha256').update('abc').digest('hex'));
});

test('informational checks record manifest facts without judging them', async () => {
  const workspace = createProject({ permissions: ['android.permission.INTERNET'] });
  const report = await runReleaseReadiness({
    workspace, specContent: SPEC, buildRelease: buildsArtifact(workspace),
  });
  assert.equal(report.status, 'READY');
  const permissions = checkOf(report, 'manifest_permissions');
  assert.equal(permissions.severity, 'info');
  assert.deepEqual(permissions.evidence, ['android.permission.INTERNET']);
  const exported = checkOf(report, 'exported_components');
  assert.equal(exported.severity, 'info');
  assert.deepEqual(exported.evidence.map(item => item.name), ['.MainActivity']);
  // Info entries never appear in blockers or warnings.
  assert.equal(report.blockers.length, 0);
  assert.ok(!report.warnings.some(item => item.id === 'manifest_permissions'));
});
