import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import test from 'node:test';

import { killProcessTree, runProcess } from '../src/async-process-runner.mjs';

test('a hung process times out and releases its caller', async () => {
  const result = await runProcess(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], {
    timeout: 200,
    killGraceMs: 200,
  });
  assert.equal(result.timedOut, true);
  assert.equal(result.status, null);
  assert.match(result.stderr, /PROCESS_TIMEOUT/);
  assert.match(result.error.message, /PROCESS_TIMEOUT/);
});

test('an already exited process needs no termination', async () => {
  const result = await killProcessTree({ exitCode: 0, signalCode: null });
  assert.equal(result.method, 'already-exited');
});

test('Windows taskkill failure falls back to direct SIGKILL', async () => {
  const child = { pid: 42, exitCode: null, signalCode: null, killCalls: [], kill(signal) { this.killCalls.push(signal); return true; } };
  const spawnProcess = () => {
    const killer = new EventEmitter();
    queueMicrotask(() => killer.emit('close', 1));
    return killer;
  };
  const result = await killProcessTree(child, { platform: 'win32', spawnProcess, graceMs: 100 });
  assert.equal(result.method, 'sigkill-fallback');
  assert.deepEqual(child.killCalls, ['SIGKILL']);
});

test('Windows taskkill that never closes still settles with fallback', async () => {
  const child = { pid: 43, exitCode: null, signalCode: null, killed: false, kill() { this.killed = true; return true; } };
  const result = await killProcessTree(child, {
    platform: 'win32', spawnProcess: () => new EventEmitter(), graceMs: 20,
  });
  assert.equal(result.method, 'sigkill-fallback');
  assert.equal(child.killed, true);
});
