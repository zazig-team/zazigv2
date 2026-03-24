import { getValidCredentials } from "../lib/credentials.js";
import { DEFAULT_SUPABASE_ANON_KEY } from "../lib/constants.js";
import { loadConfig } from "../lib/config.js";

const TWO_HOURS_MS = 2 * 60 * 60 * 1000;

type AnyRecord = Record<string, unknown>;

interface ActiveItem {
  title: string;
  status: string;
  jobs_done: number;
  jobs_total: number;
  updated_at: string | null;
}

interface FailedItem {
  title: string;
  priority: string;
  updated_at: string | null;
}

interface CompletedItem {
  title: string;
  promoted_version: string | null;
  updated_at: string | null;
}

interface StuckItem {
  title: string;
  status: string;
  updated_at: string | null;
}

interface StandupReport {
  date: string;
  inbox: {
    new: number;
    total: number;
  };
  pipeline: {
    active: number;
    backlog: number;
    failed: number;
    complete: number;
  };
  capacity: {
    machines: number;
    active_jobs: number;
    codex_slots: number;
    cc_slots: number;
  };
  active: ActiveItem[];
  failed: FailedItem[];
  completed: CompletedItem[];
  stuck: StuckItem[];
  recommendations: string[];
}

function parseCompanyFlag(args: string[]): string | undefined {
  const idx = args.indexOf("--company");
  if (idx === -1) return undefined;
  const value = args[idx + 1];
  if (!value || value.startsWith("--")) return undefined;
  return value;
}

function hasJsonFlag(args: string[]): boolean {
  return args.includes("--json");
}

function isRecord(value: unknown): value is AnyRecord {
  return typeof value === "object" && value !== null;
}

function asRecord(value: unknown): AnyRecord {
  return isRecord(value) ? value : {};
}

function asRecordArray(value: unknown): AnyRecord[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isRecord);
}

