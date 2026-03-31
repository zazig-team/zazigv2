/**
 * stop.ts — zazig stop
 *
 * Sends SIGTERM to the running daemon for the selected company,
 * waits up to 10s for graceful shutdown, then falls back to SIGKILL.
 */

import { fetchUserCompanies, pickCompany } from "../lib/company-picker.js";
import { getValidCredentials } from "../lib/credentials.js";
import { DEFAULT_SUPABASE_ANON_KEY } from "../lib/constants.js";
import {
  readPidForCompany,
  removePidFileForCompany,
} from "../lib/daemon.js";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRunning(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

interface StopFlags {
  companyId?: string;
  json: boolean;
}

function parseStopFlags(args: string[]): StopFlags {
  let companyId: string | undefined;
  let json = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (!arg) continue;

    if (arg === "--json") {
      json = true;
      continue;
    }

    if (arg.startsWith("--company=")) {
      const value = arg.slice("--company=".length).trim();
      if (!value) throw new Error("--company requires a value.");
      companyId = value;
      continue;
    }

    if (arg === "--company") {
      const value = args[i + 1];
      if (!value || value.startsWith("--")) {
        throw new Error("--company requires a value.");
      }
      companyId = value;
      i++;
      continue;
    }

    throw new Error(`Unknown stop option: ${arg}`);
  }

  return { companyId, json };
}

function writeJson(payload: Record<string, unknown>): void {
  process.stdout.write(`${JSON.stringify(payload)}\n`);
}

export async function stop(args: string[] = process.argv.slice(3)): Promise<void> {
  let flags: StopFlags;
  try {
    flags = parseStopFlags(args);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (args.includes("--json")) {
      writeJson({ "stopped": false, "error": message });
    } else {
      console.error(message);
    }
    process.exitCode = 1;
    return;
  }

  let creds;
  try {
    creds = await getValidCredentials();
  } catch {
    const error = "Not logged in. Run 'zazig login' first.";
    if (flags.json) {
      process.stderr.write(`${error}\n`);
      writeJson({ "stopped": false, "error": error });
    } else {
      console.error(error);
    }
    process.exitCode = 1;
    return;
  }

  const anonKey = process.env["SUPABASE_ANON_KEY"] ?? DEFAULT_SUPABASE_ANON_KEY;
  let company: { id: string; name: string };

  if (!flags.companyId && !flags.json) {
    // Preserve the existing interactive path exactly when no new flags are used.
    const companies = await fetchUserCompanies(creds.supabaseUrl, anonKey, creds.accessToken);
    company = await pickCompany(companies);
  } else {
    if (!flags.companyId) {
      const error = "--company <uuid> is required when using --json.";
      process.stderr.write(`${error}\n`);
      writeJson({ "stopped": false, "error": error });
      process.exitCode = 1;
      return;
    }

    try {
      const companies = await fetchUserCompanies(creds.supabaseUrl, anonKey, creds.accessToken);
      const selected = companies.find((c) => c.id === flags.companyId);
      if (!selected) {
        const error = `Company not found: ${flags.companyId}`;
        if (flags.json) {
          process.stderr.write(`${error}\n`);
          writeJson({ "stopped": false, "error": error });
        } else {
          console.error(error);
        }
        process.exitCode = 1;
        return;
      }
      company = selected;
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      if (flags.json) {
        process.stderr.write(`${error}\n`);
        writeJson({ "stopped": false, "error": error });
      } else {
        console.error(error);
      }
      process.exitCode = 1;
      return;
    }
  }

  const pid = readPidForCompany(company.id);
  if (!pid || !isRunning(pid)) {
    if (flags.json) {
      const error = "Daemon is not running";
      process.stderr.write(`${error}\n`);
      writeJson({ "stopped": false, "error": error });
      process.exitCode = 1;
    } else {
      console.log(`Agent is not running for ${company.name}.`);
    }
    return;
  }

  if (flags.json) {
    process.stderr.write(`Stopping zazig for ${company.name} (PID ${pid})...\n`);
  } else {
    process.stdout.write(`Stopping zazig for ${company.name} (PID ${pid})...`);
  }

  try {
    process.kill(pid, "SIGTERM");
  } catch { /* */ }

  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    await sleep(200);
    if (!isRunning(pid)) break;
  }

  if (isRunning(pid)) {
    try {
      process.kill(pid, "SIGKILL");
    } catch { /* */ }
  }

  removePidFileForCompany(company.id);
  if (flags.json) {
    writeJson({
      "stopped": true,
      "pid": pid,
      "company_id": company.id,
    });
    process.exitCode = 0;
  } else {
    console.log(" stopped.");
  }
}
