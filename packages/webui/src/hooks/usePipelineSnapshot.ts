import { useEffect, useMemo, useState } from "react";
import { fetchPipelineSnapshot, getAccessToken } from "../lib/queries";
import { supabase } from "../lib/supabase";

export type PipelineStatus =
  | "proposal"
  | "ready"
  | "breaking_down"
  | "writing_tests"
  | "building"
  | "combining_and_pr"
  | "ci_checking"
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
  updatedAt: string | null;
  ageHours: number | null;
  jobsDone: number;
  jobsTotal: number;
  assignee: string | null;
  capability_id: string | null;
  capability_icon: string | null;
  capability_title: string | null;
  hasFailedJobs: boolean;
  hasJobErrors: boolean;
  criticalJobErrorCount: number;
  branch: string | null;
  promoted_version: string | null;
  staging_verified_by: string | null;
  staging_verified_at: string | null;
  jobs: PipelineFeatureJob[];
}

export interface PipelineFeatureJob {
  status: string | null;
  jobType: string | null;
  role: string | null;
  title: string | null;
  result: unknown;
}

interface CapabilityLookupEntry {
  icon: string | null;
  title: string | null;
}

type CapabilityLookup = Record<string, CapabilityLookupEntry>;

type PipelineActiveJobStatus = "queued" | "executing";

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
  ideasInboxNewCount: number;
  activeJobs: PipelineActiveJob[];
}

