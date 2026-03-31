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

export async function stop(args: string[] = []): Promise<void> {
  const json = args.includes("--json");
  const companyFlagIdx = args.indexOf("--company");
  const companyFlagValue = companyFlagIdx !== -1 ? args[companyFlagIdx + 1] : undefined;

  let creds;
  try {
    creds = await getValidCredentials();
  } catch {
    if (json) {
      process.stdout.write(JSON.stringify({ "stopped": false, "error": "Not logged in. Run 'zazig login' first." }) + "\n");
      process.exit(1);
    }
    console.error("Not logged in. Run 'zazig login' first.");
    process.exitCode = 1;
    return;
  }

  const anonKey = process.env["SUPABASE_ANON_KEY"] ?? DEFAULT_SUPABASE_ANON_KEY;
  const companies = await fetchUserCompanies(creds.supabaseUrl, anonKey, creds.accessToken);

  let company;
  if (companyFlagValue) {
    const found = companies.find((c) => c.id === companyFlagValue || c.name === companyFlagValue);
    if (!found) {
      if (json) {
        process.stdout.write(JSON.stringify({ "stopped": false, "error": `Company not found: ${companyFlagValue}` }) + "\n");
        process.exit(1);
      }
      console.error(`Company not found: ${companyFlagValue}`);
      process.exitCode = 1;
      return;
    }
    company = found;
  } else {
    company = await pickCompany(companies);
  }

  const pid = readPidForCompany(company.id);
  if (!pid || !isRunning(pid)) {
    if (json) {
      process.stdout.write(JSON.stringify({ "stopped": false, "error": `Agent is not running for ${company.name}.`, "company_id": company.id }) + "\n");
      process.exit(1);
    }
    console.log(`Agent is not running for ${company.name}.`);
    return;
  }

  process.stderr.write(`Stopping zazig for ${company.name} (PID ${pid})...\n`);

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

  if (json) {
    process.stdout.write(JSON.stringify({ "stopped": true, "pid": pid, "company_id": company.id }) + "\n");
    process.exit(0);
  }
  console.log("stopped.");
}
