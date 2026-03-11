import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "../hooks/useAuth";
import { useCompany } from "../hooks/useCompany";
import {
  usePipelineSnapshot,
  type PipelineActiveJob,
  type PipelineFeature,
  type PipelineStatus,
} from "../hooks/usePipelineSnapshot";
import { useRealtimeTable } from "../hooks/useRealtimeTable";
import { fetchIdeas, getAccessToken, type Idea } from "../lib/queries";
import FeatureDetailPanel from "../components/FeatureDetailPanel";
import IdeaDetailPanel from "../components/IdeaDetailPanel";

type FilterMode = "all" | "mine" | "urgent" | "stale";

interface ColumnDefinition {
  key: PipelineStatus;
  label: string;
  colorVar: string;
}

const DAY_MS = 24 * 60 * 60 * 1000;

const COLUMN_DEFINITIONS: ColumnDefinition[] = [
  { key: "proposal", label: "Proposal", colorVar: "--col-proposal" },
  { key: "ready", label: "Ready", colorVar: "--col-ready" },
  { key: "breaking_down", label: "Breakdown", colorVar: "--col-breakdown" },
  { key: "building", label: "Building", colorVar: "--col-building" },
  { key: "combining_and_pr", label: "Combining", colorVar: "--col-combining" },
  { key: "verifying", label: "Verifying", colorVar: "--col-verifying" },
  { key: "pr_ready", label: "PR Ready", colorVar: "--col-pr" },
  { key: "complete", label: "Complete", colorVar: "--col-complete" },
  { key: "failed", label: "Failed", colorVar: "--col-failed" },
  { key: "shipped", label: "Shipped", colorVar: "--col-shipped" },
];

