import { spawn, spawnSync } from 'node:child_process';

export const DEFAULT_RUN_TIMEOUT_MS = 60 * 60_000;
export const DEFAULT_VERSION_TIMEOUT_MS = 60_000;

/**
 * Kills the whole process tree. Codex is launched through a Node entry point on
 * Windows, so killing only the direct child can leave the real worker running and
 * keep holding the concurrency slot.
 */
export function killProcessTree(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  if (process.platform === 'win32' && child.pid) {
    spawnSync('taskkill', ['/pid', String(child.pid), '/t', '/f'], { windowsHide: true });
    return;
  }
  try { child.kill('SIGKILL'); } catch { /* already gone */ }
}

function formatDuration(milliseconds) {
  return milliseconds >= 60_000
    ? `${Math.round(milliseconds / 60_000)} dakika`
    : `${Math.round(milliseconds / 1000)} saniye`;
}

export class CodexRunner {
  constructor(command = 'codex', {
    timeoutMs = DEFAULT_RUN_TIMEOUT_MS,
    versionTimeoutMs = DEFAULT_VERSION_TIMEOUT_MS,
  } = {}) {
    this.command = command;
    this.timeoutMs = timeoutMs;
    this.versionTimeoutMs = versionTimeoutMs;
  }

  invocation(args) {
    return this.command.endsWith('.js')
      ? { command: process.execPath, args: [this.command, ...args] }
      : { command: this.command, args };
  }

  async version() {
    return new Promise(resolve => {
      let child;
      try {
        const invocation = this.invocation(['--version']);
        child = spawn(invocation.command, invocation.args, {
          windowsHide: true,
        });
      } catch {
        resolve(null);
        return;
      }
      let output = '';
      let settled = false;
      const timer = setTimeout(() => { killProcessTree(child); finish(null); }, this.versionTimeoutMs);
      const finish = value => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(value);
      };
      child.stdout.on('data', chunk => { output += chunk; });
      child.once('error', () => finish(null));
      child.once('close', code => finish(code === 0 ? output.trim() : null));
    });
  }

  async run({ workspace, prompt, onEvent }) {
    return new Promise((resolve, reject) => {
      let child;
      try {
        const invocation = this.invocation(['exec', '--json', '--sandbox', 'workspace-write', '-']);
        child = spawn(
          invocation.command,
          invocation.args,
          {
            cwd: workspace,
            windowsHide: true,
            stdio: ['pipe', 'pipe', 'pipe'],
          },
        );
      } catch (error) {
        reject(error);
        return;
      }
      let buffer = '';
      let stderr = '';
      let finalMessage = '';
      let settled = false;
      let timedOut = false;
      // Without this the slot is held forever by a hung Codex process.
      const timer = setTimeout(() => {
        timedOut = true;
        onEvent('timeout', { timeout_ms: this.timeoutMs });
        killProcessTree(child);
      }, this.timeoutMs);
      const settle = action => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        action();
      };
      const fail = error => settle(() => reject(error));

      const consumeLine = line => {
        if (!line.trim()) return;
        try {
          const event = JSON.parse(line);
          onEvent(event.type ?? 'unknown', event);
          if (event.type === 'item.completed' && event.item?.type === 'agent_message') {
            finalMessage = event.item.text ?? finalMessage;
          }
        } catch { onEvent('unparsed_output', { text: line }); }
      };

      child.stdout.on('data', chunk => {
        buffer += chunk.toString();
        const lines = buffer.split(/\r?\n/);
        buffer = lines.pop() ?? '';
        lines.forEach(consumeLine);
      });
      child.stderr.on('data', chunk => {
        const text = chunk.toString();
        stderr += text;
        onEvent('stderr', { text: text.trim() });
      });
      child.stdin.end(prompt);
      child.once('error', fail);
      child.once('close', code => {
        settle(() => {
          consumeLine(buffer);
          if (timedOut) {
            reject(new Error(`Codex ${formatDuration(this.timeoutMs)} içinde tamamlanmadı ve süreç sonlandırıldı.`));
          } else if (code === 0) {
            resolve(finalMessage || 'Codex çalışması tamamlandı.');
          } else {
            reject(new Error(stderr.trim() || `Codex ${code} çıkış koduyla sonlandı.`));
          }
        });
      });
    });
  }
}
