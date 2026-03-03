import { supabase, supabaseAnonKey, supabaseUrl } from "./supabase";

export interface Goal {
  id: string;
  title: string;
  description: string | null;
  time_horizon: string | null;
  metric: string | null;
  target: string | null;
  target_date: string | null;
  status: string | null;
  position: number | null;
}

export interface FocusArea {
  id: string;
  title: string;
  description: string | null;
  status: string;
  domain_tags: string[] | null;
  goals: Goal[];
}

export interface Idea {
  id: string;
  title: string | null;
  description: string | null;
  raw_text: string;
  status: string;
  priority: string | null;
  created_at: string;
  originator: string | null;
}

export interface EventItem {
  id: string;
  event_type: string;
  role: string | null;
  detail: Record<string, unknown> | null;
  created_at: string;
}

export interface PulseMetrics {
  activeFeatures: number;
  mergedFeatures: number;
  failedFeatures: number;
  activeJobs: number;
  totalJobs: number;
  shipRate: number;
}

export interface TeamSidebarMember {
  role: string;
  activeJobs: number;
}

export interface TeamSidebarData {
  members: TeamSidebarMember[];
  machineHeartbeatById: Record<string, string | null>;
}

export interface PipelineSnapshotResponse {
  snapshot: unknown;
  updated_at: string;
}

interface EdgeListResponse<TItem, TKey extends string> {
  [key: string]: TItem[];
}

function relationObject<T>(value: T | T[] | null | undefined): T | null {
  if (!value) {
    return null;
  }
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

async function getAccessToken(): Promise<string | null> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.access_token ?? null;
}

async function invokePost<TResponse>(
  functionName: string,
  body: Record<string, unknown>,
): Promise<TResponse> {
  const token = await getAccessToken();
  const { data, error } = await supabase.functions.invoke(functionName, {
    body,
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });

  if (error) {
    throw error;
  }

  return data as TResponse;
}

