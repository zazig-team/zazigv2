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
  progress: number | null;
  position: number | null;
}

export interface FocusArea {
  id: string;
  title: string;
  description: string | null;
  status: string;
  health: string | null;
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
  item_type: "idea" | "brief" | "bug" | "test";
  horizon: "soon" | "later" | null;
  created_at: string;
  originator: string | null;
  promoted_to_type: string | null;
  promoted_to_id: string | null;
  promoted_at: string | null;
}

export interface DecisionOption {
  label: string;
  description?: string;
  recommended?: boolean;
}

export interface Decision {
  id: string;
  from_role: string;
  category: string;
  title: string;
  context: string | null;
  options: DecisionOption[];
  recommendation_rationale: string | null;
  status: string;
  resolution: Record<string, unknown> | null;
  expires_at: string | null;
  created_at: string;
}

export interface ActionItem {
  id: string;
  source_role: string | null;
  title: string;
  detail: string | null;
  cta_label: string;
  cta_type: string;
  cta_payload: Record<string, unknown> | null;
  status: string;
  created_at: string;
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function asDecisionOption(value: unknown): DecisionOption | null {
  if (typeof value === "string" && value.trim()) {
    return { label: value.trim() };
  }

  if (!isRecord(value) || typeof value.label !== "string" || !value.label.trim()) {
    return null;
  }

  return {
    label: value.label,
    description: typeof value.description === "string" ? value.description : undefined,
    recommended: typeof value.recommended === "boolean" ? value.recommended : undefined,
  };
}

function parseDecisionOptions(value: unknown): DecisionOption[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map(asDecisionOption)
    .filter((option): option is DecisionOption => option !== null);
}

function isMissingRelationError(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }

  const maybeError = error as { code?: unknown; message?: unknown };
  const code = typeof maybeError.code === "string" ? maybeError.code : "";
  const message = typeof maybeError.message === "string" ? maybeError.message.toLowerCase() : "";

  return (
    code === "42P01" ||
    code === "PGRST205" ||
    (message.includes("relation") && message.includes("does not exist"))
  );
}

function relationObject<T>(value: T | T[] | null | undefined): T | null {
  if (!value) {
    return null;
  }
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

function isTokenExpired(token: string, bufferSeconds = 30): boolean {
  try {
    const payload = JSON.parse(atob(token.split(".")[1]!));
    if (typeof payload.exp !== "number") {
      return true;
    }
    return payload.exp * 1000 < Date.now() + bufferSeconds * 1000;
  } catch {
    return true;
  }
}

let inflight: Promise<string | null> | null = null;

export async function getAccessToken(): Promise<string | null> {
  if (inflight) {
    return inflight;
  }

  inflight = (async () => {
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        return null;
      }

      // If token is expired or about to expire in the next 30s, force a refresh
      if (isTokenExpired(session.access_token, 30)) {
        const {
          data: { session: refreshed },
          error,
        } = await supabase.auth.refreshSession();

        if (error || !refreshed) {
          // If refresh fails, return current (might still work if clock drift is the issue)
          return session.access_token;
        }
        return refreshed.access_token;
      }

      return session.access_token;
    } finally {
      inflight = null;
    }
  })();

  return inflight;
}

