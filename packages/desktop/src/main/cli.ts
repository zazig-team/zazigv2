import { spawn } from 'child_process';
import os from 'os';
import path from 'path';

const CLI_BIN = process.env.ZAZIG_CLI_BIN || 'zazig';
const JSON_FLAG = '--json';

let activeCompanyId: string | null = null;

export function setActiveCompanyId(id: string | null): void {
  activeCompanyId = id;
}

export function getActiveCompanyId(): string | null {
  return activeCompanyId;
}

function ensureJsonFlag(args: string[]): string[] {
  return args.includes(JSON_FLAG) ? args : [...args, JSON_FLAG];
}

function buildCommandArgs(args: string[]): string[] {
  const command = args[0];
  const needsCompany =
    activeCompanyId !== null &&
    command !== 'companies' &&
    !args.includes('--company');

  const withCompany = needsCompany
    ? [command, '--company', activeCompanyId as string, ...args.slice(1)]
    : args;

  return ensureJsonFlag(withCompany);
}

export async function runCLI(args: string[]): Promise<unknown> {
  return new Promise((resolve) => {
    const commandArgs = buildCommandArgs(args);
    const spawnEnv: NodeJS.ProcessEnv = {
      ...process.env,
      ZAZIG_ENV: 'production',
      ZAZIG_HOME: path.join(os.homedir(), '.zazigv2'),
    };
    const child = spawn(CLI_BIN, commandArgs, {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: spawnEnv,
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
      console.error(`[desktop] Failed to run ${CLI_BIN} ${commandArgs.join(' ')}`, error);
      finish(null);
    });

    child.on('close', (code) => {
      if (code !== 0 || stderr.trim().length > 0) {
        console.error(
          `[desktop] ${CLI_BIN} ${commandArgs.join(' ')} exited with code ${code ?? 'unknown'}`,
          stderr.trim(),
        );
        finish(null);
        return;
      }

      const output = stdout.trim();
      if (output.length === 0) {
        console.error(`[desktop] ${CLI_BIN} ${commandArgs.join(' ')} returned empty stdout`);
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
