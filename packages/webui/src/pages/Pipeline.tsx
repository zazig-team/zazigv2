import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "../hooks/useAuth";
import { useCompany } from "../hooks/useCompany";
import {
  usePipelineSnapshot,
  type PipelineActiveJob,
  type PipelineFeature,
  type PipelineStatus,
} from "../hooks/usePipelineSnapshot";
import { usePolling } from "../hooks/usePolling";
import { useRealtimeTable } from "../hooks/useRealtimeTable";
import FeatureDetailPanel from "../components/FeatureDetailPanel";
import StagingVerificationBadge from "../components/StagingVerificationBadge";

type FilterMode = "all" | "mine" | "urgent" | "stale";

interface ColumnDefinition {
  key: PipelineStatus;
  label: string;
  colorVar: string;
}

const COLUMN_DEFINITIONS: ColumnDefinition[] = [
  { key: "ready", label: "Ready", colorVar: "--col-ready" },
  { key: "breaking_down", label: "Breakdown", colorVar: "--col-breakdown" },
  { key: "writing_tests", label: "Writing Tests", colorVar: "--col-writing-tests" },
  { key: "building", label: "Building", colorVar: "--col-building" },
  { key: "combining_and_pr", label: "Combining", colorVar: "--col-combining" },
  { key: "ci_checking", label: "CI Check", colorVar: "--col-ci-checking" },
  { key: "pr_ready", label: "PR Ready", colorVar: "--col-pr" },
  { key: "failed", label: "Failed", colorVar: "--col-failed" },
  { key: "complete", label: "Shipped to Staging", colorVar: "--col-complete" },
];

const ACTIVE_FEATURE_STATUSES = new Set<PipelineStatus>([
  "breaking_down",
  "writing_tests",
  "building",
  "combining_and_pr",
  "ci_checking",
]);

const GITHUB_REPO_URL = "https://github.com/zazig-team/zazigv2";

function ageLabel(ageHours: number | null): string {
  if (ageHours === null) {
    return "new";
  }
  if (ageHours < 1) {
    return "<1h";
  }
  if (ageHours < 24) {
    return `${ageHours}h`;
  }
  return `${Math.floor(ageHours / 24)}d`;
}

function truncateCapabilityTitle(title: string | null | undefined): string {
  const normalized = (title ?? "").trim();
  if (!normalized) {
    return "Capability";
  }
  if (normalized.length <= 16) {
    return normalized;
  }
  return `${normalized.slice(0, 13)}...`;
}

function priorityDotClass(priority: string | null | undefined): string {
  const normalized = (priority ?? "medium").toLowerCase();
  if (normalized === "urgent") {
    return "priority-dot priority-dot--urgent";
  }
  if (normalized === "high") {
    return "priority-dot priority-dot--high";
  }
  if (normalized === "low") {
    return "priority-dot priority-dot--low";
  }
  return "priority-dot priority-dot--medium";
}

function roleMatchesMine(value: string | null, userIdentifier: string): boolean {
  if (!value) {
    return false;
  }
  return value.toLowerCase().includes(userIdentifier.toLowerCase());
}

function timestampScore(value: string | null): number {
  if (!value) {
    return Number.NEGATIVE_INFINITY;
  }
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? Number.NEGATIVE_INFINITY : parsed;
}

