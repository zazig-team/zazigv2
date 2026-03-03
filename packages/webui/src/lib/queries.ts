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
  created_at: string;
  originator: string | null;
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
  isExec: boolean;
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
  const { data, error } = await supabase
    .from("goals")
    .select("id, title, description, time_horizon, metric, target, target_date, status, progress, position")
    .eq("company_id", companyId)
    .order("position", { ascending: true });

  if (error) {
    throw error;
  }

  return ((data ?? []) as Array<Record<string, unknown>>).map((row) => ({
    id: String(row.id),
    title: typeof row.title === "string" ? row.title : "Goal",
    description: typeof row.description === "string" ? row.description : null,
    time_horizon: typeof row.time_horizon === "string" ? row.time_horizon : null,
    metric: typeof row.metric === "string" ? row.metric : null,
    target: typeof row.target === "string" ? row.target : null,
    target_date: typeof row.target_date === "string" ? row.target_date : null,
    status: typeof row.status === "string" ? row.status : null,
    progress:
      typeof row.progress === "number" && Number.isFinite(row.progress)
        ? row.progress
        : null,
    position: typeof row.position === "number" ? row.position : null,
  }));
}

export async function fetchFocusAreas(companyId: string): Promise<FocusArea[]> {
  const { data, error } = await supabase
    .from("focus_areas")
    .select("id, title, description, status, health, domain_tags, focus_area_goals(goals(id, title, description, time_horizon, metric, target, target_date, status))")
    .eq("company_id", companyId)
    .order("position", { ascending: true });

  if (error) {
    throw error;
  }

  return ((data ?? []) as Array<Record<string, unknown>>).map((row) => {
    const joinRows = Array.isArray(row.focus_area_goals)
      ? (row.focus_area_goals as Array<{ goals: Record<string, unknown> | null }>)
      : [];

    const goals: Goal[] = joinRows
      .map((jr) => jr.goals)
      .filter((g): g is Record<string, unknown> => g !== null)
      .map((g) => ({
        id: String(g.id),
        title: typeof g.title === "string" ? g.title : "Goal",
        description: typeof g.description === "string" ? g.description : null,
        time_horizon: typeof g.time_horizon === "string" ? g.time_horizon : null,
        metric: typeof g.metric === "string" ? g.metric : null,
        target: typeof g.target === "string" ? g.target : null,
        target_date: typeof g.target_date === "string" ? g.target_date : null,
        status: typeof g.status === "string" ? g.status : null,
        progress: null,
        position: null,
      }));

    return {
      id: String(row.id),
      title: typeof row.title === "string" ? row.title : "Focus Area",
      description: typeof row.description === "string" ? row.description : null,
      status: typeof row.status === "string" ? row.status : "active",
      health: typeof row.health === "string" ? row.health : null,
      domain_tags: Array.isArray(row.domain_tags) ? (row.domain_tags as string[]) : null,
      goals,
    };
  });
}

