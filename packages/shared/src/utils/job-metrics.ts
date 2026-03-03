export interface JobRecord {
  id: string;
  status: "queued" | "dispatched" | "executing" | "complete" | "failed";
  job_type: "code" | "combine" | "verify" | "deploy_to_test" | "breakdown";
  complexity: "simple" | "medium" | "complex";
  created_at: string;
  updated_at: string;
  result?: string;
}

export interface JobMetrics {
  total: number;
  by_status: Record<JobRecord["status"], number>;
  by_type: Record<JobRecord["job_type"], number>;
  by_complexity: Record<JobRecord["complexity"], number>;
  avg_duration_ms: number | null;
  failure_rate: number;
  oldest_queued: string | null;
  throughput_per_hour: number;
}

const JOB_STATUSES: JobRecord["status"][] = [
  "queued",
  "dispatched",
  "executing",
  "complete",
  "failed",
];

const JOB_TYPES: JobRecord["job_type"][] = [
  "code",
  "combine",
  "verify",
  "deploy_to_test",
  "breakdown",
];

const JOB_COMPLEXITIES: JobRecord["complexity"][] = ["simple", "medium", "complex"];

function createCountRecord<T extends string>(keys: readonly T[]): Record<T, number> {
  const counts = {} as Record<T, number>;
  for (const key of keys) {
    counts[key] = 0;
  }
  return counts;
}

function toTimestamp(value: string): number {
  return new Date(value).getTime();
}

export function calculateJobMetrics(jobs: JobRecord[]): JobMetrics {
  const by_status = createCountRecord(JOB_STATUSES);
  const by_type = createCountRecord(JOB_TYPES);
  const by_complexity = createCountRecord(JOB_COMPLEXITIES);

  if (jobs.length === 0) {
    return {
      total: 0,
      by_status,
      by_type,
      by_complexity,
      avg_duration_ms: null,
      failure_rate: 0,
      oldest_queued: null,
      throughput_per_hour: 0,
    };
  }

  let failedCount = 0;
  let completedCount = 0;
  let validCompletedDurationCount = 0;
  let durationSumMs = 0;
  let oldestQueuedMs: number | null = null;
  let earliestCreatedMs: number | null = null;
  let latestUpdatedMs: number | null = null;

  for (const job of jobs) {
    by_status[job.status] += 1;
    by_type[job.job_type] += 1;
    by_complexity[job.complexity] += 1;

    const createdAtMs = toTimestamp(job.created_at);
    const updatedAtMs = toTimestamp(job.updated_at);

    if (Number.isFinite(createdAtMs)) {
      if (earliestCreatedMs === null || createdAtMs < earliestCreatedMs) {
        earliestCreatedMs = createdAtMs;
      }
    }

    if (Number.isFinite(updatedAtMs)) {
      if (latestUpdatedMs === null || updatedAtMs > latestUpdatedMs) {
        latestUpdatedMs = updatedAtMs;
      }
    }

    if (job.status === "failed") {
      failedCount += 1;
    }

    if (job.status === "complete") {
      completedCount += 1;
      if (Number.isFinite(createdAtMs) && Number.isFinite(updatedAtMs)) {
        durationSumMs += updatedAtMs - createdAtMs;
        validCompletedDurationCount += 1;
      }
    }

    if (job.status === "queued" && Number.isFinite(createdAtMs)) {
      if (oldestQueuedMs === null || createdAtMs < oldestQueuedMs) {
        oldestQueuedMs = createdAtMs;
      }
    }
  }

  const avg_duration_ms =
    validCompletedDurationCount > 0 ? durationSumMs / validCompletedDurationCount : null;

  const failure_rate = jobs.length > 0 ? failedCount / jobs.length : 0;

  const oldest_queued = oldestQueuedMs === null ? null : new Date(oldestQueuedMs).toISOString();

  let throughput_per_hour = 0;
  if (earliestCreatedMs !== null && latestUpdatedMs !== null) {
    const windowHours = (latestUpdatedMs - earliestCreatedMs) / 3_600_000;
    if (Number.isFinite(windowHours) && windowHours > 0) {
      throughput_per_hour = completedCount / windowHours;
    }
  }

  return {
    total: jobs.length,
    by_status,
    by_type,
    by_complexity,
    avg_duration_ms,
    failure_rate,
    oldest_queued,
    throughput_per_hour,
  };
}

export function formatMetricsSummary(metrics: JobMetrics): string {
  const failureRatePercent = (metrics.failure_rate * 100).toFixed(2);
  const averageDurationSeconds =
    metrics.avg_duration_ms === null ? "N/A" : `${(metrics.avg_duration_ms / 1000).toFixed(2)}s`;
  const throughput = metrics.throughput_per_hour.toFixed(2);

  const statusLines = JOB_STATUSES.map((status) => `  ${status}: ${metrics.by_status[status]}`).join(
    "\n",
  );

  return [
    `Total jobs: ${metrics.total}`,
    `Failure rate: ${failureRatePercent}%`,
    `Average duration: ${averageDurationSeconds}`,
    `Throughput per hour: ${throughput}`,
    "Breakdown by status:",
    statusLines,
  ].join("\n");
}
