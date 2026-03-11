/**
 * status.ts — zazig status
 *
 * Reports daemon running state, and — if running — queries Supabase for
 * the machine's connection state, heartbeat age, slot usage, and active jobs.
 */

import { readPid, isDaemonRunning, readPidForCompany, isDaemonRunningForCompany } from "../lib/daemon.js";
import { getValidCredentials } from "../lib/credentials.js";
import { loadConfig } from "../lib/config.js";
import { DEFAULT_SUPABASE_ANON_KEY } from "../lib/constants.js";
import { readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { getVersion } from "../lib/version.js";

type Row = Record<string, unknown>;

function apiFetch(url: string, headers: Record<string, string>): Promise<Row[]> {
  return fetch(url, { headers }).then(async (r) => {
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json() as Promise<Row[]>;
  });
}

/**
 * Find any running daemon — checks per-company PID files first,
 * falls back to legacy daemon.pid.
 */
function findRunningDaemon(): { pid: number; companyId: string | null } | null {
  const zazigDir = join(homedir(), ".zazigv2");
  // Check per-company PID files (UUID.pid)
  try {
    const uuidPattern = /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.pid$/;
    for (const entry of readdirSync(zazigDir)) {
      const match = entry.match(uuidPattern);
      if (match) {
        const companyId = match[1]!;
        if (isDaemonRunningForCompany(companyId)) {
          return { pid: readPidForCompany(companyId)!, companyId };
        }
      }
    }
  } catch { /* dir may not exist */ }
  // Fallback to legacy daemon.pid
  if (isDaemonRunning()) {
    return { pid: readPid()!, companyId: null };
  }
  return null;
}

export async function status(): Promise<void> {
  const daemon = findRunningDaemon();

  if (!daemon) {
    console.log("Agent is not running.");
    return;
  }

  const { pid } = daemon;
  console.log(`zazig ${getVersion()} — agent running (PID ${pid})`);

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

  const anonKey = process.env["SUPABASE_ANON_KEY"] ?? DEFAULT_SUPABASE_ANON_KEY;
  const headers: Record<string, string> = {
    apikey: anonKey,
    Authorization: `Bearer ${creds.accessToken}`,
  };

  try {
    // Machine rows — query by name (one row per company the user belongs to)
    const machines = await apiFetch(
      `${creds.supabaseUrl}/rest/v1/machines` +
        `?select=id,name,status,last_heartbeat,slots_claude_code,slots_codex,company_id` +
        `&name=eq.${encodeURIComponent(cfg.name)}`,
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
          `?select=id,status,context,slot_type,job_type` +
          `&machine_id=eq.${encodeURIComponent(machineId)}` +
          `&status=in.(queued,executing,reviewing)`,
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

    // Persistent agents — query across all companies this machine is registered for
    const companyIds = machines
      .map((row) => String(row.company_id ?? ""))
      .filter((id) => id.length > 0);

    if (companyIds.length > 0) {
      const persistentAgents = await apiFetch(
        `${creds.supabaseUrl}/rest/v1/persistent_agents` +
          `?select=id,role,status,machine_id,last_heartbeat` +
          `&company_id=in.(${companyIds.join(",")})`,
        headers
      );

      if (Array.isArray(persistentAgents) && persistentAgents.length > 0) {
        console.log(`  Persistent agents:`);
        for (const agent of persistentAgents) {
          const role = String(agent.role ?? "unknown").toUpperCase();
          const agentStatus = String(agent.status ?? "unknown");
          const isLocal = agent.machine_id === machineId;
          const localTag = isLocal ? " (this machine)" : "";
          const icon = agentStatus === "running" ? "●" : "○";
          console.log(`    ${icon} ${role.padEnd(12)} ${agentStatus}${localTag}`);
        }
      }
    }
  } catch (err) {
    console.log(`  (could not fetch live status: ${String(err)})`);
  }
}
