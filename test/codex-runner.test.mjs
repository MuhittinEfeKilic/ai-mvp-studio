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

test('a Codex process that exits before reading the prompt fails the run, not the Studio', async () => {
  // Exits immediately and never drains stdin, so writing the prompt breaks the
  // pipe. An unhandled stdin error would take the whole Studio process down.
  const { workspace, runner } = scriptRunner('process.exit(3);\n', { timeoutMs: 10_000 });
  const events = [];
  await assert.rejects(
    // Large enough that the write cannot complete in one buffered chunk.
    runner.run({ workspace, prompt: 'x'.repeat(4 * 1024 * 1024), onEvent: (type, payload) => events.push([type, payload]) }),
    error => {
      assert.match(error.message, /prompt yazılamadı|çıkış koduyla sonlandı/);
      return true;
    },
  );
  assert.ok(events.some(([type]) => type === 'stderr'), 'stdin arızası teşhis edilebilir değil');
  // The Studio is still alive and still running agents, which is the point.
  const survivor = scriptRunner([
    'const event = { type: "item.completed", item: { type: "agent_message", text: "ayakta" } };',
    'process.stdout.write(JSON.stringify(event) + String.fromCharCode(10));',
    '',
  ].join('\n'), { timeoutMs: 10_000 });
  assert.equal(await survivor.runner.run({ workspace: survivor.workspace, prompt: 'merhaba', onEvent: () => {} }), 'ayakta');
});
