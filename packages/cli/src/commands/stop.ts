/**
 * stop.ts — zazig stop
 *
 * Sends SIGTERM to the running daemon for the selected company,
 * waits up to 10s for graceful shutdown, then falls back to SIGKILL.
 *
 * Flags:
 *   --company <uuid>  Skip interactive company picker
 *   --json            Machine-readable output on stdout; progress to stderr
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

function parseFlag(args: string[], flag: string): string | undefined {
  const idx = args.indexOf(flag);
  if (idx === -1) return undefined;
  const value = args[idx + 1];
  if (!value || value.startsWith("--")) return undefined;
  return value;
}

function hasFlag(args: string[], flag: string): boolean {
  return args.includes(flag);
}

export async function stop(args: string[] = []): Promise<void> {
  const companyIdFlag = parseFlag(args, "--company");
  const jsonMode = hasFlag(args, "--json");

  let creds;
  try {
    creds = await getValidCredentials();
  } catch {
    if (jsonMode) {
      process.stdout.write(JSON.stringify({ "stopped": false, "error": "Not logged in. Run 'zazig login' first." }) + "\n");
      process.exit(1);
    }
    console.error("Not logged in. Run 'zazig login' first.");
    process.exitCode = 1;
    return;
  }

  const anonKey = process.env["SUPABASE_ANON_KEY"] ?? DEFAULT_SUPABASE_ANON_KEY;

  let company: { id: string; name: string };

  if (companyIdFlag) {
    // Non-interactive: find the company from the list by id or name
    let companies: { id: string; name: string }[];
    try {
      companies = await fetchUserCompanies(creds.supabaseUrl, anonKey, creds.accessToken);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (jsonMode) {
        process.stdout.write(JSON.stringify({ "stopped": false, "error": msg }) + "\n");
        process.exit(1);
      }
      console.error(`Failed to fetch companies: ${msg}`);
      process.exitCode = 1;
      return;
    }
    const found = companies.find((c) => c.id === companyIdFlag || c.name === companyIdFlag);
    if (!found) {
      const msg = `Company not found: ${companyIdFlag}`;
      if (jsonMode) {
        process.stdout.write(JSON.stringify({ "stopped": false, "error": msg }) + "\n");
        process.exit(1);
      }
      console.error(msg);
      process.exitCode = 1;
      return;
    }
    company = found;
  } else {
    // Interactive path
    const companies = await fetchUserCompanies(creds.supabaseUrl, anonKey, creds.accessToken);
    company = await pickCompany(companies);
  }

  const pid = readPidForCompany(company.id);
  if (!pid || !isRunning(pid)) {
    if (jsonMode) {
      process.stdout.write(JSON.stringify({ "stopped": false, "error": `Agent is not running for ${company.name}.`, "company_id": company.id }) + "\n");
      process.exit(1);
    }
    console.log(`Agent is not running for ${company.name}.`);
    return;
  }

  if (jsonMode) {
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

  if (jsonMode) {
    process.stdout.write(JSON.stringify({ "stopped": true, "pid": pid, "company_id": company.id }) + "\n");
    process.exit(0);
  } else {
    console.log(" stopped.");
  }
}
