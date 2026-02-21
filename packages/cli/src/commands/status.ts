/**
 * status.ts — zazig status
 *
 * Reports daemon running state, and — if running — queries Supabase for
 * the machine's connection state, heartbeat age, slot usage, and active jobs.
 */

import { readPid, isDaemonRunning } from "../lib/daemon.js";
import { loadCredentials } from "../lib/credentials.js";
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
    creds = loadCredentials();
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
    Authorization: `Bearer ${creds.serviceRoleKey}`,
  };

  try {
    // Machine row
    const machines = await apiFetch(
      `${creds.supabaseUrl}/rest/v1/machines` +
        `?select=id,name,status,last_heartbeat,slots_claude_code,slots_codex` +
        `&name=eq.${encodeURIComponent(cfg.name)}` +
        `&company_id=eq.${encodeURIComponent(cfg.company_id)}` +
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
    console.log(`  Machine:        ${String(m.name ?? cfg.name)}`);
    console.log(`  Claude slots:   ${String(m.slots_claude_code ?? cfg.slots.claude_code)}`);
    console.log(`  Codex slots:    ${String(m.slots_codex ?? cfg.slots.codex)}`);

    if (typeof m.last_heartbeat === "string") {
      const ageSec = Math.round(
        (Date.now() - new Date(m.last_heartbeat).getTime()) / 1000
      );
      console.log(`  Last heartbeat: ${ageSec}s ago`);
    }

    // Active jobs on this machine
    const machineId = String(m.id ?? "");
    if (machineId) {
      const jobs = await apiFetch(
        `${creds.supabaseUrl}/rest/v1/jobs` +
          `?select=id,status,context` +
          `&machine_id=eq.${encodeURIComponent(machineId)}` +
          `&status=in.(queued,dispatched,executing,reviewing)`,
        headers
      );

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