export async function fetchIdeas(
  companyId: string,
  statuses?: string[],
): Promise<Idea[]> {
  let query = supabase
    .from("ideas")
    .select("id, title, description, raw_text, status, priority, created_at, originator")
    .eq("company_id", companyId)
    .order("created_at", { ascending: false })
    .limit(80);

  if (statuses && statuses.length > 0) {
    query = query.in("status", statuses);
  }

  const { data, error } = await query;

  if (error) {
    throw error;
  }

  return ((data ?? []) as Array<Record<string, unknown>>).map((row) => ({
    id: String(row.id),
    title: typeof row.title === "string" ? row.title : null,
    description: typeof row.description === "string" ? row.description : null,
    raw_text: typeof row.raw_text === "string" ? row.raw_text : "",
    status: typeof row.status === "string" ? row.status : "new",
    priority: typeof row.priority === "string" ? row.priority : null,
    created_at: typeof row.created_at === "string" ? row.created_at : new Date().toISOString(),
    originator: typeof row.originator === "string" ? row.originator : null,
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
  const [featuresResult, jobsResult] = await Promise.all([
    supabase
      .from("features")
      .select("id, title, description, status, priority, created_at, created_by, spec, pr_url, branch, tags")
      .eq("company_id", companyId),
    supabase
      .from("jobs")
      .select("id, feature_id, status")
      .eq("company_id", companyId),
  ]);

  if (featuresResult.error) {
    throw featuresResult.error;
  }
  if (jobsResult.error) {
    throw jobsResult.error;
  }

  const jobs = (jobsResult.data ?? []) as Array<{ id: string; feature_id: string | null; status: string }>;
  const jobCountsByFeature: Record<string, { total: number; complete: number }> = {};
  for (const job of jobs) {
    if (!job.feature_id) continue;
    if (!jobCountsByFeature[job.feature_id]) {
      jobCountsByFeature[job.feature_id] = { total: 0, complete: 0 };
    }
    jobCountsByFeature[job.feature_id].total++;
    if (job.status === "complete") {
      jobCountsByFeature[job.feature_id].complete++;
    }
  }

  const features = (featuresResult.data ?? []) as Array<Record<string, unknown>>;
  const featuresByStatus: Record<string, Array<Record<string, unknown>>> = {};
  for (const feature of features) {
    const status = typeof feature.status === "string" ? feature.status : "created";
    if (!featuresByStatus[status]) {
      featuresByStatus[status] = [];
    }
    const id = String(feature.id);
    const counts = jobCountsByFeature[id];
    featuresByStatus[status].push({
      ...feature,
      job_counts: counts ? { total: counts.total, complete: counts.complete } : { total: 0, complete: 0 },
    });
  }

  return {
    snapshot: { features_by_status: featuresByStatus },
    updated_at: new Date().toISOString(),
  };
}

export interface FeatureJob {
  id: string;
  title: string;
  status: string;
  role: string;
  model: string | null;
  complexity: string | null;
  prUrl: string | null;
  branch: string | null;
}

export interface SourceIdea {
  id: string;
  title: string | null;
  rawText: string;
  status: string;
  promotedAt: string | null;
}

export interface FeatureDetail {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  branch: string | null;
  spec: string | null;
  acceptanceTests: string | null;
  verificationType: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  createdBy: string | null;
  prUrl: string | null;
  jobs: FeatureJob[];
  sourceIdea: SourceIdea | null;
}

export async function fetchFeatureDetail(featureId: string): Promise<FeatureDetail> {
  const [featureResult, jobsResult, ideaResult] = await Promise.all([
    supabase
      .from("features")
      .select(
        "id, title, description, status, priority, branch, spec, acceptance_tests, verification_type, created_at, updated_at, completed_at, created_by, pr_url",
      )
      .eq("id", featureId)
      .single(),
    supabase
      .from("jobs")
      .select("id, title, status, role, model, complexity, pr_url, branch")
      .eq("feature_id", featureId)
      .order("created_at", { ascending: true }),
    supabase
      .from("ideas")
      .select("id, title, raw_text, status, promoted_at")
      .eq("promoted_to_type", "feature")
      .eq("promoted_to_id", featureId)
      .limit(1),
  ]);

  if (featureResult.error) {
    throw featureResult.error;
  }

  const f = featureResult.data as Record<string, unknown>;

  const jobs: FeatureJob[] = ((jobsResult.data ?? []) as Array<Record<string, unknown>>).map(
    (j) => ({
      id: String(j.id),
      title: typeof j.title === "string" ? j.title : "Untitled job",
      status: typeof j.status === "string" ? j.status : "queued",
      role: typeof j.role === "string" ? j.role : "unknown",
      model: typeof j.model === "string" ? j.model : null,
      complexity: typeof j.complexity === "string" ? j.complexity : null,
      prUrl: typeof j.pr_url === "string" ? j.pr_url : null,
      branch: typeof j.branch === "string" ? j.branch : null,
    }),
  );

  // PR URL: prefer feature-level pr_url, fall back to first job with one
  const featurePrUrl =
    (typeof f.pr_url === "string" ? f.pr_url : null) ??
    jobs.find((j) => j.prUrl)?.prUrl ??
    null;

  return {
    id: String(f.id),
    title: typeof f.title === "string" ? f.title : "Untitled",
    description: typeof f.description === "string" ? f.description : null,
    status: typeof f.status === "string" ? f.status : "created",
    priority: typeof f.priority === "string" ? f.priority : "medium",
    branch: typeof f.branch === "string" ? f.branch : null,
    spec: typeof f.spec === "string" ? f.spec : null,
    acceptanceTests: typeof f.acceptance_tests === "string" ? f.acceptance_tests : null,
    verificationType: typeof f.verification_type === "string" ? f.verification_type : null,
    createdAt: typeof f.created_at === "string" ? f.created_at : new Date().toISOString(),
    updatedAt: typeof f.updated_at === "string" ? f.updated_at : new Date().toISOString(),
    completedAt: typeof f.completed_at === "string" ? f.completed_at : null,
    createdBy: typeof f.created_by === "string" ? f.created_by : null,
    prUrl: featurePrUrl,
    jobs,
    sourceIdea: (() => {
      const ideaRow = (ideaResult.data ?? [])[0] as Record<string, unknown> | undefined;
      if (!ideaRow) return null;
      return {
        id: String(ideaRow.id),
        title: typeof ideaRow.title === "string" ? ideaRow.title : null,
        rawText: typeof ideaRow.raw_text === "string" ? ideaRow.raw_text : "",
        status: typeof ideaRow.status === "string" ? ideaRow.status : "promoted",
        promotedAt: typeof ideaRow.promoted_at === "string" ? ideaRow.promoted_at : null,
      };
    })(),
  };
}

export interface IdeaDetail {
  id: string;
  title: string | null;
  description: string | null;
  rawText: string;
  status: string;
  priority: string;
  originator: string | null;
  source: string | null;
  sourceRef: string | null;
  clarificationNotes: string | null;
  tags: string[];
  createdAt: string;
  updatedAt: string;
  promotedToType: string | null;
  promotedToId: string | null;
  promotedAt: string | null;
  promotedFeature: { id: string; title: string; status: string } | null;
}

export async function fetchIdeaDetail(ideaId: string): Promise<IdeaDetail> {
  const { data, error } = await supabase
    .from("ideas")
    .select(
      "id, title, description, raw_text, status, priority, originator, source, source_ref, clarification_notes, tags, created_at, updated_at, promoted_to_type, promoted_to_id, promoted_at",
    )
    .eq("id", ideaId)
    .single();

  if (error) {
    throw error;
  }

  const row = data as Record<string, unknown>;

  // If promoted to a feature, fetch its title and status
  let promotedFeature: IdeaDetail["promotedFeature"] = null;
  if (row.promoted_to_type === "feature" && typeof row.promoted_to_id === "string") {
    const { data: featureData } = await supabase
      .from("features")
      .select("id, title, status")
      .eq("id", row.promoted_to_id)
      .single();

    if (featureData) {
      const f = featureData as Record<string, unknown>;
      promotedFeature = {
        id: String(f.id),
        title: typeof f.title === "string" ? f.title : "Untitled",
        status: typeof f.status === "string" ? f.status : "created",
      };
    }
  }

  return {
    id: String(row.id),
    title: typeof row.title === "string" ? row.title : null,
    description: typeof row.description === "string" ? row.description : null,
    rawText: typeof row.raw_text === "string" ? row.raw_text : "",
    status: typeof row.status === "string" ? row.status : "new",
    priority: typeof row.priority === "string" ? row.priority : "medium",
    originator: typeof row.originator === "string" ? row.originator : null,
    source: typeof row.source === "string" ? row.source : null,
    sourceRef: typeof row.source_ref === "string" ? row.source_ref : null,
    clarificationNotes: typeof row.clarification_notes === "string" ? row.clarification_notes : null,
    tags: Array.isArray(row.tags) ? (row.tags as string[]) : [],
    createdAt: typeof row.created_at === "string" ? row.created_at : new Date().toISOString(),
    updatedAt: typeof row.updated_at === "string" ? row.updated_at : new Date().toISOString(),
    promotedToType: typeof row.promoted_to_type === "string" ? row.promoted_to_type : null,
    promotedToId: typeof row.promoted_to_id === "string" ? row.promoted_to_id : null,
    promotedAt: typeof row.promoted_at === "string" ? row.promoted_at : null,
    promotedFeature,
  };
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

  const completedFeatures = features.filter(
    (feature) => feature.status === "complete" || feature.status === "merged",
  ).length;
  const failedFeatures = features.filter(
    (feature) => feature.status === "failed" || feature.status === "cancelled",
  ).length;
  const activeFeatures = features.filter(
    (feature) =>
      feature.status === "created" ||
      feature.status === "ready_for_breakdown" ||
      feature.status === "breakdown" ||
      feature.status === "breaking_down" ||
      feature.status === "building" ||
      feature.status === "combining_and_pr" ||
      feature.status === "verifying" ||
      feature.status === "merging",
  ).length;

  const activeJobs = jobs.filter(
    (job) => job.status === "dispatched" || job.status === "executing",
  ).length;
  const totalJobs = jobs.length;
  const successfulJobs = jobs.filter((job) => job.status === "complete").length;
  const shipRate = totalJobs === 0 ? 0 : Math.round((successfulJobs / totalJobs) * 100);

  return {
    activeFeatures,
    mergedFeatures: completedFeatures,
    failedFeatures,
    activeJobs,
    totalJobs,
    shipRate,
  };
}

export async function fetchDashboardTeam(
  companyId: string,
): Promise<TeamSidebarData> {
  const [jobsResult, machinesResult, execResult] = await Promise.all([
    supabase
      .from("jobs")
      .select("role, status, machine_id")
      .eq("company_id", companyId)
      .in("status", ["dispatched", "executing"]),
    supabase
      .from("machines")
      .select("id, last_heartbeat")
      .eq("company_id", companyId),
    supabase
      .from("exec_personalities")
      .select("id, roles(name)")
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

  // Exec personalities are always shown (CPO, CTO, etc.)
  const execRoleNames = new Set<string>();
  if (!execResult.error && execResult.data) {
    for (const row of execResult.data as Array<{ id: string; roles: { name: string } | Array<{ name: string }> | null }>) {
      const role = Array.isArray(row.roles) ? row.roles[0] : row.roles;
      if (role?.name) {
        execRoleNames.add(role.name);
      }
    }
  }

  const members: TeamSidebarMember[] = [];

  // Add execs first (always present)
  for (const roleName of execRoleNames) {
    members.push({
      role: roleName,
      activeJobs: byRole.get(roleName) ?? 0,
      isExec: true,
    });
    byRole.delete(roleName);
  }

  // Add remaining active job roles
  for (const [role, activeJobs] of byRole.entries()) {
    members.push({ role, activeJobs, isExec: false });
  }

  // Sort: execs first, then by active jobs
  members.sort((a, b) => {
    if (a.isExec !== b.isExec) return a.isExec ? -1 : 1;
    return b.activeJobs - a.activeJobs;
  });

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

function parseDimensionValue(raw: unknown): string | null {
  if (typeof raw === "number") {
    return String(raw);
  }
  if (typeof raw === "string") {
    return raw;
  }
  if (raw && typeof raw === "object") {
    const obj = raw as Record<string, unknown>;
    if (typeof obj.value === "number") {
      return String(obj.value);
    }
    if (typeof obj.current === "number") {
      return String(obj.current);
    }
  }
  return null;
}

function parseTraits(value: unknown): string[] {
  if (!value || typeof value !== "object") {
    return [];
  }

  const entries = Object.entries(value as Record<string, unknown>);
  return entries
    .slice(0, 5)
    .map(([key, raw]) => {
      const parsed = parseDimensionValue(raw);
      return parsed !== null ? `${key.replace(/_/g, " ")}: ${parsed}` : key.replace(/_/g, " ");
    });
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