function formatRoleLabel(value: string): string {
  return value
    .replace(/[-_]+/g, " ")
    .trim()
    .split(/\s+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

function normalizeGithubUrl(value: string): string | null {
  const trimmed = value.trim().replace(/[),.;]+$/g, "");
  return trimmed.startsWith("https://github.com/") ? trimmed : null;
}

function extractGithubUrlFromText(text: string): string | null {
  const match = text.match(/https?:\/\/\S+/);
  if (!match?.[0]) {
    return null;
  }
  return normalizeGithubUrl(match[0]);
}

function extractPrUrlFromResult(result: unknown): string | null {
  if (typeof result === "string") {
    const directUrl = normalizeGithubUrl(result);
    if (directUrl) {
      return directUrl;
    }

    const embeddedUrl = extractGithubUrlFromText(result);
    if (embeddedUrl) {
      return embeddedUrl;
    }

    const trimmed = result.trim();
    if (/^\d+$/.test(trimmed)) {
      return `${GITHUB_REPO_URL}/pull/${trimmed}`;
    }

    return null;
  }

  if (typeof result === "number" && Number.isInteger(result) && result > 0) {
    return `${GITHUB_REPO_URL}/pull/${result}`;
  }

  if (!result || typeof result !== "object") {
    return null;
  }

  const resultObj = result as Record<string, unknown>;
  const urlKeys = [
    "pr_url",
    "prUrl",
    "url",
    "html_url",
    "pull_request_url",
    "pullRequestUrl",
    "link",
  ];

  for (const key of urlKeys) {
    const value = resultObj[key];
    if (typeof value !== "string") {
      continue;
    }

    const directUrl = normalizeGithubUrl(value);
    if (directUrl) {
      return directUrl;
    }

    const embeddedUrl = extractGithubUrlFromText(value);
    if (embeddedUrl) {
      return embeddedUrl;
    }

    const trimmed = value.trim();
    if (/^\d+$/.test(trimmed)) {
      return `${GITHUB_REPO_URL}/pull/${trimmed}`;
    }
  }

  const nestedResult = resultObj.result;
  if (nestedResult !== undefined && nestedResult !== result) {
    return extractPrUrlFromResult(nestedResult);
  }

  return null;
}

function isCompletedCombineJob(job: PipelineFeature["jobs"][number]): boolean {
  const status = (job.status ?? "").toLowerCase();
  const isComplete = status === "complete" || status === "done";
  if (!isComplete) {
    return false;
  }

  const jobType = (job.jobType ?? "").toLowerCase();
  const role = (job.role ?? "").toLowerCase();
  const title = (job.title ?? "").toLowerCase();

  return (
    jobType === "combine" ||
    role.includes("combiner") ||
    title.includes("combine")
  );
}

function featurePrUrl(feature: PipelineFeature): string | null {
  if (feature.status !== "pr_ready") {
    return null;
  }

  for (const job of feature.jobs) {
    if (!isCompletedCombineJob(job)) {
      continue;
    }

    const prUrl = extractPrUrlFromResult(job.result);
    if (prUrl) {
      return prUrl;
    }
  }

  if (!feature.branch) {
    return null;
  }

  return `${GITHUB_REPO_URL}/pulls?q=head:${encodeURIComponent(feature.branch)}`;
}

function getCardAccentColor(feature: PipelineFeature, activeJobs: PipelineActiveJob[]): string {
  if (feature.status === "complete" || feature.status === "shipped") {
    return "var(--positive)";
  }

  if (feature.hasFailedJobs) {
    return "var(--negative)";
  }

  const featureJobs = activeJobs.filter((job) => job.featureId === feature.id);
  if (
    featureJobs.some((job) =>
      ["executing", "running", "in_progress"].includes(job.status.toLowerCase()),
    )
  ) {
    return "var(--positive)";
  }

  if (featureJobs.some((job) => ["queued"].includes(job.status.toLowerCase()))) {
    return "var(--caution)";
  }

  return "transparent";
}

export default function Pipeline(): JSX.Element {
  const { activeCompany } = useCompany();
  const { user } = useAuth();
  const { loading, error, snapshot, refresh } = usePipelineSnapshot(activeCompany?.id ?? null);

  const [filterMode, setFilterMode] = useState<FilterMode>("all");
  const [showProductionArchive, setShowProductionArchive] = useState(false);
  const [selectedFeature, setSelectedFeature] = useState<{ id: string; colorVar: string } | null>(null);
  const refreshTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (refreshTimerRef.current !== null) {
        window.clearTimeout(refreshTimerRef.current);
      }
    };
  }, []);

  const scheduleRefresh = useCallback(() => {
    if (refreshTimerRef.current !== null) {
      window.clearTimeout(refreshTimerRef.current);
    }

    refreshTimerRef.current = window.setTimeout(() => {
      void refresh();
      refreshTimerRef.current = null;
    }, 300);
  }, [refresh]);

  const refreshAll = useCallback(async (): Promise<void> => {
    try {
      await refresh();
    } catch {
      // Silent failure for background refresh.
    }
  }, [refresh]);

  usePolling(refreshAll, 15000, Boolean(activeCompany?.id));

  const realtimeEnabled = Boolean(activeCompany?.id);
  const realtimeFilter = activeCompany?.id
    ? `company_id=eq.${activeCompany.id}`
    : undefined;

  useRealtimeTable({
    table: "features",
    filter: realtimeFilter,
    enabled: realtimeEnabled,
    onInsert: scheduleRefresh,
    onUpdate: scheduleRefresh,
  });

  useRealtimeTable({
    table: "jobs",
    filter: realtimeFilter,
    enabled: realtimeEnabled,
    onInsert: scheduleRefresh,
    onUpdate: scheduleRefresh,
  });

  const allFeatures = useMemo(
    () => Object.values(snapshot.byStatus).flat(),
    [snapshot.byStatus],
  );

  const mineIdentifier = user?.email?.split("@")[0] ?? "";
  const userId = user?.id ?? "";

  const applyFeatureFilter = (feature: PipelineFeature): boolean => {
    switch (filterMode) {
      case "mine":
        if (!feature.assignee) {
          return false;
        }
        return (
          roleMatchesMine(feature.assignee, mineIdentifier) ||
          feature.assignee === userId
        );
      case "urgent":
        return ["urgent", "high"].includes(feature.priority.toLowerCase());
      case "stale":
        return (feature.ageHours ?? 0) >= 72;
      case "all":
      default:
        return true;
    }
  };

  const filteredByStatus = useMemo(() => {
    const next: Record<PipelineStatus, PipelineFeature[]> = {
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

    for (const key of Object.keys(snapshot.byStatus) as PipelineStatus[]) {
      next[key] = snapshot.byStatus[key].filter(applyFeatureFilter);
    }

    return next;
  }, [snapshot.byStatus, filterMode, mineIdentifier, userId]);

  const activeRoleByFeatureId = useMemo(() => {
    const latestRoleByFeature = new Map<string, { role: string; createdAtScore: number }>();

    for (const job of snapshot.activeJobs) {
      if (!job.featureId || !job.role) {
        continue;
      }

      const trimmedRole = job.role.trim();
      if (!trimmedRole) {
        continue;
      }

      const createdAtScore = timestampScore(job.createdAt);
      const current = latestRoleByFeature.get(job.featureId);
      if (!current || createdAtScore > current.createdAtScore) {
        latestRoleByFeature.set(job.featureId, { role: trimmedRole, createdAtScore });
      }
    }

    const formattedRoleByFeature = new Map<string, string>();
    for (const [featureId, value] of latestRoleByFeature.entries()) {
      formattedRoleByFeature.set(featureId, formatRoleLabel(value.role));
    }

    return formattedRoleByFeature;
  }, [snapshot.activeJobs]);

  const metrics = useMemo(() => {
    const active =
      filteredByStatus.breaking_down.length +
      filteredByStatus.writing_tests.length +
      filteredByStatus.building.length +
      filteredByStatus.combining_and_pr.length +
      filteredByStatus.ci_checking.length +
      filteredByStatus.pr_ready.length;

    return {
      active,
      shipped: filteredByStatus.complete.length + filteredByStatus.shipped.length,
      failed: filteredByStatus.failed.length,
      totalFeatures: allFeatures.length,
    };
  }, [filteredByStatus, allFeatures.length]);

  return (
    <div className="pipeline-page">
      <div className="page-header">
        <div className="page-header-left">
          <div className="page-title">Pipeline</div>
          <div className="page-stats">
            <div className="page-stat">Active <span className="page-stat-value">{metrics.active}</span></div>
            <div className="page-stat">Shipped <span className="page-stat-value" style={{ color: "var(--positive)" }}>{metrics.shipped}</span></div>
            <div className="page-stat">Failed <span className="page-stat-value" style={{ color: "var(--negative)" }}>{metrics.failed}</span></div>
          </div>
        </div>

        <div className="page-header-right">
          {(["all", "mine", "urgent", "stale"] as FilterMode[]).map((mode) => (
            <button
              key={mode}
              className={`filter-btn${filterMode === mode ? " active" : ""}`}
              onClick={() => setFilterMode(mode)}
              type="button"
            >
              {mode[0]!.toUpperCase() + mode.slice(1)}
            </button>
          ))}
          <button className="filter-btn" onClick={() => void refresh()} type="button">
            Refresh
          </button>
        </div>
      </div>

      <div className="pipeline-board">
        {COLUMN_DEFINITIONS.map((column) => {
          const allColumnFeatures = filteredByStatus[column.key];
          const completeStagingFeatures = column.key === "complete"
            ? allColumnFeatures.filter(
              (feature) => feature.status === "complete" && !feature.promoted_version,
            )
            : [];
          const completeProductionFeatures = column.key === "complete"
            ? allColumnFeatures.filter(
              (feature) => feature.status === "complete" && feature.promoted_version != null,
            )
            : [];
          const features = column.key === "complete" ? completeStagingFeatures : allColumnFeatures;

          const renderFeatureCard = (
            feature: PipelineFeature,
            options: { showPromotedVersionBadge?: boolean } = {},
          ) => {
            const activeRole = ACTIVE_FEATURE_STATUSES.has(feature.status)
              ? activeRoleByFeatureId.get(feature.id)
              : undefined;
            const prUrl = column.key === "pr_ready" ? featurePrUrl(feature) : null;
            const showPromotedVersionBadge =
              options.showPromotedVersionBadge === true &&
              feature.promoted_version != null;
            const accentColor = getCardAccentColor(feature, snapshot.activeJobs);

            return (
            <article className="card card--clickable" key={feature.id} onClick={() => setSelectedFeature({ id: feature.id, colorVar: column.colorVar })}>
              <div className="card-accent" style={{ background: accentColor }} />
              <div className="card-body">
                <div className="card-title">{feature.title}</div>
                <StagingVerificationBadge
                  staging_verified_by={feature.staging_verified_by}
                  staging_verified_at={feature.staging_verified_at}
                />
                {showPromotedVersionBadge ? (
                  <div className="card-role-badge">{feature.promoted_version}</div>
                ) : null}
                {activeRole ? <div className="card-role-badge">{activeRole}</div> : null}
                {feature.capability_id ? (
                  <div className="card-capability-badge">
                    <span className="card-capability-icon" aria-hidden="true">
                      {feature.capability_icon ?? "⚙️"}
                    </span>
                    <span className="card-capability-title">
                      {truncateCapabilityTitle(feature.capability_title)}
                    </span>
                  </div>
                ) : null}
                <div className="card-meta">
                  <span className={priorityDotClass(feature.priority)} />
                  {feature.priority.toLowerCase()} · {ageLabel(feature.ageHours)}
                  {feature.jobsTotal > 0 ? (
                    <span className="card-job-count">
                      {feature.jobsDone}/{feature.jobsTotal}
                    </span>
                  ) : null}
                </div>
                <div className="card-desc">{feature.description}</div>
                {prUrl ? (
                  <a
                    className="card-secondary-link"
                    href={prUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(event) => event.stopPropagation()}
                  >
                    View PR
                  </a>
                ) : null}
                {feature.hasJobErrors && (
                  <div className="card-error-indicator">
                    <span className="error-icon">⚠</span>
                    <span className="error-label">
                      {feature.criticalJobErrorCount} job error{feature.criticalJobErrorCount !== 1 ? "s" : ""} detected
                    </span>
                  </div>
                )}
                {feature.staging_verified_by ? (
                  <div className="card-staging-verified badge badge--positive">
                    ✓ staging_verified by {feature.staging_verified_by}
                  </div>
                ) : null}
              </div>
            </article>
            );
          };

          return (
            <section className="pipeline-col" key={column.key}>
              <header className="pipeline-col-header">
                <div className="pipeline-col-title">
                  <span className="col-dot" style={{ background: `var(${column.colorVar})` }} />
                  <span className="col-name">{column.label}</span>
                </div>
                <span className="col-count">{features.length}</span>
              </header>

              <div className="pipeline-col-body">
                {features.length === 0 ? (
                  <div className="col-empty">No items</div>
                ) : (
                  features.map((feature) => renderFeatureCard(feature))
                )}

                {column.key === "complete" ? (
                  <>
                    <button
                      className="parked-toggle"
                      type="button"
                      onClick={() => setShowProductionArchive((value) => !value)}
                    >
                      {showProductionArchive ? "▼" : "▶"} Shipped to Production ({completeProductionFeatures.length})
                    </button>

                    {showProductionArchive ? (
                      completeProductionFeatures.length === 0 ? (
                        <div className="col-empty">No items</div>
                      ) : (
                        completeProductionFeatures.map((feature) => (
                          renderFeatureCard(feature, { showPromotedVersionBadge: true })
                        ))
                      )
                    ) : null}
                  </>
                ) : null}
              </div>
            </section>
          );
        })}
      </div>

      {loading ? (
        <div className="inline-feedback">Loading pipeline snapshot...</div>
      ) : null}
      {error ? <div className="inline-feedback inline-feedback--error">{error}</div> : null}
      {snapshot.updatedAt ? (
        <div className="inline-feedback">Updated {new Date(snapshot.updatedAt).toLocaleString("en-GB")}</div>
      ) : null}

      {selectedFeature ? (
        <FeatureDetailPanel
          featureId={selectedFeature.id}
          colorVar={selectedFeature.colorVar}
          onClose={() => setSelectedFeature(null)}
        />
      ) : null}
    </div>
  );
}
