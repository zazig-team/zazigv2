import { useEffect, useMemo, useState } from "react";
import { fetchPipelineSnapshot } from "../lib/queries";

export type PipelineStatus =
  | "created"
  | "ready_for_breakdown"
  | "breakdown"
  | "building"
  | "combining_and_pr"
  | "verifying"
  | "merging"
  | "complete"
  | "failed";

export interface PipelineFeature {
  id: string;
  title: string;
  description: string;
  status: PipelineStatus;
  priority: string;
  createdAt: string | null;
  ageHours: number | null;
  jobsDone: number;
  jobsTotal: number;
  assignee: string | null;
  hasSpec: boolean;
  needsWorkshop: boolean;
  prUrl: string | null;
  branch: string | null;
  createdBy: string | null;
}

export interface NormalizedPipelineSnapshot {
  updatedAt: string | null;
  byStatus: Record<PipelineStatus, PipelineFeature[]>;
}

const EMPTY_SNAPSHOT: NormalizedPipelineSnapshot = {
  updatedAt: null,
  byStatus: {
    created: [],
    ready_for_breakdown: [],
    breakdown: [],
    building: [],
    combining_and_pr: [],
    verifying: [],
    merging: [],
    complete: [],
    failed: [],
  },
};

function toPipelineStatus(rawStatus: string | null | undefined): PipelineStatus | null {
  if (!rawStatus) {
    return null;
  }

  const normalized = rawStatus.trim().toLowerCase();
  switch (normalized) {
    case "created":
      return "created";
    case "ready_for_breakdown":
      return "ready_for_breakdown";
    case "breakdown":
    case "breaking_down":
      return "breakdown";
    case "building":
      return "building";
    case "combining":
    case "combining_and_pr":
      return "combining_and_pr";
    case "verifying":
      return "verifying";
    case "merging":
    case "pr_ready":
      return "merging";
    case "complete":
    case "shipped":
    case "merged":
      return "complete";
    case "cancelled":
    case "failed":
      return "failed";
    default:
      return null;
  }
}

function numericValue(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function ageInHours(isoValue: string | null): number | null {
  if (!isoValue) {
    return null;
  }

  const timestamp = Date.parse(isoValue);
  if (Number.isNaN(timestamp)) {
    return null;
  }

  return Math.max(0, Math.floor((Date.now() - timestamp) / (1000 * 60 * 60)));
}

function parseFeature(raw: Record<string, unknown>, fallbackStatus: PipelineStatus): PipelineFeature {
  const fromStatus = toPipelineStatus(stringValue(raw.status));
  const status = fromStatus ?? fallbackStatus;

  const createdAt =
    stringValue(raw.created_at) ?? stringValue(raw.createdAt) ?? stringValue(raw.since);

  let jobsTotal =
    numericValue(raw.jobs_total) ??
    numericValue(raw.total_jobs) ??
    numericValue(raw.job_count) ??
    numericValue(raw.jobsCount) ??
    0;

  let jobsDone =
    numericValue(raw.jobs_done) ??
    numericValue(raw.completed_jobs) ??
    numericValue(raw.done_jobs) ??
    numericValue(raw.complete_count) ??
    0;

  const jobCounts = raw.job_counts;
  if (jobCounts && typeof jobCounts === "object") {
    jobsTotal = numericValue((jobCounts as Record<string, unknown>).total) ?? jobsTotal;
    jobsDone = numericValue((jobCounts as Record<string, unknown>).complete) ?? jobsDone;
  }

  const jobs = raw.jobs;
  if (Array.isArray(jobs) && jobs.length > 0) {
    jobsTotal = Math.max(jobsTotal, jobs.length);
    const completeCount = jobs.filter((job) => {
      if (!job || typeof job !== "object") {
        return false;
      }
      return (job as Record<string, unknown>).status === "complete";
    }).length;
    jobsDone = Math.max(jobsDone, completeCount);
  }

  const id = stringValue(raw.id) ?? crypto.randomUUID();
  const title =
    stringValue(raw.title) ?? stringValue(raw.name) ?? stringValue(raw.feature_title) ?? "Untitled";
  const description =
    stringValue(raw.description) ?? stringValue(raw.summary) ?? stringValue(raw.context) ?? "";

  const spec = stringValue(raw.spec);
  const tags = Array.isArray(raw.tags) ? raw.tags : [];

  return {
    id,
    title,
    description,
    status,
    priority: stringValue(raw.priority) ?? "medium",
    createdAt,
    ageHours: ageInHours(createdAt),
    jobsDone,
    jobsTotal,
    assignee:
      stringValue(raw.owner_id) ?? stringValue(raw.owner) ?? stringValue(raw.originator),
    hasSpec: spec !== null && spec.trim().length > 0,
    needsWorkshop: tags.includes("needs-workshop"),
    prUrl: stringValue(raw.pr_url) ?? null,
    branch: stringValue(raw.branch) ?? null,
    createdBy: stringValue(raw.created_by) ?? null,
  };
}

function normalizeSnapshot(snapshot: unknown, updatedAt: string | null): NormalizedPipelineSnapshot {
  const byStatus: Record<PipelineStatus, PipelineFeature[]> = {
    created: [],
    ready_for_breakdown: [],
    breakdown: [],
    building: [],
    combining_and_pr: [],
    verifying: [],
    merging: [],
    complete: [],
    failed: [],
  };

  if (snapshot && typeof snapshot === "object") {
    const snapshotObj = snapshot as Record<string, unknown>;

    const grouped =
      (snapshotObj.features_by_status as Record<string, unknown> | undefined) ??
      (snapshotObj.statuses as Record<string, unknown> | undefined);

    if (grouped && typeof grouped === "object") {
      for (const [rawStatus, rawFeatures] of Object.entries(grouped)) {
        const status = toPipelineStatus(rawStatus);
        if (!status || !Array.isArray(rawFeatures)) {
          continue;
        }

        for (const rawFeature of rawFeatures) {
          if (!rawFeature || typeof rawFeature !== "object") {
            continue;
          }
          byStatus[status].push(parseFeature(rawFeature as Record<string, unknown>, status));
        }
      }
    } else {
      const rawFeatures = snapshotObj.features;
      if (Array.isArray(rawFeatures)) {
        for (const rawFeature of rawFeatures) {
          if (!rawFeature || typeof rawFeature !== "object") {
            continue;
          }
          const status =
            toPipelineStatus(stringValue((rawFeature as Record<string, unknown>).status)) ??
            "created";
          byStatus[status].push(parseFeature(rawFeature as Record<string, unknown>, status));
        }
      }
    }
  }

  return {
    updatedAt,
    byStatus,
  };
}

export function usePipelineSnapshot(companyId: string | null): {
  loading: boolean;
  error: string | null;
  snapshot: NormalizedPipelineSnapshot;
  refresh: () => Promise<void>;
} {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<NormalizedPipelineSnapshot>(EMPTY_SNAPSHOT);

  const refresh = async (): Promise<void> => {
    if (!companyId) {
      setSnapshot(EMPTY_SNAPSHOT);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetchPipelineSnapshot(companyId);
      setSnapshot(normalizeSnapshot(response.snapshot, response.updated_at ?? null));
    } catch (refreshError) {
      const msg = refreshError instanceof Error
        ? refreshError.message
        : (refreshError && typeof refreshError === "object" && "message" in refreshError)
          ? String((refreshError as { message: unknown }).message)
          : String(refreshError);
      setError(msg);
      setSnapshot(EMPTY_SNAPSHOT);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, [companyId]);

  return useMemo(
    () => ({ loading, error, snapshot, refresh }),
    [loading, error, snapshot],
  );
}