async function invokePost<TResponse>(
  functionName: string,
  body: Record<string, unknown>,
): Promise<TResponse> {
  const { data, error } = await supabase.functions.invoke(functionName, {
    body,
  });

  if (error) {
    const context = error instanceof Response
      ? await error.text().catch(() => "")
      : (error as { context?: { body?: unknown } })?.context?.body ?? "";
    const msg = `${functionName}: ${error.message ?? error}${context ? ` — ${JSON.stringify(context)}` : ""}`;
    throw new Error(msg);
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

  const goals = (data.goals ?? []).map((goal) => ({
    ...goal,
    progress:
      typeof goal.progress === "number" && Number.isFinite(goal.progress)
        ? goal.progress
        : null,
  }));
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

  return (data.focus_areas ?? []).map((focusArea) => ({
    ...focusArea,
    health: typeof focusArea.health === "string" ? focusArea.health : null,
  }));
}

export async function fetchIdeas(
  companyId: string,
  statuses?: string[],
  item_type?: Idea["item_type"],
): Promise<Idea[]> {
  const body: Record<string, unknown> = {
    company_id: companyId,
    limit: 80,
  };

  if (statuses && statuses.length > 0) {
    body.statuses = statuses;
  }
  if (item_type) {
    body.item_type = item_type;
  }

  const data = await invokePost<EdgeListResponse<Idea, "ideas">>("query-ideas", body);
  return (data.ideas ?? []).map((idea) => ({
    ...idea,
    item_type: idea.item_type,
    horizon: idea.horizon,
  }));
}

export async function fetchDecisions(companyId: string): Promise<Decision[]> {
  const { data, error } = await supabase
    .from("decisions")
    .select(
      "id, from_role, category, title, context, options, recommendation_rationale, status, resolution, expires_at, created_at",
    )
    .eq("company_id", companyId)
    .eq("status", "pending")
    .order("created_at", { ascending: false });

  if (error) {
    if (isMissingRelationError(error)) {
      return [];
    }
    throw error;
  }

  return ((data ?? []) as Array<Record<string, unknown>>).map((row) => ({
    id: typeof row.id === "string" ? row.id : crypto.randomUUID(),
    from_role: typeof row.from_role === "string" ? row.from_role : "system",
    category: typeof row.category === "string" ? row.category : "tactical",
    title: typeof row.title === "string" ? row.title : "Decision",
    context: typeof row.context === "string" ? row.context : null,
    options: parseDecisionOptions(row.options),
    recommendation_rationale:
      typeof row.recommendation_rationale === "string"
        ? row.recommendation_rationale
        : null,
    status: typeof row.status === "string" ? row.status : "pending",
    resolution: isRecord(row.resolution) ? row.resolution : null,
    expires_at: typeof row.expires_at === "string" ? row.expires_at : null,
    created_at:
      typeof row.created_at === "string" ? row.created_at : new Date().toISOString(),
  }));
}

export async function fetchActionItems(companyId: string): Promise<ActionItem[]> {
  const { data, error } = await supabase
    .from("action_items")
    .select("id, source_role, title, detail, cta_label, cta_type, cta_payload, status, created_at")
    .eq("company_id", companyId)
    .eq("status", "pending")
    .order("created_at", { ascending: false });

  if (error) {
    if (isMissingRelationError(error)) {
      return [];
    }
    throw error;
  }

  return ((data ?? []) as Array<Record<string, unknown>>).map((row) => ({
    id: typeof row.id === "string" ? row.id : crypto.randomUUID(),
    source_role: typeof row.source_role === "string" ? row.source_role : null,
    title: typeof row.title === "string" ? row.title : "Action item",
    detail: typeof row.detail === "string" ? row.detail : null,
    cta_label: typeof row.cta_label === "string" ? row.cta_label : "Resolve",
    cta_type: typeof row.cta_type === "string" ? row.cta_type : "acknowledge",
    cta_payload: isRecord(row.cta_payload) ? row.cta_payload : null,
    status: typeof row.status === "string" ? row.status : "pending",
    created_at:
      typeof row.created_at === "string" ? row.created_at : new Date().toISOString(),
  }));
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
  item_type?: Idea["item_type"];
}): Promise<void> {
  await invokePost("create-idea", {
    company_id: params.companyId,
    raw_text: params.rawText,
    originator: params.originator,
    item_type: params.item_type,
  });
}

export async function resolveDecision(params: {
  decisionId: string;
  action: "resolve" | "defer" | "add_note";
  selectedOption?: string;
  note?: string;
}): Promise<void> {
  await invokePost("update-decision", {
    decision_id: params.decisionId,
    action: params.action,
    selected_option: params.selectedOption,
    note: params.note,
  });
}

export async function resolveActionItem(actionItemId: string): Promise<void> {
  const { error } = await supabase
    .from("action_items")
    .update({ status: "resolved", resolved_at: new Date().toISOString() })
    .eq("id", actionItemId);

  if (error) {
    throw error;
  }
}

