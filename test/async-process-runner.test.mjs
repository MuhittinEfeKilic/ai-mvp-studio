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

/** Child stub whose close/exit timing the test drives explicitly. */
class ScriptedChild extends EventEmitter {
  constructor(pid = 4242) {
    super();
    this.pid = pid;
    this.exitCode = null;
    this.signalCode = null;
    this.killCalls = [];
    this.stdout = new EventEmitter();
    this.stderr = new EventEmitter();
  }

  kill(signal) {
    this.killCalls.push(signal);
    return true;
  }
}

/**
 * Reproduces the exact ordering deterministically instead of hoping for it: the
 * timeout fires, termination is in flight, and the process closes on its own
 * with a real exit code before the timeout has settled. The full suite hit this
 * about once in eight runs, which is exactly the kind of result that must not
 * depend on scheduling.
 */
test('a close arriving while the timeout kills the tree cannot undo the timeout', async () => {
  const child = new ScriptedChild();
  let taskkill = null;
  const spawnProcess = command => {
    if (String(command).startsWith('taskkill')) {
      taskkill = new EventEmitter();
      return taskkill;
    }
    return child;
  };
  const pending = runProcess('slow.exe', [], {
    timeout: 20, killGraceMs: 5_000, platform: 'win32', spawnProcess,
  });
  child.stdout.emit('data', 'kısmi çıktı');
  child.stderr.emit('data', 'kısmi hata');
  while (!taskkill) await new Promise(resolve => setTimeout(resolve, 5));

  // The race: the process dies by itself while taskkill is still running.
  child.exitCode = 1;
  child.emit('close', 1, null);
  taskkill.emit('close', 0);

  const result = await pending;
  assert.equal(result.timedOut, true);
  assert.equal(result.status, null, 'timeout sonucu gerçek exit koduna dönüştü');
  assert.equal(result.signal, 'SIGKILL');
  assert.match(result.error.message, /PROCESS_TIMEOUT/);
  assert.match(result.stderr, /PROCESS_TIMEOUT/);
  // Output collected before the timeout survives, and the late exit is kept for
  // diagnostics without ever becoming the result.
  assert.equal(result.stdout, 'kısmi çıktı');
  assert.match(result.stderr, /kısmi hata/);
  assert.deepEqual(result.exit_during_termination, { event: 'close', status: 1, signal: null });
  assert.equal(result.termination.method, 'taskkill');
});

test('an error arriving during termination also cannot undo the timeout', async () => {
  const child = new ScriptedChild();
  let taskkill = null;
  const spawnProcess = command => {
    if (String(command).startsWith('taskkill')) {
      taskkill = new EventEmitter();
      return taskkill;
    }
    return child;
  };
  const pending = runProcess('slow.exe', [], {
    timeout: 20, killGraceMs: 5_000, platform: 'win32', spawnProcess,
  });
  while (!taskkill) await new Promise(resolve => setTimeout(resolve, 5));
  child.emit('error', new Error('ECONNRESET'));
  taskkill.emit('close', 0);

  const result = await pending;
  assert.equal(result.timedOut, true);
  assert.match(result.error.message, /PROCESS_TIMEOUT/);
  assert.equal(result.exit_during_termination.event, 'error');
});

test('a process that finishes before its timeout keeps its real exit code', async () => {
  const child = new ScriptedChild();
  const pending = runProcess('quick.exe', [], {
    timeout: 5_000, platform: 'win32', spawnProcess: () => child,
  });
  child.stdout.emit('data', 'tamam');
  child.emit('close', 2, null);

  const result = await pending;
  assert.equal(result.timedOut, false);
  assert.equal(result.status, 2);
  assert.equal(result.stdout, 'tamam');
  assert.equal(result.error, undefined);
  assert.equal(result.exit_during_termination, undefined);
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
