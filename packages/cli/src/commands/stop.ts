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

export async function stop(): Promise<void> {
  let creds;
  try {
    creds = await getValidCredentials();
  } catch {
    console.error("Not logged in. Run 'zazig login' first.");
    process.exitCode = 1;
    return;
  }

  const anonKey = process.env["SUPABASE_ANON_KEY"] ?? DEFAULT_SUPABASE_ANON_KEY;
  const companies = await fetchUserCompanies(creds.supabaseUrl, anonKey, creds.accessToken);
  const company = await pickCompany(companies);

  const pid = readPidForCompany(company.id);
  if (!pid || !isRunning(pid)) {
    console.log(`Agent is not running for ${company.name}.`);
    return;
  }

  process.stdout.write(`Stopping zazig for ${company.name} (PID ${pid})...`);

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
  console.log(" stopped.");
}
