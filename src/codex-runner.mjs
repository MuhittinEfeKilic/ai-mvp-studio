import { spawn } from 'node:child_process';

export class CodexRunner {
  constructor(command = 'codex') { this.command = command; }

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
      const finish = value => { if (!settled) { settled = true; resolve(value); } };
      child.stdout.on('data', chunk => { output += chunk; });
      child.once('error', () => finish(null));
      child.once('close', code => finish(code === 0 ? output.trim() : null));
    });
  }

  async run({ workspace, prompt, onEvent, resumeThreadId = null }) {
    return new Promise((resolve, reject) => {
      let child;
      try {
        const codexArgs = resumeThreadId
          ? ['exec', 'resume', '--json', resumeThreadId, '-']
          : ['exec', '--json', '--sandbox', 'workspace-write', '-'];
        const invocation = this.invocation(codexArgs);
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
      const fail = error => { if (!settled) { settled = true; reject(error); } };

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
        if (settled) return;
        settled = true;
        consumeLine(buffer);
        if (code === 0) resolve(finalMessage || 'Codex çalışması tamamlandı.');
        else reject(new Error(stderr.trim() || `Codex ${code} çıkış koduyla sonlandı.`));
      });
    });
  }
}
