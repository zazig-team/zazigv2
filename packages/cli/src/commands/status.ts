/**
 * status.ts — zazig status
 *
 * Reports daemon running state, and — if running — queries Supabase for
 * the machine's connection state, heartbeat age, slot usage, and active jobs.
 *
 * Uses the authenticated JWT (not service-role key) for API calls.
 * company_id is derived from credentials, not machine.yaml.
 */

import { readPid, isDaemonRunning } from "../lib/daemon.js";
import { getValidCredentials } from "../lib/credentials.js";
import { loadConfig } from "../lib/config.js";

type Row = Record<string, unknown>;

function apiFetch(url: string, headers: Record<string, string>): Promise<Row[]> {
  return fetch(url, { headers }).then(async (r) => {
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json() as Promise<Row[]>;
  });
}

export async function status(): Promise<void> {
  const pid = readPid();
  const running = isDaemonRunning();

  if (!running) {
    console.log("Agent is not running.");
    return;
  }

  console.log(`Agent is running (PID ${pid}).`);

  // Best-effort live state from Supabase — never fatal if this fails
  let creds;
  try {
    creds = await getValidCredentials();
  } catch {
    return; // No credentials — can't query Supabase
  }

  let cfg;
  try {
    cfg = loadConfig();
  } catch {
    return; // No machine config — can't query Supabase
  }

  const headers: Record<string, string> = {
    apikey: creds.anonKey,
    Authorization: `Bearer ${creds.accessToken}`,
  };

  try {
    // Company name (uses authenticated role — RLS scopes to own company)
    const companies = await apiFetch(
      `${creds.supabaseUrl}/rest/v1/companies` +
        `?select=name` +
        `&id=eq.${encodeURIComponent(creds.companyId)}` +
        `&limit=1`,
      headers
    );
    const companyName =
      companies.length > 0 ? String(companies[0]!.name ?? creds.companyId) : creds.companyId;

    // Machine row
    const machines = await apiFetch(
      `${creds.supabaseUrl}/rest/v1/machines` +
        `?select=id,name,status,last_heartbeat,slots_claude_code,slots_codex` +
        `&name=eq.${encodeURIComponent(cfg.name)}` +
        `&company_id=eq.${encodeURIComponent(creds.companyId)}` +
        `&limit=1`,
      headers
    );

    if (machines.length === 0) {
      console.log("  (machine not registered yet — start the agent to register)");
      return;
    }

    const m = machines[0]!;
    const connStatus = String(m.status ?? "unknown");
    const connIcon = connStatus === "online" ? "●" : "○";

    console.log(`  Connection:     ${connIcon} ${connStatus}`);
    console.log(`  Company:        ${companyName}`);
    console.log(`  Machine:        ${String(m.name ?? cfg.name)}`);

    if (typeof m.last_heartbeat === "string") {
      const ageSec = Math.round(
        (Date.now() - new Date(m.last_heartbeat).getTime()) / 1000
      );
      console.log(`  Last heartbeat: ${ageSec}s ago`);
    }

    // Active jobs — include slot_type for per-type usage counts
    const machineId = String(m.id ?? "");
    if (machineId) {
      const jobs = await apiFetch(
        `${creds.supabaseUrl}/rest/v1/jobs` +
          `?select=id,status,context,slot_type` +
          `&machine_id=eq.${encodeURIComponent(machineId)}` +
          `&status=in.(queued,dispatched,executing,reviewing)`,
        headers
      );

      const claudeActive = jobs.filter((j) => j.slot_type === "claude_code").length;
      const codexActive = jobs.filter((j) => j.slot_type === "codex").length;
      const claudeSlots = Number(m.slots_claude_code ?? cfg.slots.claude_code);
      const codexSlots = Number(m.slots_codex ?? cfg.slots.codex);

      console.log(`  Claude slots:   ${claudeActive}/${claudeSlots}`);
      console.log(`  Codex slots:    ${codexActive}/${codexSlots}`);
      console.log(`  Active jobs:    ${jobs.length}`);

      for (const job of jobs) {
        const ctx =
          typeof job.context === "string"
            ? job.context.replace(/\s+/g, " ").trim().slice(0, 55)
            : String(job.id ?? "").slice(0, 8);
        console.log(`    • [${job.status}] ${ctx}`);
      }
    }
  } catch (err) {
    console.log(`  (could not fetch live status: ${String(err)})`);
  }
}
