import { spawn } from 'child_process';

const JSON_FLAG = '--json';

function ensureJsonFlag(args: string[]): string[] {
  return args.includes(JSON_FLAG) ? args : [...args, JSON_FLAG];
}

export async function runCLI(args: string[]): Promise<unknown> {
  return new Promise((resolve) => {
    const commandArgs = ensureJsonFlag(args);
    const child = spawn('zazig', commandArgs, {
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    let settled = false;

    const finish = (value: unknown): void => {
      if (settled) return;
      settled = true;
      resolve(value);
    };

    child.stdout?.on('data', (chunk: string | Buffer) => {
      stdout += chunk.toString();
    });

    child.stderr?.on('data', (chunk: string | Buffer) => {
      stderr += chunk.toString();
    });

    child.on('error', (error) => {
      console.error(`[desktop] Failed to run zazig ${commandArgs.join(' ')}`, error);
      finish(null);
    });

    child.on('close', (code) => {
      if (code !== 0 || stderr.trim().length > 0) {
        console.error(
          `[desktop] zazig ${commandArgs.join(' ')} exited with code ${code ?? 'unknown'}`,
          stderr.trim(),
        );
        finish(null);
        return;
      }

      const output = stdout.trim();
      if (output.length === 0) {
        console.error(`[desktop] zazig ${commandArgs.join(' ')} returned empty stdout`);
        finish(null);
        return;
      }

      try {
        finish(JSON.parse(output));
      } catch (error) {
        console.error(`[desktop] Failed to parse JSON from zazig ${commandArgs.join(' ')}`, error);
        finish(null);
      }
    });
  });
}