function getString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function getNumber(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number.parseInt(value, 10);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function parseUpdatedAt(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const ts = Date.parse(value);
  if (Number.isNaN(ts)) return null;
  return value;
}

function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function isOlderThanTwoHours(updatedAt: string | null, nowMs: number): boolean {
  if (!updatedAt) return false;
  const updatedAtMs = Date.parse(updatedAt);
  if (Number.isNaN(updatedAtMs)) return false;
  return nowMs - updatedAtMs > TWO_HOURS_MS;
}

function toActiveItem(feature: AnyRecord, status: string, activeJobs: AnyRecord[]): ActiveItem {
  const id = getString(feature.id);
  const jobsForFeature = id.length > 0
    ? activeJobs.filter((job) => getString(job.feature_id) === id)
    : [];

  // Snapshot only includes active jobs, so this is a best-effort approximation
  // of total jobs for the feature rather than a complete historical count.
  const jobsTotal = jobsForFeature.length;
  const jobsDone = jobsForFeature.filter((job) => {
    const jobStatus = getString(job.status);
    return jobStatus === "executing" || jobStatus === "dispatched";
  }).length;

  return {
    title: getString(feature.title, "Untitled feature"),
    status,
    jobs_done: jobsDone,
    jobs_total: jobsTotal,
    updated_at: parseUpdatedAt(feature.updated_at),
  };
}

function toFailedItem(feature: AnyRecord): FailedItem {
  return {
    title: getString(feature.title, "Untitled feature"),
    priority: getString(feature.priority, "unknown"),
    updated_at: parseUpdatedAt(feature.updated_at),
  };
}

function toCompletedItem(feature: AnyRecord): CompletedItem {
  const promotedVersion = getString(feature.promoted_version);
  return {
    title: getString(feature.title, "Untitled feature"),
    promoted_version: promotedVersion.length > 0 ? promotedVersion : null,
    updated_at: parseUpdatedAt(feature.updated_at),
  };
}

function recommendationList(report: Omit<StandupReport, "recommendations">): string[] {
  const recommendations: string[] = [];

  if (report.inbox.new > 0) {
    recommendations.push("Triage the inbox?");
  }

  if (report.failed.length > 3) {
    recommendations.push("Failed features accumulating — run /scrum");
  }

  if (report.pipeline.backlog > 5 && report.pipeline.active < 2) {
    recommendations.push("Pipeline has capacity — run /scrum");
  }

  if (report.stuck.length > 0) {
    recommendations.push("Stuck features — investigate?");
  }

  return recommendations;
}

function buildReport(snapshot: AnyRecord, now: Date): StandupReport {
  const featuresByStatus = asRecord(snapshot.features_by_status);
  const activeJobs = asRecordArray(snapshot.active_jobs);

  const backlogFeatures = asRecordArray(featuresByStatus.created);
  const failedFeatures = asRecordArray(featuresByStatus.failed);

  const active: ActiveItem[] = [];
  for (const [status, rawFeatures] of Object.entries(featuresByStatus)) {
    if (status === "created" || status === "failed") {
      continue;
    }

    for (const feature of asRecordArray(rawFeatures)) {
      active.push(toActiveItem(feature, status, activeJobs));
    }
  }

  const nowMs = now.getTime();
  const stuck: StuckItem[] = active
    .filter((item) => isOlderThanTwoHours(item.updated_at, nowMs))
    .map((item) => ({
      title: item.title,
      status: item.status,
      updated_at: item.updated_at,
    }));

  const failed = failedFeatures.map(toFailedItem);
  const completedAll = asRecordArray(snapshot.completed_features).map(toCompletedItem);
  const completed = completedAll.slice(0, 5);

  const ideasInbox = asRecord(snapshot.ideas_inbox);
  const capacity = asRecord(snapshot.capacity);

  const baseReport = {
    "date": formatDate(now),
    "inbox": {
      "new": getNumber(ideasInbox.new_count),
      "total": getNumber(ideasInbox.total_count),
    },
    "pipeline": {
      "active": active.length,
      "backlog": backlogFeatures.length,
      "failed": failed.length,
      "complete": completedAll.length,
    },
    "capacity": {
      "machines": getNumber(capacity.machines_online),
      "active_jobs": activeJobs.length,
      "codex_slots": getNumber(capacity.total_codex_slots),
      "cc_slots": getNumber(capacity.total_claude_code_slots),
    },
    "active": active,
    "failed": failed,
    "completed": completed,
    "stuck": stuck,
  };

  return {
    ...baseReport,
    "recommendations": recommendationList(baseReport),
  };
}

function formatVersionForText(version: string | null): string {
  if (!version) return "";
  return version.startsWith("v") ? version : `v${version}`;
}

function formatTextOutput(report: StandupReport): string {
  const lines: string[] = [];

  lines.push(`Standup — ${report.date}`);
  lines.push("");
  lines.push(`Inbox: ${report.inbox.new} new ideas`);
  lines.push(
    `Pipeline: ${report.pipeline.active} active | ${report.pipeline.backlog} backlog | ${report.pipeline.failed} failed | ${report.pipeline.complete} complete`,
  );
  lines.push(`Capacity: ${report.capacity.machines} machines online, ${report.capacity.active_jobs} active jobs`);

  if (report.active.length > 0) {
    lines.push("");
    lines.push("Active work:");
    for (const item of report.active) {
      lines.push(`  ${item.title} — ${item.status} (${item.jobs_done}/${item.jobs_total} jobs done)`);
    }
  }

  if (report.failed.length > 0) {
    lines.push("");
    lines.push("Failed:");
    for (const item of report.failed) {
      lines.push(`  ${item.title} — ${item.priority}`);
    }
  }

  if (report.completed.length > 0) {
    lines.push("");
    lines.push("Recently completed:");
    for (const item of report.completed) {
      const version = formatVersionForText(item.promoted_version);
      if (version) {
        lines.push(`  ${item.title} — ${version}`);
      } else {
        lines.push(`  ${item.title}`);
      }
    }
  }

  if (report.stuck.length === 0) {
    lines.push("");
    lines.push("Stuck: none");
  } else {
    lines.push("");
    lines.push("Stuck:");
    for (const item of report.stuck) {
      lines.push(`  ${item.title} — ${item.status}`);
    }
  }

  if (report.recommendations.length > 0) {
    lines.push("");
    lines.push(...report.recommendations);
  }

  return `${lines.join("\n")}\n`;
}

export async function standup(args: string[]): Promise<void> {
  const companyId = parseCompanyFlag(args);
  if (!companyId) {
    process.stderr.write("Usage: zazig standup --company <company-id> [--json]\n");
    process.exit(1);
  }

  const jsonOutput = hasJsonFlag(args);

  let creds;
  try {
    creds = await getValidCredentials();
  } catch {
    process.stderr.write(JSON.stringify({ "error": "Not logged in. Run zazig login" }));
    process.exit(1);
  }

  const config = (() => {
    try {
      return loadConfig() as { supabaseUrl?: string; supabase_url?: string };
    } catch {
      return undefined;
    }
  })();
  const supabaseUrl = config?.supabaseUrl ?? config?.supabase_url ?? creds.supabaseUrl;

  const endpoint = new URL(`${supabaseUrl}/functions/v1/get-pipeline-snapshot`);
  endpoint.searchParams.set("company_id", companyId);

  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${creds.accessToken}`,
        apikey: DEFAULT_SUPABASE_ANON_KEY,
        "x-company-id": companyId,
      },
    });
  } catch (error) {
    process.stderr.write(JSON.stringify({ "error": `Network error: ${String(error)}` }));
    process.exit(1);
  }

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    process.stderr.write(JSON.stringify({ "error": `HTTP ${response.status}: ${body}` }));
    process.exit(1);
  }

  const payload = asRecord(await response.json());
  const snapshot = asRecord(payload.snapshot);
  const report = buildReport(snapshot, new Date());

  if (jsonOutput) {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } else {
    process.stdout.write(formatTextOutput(report));
  }

  process.exit(0);
}