const ACTIVE_FEATURE_STATUSES = new Set<PipelineStatus>([
  "breaking_down",
  "building",
  "combining_and_pr",
  "verifying",
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

function ideaTitle(idea: Idea): string {
  return idea.title ?? idea.description ?? idea.raw_text;
}

function ideaAccentColor(itemType: string): string {
  switch (itemType) {
    case "brief": return "var(--col-brief)";
    case "bug": return "var(--col-bug)";
    case "test": return "var(--col-test)";
    default: return "var(--col-ideas)";
  }
}

function ideaColorVar(itemType: string): string {
  switch (itemType) {
    case "brief": return "--col-brief";
    case "bug": return "--col-bug";
    case "test": return "--col-test";
    default: return "--col-ideas";
  }
}

function featureActivityTimestamp(feature: PipelineFeature): number | null {
  const activityAt = feature.updatedAt ?? feature.createdAt;
  if (!activityAt) {
    return null;
  }

  const timestamp = Date.parse(activityAt);
  return Number.isNaN(timestamp) ? null : timestamp;
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

  if (featureJobs.some((job) => ["queued", "dispatched"].includes(job.status.toLowerCase()))) {
    return "var(--caution)";
  }

  return "transparent";
}

export default function Pipeline(): JSX.Element {
  const { activeCompany } = useCompany();
  const { user } = useAuth();
  const { loading, error, snapshot, refresh } = usePipelineSnapshot(activeCompany?.id ?? null);

  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [triagedIdeas, setTriagedIdeas] = useState<Idea[]>([]);
  const [parkedIdeas, setParkedIdeas] = useState<Idea[]>([]);
  const [ideasError, setIdeasError] = useState<string | null>(null);
  const [ideasLoading, setIdeasLoading] = useState(false);
  const [filterMode, setFilterMode] = useState<FilterMode>("all");
  const [inboxTypeFilter, setInboxTypeFilter] = useState<string>("all");
  const [showReviewSoon, setShowReviewSoon] = useState(false);
  const [showLongTerm, setShowLongTerm] = useState(false);
  const [showFailedArchive, setShowFailedArchive] = useState(false);
  const [showCompleteArchive, setShowCompleteArchive] = useState(false);
  const [showShippedArchive, setShowShippedArchive] = useState(false);
  const [selectedFeature, setSelectedFeature] = useState<{ id: string; colorVar: string } | null>(null);
  const [selectedIdea, setSelectedIdea] = useState<{ id: string; colorVar: string } | null>(null);
  const refreshTimerRef = useRef<number | null>(null);

  useEffect(() => {
    async function loadIdeas(): Promise<void> {
      if (!activeCompany?.id) {
        setIdeas([]);
        setTriagedIdeas([]);
        setParkedIdeas([]);
        return;
      }

      setIdeasLoading(true);
      setIdeasError(null);

      try {
        await getAccessToken();
        const [newIdeas, triaged, parked] = await Promise.all([
          fetchIdeas(activeCompany.id, ["new"]),
          fetchIdeas(activeCompany.id, ["triaged"]),
          fetchIdeas(activeCompany.id, ["parked"]),
        ]);

        setIdeas(newIdeas);
        setTriagedIdeas(triaged);
        setParkedIdeas(parked);
      } catch (loadError) {
        setIdeasError(loadError instanceof Error ? loadError.message : String(loadError));
      } finally {
        setIdeasLoading(false);
      }
    }

    void loadIdeas();
  }, [activeCompany?.id]);

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

  useRealtimeTable({
    table: "ideas",
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

  const applyIdeaFilter = (idea: Idea): boolean => {
    if (filterMode === "all") {
      return true;
    }

    if (filterMode === "urgent") {
      return ["urgent", "high"].includes((idea.priority ?? "medium").toLowerCase());
    }

    if (filterMode === "stale") {
      const ageHours = Math.floor((Date.now() - Date.parse(idea.created_at)) / 3_600_000);
      return ageHours >= 72;
    }

    if (filterMode === "mine") {
      if (!idea.originator) {
        return false;
      }
      return (
        roleMatchesMine(idea.originator, mineIdentifier) ||
        idea.originator === userId
      );
    }

    return true;
  };

  const filteredByStatus = useMemo(() => {
    const next: Record<PipelineStatus, PipelineFeature[]> = {
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

    for (const key of Object.keys(snapshot.byStatus) as PipelineStatus[]) {
      next[key] = snapshot.byStatus[key].filter(applyFeatureFilter);
    }

    return next;
  }, [snapshot.byStatus, filterMode, mineIdentifier, userId]);

  const filteredIdeas = useMemo(
    () => ideas.filter(applyIdeaFilter),
    [ideas, filterMode, mineIdentifier, userId],
  );
  const filteredTriagedIdeas = useMemo(
    () => triagedIdeas.filter(applyIdeaFilter),
    [triagedIdeas, filterMode, mineIdentifier, userId],
  );
  const filteredParkedIdeas = useMemo(
    () => parkedIdeas.filter(applyIdeaFilter),
    [parkedIdeas, filterMode, mineIdentifier, userId],
  );
  const displayedIdeas = useMemo(
    () => (
      inboxTypeFilter === "all"
        ? filteredIdeas
        : filteredIdeas.filter((idea) => idea.item_type === inboxTypeFilter)
    ),
    [filteredIdeas, inboxTypeFilter],
  );
  const displayedParkedIdeas = useMemo(
    () => (
      inboxTypeFilter === "all"
        ? filteredParkedIdeas
        : filteredParkedIdeas.filter((idea) => idea.item_type === inboxTypeFilter)
    ),
    [filteredParkedIdeas, inboxTypeFilter],
  );
  const reviewSoonIdeas = useMemo(
    () => displayedParkedIdeas.filter((idea) => idea.horizon === "soon"),
    [displayedParkedIdeas],
  );
  const longTermIdeas = useMemo(
    () => displayedParkedIdeas.filter((idea) => idea.horizon === "later"),
    [displayedParkedIdeas],
  );
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
      filteredByStatus.building.length +
      filteredByStatus.combining_and_pr.length +
      filteredByStatus.verifying.length +
      filteredByStatus.pr_ready.length;

    return {
      active,
      shipped: filteredByStatus.complete.length + filteredByStatus.shipped.length,
      failed: filteredByStatus.failed.length,
      ideas: filteredIdeas.length + filteredTriagedIdeas.length,
      totalFeatures: allFeatures.length,
    };
  }, [filteredByStatus, filteredIdeas.length, filteredTriagedIdeas.length, allFeatures.length]);

  const now = Date.now();

  return (
    <div className="pipeline-page">
      <div className="page-header">
        <div className="page-header-left">
          <div className="page-title">Pipeline</div>
          <div className="page-stats">
            <div className="page-stat">Active <span className="page-stat-value">{metrics.active}</span></div>
            <div className="page-stat">Shipped <span className="page-stat-value" style={{ color: "var(--positive)" }}>{metrics.shipped}</span></div>
            <div className="page-stat">Failed <span className="page-stat-value" style={{ color: "var(--negative)" }}>{metrics.failed}</span></div>
            <div className="page-stat">Inbox <span className="page-stat-value">{metrics.ideas}</span></div>
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
        <section className="pipeline-col">
          <header className="pipeline-col-header">
            <div className="pipeline-col-title">
              <span className="col-dot" style={{ background: "var(--col-ideas)" }} title="Inbox" />
              <span className="col-name">Inbox</span>
              {snapshot.ideasInboxNewCount > 0 ? (
                <span
                  className="col-notification-badge"
                  aria-label={`${snapshot.ideasInboxNewCount} new ideas`}
                >
                  {snapshot.ideasInboxNewCount}
                </span>
              ) : null}
            </div>
            <span className="col-count">{displayedIdeas.length}</span>
          </header>

          <div className="inbox-type-tabs">
            <button
              className={`filter-btn${inboxTypeFilter === "all" ? " active" : ""}`}
              type="button"
              onClick={() => setInboxTypeFilter("all")}
            >
              All
            </button>
            <button
              className={`filter-btn${inboxTypeFilter === "idea" ? " active" : ""}`}
              type="button"
              onClick={() => setInboxTypeFilter("idea")}
            >
              Ideas
            </button>
            <button
              className={`filter-btn${inboxTypeFilter === "brief" ? " active" : ""}`}
              type="button"
              onClick={() => setInboxTypeFilter("brief")}
            >
              Briefs
            </button>
            <button
              className={`filter-btn${inboxTypeFilter === "bug" ? " active" : ""}`}
              type="button"
              onClick={() => setInboxTypeFilter("bug")}
            >
              Bugs
            </button>
            <button
              className={`filter-btn${inboxTypeFilter === "test" ? " active" : ""}`}
              type="button"
              onClick={() => setInboxTypeFilter("test")}
            >
              Tests
            </button>
          </div>

          <div className="pipeline-col-body">
            <button className="parked-toggle" type="button" onClick={() => setShowReviewSoon((value) => !value)}>
              {showReviewSoon ? "▼" : "▶"} Review Soon ({reviewSoonIdeas.length})
            </button>

            {showReviewSoon ? (
              <div className="pipeline-stack">
                {reviewSoonIdeas.length === 0 ? (
                  <div className="col-empty">No review-soon ideas</div>
                ) : (
                  reviewSoonIdeas.map((idea) => (
                    <article className="card card--clickable" key={idea.id} onClick={() => setSelectedIdea({ id: idea.id, colorVar: ideaColorVar(idea.item_type) })}>
                      <div className="card-accent" style={{ background: ideaAccentColor(idea.item_type) }} />
                      <div className="card-body">
                        <span className={`type-chip type-chip--${idea.item_type}`}>{idea.item_type}</span>
                        <div className="card-title">{ideaTitle(idea)}</div>
                        <div className="card-desc">{idea.description ?? idea.raw_text}</div>
                      </div>
                    </article>
                  ))
                )}
              </div>
            ) : null}

            <button className="parked-toggle" type="button" onClick={() => setShowLongTerm((value) => !value)}>
              {showLongTerm ? "▼" : "▶"} Long Term ({longTermIdeas.length})
            </button>

            {showLongTerm ? (
              <div className="pipeline-stack">
                {longTermIdeas.length === 0 ? (
                  <div className="col-empty">No long-term ideas</div>
                ) : (
                  longTermIdeas.map((idea) => (
                    <article className="card card--clickable" key={idea.id} onClick={() => setSelectedIdea({ id: idea.id, colorVar: ideaColorVar(idea.item_type) })}>
                      <div className="card-accent" style={{ background: ideaAccentColor(idea.item_type) }} />
                      <div className="card-body">
                        <span className={`type-chip type-chip--${idea.item_type}`}>{idea.item_type}</span>
                        <div className="card-title">{ideaTitle(idea)}</div>
                        <div className="card-desc">{idea.description ?? idea.raw_text}</div>
                      </div>
                    </article>
                  ))
                )}
              </div>
            ) : null}

            <div className="section-label">Inbox</div>
            {displayedIdeas.length === 0 ? (
              <div className="col-empty">No ideas</div>
            ) : (
              displayedIdeas.map((idea) => (
                <article className="card card--clickable" key={idea.id} onClick={() => setSelectedIdea({ id: idea.id, colorVar: ideaColorVar(idea.item_type) })}>
                  <div className="card-accent" style={{ background: ideaAccentColor(idea.item_type) }} />
                  <div className="card-body">
                    <div className="card-meta">
                      <span className={priorityDotClass(idea.priority)} />
                      {(idea.priority ?? "medium").toLowerCase()} · {ageLabel(Math.floor((Date.now() - Date.parse(idea.created_at)) / 3_600_000))}
                    </div>
                    <span className={`type-chip type-chip--${idea.item_type}`}>{idea.item_type}</span>
                    <div className="card-title">{ideaTitle(idea)}</div>
                    <div className="card-desc">{idea.description ?? idea.raw_text}</div>
                  </div>
                </article>
              ))
            )}
          </div>
        </section>

        <section className="pipeline-col">
          <header className="pipeline-col-header">
            <div className="pipeline-col-title">
              <span className="col-dot" style={{ background: "var(--col-triage)" }} />
              <span className="col-name">Triage</span>
            </div>
            <span className="col-count">{filteredTriagedIdeas.length}</span>
          </header>

          <div className="pipeline-col-body">
            {filteredTriagedIdeas.length === 0 ? (
              <div className="col-empty">No items</div>
            ) : (
              filteredTriagedIdeas.map((idea) => (
                <article className="card card--clickable" key={idea.id} onClick={() => setSelectedIdea({ id: idea.id, colorVar: "--col-triage" })}>
                  <div className="card-accent" style={{ background: "var(--col-triage)" }} />
                  <div className="card-body">
                    <div className="card-meta">
                      <span className={priorityDotClass(idea.priority)} />
                      {(idea.priority ?? "medium").toLowerCase()} · {ageLabel(Math.floor((Date.now() - Date.parse(idea.created_at)) / 3_600_000))}
                    </div>
                    <div className="card-title">{ideaTitle(idea)}</div>
                    <div className="card-desc">{idea.description ?? idea.raw_text}</div>
                  </div>
                </article>
              ))
            )}
          </div>
        </section>

        {COLUMN_DEFINITIONS.map((column) => {
          const features = filteredByStatus[column.key];
          const hasArchive =
            column.key === "failed" || column.key === "complete" || column.key === "shipped";
          const recentFeatures = hasArchive
            ? features.filter((feature) => {
              const activityTimestamp = featureActivityTimestamp(feature);
              if (activityTimestamp === null) {
                return true;
              }

              return now - activityTimestamp <= DAY_MS;
            })
            : features;
          const archivedFeatures = hasArchive
            ? features.filter((feature) => {
              const activityTimestamp = featureActivityTimestamp(feature);
              if (activityTimestamp === null) {
                return false;
              }

              return now - activityTimestamp > DAY_MS;
            })
            : [];
          const showArchive =
            column.key === "failed"
              ? showFailedArchive
              : column.key === "complete"
                ? showCompleteArchive
                : column.key === "shipped"
                  ? showShippedArchive
                  : false;

          const renderFeatureCard = (feature: PipelineFeature) => {
            const activeRole = ACTIVE_FEATURE_STATUSES.has(feature.status)
              ? activeRoleByFeatureId.get(feature.id)
              : undefined;
            const prUrl = column.key === "pr_ready" ? featurePrUrl(feature) : null;
            const accentColor = getCardAccentColor(feature, snapshot.activeJobs);
            return (
            <article className="card card--clickable" key={feature.id} onClick={() => setSelectedFeature({ id: feature.id, colorVar: column.colorVar })}>
              <div className="card-accent" style={{ background: accentColor }} />
              <div className="card-body">
                <div className="card-title">{feature.title}</div>
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
                {feature.jobsTotal > 0 ? (
                  <div className="card-jobs">
                    <div className="card-jobs-bar">
                      <div
                        className="card-jobs-bar-fill"
                        style={{ width: `${Math.round((feature.jobsDone / feature.jobsTotal) * 100)}%` }}
                      />
                    </div>
                    <span className="card-job-count">
                      {feature.jobsDone}/{feature.jobsTotal}
                    </span>
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
                {recentFeatures.length === 0 ? (
                  <div className="col-empty">No items</div>
                ) : (
                  recentFeatures.map((feature) => renderFeatureCard(feature))
                )}

                {archivedFeatures.length > 0 ? (
                  <button
                    className="parked-toggle"
                    type="button"
                    onClick={() => {
                      if (column.key === "failed") {
                        setShowFailedArchive((value) => !value);
                        return;
                      }
                      if (column.key === "complete") {
                        setShowCompleteArchive((value) => !value);
                        return;
                      }
                      if (column.key === "shipped") {
                        setShowShippedArchive((value) => !value);
                      }
                    }}
                  >
                    {showArchive ? "▼" : "▶"} Archive ({archivedFeatures.length})
                  </button>
                ) : null}

                {showArchive ? archivedFeatures.map((feature) => renderFeatureCard(feature)) : null}
              </div>
            </section>
          );
        })}
      </div>

      {loading || ideasLoading ? (
        <div className="inline-feedback">Loading pipeline snapshot...</div>
      ) : null}
      {error ? <div className="inline-feedback inline-feedback--error">{error}</div> : null}
      {ideasError ? <div className="inline-feedback inline-feedback--error">{ideasError}</div> : null}
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

      {selectedIdea ? (
        <IdeaDetailPanel
          ideaId={selectedIdea.id}
          colorVar={selectedIdea.colorVar}
          onClose={() => setSelectedIdea(null)}
        />
      ) : null}
    </div>
  );
}