async function invokeGet<TResponse>(
  functionName: string,
  params: Record<string, string>,
): Promise<TResponse> {
  const token = await getAccessToken();
  if (!token) {
    throw new Error("Missing access token");
  }

  const query = new URLSearchParams(params).toString();
  const response = await fetch(`${supabaseUrl}/functions/v1/${functionName}?${query}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: supabaseAnonKey,
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(`${functionName} failed (${response.status}): ${message}`);
  }

  return (await response.json()) as TResponse;
}

export async function fetchGoals(companyId: string): Promise<Goal[]> {
  const data = await invokePost<EdgeListResponse<Goal, "goals">>("query-goals", {
    company_id: companyId,
  });

  const goals = (data.goals ?? []).slice();
  goals.sort((a, b) => (a.position ?? 999) - (b.position ?? 999));
  return goals;
}

export async function fetchFocusAreas(companyId: string): Promise<FocusArea[]> {
  const data = await invokePost<EdgeListResponse<FocusArea, "focus_areas">>(
    "query-focus-areas",
    {
      company_id: companyId,
      include_goals: true,
    },
  );

  return data.focus_areas ?? [];
}

export async function fetchIdeas(
  companyId: string,
  statuses?: string[],
): Promise<Idea[]> {
  const body: Record<string, unknown> = {
    company_id: companyId,
    limit: 80,
  };

  if (statuses && statuses.length > 0) {
    body.statuses = statuses;
  }

  const data = await invokePost<EdgeListResponse<Idea, "ideas">>("query-ideas", body);
  return data.ideas ?? [];
}

export async function fetchPipelineSnapshot(
  companyId: string,
): Promise<PipelineSnapshotResponse> {
  return invokeGet<PipelineSnapshotResponse>("get-pipeline-snapshot", {
    company_id: companyId,
  });
}

export async function submitIdea(params: {
  companyId: string;
  rawText: string;
  originator: string;
}): Promise<void> {
  await invokePost("create-idea", {
    company_id: params.companyId,
    raw_text: params.rawText,
    originator: params.originator,
  });
}

export async function fetchActivity(companyId: string): Promise<EventItem[]> {
  const { data, error } = await supabase
    .from("events")
    .select("id, event_type, role, detail, created_at")
    .eq("company_id", companyId)
    .order("created_at", { ascending: false })
    .limit(20);

  if (error) {
    throw error;
  }

  return (data as EventItem[]) ?? [];
}

export async function fetchPulseMetrics(companyId: string): Promise<PulseMetrics> {
  const [featuresResult, jobsResult] = await Promise.all([
    supabase.from("features").select("status").eq("company_id", companyId),
    supabase.from("jobs").select("status").eq("company_id", companyId),
  ]);

  if (featuresResult.error) {
    throw featuresResult.error;
  }

  if (jobsResult.error) {
    throw jobsResult.error;
  }

  const features = (featuresResult.data ?? []) as Array<{ status: string }>;
  const jobs = (jobsResult.data ?? []) as Array<{ status: string }>;

  const mergedFeatures = features.filter((feature) => feature.status === "merged").length;
  const failedFeatures = features.filter(
    (feature) => feature.status === "failed" || feature.status === "cancelled",
  ).length;
  const activeFeatures = features.filter(
    (feature) =>
      feature.status === "created" ||
      feature.status === "breaking_down" ||
      feature.status === "building" ||
      feature.status === "combining_and_pr" ||
      feature.status === "verifying",
  ).length;

  const activeJobs = jobs.filter(
    (job) => job.status === "dispatched" || job.status === "executing",
  ).length;
  const totalJobs = jobs.length;
  const successfulJobs = jobs.filter((job) => job.status === "complete").length;
  const shipRate = totalJobs === 0 ? 0 : Math.round((successfulJobs / totalJobs) * 100);

  return {
    activeFeatures,
    mergedFeatures,
    failedFeatures,
    activeJobs,
    totalJobs,
    shipRate,
  };
}

export async function fetchDashboardTeam(
  companyId: string,
): Promise<TeamSidebarData> {
  const [jobsResult, machinesResult] = await Promise.all([
    supabase
      .from("jobs")
      .select("role, status, machine_id")
      .eq("company_id", companyId)
      .in("status", ["dispatched", "executing"]),
    supabase
      .from("machines")
      .select("id, last_heartbeat")
      .eq("company_id", companyId),
  ]);

  if (jobsResult.error) {
    throw jobsResult.error;
  }

  if (machinesResult.error) {
    throw machinesResult.error;
  }

  const jobs = (jobsResult.data ?? []) as Array<{
    role: string;
    status: string;
    machine_id: string | null;
  }>;

  const byRole = new Map<string, number>();
  for (const job of jobs) {
    byRole.set(job.role, (byRole.get(job.role) ?? 0) + 1);
  }

  const members = [...byRole.entries()]
    .map(([role, activeJobs]) => ({ role, activeJobs }))
    .sort((a, b) => b.activeJobs - a.activeJobs);

  const machineHeartbeatById: Record<string, string | null> = {};
  for (const machine of (machinesResult.data ?? []) as Array<{
    id: string;
    last_heartbeat: string | null;
  }>) {
    machineHeartbeatById[machine.id] = machine.last_heartbeat;
  }

  return { members, machineHeartbeatById };
}

export interface TeamExecCard {
  id: string;
  roleName: string;
  model: string;
  archetypeId: string | null;
  archetypeName: string;
  archetypeTagline: string;
  philosophy: string[];
  traits: string[];
}

export interface TeamMachine {
  id: string;
  name: string;
  status: string | null;
  lastHeartbeat: string | null;
  slotsClaudeCode: number;
  slotsCodex: number;
}

export interface TeamEngineer {
  id: string;
  role: string;
  status: string;
  title: string;
}

export interface TeamContractor {
  id: string;
  name: string;
  description: string | null;
}

export interface TeamPageData {
  execCards: TeamExecCard[];
  archetypeOptionsByRoleId: Record<string, Array<{ id: string; name: string; tagline: string }>>;
  engineers: TeamEngineer[];
  machines: TeamMachine[];
  contractors: TeamContractor[];
}

function parsePhilosophy(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((entry): entry is string => typeof entry === "string");
  }

  if (typeof value === "string") {
    return value
      .split("\n")
      .map((line) => line.replace(/^[-*]\s*/, "").trim())
      .filter(Boolean)
      .slice(0, 4);
  }

  return [];
}

function parseTraits(value: unknown): string[] {
  if (!value || typeof value !== "object") {
    return [];
  }

  const entries = Object.entries(value as Record<string, unknown>);
  return entries
    .slice(0, 5)
    .map(([key, raw]) => `${key.replace(/_/g, " ")}: ${String(raw)}`);
}

export async function fetchTeamPageData(companyId: string): Promise<TeamPageData> {
  const persistentRoleNames = new Set<string>();

  const [execResult, activeJobsResult, machinesResult, contractorsResult] = await Promise.all([
    supabase
      .from("exec_personalities")
      .select(
        "id, role_id, archetype_id, roles(id, name, default_model), exec_archetypes(id, name, display_name, tagline, philosophy, dimensions)",
      )
      .eq("company_id", companyId),
    supabase
      .from("jobs")
      .select("id, role, status, title")
      .eq("company_id", companyId)
      .in("status", ["dispatched", "executing"]),
    supabase
      .from("machines")
      .select("id, name, status, last_heartbeat, slots_claude_code, slots_codex")
      .eq("company_id", companyId),
    supabase
      .from("roles")
      .select("id, name, description, company_roles!inner(company_id)")
      .eq("company_roles.company_id", companyId)
      .in("name", [
        "breakdown-specialist",
        "project-architect",
        "verification-specialist",
        "monitoring-agent",
      ]),
  ]);

  if (execResult.error) {
    throw execResult.error;
  }
  if (activeJobsResult.error) {
    throw activeJobsResult.error;
  }
  if (machinesResult.error) {
    throw machinesResult.error;
  }
  if (contractorsResult.error) {
    throw contractorsResult.error;
  }

  const execRows = (execResult.data ?? []) as Array<Record<string, unknown>>;

  const execCards: TeamExecCard[] = execRows.map((row) => {
    const role = relationObject<{ id: string; name: string; default_model: string | null }>(
      row.roles as
        | { id: string; name: string; default_model: string | null }
        | Array<{ id: string; name: string; default_model: string | null }>
        | null,
    );

    const archetype = relationObject<{
      id: string;
      name: string | null;
      display_name: string | null;
      tagline: string | null;
      philosophy: unknown;
      dimensions: unknown;
    }>(
      row.exec_archetypes as
        | {
            id: string;
            name: string | null;
            display_name: string | null;
            tagline: string | null;
            philosophy: unknown;
            dimensions: unknown;
          }
        | Array<{
            id: string;
            name: string | null;
            display_name: string | null;
            tagline: string | null;
            philosophy: unknown;
            dimensions: unknown;
          }>
        | null,
    );

    if (role?.name) {
      persistentRoleNames.add(role.name);
    }

    return {
      id: String(row.id),
      roleName: role?.name ?? "Role",
      model: role?.default_model ?? "unknown",
      archetypeId: (row.archetype_id as string | null) ?? null,
      archetypeName:
        archetype?.display_name ?? archetype?.name ?? "No archetype configured",
      archetypeTagline: archetype?.tagline ?? "",
      philosophy: parsePhilosophy(archetype?.philosophy),
      traits: parseTraits(archetype?.dimensions),
    };
  });

  const roleIds = execRows
    .map((row) => row.role_id)
    .filter((id): id is string => typeof id === "string");

  const archetypeOptionsByRoleId: Record<
    string,
    Array<{ id: string; name: string; tagline: string }>
  > = {};

  if (roleIds.length > 0) {
    const { data: archetypeOptions, error: archetypeOptionsError } = await supabase
      .from("exec_archetypes")
      .select("id, role_id, display_name, name, tagline")
      .in("role_id", roleIds);

    if (archetypeOptionsError) {
      throw archetypeOptionsError;
    }

    for (const option of (archetypeOptions ?? []) as Array<{
      id: string;
      role_id: string;
      display_name: string | null;
      name: string | null;
      tagline: string | null;
    }>) {
      if (!archetypeOptionsByRoleId[option.role_id]) {
        archetypeOptionsByRoleId[option.role_id] = [];
      }
      archetypeOptionsByRoleId[option.role_id].push({
        id: option.id,
        name: option.display_name ?? option.name ?? "Unnamed",
        tagline: option.tagline ?? "",
      });
    }
  }

  const engineers = ((activeJobsResult.data ?? []) as Array<{
    id: string;
    role: string;
    status: string;
    title: string | null;
  }>)
    .filter((job) => !persistentRoleNames.has(job.role))
    .map((job) => ({
      id: job.id,
      role: job.role,
      status: job.status,
      title: job.title ?? "Working",
    }));

  const machines = ((machinesResult.data ?? []) as Array<{
    id: string;
    name: string | null;
    status: string | null;
    last_heartbeat: string | null;
    slots_claude_code: number | null;
    slots_codex: number | null;
  }>).map((machine) => ({
    id: machine.id,
    name: machine.name ?? "Machine",
    status: machine.status,
    lastHeartbeat: machine.last_heartbeat,
    slotsClaudeCode: machine.slots_claude_code ?? 0,
    slotsCodex: machine.slots_codex ?? 0,
  }));

  const contractors = ((contractorsResult.data ?? []) as Array<{
    id: string;
    name: string;
    description: string | null;
  }>).map((contractor) => ({
    id: contractor.id,
    name: contractor.name,
    description: contractor.description,
  }));

  return {
    execCards,
    archetypeOptionsByRoleId,
    engineers,
    machines,
    contractors,
  };
}