const EMPTY_SNAPSHOT: NormalizedPipelineSnapshot = {
  updatedAt: null,
  byStatus: {
    proposal: [],
    ready: [],
    breaking_down: [],
    writing_tests: [],
    building: [],
    combining_and_pr: [],
    ci_checking: [],
    pr_ready: [],
    complete: [],
    failed: [],
    shipped: [],
  },
  ideasInboxNewCount: 0,
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
    case "writing_tests":
      return "writing_tests";
    case "building":
      return "building";
    case "combining":
    case "combining_and_pr":
      return "combining_and_pr";
    case "ci_checking":
      return "ci_checking";
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
  if (normalized === "queued" || normalized === "executing") {
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

async function fetchCapabilityLookup(companyId: string): Promise<CapabilityLookup> {
  const { data, error } = await supabase
    .from("capabilities")
    .select("id, icon, title")
    .eq("company_id", companyId);

  if (error) {
    if (isMissingRelationError(error)) {
      return {};
    }
    throw error;
  }

  const lookup: CapabilityLookup = {};
  for (const row of (data ?? []) as Array<Record<string, unknown>>) {
    const capabilityId = stringValue(row.id);
    if (!capabilityId) {
      continue;
    }

    lookup[capabilityId] = {
      icon: stringValue(row.icon),
      title: stringValue(row.title),
    };
  }

  return lookup;
}

function parseFeatureJobs(value: unknown): PipelineFeatureJob[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => {
      if (!entry || typeof entry !== "object") {
        return null;
      }

      const job = entry as Record<string, unknown>;
      return {
        status: stringValue(job.status),
        jobType:
          stringValue(job.job_type) ??
          stringValue(job.jobType) ??
          stringValue(job.type),
        role: stringValue(job.role),
        title: stringValue(job.title),
        result: job.result,
      };
    })
    .filter((job): job is PipelineFeatureJob => job !== null);
}

function parseFeature(
  raw: Record<string, unknown>,
  fallbackStatus: PipelineStatus,
  capabilityLookup: CapabilityLookup,
): PipelineFeature {
  const fromStatus = toPipelineStatus(stringValue(raw.status));
  const status = fromStatus ?? fallbackStatus;

  const createdAt =
    stringValue(raw.created_at) ?? stringValue(raw.createdAt) ?? stringValue(raw.since);
  const updatedAt = stringValue(raw.updated_at) ?? stringValue(raw.updatedAt) ?? null;

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

  const jobs = parseFeatureJobs(raw.jobs);
  if (jobs.length > 0) {
    const nonCancelledJobs = jobs.filter((job) => {
      const normalized = (job.status ?? "").toLowerCase();
      return normalized !== "cancelled";
    });
    jobsTotal = nonCancelledJobs.length;
    const completeCount = jobs.filter((job) => {
      const normalized = (job.status ?? "").toLowerCase();
      return normalized === "complete";
    }).length;
    jobsDone = completeCount;
  }

  const id = stringValue(raw.id) ?? crypto.randomUUID();
  const title =
    stringValue(raw.title) ?? stringValue(raw.name) ?? stringValue(raw.feature_title) ?? "Untitled";
  const description =
    stringValue(raw.description) ?? stringValue(raw.summary) ?? stringValue(raw.context) ?? "";
  const capabilityId = stringValue(raw.capability_id) ?? stringValue(raw.capabilityId);
  const capability = capabilityId ? capabilityLookup[capabilityId] : null;
  const capabilityIcon =
    stringValue(raw.capability_icon) ?? stringValue(raw.capabilityIcon) ?? capability?.icon ?? null;
  const capabilityTitle =
    stringValue(raw.capability_title) ??
    stringValue(raw.capabilityTitle) ??
    capability?.title ??
    null;
  const criticalJobErrorCount = Math.max(
    0,
    Math.floor(
      numericValue(raw.critical_job_error_count) ??
      numericValue(raw.criticalJobErrorCount) ??
      0,
    ),
  );
  const hasJobErrors =
    raw.has_job_errors === true ||
    raw.hasJobErrors === true ||
    criticalJobErrorCount > 0;

  return {
    id,
    title,
    description,
    status,
    priority: stringValue(raw.priority) ?? "medium",
    createdAt,
    updatedAt,
    ageHours: ageInHours(createdAt),
    jobsDone,
    jobsTotal,
    assignee:
      stringValue(raw.owner_id) ?? stringValue(raw.owner) ?? stringValue(raw.originator),
    capability_id: capabilityId,
    capability_icon: capabilityIcon,
    capability_title: capabilityTitle,
    hasFailedJobs: raw.has_failed_jobs === true,
    hasJobErrors,
    criticalJobErrorCount,
    branch:
      stringValue(raw.branch) ??
      stringValue(raw.feature_branch) ??
      stringValue(raw.featureBranch),
    promoted_version:
      stringValue(raw.promoted_version) ??
      stringValue(raw.promotedVersion) ??
      null,
    staging_verified_by:
      stringValue(raw.staging_verified_by) ??
      stringValue(raw.stagingVerifiedBy) ??
      null,
    staging_verified_at:
      stringValue(raw.staging_verified_at) ??
      stringValue(raw.stagingVerifiedAt) ??
      null,
    jobs,
  };
}

function normalizeSnapshot(
  snapshot: unknown,
  updatedAt: string | null,
  capabilityLookup: CapabilityLookup,
): NormalizedPipelineSnapshot {
  const byStatus: Record<PipelineStatus, PipelineFeature[]> = {
    proposal: [],
    ready: [],
    breaking_down: [],
    writing_tests: [],
    building: [],
    combining_and_pr: [],
    ci_checking: [],
    pr_ready: [],
    complete: [],
    failed: [],
    shipped: [],
  };
  let ideasInboxNewCount = 0;
  const activeJobsById = new Map<string, PipelineActiveJob>();
  const upsertActiveJob = (job: PipelineActiveJob): void => {
    activeJobsById.set(job.id, job);
  };

  if (snapshot && typeof snapshot === "object") {
    const snapshotObj = snapshot as Record<string, unknown>;
    const ideasInbox = snapshotObj.ideas_inbox;
    if (ideasInbox && typeof ideasInbox === "object") {
      const parsedIdeasInboxCount = numericValue(
        (ideasInbox as Record<string, unknown>).new_count,
      );
      if (parsedIdeasInboxCount !== null) {
        ideasInboxNewCount = Math.max(0, Math.floor(parsedIdeasInboxCount));
      }
    }

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
          const parsedFeature = parseFeature(featureRecord, status, capabilityLookup);
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
          const parsedFeature = parseFeature(featureRecord, status, capabilityLookup);
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
        const parsed = parseFeature(
          rawFeature as Record<string, unknown>,
          "complete",
          capabilityLookup,
        );
        byStatus[parsed.status].push(parsed);
      }
    }
  }

  return {
    updatedAt,
    byStatus,
    ideasInboxNewCount,
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
      const [response, capabilityLookup] = await Promise.all([
        fetchPipelineSnapshot(companyId),
        fetchCapabilityLookup(companyId),
      ]);

      const normalized = normalizeSnapshot(response.snapshot, response.updated_at ?? null, capabilityLookup);

      setSnapshot(normalized);
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
