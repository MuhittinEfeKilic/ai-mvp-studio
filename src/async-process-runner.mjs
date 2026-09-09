import { spawn } from 'node:child_process';

export const DEFAULT_PROCESS_TIMEOUT_MS = 10 * 60_000;
export const DEFAULT_KILL_GRACE_MS = 2_000;

/** Best-effort process-tree termination that never waits forever. */
export async function killProcessTree(child, {
  platform = process.platform,
  spawnProcess = spawn,
  graceMs = DEFAULT_KILL_GRACE_MS,
} = {}) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return { method: 'already-exited' };
  const directKill = () => {
    try { return child.kill('SIGKILL'); } catch { return false; }
  };
  if (platform !== 'win32' || !child.pid) {
    directKill();
    return { method: 'sigkill' };
  }

  return new Promise(resolve => {
    let settled = false;
    const finish = result => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(result);
    };
    let killer;
    try {
      killer = spawnProcess('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], {
        windowsHide: true, stdio: 'ignore',
      });
    } catch (error) {
      directKill();
      resolve({ method: 'sigkill-fallback', error });
      return;
    }
    killer.once('error', error => {
      directKill();
      finish({ method: 'sigkill-fallback', error });
    });
    killer.once('close', code => {
      if (code !== 0) directKill();
      finish({ method: code === 0 ? 'taskkill' : 'sigkill-fallback', taskkillExitCode: code });
    });
    const timer = setTimeout(() => {
      directKill();
      finish({ method: 'sigkill-fallback', error: new Error('taskkill yanıt vermedi.') });
    }, graceMs);
  });
}

/** Runs a command without blocking the event loop and always settles after timeout. */
export function runProcess(command, args = [], options = {}) {
  const {
    timeout = DEFAULT_PROCESS_TIMEOUT_MS,
    timeoutLabel = 'PROCESS_TIMEOUT',
    killGraceMs = DEFAULT_KILL_GRACE_MS,
    spawnProcess = spawn,
    platform = process.platform,
    ...spawnOptions
  } = options;
  return new Promise(resolve => {
    let child;
    try {
      child = spawnProcess(command, args, { windowsHide: true, ...spawnOptions });
    } catch (error) {
      resolve({ status: null, signal: null, stdout: '', stderr: '', error, timedOut: false });
      return;
    }
    let stdout = '';
    let stderr = '';
    let settled = false;
    let timedOut = false;
    // What the process reported while it was already being killed. Kept for
    // diagnostics only; it must never become the result of a timed-out run.
    let exitDuringTermination = null;
    child.stdout?.on('data', chunk => { stdout += chunk; });
    child.stderr?.on('data', chunk => { stderr += chunk; });
    const finish = result => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ stdout, stderr, timedOut, ...result });
    };
    /**
     * Once the timeout fires it owns the outcome. Terminating the process tree
     * takes a moment, and the process may well close during it — reporting that
     * exit code would turn a timeout into an ordinary failure with no timeout
     * error attached, which made the result depend on event ordering. Late
     * close/error events are recorded and the timeout handler still settles.
     */
    const settleUnlessTimingOut = (event, result) => {
      if (!timedOut) {
        finish(result);
        return;
      }
      exitDuringTermination = { event, status: result.status ?? null, signal: result.signal ?? null };
    };
    child.once('error', error => settleUnlessTimingOut('error', { status: null, signal: null, error }));
    child.once('close', (status, signal) => settleUnlessTimingOut('close', { status, signal }));
    const timer = setTimeout(async () => {
      timedOut = true;
      const seconds = Math.max(1, Math.round(Number(timeout) / 1000));
      const timeoutMessage = `${timeoutLabel}: süreç ${seconds} saniyede tamamlanmadı.`;
      stderr = [stderr, timeoutMessage].filter(Boolean).join('\n');
      const termination = await killProcessTree(child, { platform, spawnProcess, graceMs: killGraceMs });
      finish({
        status: null, signal: 'SIGKILL', termination, exit_during_termination: exitDuringTermination,
        error: new Error(timeoutMessage),
      });
    }, Number(timeout));
  });
}
