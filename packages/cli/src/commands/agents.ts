import { discoverAgentSessions } from "./chat.js";
import { getValidCredentials } from "../lib/credentials.js";
import { loadConfig } from "../lib/config.js";
import { DEFAULT_SUPABASE_ANON_KEY } from "../lib/constants.js";

type AgentType = "persistent" | "job" | "expert";

interface PersistentAgentEntry {
  type: "persistent";
  role: string;
  status: string;
  tmux_session: string | null;
  company_id: string;
  last_heartbeat?: string | null;
}

interface JobAgentEntry {
  type: "job";
  role: string;
  status: string;
  tmux_session: string | null;
  job_id: string;
  context?: string | null;
  slot_type?: string | null;
}

interface ExpertAgentEntry {
  type: "expert";
  role: string;
  status: string;
  tmux_session: string | null;
  brief?: string | null;
}

type AgentEntry = PersistentAgentEntry | JobAgentEntry | ExpertAgentEntry;

function parseFlag(args: string[], name: string): string | undefined {
  const eq = args.find((a) => a.startsWith(`--${name}=`));
  if (eq) return eq.slice(`--${name}=`.length) || undefined;
  const idx = args.indexOf(`--${name}`);
  if (idx === -1) return undefined;
  const val = args[idx + 1];
  return val && !val.startsWith("--") ? val : undefined;
}

function classifyRole(role: string): AgentType {
  if (role.startsWith("job-")) return "job";
  if (role.startsWith("expert-")) return "expert";
  return "persistent";
}

export async function agents(args: string[]): Promise<void> {
  const companyId = parseFlag(args, "company");
  const typeFilter = parseFlag(args, "type") as AgentType | undefined;

  if (!companyId) {
    process.stderr.write(JSON.stringify({ error: "Missing required flag: --company <uuid>" }) + "\n");
    process.exit(1);
  }

  // Get machine config to obtain machineId for session discovery
  let machineId: string;
  try {
    const config = loadConfig();
    machineId = config.name;
  } catch {
    // No daemon running / no config — return empty agents list
    process.stdout.write(JSON.stringify({ "agents": [] }));
    process.exit(0);
    return;
  }

  // Get credentials for Supabase queries
  let creds: Awaited<ReturnType<typeof getValidCredentials>>;
  try {
    creds = await getValidCredentials();
  } catch {
    process.stderr.write(JSON.stringify({ error: "Not logged in. Run zazig login" }) + "\n");
    process.exit(1);
    return;
  }

  const supabaseUrl = creds.supabaseUrl;

  // Discover active zazig tmux sessions on this machine for this company
  const tmuxSessions = discoverAgentSessions(machineId, companyId);

  // Query persistent_agents table for this company
  let persistentAgentRows: Array<{
    id: string;
    role: string;
    status: string;
    last_heartbeat: string | null;
  }> = [];
  try {
    const url = `${supabaseUrl}/rest/v1/persistent_agents?company_id=eq.${companyId}&select=id,role,status,last_heartbeat`;
    const resp = await fetch(url, {
      headers: {
        Authorization: `Bearer ${creds.accessToken}`,
        apikey: DEFAULT_SUPABASE_ANON_KEY,
        "Content-Type": "application/json",
      },
    });
    if (resp.ok) {
      persistentAgentRows = (await resp.json()) as typeof persistentAgentRows;
    }
  } catch { /* ignore — treat as empty */ }

  // Query jobs table for active job agents on this machine
  // Active statuses: queued, dispatched, executing, reviewing
  let jobRows: Array<{
    id: string;
    status: string;
    slot_type: string | null;
    context: string | null;
  }> = [];
  try {
    const activeStatuses = "queued,dispatched,executing,reviewing";
    const url = `${supabaseUrl}/rest/v1/jobs?company_id=eq.${companyId}&status=in.(${activeStatuses})&machine_id=eq.${machineId}&select=id,status,slot_type,context`;
    const resp = await fetch(url, {
      headers: {
        Authorization: `Bearer ${creds.accessToken}`,
        apikey: DEFAULT_SUPABASE_ANON_KEY,
        "Content-Type": "application/json",
      },
    });
    if (resp.ok) {
      jobRows = (await resp.json()) as typeof jobRows;
    }
  } catch { /* ignore — treat as empty */ }

  const allAgents: AgentEntry[] = [];

  // --- Persistent agents ---
  const persistentSessions = tmuxSessions.filter((s) => classifyRole(s.role) === "persistent");
  const persistentSessionByRole = new Map(persistentSessions.map((s) => [s.role, s]));
  const matchedPersistentRoles = new Set<string>();

  for (const row of persistentAgentRows) {
    const session = persistentSessionByRole.get(row.role);
    matchedPersistentRoles.add(row.role);
    allAgents.push({
      type: "persistent",
      role: row.role,
      status: session ? row.status : "orphaned",
      tmux_session: session?.sessionName ?? null,
      company_id: companyId,
      last_heartbeat: row.last_heartbeat,
    });
  }
  // Unmatched persistent tmux sessions → unknown
  for (const session of persistentSessions) {
    if (!matchedPersistentRoles.has(session.role)) {
      allAgents.push({
        type: "persistent",
        role: session.role,
        status: "unknown",
        tmux_session: session.sessionName,
        company_id: companyId,
      });
    }
  }

  // --- Job agents ---
  const jobSessions = tmuxSessions.filter((s) => classifyRole(s.role) === "job");
  const jobSessionByJobId = new Map(
    jobSessions.map((s) => [s.role.replace(/^job-/, ""), s]),
  );
  const matchedJobIds = new Set<string>();

  for (const row of jobRows) {
    const session = jobSessionByJobId.get(row.id);
    matchedJobIds.add(row.id);
    allAgents.push({
      type: "job",
      role: row.slot_type ?? "agent",
      status: session ? row.status : "orphaned",
      tmux_session: session?.sessionName ?? null,
      job_id: row.id,
      context: row.context,
      slot_type: row.slot_type,
    });
  }
  // Unmatched job tmux sessions → unknown
  for (const session of jobSessions) {
    const jobId = session.role.replace(/^job-/, "");
    if (!matchedJobIds.has(jobId)) {
      allAgents.push({
        type: "job",
        role: "agent",
        status: "unknown",
        tmux_session: session.sessionName,
        job_id: jobId,
      });
    }
  }

  // --- Expert agents ---
  // Expert sessions have role like "expert-{role-slug}" in tmux session name
  const expertSessions = tmuxSessions.filter((s) => classifyRole(s.role) === "expert");
  for (const session of expertSessions) {
    const role = session.role.replace(/^expert-/, "");
    allAgents.push({
      type: "expert",
      role,
      status: "running",
      tmux_session: session.sessionName,
    });
  }

  // Apply optional --type filter
  const filtered = typeFilter
    ? allAgents.filter((a) => a.type === typeFilter)
    : allAgents;

  process.stdout.write(JSON.stringify({ "agents": filtered }));
  process.exit(0);
}
