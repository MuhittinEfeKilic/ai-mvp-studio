import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { CodexRunner } from '../src/codex-runner.mjs';
import { classifyInterruption } from '../src/orchestrator.mjs';

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

test('a Codex stop reported on its event stream is not flattened into an exit code', async () => {
  // The measured shape: Codex answers the usage limit through its own JSONL
  // stream and writes nothing to stderr, then exits 1. Reading only stderr left
  // the runner saying "Codex 1 çıkış koduyla sonlandı.", which matches no pause
  // pattern — so a project that only had to wait was parked as `failed`.
  const limit = "You've hit your usage limit. Upgrade to Pro or try again at 9:57 PM.";
  const { workspace, runner } = scriptRunner([
    `const message = ${JSON.stringify(limit)};`,
    'process.stdout.write(JSON.stringify({ type: "error", message }) + "\\n");',
    'process.stdout.write(JSON.stringify({ type: "turn.failed", error: { message } }) + "\\n");',
    'process.exit(1);',
  ].join('\n'));

  const events = [];
  await assert.rejects(
    runner.run({ workspace, prompt: 'merhaba', onEvent: type => events.push(type) }),
    error => {
      assert.match(error.message, /usage limit/i);
      assert.doesNotMatch(error.message, /çıkış koduyla sonlandı/);
      // And the whole point: the orchestrator can now see what kind of stop it was.
      assert.equal(classifyInterruption(error.message), 'usage');
      return true;
    },
  );
  assert.ok(events.includes('error'), 'hata olayı iletilmedi');
});

test('a context-window stop is classified as a context pause, not a failure', async () => {
  const { workspace, runner } = scriptRunner([
    'const message = "Your input exceeds the context window of this model.";',
    'process.stdout.write(JSON.stringify({ type: "turn.failed", error: { message } }) + "\\n");',
    'process.exit(1);',
  ].join('\n'));
  await assert.rejects(
    runner.run({ workspace, prompt: 'merhaba', onEvent: () => {} }),
    error => {
      assert.equal(classifyInterruption(error.message), 'context');
      return true;
    },
  );
});

test('a genuine crash still reports the exit code and stays a failure', async () => {
  // Nothing on the event stream and nothing on stderr: there is no reason to
  // invent a pause, and the run must not look resumable when it is not.
  const { workspace, runner } = scriptRunner('process.exit(3);\n');
  await assert.rejects(
    runner.run({ workspace, prompt: 'merhaba', onEvent: () => {} }),
    error => {
      assert.match(error.message, /Codex 3 çıkış koduyla sonlandı/);
      assert.equal(classifyInterruption(error.message), null);
      return true;
    },
  );
});

test('stderr is still reported when Codex says nothing on its event stream', async () => {
  const { workspace, runner } = scriptRunner([
    'process.stderr.write("codex: cannot find configuration\\n");',
    'process.exit(2);',
  ].join('\n'));
  await assert.rejects(
    runner.run({ workspace, prompt: 'merhaba', onEvent: () => {} }),
    /cannot find configuration/,
  );
});
