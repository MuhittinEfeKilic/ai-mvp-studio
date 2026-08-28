import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { CodexRunner } from '../src/codex-runner.mjs';

function scriptRunner(body, options) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-runner-'));
  const script = path.join(directory, 'fake-codex.js');
  fs.writeFileSync(script, body, 'utf8');
  return { workspace: directory, runner: new CodexRunner(script, options) };
}

test('a hung Codex process is killed and reported as a timeout', async () => {
  // Keeps the event loop alive forever, like a Codex call that never answers.
  const { workspace, runner } = scriptRunner('setInterval(() => {}, 1000);\n', { timeoutMs: 300 });
  const events = [];
  await assert.rejects(
    runner.run({ workspace, prompt: 'merhaba', onEvent: type => events.push(type) }),
    /tamamlanmadı ve süreç sonlandırıldı/,
  );
  assert.ok(events.includes('timeout'), 'timeout olayı bildirilmedi');
});

test('a Codex process that answers in time is not affected by the timeout', async () => {
  const { workspace, runner } = scriptRunner([
    'const event = { type: "item.completed", item: { type: "agent_message", text: "bitti" } };',
    'process.stdout.write(JSON.stringify(event) + "\\n");',
    '',
  ].join('\n'), { timeoutMs: 10_000 });
  const message = await runner.run({ workspace, prompt: 'merhaba', onEvent: () => {} });
  assert.equal(message, 'bitti');
});

test('version lookup gives up instead of hanging forever', async () => {
  const { runner } = scriptRunner('setInterval(() => {}, 1000);\n', { versionTimeoutMs: 300 });
  assert.equal(await runner.version(), null);
});
