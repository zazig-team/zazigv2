import { discoverAgentSessions } from "./chat.js";
import { getValidCredentials } from "../lib/credentials.js";
import { loadConfig } from "../lib/config.js";
import { DEFAULT_SUPABASE_ANON_KEY } from "../lib/constants.js";
import { isDaemonRunningForCompany } from "../lib/daemon.js";

type ParsedFlag = {
  provided: boolean;
  value?: string;
};

type AgentType = "persistent" | "job" | "expert";

type AnyRow = Record<string, unknown>;

type PersistentAgentOut = {
  type: "persistent";
  role: string;
  status: string;
  tmux_session: string | null;
  company_id: string;
};

type JobAgentOut = {
  type: "job";
  role: string;
  status: string;
  tmux_session: string | null;
  company_id: string;
  job_id?: string;
  context?: string;
  slot_type?: string;
};

type ExpertAgentOut = {
  type: "expert";
  role: string;
  status: string;
  tmux_session: string;
  brief?: string;
};

type AgentOut = PersistentAgentOut | JobAgentOut | ExpertAgentOut;

const UUID_V4ISH_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const UUID_ANY_REGEX = /[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i;
const COMPANY_PREFIX_REGEX = /^[0-9a-f]{8}-/i;
const ACTIVE_JOB_STATUSES = ["queued", "dispatched", "executing", "reviewing"] as const;
const VALID_TYPES: AgentType[] = ["persistent", "job", "expert"];

function parseFlag(args: string[], name: string): ParsedFlag {
  const eq = args.find((arg) => arg.startsWith(`--${name}=`));
  if (eq !== undefined) {
    const value = eq.slice(`--${name}=`.length);
    return { provided: true, value: value.length > 0 ? value : undefined };
  }

  const idx = args.indexOf(`--${name}`);
  if (idx === -1) return { provided: false };

  const value = args[idx + 1];
  if (!value || value.startsWith("--")) return { provided: true, value: undefined };

  return { provided: true, value };
}

function isUuid(value: string): boolean {
  return UUID_V4ISH_REGEX.test(value);
}

function writeResult(agents: AgentOut[]): never {
  process.stdout.write(JSON.stringify({ agents }));
  process.exit(0);
}

function asString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function fetchRows(url: string, headers: Record<string, string>): Promise<AnyRow[]> {
  return fetch(url, { headers }).then(async (response) => {
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json() as Promise<AnyRow[]>;
  });
}

function dedupeSessionNames(names: string[]): string[] {
  return [...new Set(names)];
}

function listTmuxSessions(machineName: string): string[] {
  const machineScoped = discoverAgentSessions(machineName).map((session) => session.sessionName);
  const expertScoped = discoverAgentSessions("expert").map((session) => session.sessionName);
  const expertPrefixed = discoverAgentSessions("zazig-expert").map((session) => session.sessionName);
  const zazigPrefixed = discoverAgentSessions("zazig").map((session) => session.sessionName);
  return dedupeSessionNames([
    ...machineScoped,
    ...expertScoped,
    ...expertPrefixed,
    ...zazigPrefixed,
  ]);
}

function extractRoleFromPersistentSession(sessionName: string, machineName: string): string | undefined {
  if (sessionName.startsWith(`${machineName}-`)) {
    const raw = sessionName.slice(`${machineName}-`.length);
    const withoutCompanyPrefix = raw.replace(COMPANY_PREFIX_REGEX, "");
    if (withoutCompanyPrefix.length > 0 && !isUuid(withoutCompanyPrefix)) {
      return withoutCompanyPrefix;
    }
  }

  if (sessionName.startsWith("zazig-")) {
    const raw = sessionName.slice("zazig-".length);
    const first = raw.split("-")[0];
    if (first && first !== "job" && first !== "expert" && first !== "view") {
      return first;
    }
  }

  return undefined;
}

function extractJobIdFromSession(sessionName: string, machineName: string): string | undefined {
  if (sessionName.startsWith(`${machineName}-`)) {
    const suffix = sessionName.slice(`${machineName}-`.length);
    if (isUuid(suffix)) return suffix;
  }

  if (sessionName.startsWith("zazig-job-")) {
    const raw = sessionName.slice("zazig-job-".length);
    const match = raw.match(UUID_ANY_REGEX);
    if (match?.[0]) return match[0];
  }

  const anywhere = sessionName.match(UUID_ANY_REGEX);
  return anywhere?.[0];
}

function isExpertSession(sessionName: string): boolean {
  return sessionName.startsWith("expert-") || sessionName.startsWith("zazig-expert-");
}

function isJobSession(sessionName: string, machineName: string): boolean {
  if (sessionName.startsWith("zazig-job-")) return true;
  if (!sessionName.startsWith(`${machineName}-`)) return false;
  const suffix = sessionName.slice(`${machineName}-`.length);
  return isUuid(suffix);
}

function extractExpertRole(sessionName: string): string {
  if (sessionName.startsWith("zazig-expert-")) {
    const raw = sessionName.slice("zazig-expert-".length);
    const role = raw.split("-").slice(0, 2).join("-").trim();
    if (role.length > 0) return role;
  }
  return "expert";
}

function applyTypeFilter(agents: AgentOut[], type?: string): AgentOut[] {
  if (!type) return agents;
  return agents.filter((agent) => agent.type === type);
}

export async function agents(args: string[]): Promise<void> {
  const company = parseFlag(args, "company");
  const typeFilter = parseFlag(args, "type").value;

  if (!company.value || !isUuid(company.value)) {
    writeResult([]);
  }
  if (typeFilter && !VALID_TYPES.includes(typeFilter as AgentType)) {
    writeResult([]);
  }

  const companyId = company.value;

  if (!isDaemonRunningForCompany(companyId)) {
    writeResult([]);
  }

  let creds;
  try {
    creds = await getValidCredentials();
  } catch {
    writeResult([]);
  }

  const config = (() => {
    try {
      return loadConfig() as { name?: string; supabaseUrl?: string; supabase_url?: string };
    } catch {
      return undefined;
    }
  })();

  const machineName = config?.name;
  if (!machineName) {
    writeResult([]);
  }

  const supabaseUrl = config?.supabaseUrl ?? config?.supabase_url ?? creds.supabaseUrl;
  const headers: Record<string, string> = {
    Authorization: `Bearer ${creds.accessToken}`,
    apikey: DEFAULT_SUPABASE_ANON_KEY,
  };

  try {
    const machineRows = await fetchRows(
      `${supabaseUrl}/rest/v1/machines` +
        `?select=id` +
        `&company_id=eq.${encodeURIComponent(companyId)}` +
        `&name=eq.${encodeURIComponent(machineName)}` +
        `&limit=1`,
      headers,
    );
    const machineId = asString(machineRows[0]?.["id"]);
    if (!machineId) {
      writeResult([]);
    }

    const sessions = listTmuxSessions(machineName);
    const expertSessions = sessions.filter((name) => isExpertSession(name));
    const jobSessions = sessions.filter((name) => isJobSession(name, machineName));
    const persistentSessions = sessions.filter((name) => {
      if (isExpertSession(name) || isJobSession(name, machineName)) return false;
      return extractRoleFromPersistentSession(name, machineName) !== undefined;
    });

    const [persistentRows, jobRows] = await Promise.all([
      fetchRows(
        `${supabaseUrl}/rest/v1/persistent_agents` +
          `?select=role,status,last_heartbeat,machine_id,company_id` +
          `&company_id=eq.${encodeURIComponent(companyId)}` +
          `&machine_id=eq.${encodeURIComponent(machineId)}`,
        headers,
      ),
      fetchRows(
        `${supabaseUrl}/rest/v1/jobs` +
          `?select=id,role,status,context,slot_type,machine_id,company_id` +
          `&company_id=eq.${encodeURIComponent(companyId)}` +
          `&machine_id=eq.${encodeURIComponent(machineId)}` +
          `&status=in.(${ACTIVE_JOB_STATUSES.join(",")})`,
        headers,
      ),
    ]);

    const output: AgentOut[] = [];

    const persistentByRole = new Map<string, AnyRow>();
    for (const row of persistentRows) {
      const role = asString(row["role"]);
      if (role) persistentByRole.set(role, row);
    }
    const seenPersistentRoles = new Set<string>();

    for (const tmuxSession of persistentSessions) {
      const role = extractRoleFromPersistentSession(tmuxSession, machineName);
      if (!role) continue;
      const row = persistentByRole.get(role);
      if (row) seenPersistentRoles.add(role);
      output.push({
        type: "persistent",
        role,
        status: asString(row?.["status"]) ?? "unknown",
        tmux_session: tmuxSession,
        company_id: companyId,
      });
    }

    for (const row of persistentRows) {
      const role = asString(row["role"]);
      if (!role || seenPersistentRoles.has(role)) continue;
      output.push({
        type: "persistent",
        role,
        status: "orphaned",
        tmux_session: null,
        company_id: companyId,
      });
    }

    const jobsById = new Map<string, AnyRow>();
    for (const row of jobRows) {
      const jobId = asString(row["id"]);
      if (jobId) jobsById.set(jobId, row);
    }
    const seenJobIds = new Set<string>();

    for (const tmuxSession of jobSessions) {
      const jobId = extractJobIdFromSession(tmuxSession, machineName);
      const row = jobId ? jobsById.get(jobId) : undefined;
      if (jobId && row) seenJobIds.add(jobId);
      output.push({
        type: "job",
        role: asString(row?.["role"]) ?? "unknown",
        status: asString(row?.["status"]) ?? "unknown",
        tmux_session: tmuxSession,
        company_id: companyId,
        ...(jobId ? { job_id: jobId } : {}),
        ...(asString(row?.["context"]) ? { context: asString(row?.["context"]) } : {}),
        ...(asString(row?.["slot_type"]) ? { slot_type: asString(row?.["slot_type"]) } : {}),
      });
    }

    for (const row of jobRows) {
      const jobId = asString(row["id"]);
      if (!jobId || seenJobIds.has(jobId)) continue;
      output.push({
        type: "job",
        role: asString(row["role"]) ?? "unknown",
        status: "orphaned",
        tmux_session: null,
        company_id: companyId,
        job_id: jobId,
        ...(asString(row["context"]) ? { context: asString(row["context"]) } : {}),
        ...(asString(row["slot_type"]) ? { slot_type: asString(row["slot_type"]) } : {}),
      });
    }

    for (const tmuxSession of expertSessions) {
      output.push({
        type: "expert",
        role: extractExpertRole(tmuxSession),
        status: "running",
        tmux_session: tmuxSession,
      });
    }

    writeResult(applyTypeFilter(output, typeFilter));
  } catch {
    writeResult([]);
  }
}