export async function dismissActionItem(actionItemId: string): Promise<void> {
  const { error } = await supabase
    .from("action_items")
    .update({ status: "dismissed", resolved_at: new Date().toISOString() })
    .eq("id", actionItemId);

  if (error) {
    throw error;
  }
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

  const mergedFeatures = features.filter((feature) => feature.status === "complete").length;
  const failedFeatures = features.filter(
    (feature) => feature.status === "failed" || feature.status === "cancelled",
  ).length;
  const activeFeatures = features.filter(
    (feature) =>
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

export interface FeatureDetailJob {
  id: string;
  title: string;
  status: string;
  role: string;
  model: string | null;
  result: string | null;
}

export interface FeatureDetail {
  id: string;
  title: string;
  status: string;
  priority: string | null;
  description: string | null;
  error: string | null;
  spec: string | null;
  acceptance_tests: string | null;
  branch: string | null;
  pr_url: string | null;
  created_by: string | null;
  verification_type: string | null;
  created_at: string;
  updated_at: string | null;
  completed_at: string | null;
  jobs: FeatureDetailJob[];
  sourceIdea: { title: string; raw_text: string; promoted_at: string | null } | null;
}

export interface IdeaDetail {
  id: string;
  title: string | null;
  raw_text: string;
  status: string;
  priority: string | null;
  description: string | null;
  originator: string | null;
  source: string | null;
  source_ref: string | null;
  tags: string[] | null;
  clarification_notes: string | null;
  promoted_to_type: string | null;
  promoted_to_id: string | null;
  promoted_at: string | null;
  created_at: string;
  updated_at: string | null;
  item_type: string | null;
  horizon: string | null;
  project_id: string | null;
  suggested_exec: string | null;
  triage_notes: string | null;
  promotedFeature: { title: string; status: string } | null;
}

export async function fetchFeatureDetail(featureId: string): Promise<FeatureDetail> {
  const { data: feature, error: featureError } = await supabase
    .from("features")
    .select("id, title, status, priority, description, error, spec, acceptance_tests, branch, pr_url, created_by, verification_type, created_at, updated_at, completed_at, source_idea_id")
    .eq("id", featureId)
    .single();

  if (featureError) throw featureError;

  const { data: jobs } = await supabase
    .from("jobs")
    .select("id, title, status, role, model, result")
    .eq("feature_id", featureId);

  let sourceIdea: FeatureDetail["sourceIdea"] = null;
  const sourceIdeaId = (feature as Record<string, unknown>).source_idea_id;
  if (typeof sourceIdeaId === "string" && sourceIdeaId) {
    const { data: idea } = await supabase
      .from("ideas")
      .select("title, raw_text, promoted_at")
      .eq("id", sourceIdeaId)
      .single();

    if (idea) {
      const row = idea as { title: string | null; raw_text: string; promoted_at: string | null };
      sourceIdea = { title: row.title ?? row.raw_text, raw_text: row.raw_text, promoted_at: row.promoted_at };
    }
  }

  const f = feature as Record<string, unknown>;
  return {
    id: f.id as string,
    title: f.title as string,
    status: f.status as string,
    priority: (f.priority as string | null) ?? null,
    description: (f.description as string | null) ?? null,
    error: (f.error as string | null) ?? null,
    spec: (f.spec as string | null) ?? null,
    acceptance_tests: (f.acceptance_tests as string | null) ?? null,
    branch: (f.branch as string | null) ?? null,
    pr_url: (f.pr_url as string | null) ?? null,
    created_by: (f.created_by as string | null) ?? null,
    verification_type: (f.verification_type as string | null) ?? null,
    created_at: f.created_at as string,
    updated_at: (f.updated_at as string | null) ?? null,
    completed_at: (f.completed_at as string | null) ?? null,
    jobs: ((jobs ?? []) as FeatureDetailJob[]).map((j) => ({
      id: j.id,
      title: j.title ?? "Job",
      status: j.status,
      role: j.role,
      model: j.model ?? null,
      result: j.result ?? null,
    })),
    sourceIdea,
  };
}

export async function fetchIdeaDetail(ideaId: string): Promise<IdeaDetail> {
  const { data: idea, error: ideaError } = await supabase
    .from("ideas")
    .select("id, title, raw_text, status, priority, description, originator, source, source_ref, tags, clarification_notes, promoted_to_type, promoted_to_id, promoted_at, created_at, updated_at, item_type, horizon, project_id, suggested_exec, triage_notes")
    .eq("id", ideaId)
    .single();

  if (ideaError) throw ideaError;

  const row = idea as Record<string, unknown>;
  let promotedFeature: IdeaDetail["promotedFeature"] = null;

  if (row.promoted_to_type === "feature" && typeof row.promoted_to_id === "string") {
    const { data: feat } = await supabase
      .from("features")
      .select("title, status")
      .eq("id", row.promoted_to_id)
      .single();

    if (feat) {
      const f = feat as { title: string; status: string };
      promotedFeature = { title: f.title, status: f.status };
    }
  }

  return {
    id: row.id as string,
    title: (row.title as string | null) ?? null,
    raw_text: row.raw_text as string,
    status: row.status as string,
    priority: (row.priority as string | null) ?? null,
    description: (row.description as string | null) ?? null,
    originator: (row.originator as string | null) ?? null,
    source: (row.source as string | null) ?? null,
    source_ref: (row.source_ref as string | null) ?? null,
    tags: Array.isArray(row.tags) ? (row.tags as string[]) : null,
    clarification_notes: (row.clarification_notes as string | null) ?? null,
    promoted_to_type: (row.promoted_to_type as string | null) ?? null,
    promoted_to_id: (row.promoted_to_id as string | null) ?? null,
    promoted_at: (row.promoted_at as string | null) ?? null,
    created_at: row.created_at as string,
    updated_at: (row.updated_at as string | null) ?? null,
    item_type: (row.item_type as string | null) ?? null,
    horizon: (row.horizon as string | null) ?? null,
    project_id: (row.project_id as string | null) ?? null,
    suggested_exec: (row.suggested_exec as string | null) ?? null,
    triage_notes: (row.triage_notes as string | null) ?? null,
    promotedFeature,
  };
}

export async function updateIdeaStatus(ideaId: string, status: string): Promise<void> {
  const { error } = await supabase
    .from("ideas")
    .update({ status })
    .eq("id", ideaId);

  if (error) throw error;
}

export interface TeamExecCard {
  id: string;
  roleId: string;
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
      roleId: typeof row.role_id === "string" ? row.role_id : "",
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

export interface Project {
  id: string;
  name: string;
  description: string | null;
}

export async function fetchProjects(companyId: string): Promise<Project[]> {
  const { data, error } = await supabase
    .from("projects")
    .select("id, name, description")
    .eq("company_id", companyId)
    .order("name");

  if (error) throw error;
  return (data ?? []) as Project[];
}

export async function promoteIdea(params: {
  ideaId: string;
  promoteTo: "feature" | "job";
  projectId: string;
  title?: string;
}): Promise<{ promoted_to_id: string }> {
  return invokePost<{ promoted_to_id: string }>("promote-idea", {
    idea_id: params.ideaId,
    promote_to: params.promoteTo,
    project_id: params.projectId,
    title: params.title,
  });
}

export async function commissionProjectArchitect(params: {
  companyId: string;
  projectId: string;
  context: string;
}): Promise<{ job_id?: string }> {
  return invokePost<{ job_id?: string }>("request-work", {
    company_id: params.companyId,
    project_id: params.projectId,
    role: "project-architect",
    context: params.context,
  });
}

export async function requestTriageJob(params: {
  companyId: string;
  projectId: string;
  ideaId: string;
}): Promise<{ job_id?: string }> {
  return invokePost<{ job_id?: string }>("request-work", {
    company_id: params.companyId,
    project_id: params.projectId,
    role: "triage-analyst",
    context: params.ideaId,
  });
}

export async function requestEnrichmentJob(params: {
  companyId: string;
  projectId: string;
  ideaId: string;
  missing: string[];
}): Promise<{ job_id?: string }> {
  return invokePost<{ job_id?: string }>("request-work", {
    company_id: params.companyId,
    project_id: params.projectId,
    role: "triage-analyst",
    context: JSON.stringify({ idea_id: params.ideaId, action: "enrich", missing: params.missing }),
  });
}

export async function requestFeatureFix(params: {
  companyId: string;
  featureId: string;
  reason: string;
}): Promise<{ job_id: string; feature_id: string }> {
  return invokePost<{ job_id: string; feature_id: string }>("request-feature-fix", {
    company_id: params.companyId,
    feature_id: params.featureId,
    reason: params.reason,
  });
}

export async function diagnoseFeature(params: {
  companyId: string;
  featureId: string;
}): Promise<{ job_id: string }> {
  return invokePost<{ job_id: string }>("diagnose-feature", {
    company_id: params.companyId,
    feature_id: params.featureId,
  });
}

export async function fetchJobResult(jobId: string): Promise<{ status: string; result: string | null }> {
  const { data, error } = await supabase
    .from("jobs")
    .select("status, result")
    .eq("id", jobId)
    .single();

  if (error) throw error;
  const row = data as { status: string; result: string | null };
  return { status: row.status, result: row.result };
}

export async function fetchAutoTriageSetting(companyId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from("companies")
    .select("auto_triage")
    .eq("id", companyId)
    .single();

  if (error) throw error;
  return (data as { auto_triage: boolean }).auto_triage;
}

export async function setAutoTriageSetting(companyId: string, enabled: boolean): Promise<void> {
  const { error } = await supabase
    .from("companies")
    .update({ auto_triage: enabled })
    .eq("id", companyId);

  if (error) throw error;
}

export async function updateExecArchetype(
  personalityId: string,
  archetypeId: string,
): Promise<void> {
  const { error } = await supabase
    .from("exec_personalities")
    .update({ archetype_id: archetypeId })
    .eq("id", personalityId);

  if (error) {
    throw error;
  }
}
