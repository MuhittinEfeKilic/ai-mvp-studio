import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { validateSpec } from '../src/spec-validator.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('Odak Mini example spec is approved and production-ready', () => {
  const spec = fs.readFileSync(path.join(root, 'examples', 'odak-mini', 'PROJECT_SPEC.md'), 'utf8');
  const report = validateSpec(spec);
  assert.equal(report.ready, true, JSON.stringify(report.blocking_issues));
  assert.equal(report.score, 100);
  assert.equal(report.metadata.project_profile, 'flutter_mobile');
  assert.equal(report.metadata.package_name, 'com.aimvpstudio.odakmini');
});
