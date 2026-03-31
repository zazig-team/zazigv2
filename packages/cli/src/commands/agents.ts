/**
 * agents.ts — zazig agents
 *
 * Lists all running agents for a company as JSON.
 * Combines data from:
 *   - tmux sessions (via discoverAgentSessions) for actual running state
 *   - Supabase persistent_agents table for persistent agents
 *   - Supabase jobs table for active job agents
 *
 * Usage:
 *   zazig agents --company <id>
 *   zazig agents --company <id> --type persistent|job|expert
 */

import { getValidCredentials } from "../lib/credentials.js";
import { loadConfig } from "../lib/config.js";
import { DEFAULT_SUPABASE_ANON_KEY } from "../lib/constants.js";
import { discoverAgentSessions } from "./chat.js";

type AgentType = "persistent" | "job" | "expert";

interface AgentEntry {
  "id": string | null;
  "type": AgentType;
  "role": string;
  "status": string;
  "tmux_session": string | null;
}

function parseArgs(args: string[]): { companyId: string | null; typeFilter: AgentType | null } {
  let companyId: string | null = null;
  let typeFilter: AgentType | null = null;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--company" && args[i + 1]) {
      companyId = args[++i]!;
    } else if (args[i] === "--type" && args[i + 1]) {
      typeFilter = args[++i] as AgentType;
    }
  }

  return { companyId, typeFilter };
}

export async function agents(args: string[] = []): Promise<void> {
  const { companyId, typeFilter } = parseArgs(args);

  if (!companyId) {
    process.stdout.write(JSON.stringify({ "error": "--company <id> is required" }) + "\n");
    process.exitCode = 1;
    process.exit(1);
    return;
  }

  let creds;
  try {
    creds = await getValidCredentials();
  } catch {
    process.stdout.write(JSON.stringify({ "agents": [], error: "Not logged in. Run 'zazig login' first." }) + "\n");
    process.exitCode = 1;
    process.exit(1);
    return;
  }

  let cfg;
  try {
    cfg = loadConfig();
  } catch {
    // No config — can't discover tmux sessions by machine name, use empty string
    cfg = { name: "", slots: { claude_code: 0, codex: 0 } };
  }

  // Discover tmux sessions for this machine + company
  const tmuxSessions = discoverAgentSessions(cfg.name, companyId);
  const tmuxSessionNames = new Set(tmuxSessions.map((s) => s.sessionName));

  const anonKey = process.env["SUPABASE_ANON_KEY"] ?? DEFAULT_SUPABASE_ANON_KEY;
  const headers: Record<string, string> = {
    apikey: anonKey,
    Authorization: `Bearer ${creds.accessToken}`,
  };

  const result: AgentEntry[] = [];

  // Query persistent agents from Supabase
  let persistentAgents: Array<Record<string, unknown>> = [];
  try {
    const resp = await fetch(
      `${creds.supabaseUrl}/rest/v1/persistent_agents?select=id,role,status,machine_id&company_id=eq.${encodeURIComponent(companyId)}`,
      { headers }
    );
    if (resp.ok) {
      persistentAgents = (await resp.json()) as Array<Record<string, unknown>>;
    }
  } catch { /* best-effort */ }

  // Match persistent agents with tmux sessions
  const matchedSessions = new Set<string>();
  for (const agent of persistentAgents) {
    const role = String(agent["role"] ?? "unknown");
    // Find a tmux session for this persistent agent role
    const session = tmuxSessions.find((s) => s.role === role || s.role.startsWith(role));
    const tmuxSession = session ? session.sessionName : null;
    if (tmuxSession) matchedSessions.add(tmuxSession);

    const agentStatus = tmuxSession ? String(agent["status"] ?? "running") : "orphaned";

    result.push({
      id: String(agent["id"] ?? ""),
      type: "persistent",
      role,
      status: agentStatus,
      tmux_session: tmuxSession,
    });
  }

  // Query active job agents from Supabase
  let jobAgents: Array<Record<string, unknown>> = [];
  try {
    const resp = await fetch(
      `${creds.supabaseUrl}/rest/v1/jobs?select=id,status,context,slot_type,job_type&company_id=eq.${encodeURIComponent(companyId)}&status=in.(queued,dispatched,executing,reviewing)`,
      { headers }
    );
    if (resp.ok) {
      jobAgents = (await resp.json()) as Array<Record<string, unknown>>;
    }
  } catch { /* best-effort */ }

  for (const job of jobAgents) {
    const jobId = String(job["id"] ?? "");
    // Find matching tmux session by job ID prefix
    const session = tmuxSessions.find((s) => s.role.includes(jobId.slice(0, 8)));
    const tmuxSession = session ? session.sessionName : null;
    if (tmuxSession) matchedSessions.add(tmuxSession);

    result.push({
      id: jobId,
      type: "job",
      role: String(job["job_type"] ?? "job"),
      status: String(job["status"] ?? "unknown"),
      tmux_session: tmuxSession,
    });
  }

  // Expert agents: tmux sessions matching "expert" pattern not already matched
  for (const session of tmuxSessions) {
    if (matchedSessions.has(session.sessionName)) continue;
    if (session.role.includes("expert")) {
      matchedSessions.add(session.sessionName);
      result.push({
        id: null,
        type: "expert",
        role: session.role,
        status: "running",
        tmux_session: session.sessionName,
      });
    }
  }

  // Unknown sessions: tmux sessions not matched to any DB row
  for (const session of tmuxSessions) {
    if (matchedSessions.has(session.sessionName)) continue;
    result.push({
      id: null,
      type: "job",
      role: session.role,
      status: "unknown",
      tmux_session: session.sessionName,
    });
  }

  // Apply --type filter if provided
  const filtered = typeFilter ? result.filter((a) => a.type === typeFilter) : result;

  process.stdout.write(JSON.stringify({ "agents": filtered }) + "\n");
  process.exit(0);
}
