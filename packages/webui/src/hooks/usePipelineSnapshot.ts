import { useEffect, useMemo, useState } from "react";
import { fetchPipelineSnapshot, getAccessToken } from "../lib/queries";

export type PipelineStatus =
  | "proposal"
  | "ready"
  | "breaking_down"
  | "building"
  | "combining_and_pr"
  | "verifying"
  | "pr_ready"
  | "complete"
  | "failed"
  | "shipped";

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
}

type PipelineActiveJobStatus = "queued" | "dispatched" | "executing";

export interface PipelineActiveJob {
  id: string;
  featureId: string | null;
  role: string | null;
  status: PipelineActiveJobStatus;
  createdAt: string | null;
}

export interface NormalizedPipelineSnapshot {
  updatedAt: string | null;
  byStatus: Record<PipelineStatus, PipelineFeature[]>;
  activeJobs: PipelineActiveJob[];
}

const EMPTY_SNAPSHOT: NormalizedPipelineSnapshot = {
  updatedAt: null,
  byStatus: {
    proposal: [],
    ready: [],
    breaking_down: [],
    building: [],
    combining_and_pr: [],
    verifying: [],
    pr_ready: [],
    complete: [],
    failed: [],
    shipped: [],
  },
  activeJobs: [],
};

function toPipelineStatus(rawStatus: string | null | undefined): PipelineStatus | null {
  if (!rawStatus) {
    return null;
  }

  const normalized = rawStatus.trim().toLowerCase();
  switch (normalized) {
    case "created":
    case "proposal":
      return "proposal";
    case "ready_for_breakdown":
    case "ready":
      return "ready";
    case "breakdown":
    case "breaking_down":
      return "breaking_down";
    case "building":
      return "building";
    case "combining":
    case "combining_and_pr":
      return "combining_and_pr";
    case "verifying":
      return "verifying";
    case "pr_ready":
    case "merging":
      return "pr_ready";
    case "complete":
      return "complete";
    case "shipped":
    case "merged":
      return "shipped";
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

function toActiveJobStatus(rawStatus: string | null | undefined): PipelineActiveJobStatus | null {
  if (!rawStatus) {
    return null;
  }

  const normalized = rawStatus.trim().toLowerCase();
  if (normalized === "queued" || normalized === "dispatched" || normalized === "executing") {
    return normalized;
  }

  return null;
}

function parseActiveJob(
  raw: Record<string, unknown>,
  fallbackFeatureId: string | null = null,
): PipelineActiveJob | null {
  const status = toActiveJobStatus(stringValue(raw.status));
  if (!status) {
    return null;
  }

  return {
    id: stringValue(raw.id) ?? crypto.randomUUID(),
    featureId: stringValue(raw.feature_id) ?? stringValue(raw.featureId) ?? fallbackFeatureId,
    role: stringValue(raw.role),
    status,
    createdAt: stringValue(raw.created_at) ?? stringValue(raw.createdAt),
  };
}

function collectActiveJobs(
  rawJobs: unknown,
  fallbackFeatureId: string | null = null,
): PipelineActiveJob[] {
  if (!Array.isArray(rawJobs)) {
    return [];
  }

  return rawJobs
    .map((rawJob) => {
      if (!rawJob || typeof rawJob !== "object") {
        return null;
      }
      return parseActiveJob(rawJob as Record<string, unknown>, fallbackFeatureId);
    })
    .filter((job): job is PipelineActiveJob => job !== null);
}

function sortByNewestCreatedAt(jobs: PipelineActiveJob[]): PipelineActiveJob[] {
  const score = (value: string | null): number => {
    if (!value) {
      return Number.NEGATIVE_INFINITY;
    }
    const timestamp = Date.parse(value);
    return Number.isNaN(timestamp) ? Number.NEGATIVE_INFINITY : timestamp;
  };

  return [...jobs].sort((a, b) => score(b.createdAt) - score(a.createdAt));
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
  };
}

function normalizeSnapshot(snapshot: unknown, updatedAt: string | null): NormalizedPipelineSnapshot {
  const byStatus: Record<PipelineStatus, PipelineFeature[]> = {
    proposal: [],
    ready: [],
    breaking_down: [],
    building: [],
    combining_and_pr: [],
    verifying: [],
    pr_ready: [],
    complete: [],
    failed: [],
    shipped: [],
  };
  const activeJobsById = new Map<string, PipelineActiveJob>();
  const upsertActiveJob = (job: PipelineActiveJob): void => {
    activeJobsById.set(job.id, job);
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
          const featureRecord = rawFeature as Record<string, unknown>;
          const parsedFeature = parseFeature(featureRecord, status);
          byStatus[status].push(parsedFeature);
          collectActiveJobs(featureRecord.jobs, parsedFeature.id).forEach(upsertActiveJob);
        }
      }
    } else {
      const rawFeatures = snapshotObj.features;
      if (Array.isArray(rawFeatures)) {
        for (const rawFeature of rawFeatures) {
          if (!rawFeature || typeof rawFeature !== "object") {
            continue;
          }
          const featureRecord = rawFeature as Record<string, unknown>;
          const status =
            toPipelineStatus(stringValue(featureRecord.status)) ??
            "breaking_down";
          const parsedFeature = parseFeature(featureRecord, status);
          byStatus[status].push(parsedFeature);
          collectActiveJobs(featureRecord.jobs, parsedFeature.id).forEach(upsertActiveJob);
        }
      }
    }

    collectActiveJobs(snapshotObj.active_jobs).forEach(upsertActiveJob);
  }

  // Pick up completed_features from top level (RPC stores complete/cancelled separately)
  if (snapshot && typeof snapshot === "object") {
    const snapshotObj = snapshot as Record<string, unknown>;
    const completedFeatures = snapshotObj.completed_features;
    if (Array.isArray(completedFeatures)) {
      for (const rawFeature of completedFeatures) {
        if (!rawFeature || typeof rawFeature !== "object") continue;
        const parsed = parseFeature(rawFeature as Record<string, unknown>, "shipped");
        byStatus[parsed.status].push(parsed);
      }
    }
  }

  return {
    updatedAt,
    byStatus,
    activeJobs: sortByNewestCreatedAt(Array.from(activeJobsById.values())),
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
      await getAccessToken();
      const response = await fetchPipelineSnapshot(companyId);
      setSnapshot(normalizeSnapshot(response.snapshot, response.updated_at ?? null));
    } catch (refreshError) {
      setError(refreshError instanceof Error ? refreshError.message : String(refreshError));
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
