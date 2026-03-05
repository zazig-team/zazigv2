import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "../hooks/useAuth";
import { useCompany } from "../hooks/useCompany";
import {
  usePipelineSnapshot,
  type PipelineFeature,
  type PipelineStatus,
} from "../hooks/usePipelineSnapshot";
import { useRealtimeTable } from "../hooks/useRealtimeTable";
import { fetchIdeas, type Idea } from "../lib/queries";

type FilterMode = "all" | "mine" | "urgent" | "stale";

interface ColumnDefinition {
  key: PipelineStatus;
  label: string;
  colorVar: string;
}

const COLUMN_DEFINITIONS: ColumnDefinition[] = [
  { key: "breaking_down", label: "Breaking Down", colorVar: "--col-breakdown" },
  { key: "building", label: "Building", colorVar: "--col-building" },
  { key: "combining_and_pr", label: "Combining & PR", colorVar: "--col-combining" },
  { key: "verifying", label: "Verifying", colorVar: "--col-verifying" },
  { key: "merging", label: "Merging", colorVar: "--col-merging" },
  { key: "complete", label: "Complete", colorVar: "--col-complete" },
  { key: "failed", label: "Failed", colorVar: "--col-failed" },
];

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

export default function Pipeline(): JSX.Element {
  const { activeCompany } = useCompany();
  const { user } = useAuth();
  const { loading, error, snapshot, refresh } = usePipelineSnapshot(activeCompany?.id ?? null);

  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [parkedIdeas, setParkedIdeas] = useState<Idea[]>([]);
  const [ideasError, setIdeasError] = useState<string | null>(null);
  const [ideasLoading, setIdeasLoading] = useState(false);
  const [filterMode, setFilterMode] = useState<FilterMode>("all");
  const [showParked, setShowParked] = useState(false);
  const refreshTimerRef = useRef<number | null>(null);

  useEffect(() => {
    async function loadIdeas(): Promise<void> {
      if (!activeCompany?.id) {
        setIdeas([]);
        setParkedIdeas([]);
        return;
      }

      setIdeasLoading(true);
      setIdeasError(null);

      try {
        const [activeIdeas, parked] = await Promise.all([
          fetchIdeas(activeCompany.id, ["new", "triaged"]),
          fetchIdeas(activeCompany.id, ["parked"]),
        ]);

        setIdeas(activeIdeas);
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
      breaking_down: [],
      building: [],
      combining_and_pr: [],
      verifying: [],
      merging: [],
      complete: [],
      failed: [],
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
  const filteredParkedIdeas = useMemo(
    () => parkedIdeas.filter(applyIdeaFilter),
    [parkedIdeas, filterMode, mineIdentifier, userId],
  );

  const metrics = useMemo(() => {
    const active =
      filteredByStatus.breaking_down.length +
      filteredByStatus.building.length +
      filteredByStatus.combining_and_pr.length +
      filteredByStatus.verifying.length;

    return {
      active,
      merged: filteredByStatus.complete.length,
      failed: filteredByStatus.failed.length,
      ideas: filteredIdeas.length,
      totalFeatures: allFeatures.length,
    };
  }, [filteredByStatus, filteredIdeas.length, allFeatures.length]);

  return (
    <div className="pipeline-page">
      <div className="page-header">
        <div className="page-header-left">
          <div className="page-title">Pipeline</div>
          <div className="page-stats">
            <div className="page-stat">Active <span className="page-stat-value">{metrics.active}</span></div>
            <div className="page-stat">Complete <span className="page-stat-value" style={{ color: "var(--positive)" }}>{metrics.merged}</span></div>
            <div className="page-stat">Failed <span className="page-stat-value" style={{ color: "var(--negative)" }}>{metrics.failed}</span></div>
            <div className="page-stat">Ideas <span className="page-stat-value">{metrics.ideas}</span></div>
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
              <span className="col-dot" style={{ background: "var(--col-ideas)" }} />
              <span className="col-name">Ideas</span>
            </div>
            <span className="col-count">{filteredIdeas.length}</span>
          </header>

          <div className="pipeline-col-body">
            <button className="parked-toggle" type="button" onClick={() => setShowParked((value) => !value)}>
              {showParked ? "▼" : "▶"} Parked ({filteredParkedIdeas.length})
            </button>

            {showParked ? (
              <div className="pipeline-stack">
                {filteredParkedIdeas.length === 0 ? (
                  <div className="col-empty">No parked ideas</div>
                ) : (
                  filteredParkedIdeas.map((idea) => (
                    <article className="card" key={idea.id}>
                      <div className="card-accent" style={{ background: "var(--col-ideas)" }} />
                      <div className="card-body">
                        <div className="card-title">{ideaTitle(idea)}</div>
                        <div className="card-desc">{idea.description ?? idea.raw_text}</div>
                      </div>
                    </article>
                  ))
                )}
              </div>
            ) : null}

            <div className="section-label">Inbox</div>
            {filteredIdeas.length === 0 ? (
              <div className="col-empty">No ideas</div>
            ) : (
              filteredIdeas.map((idea) => (
                <article className="card" key={idea.id}>
                  <div className="card-accent" style={{ background: "var(--col-ideas)" }} />
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
                  features.map((feature) => (
                    <article className="card" key={feature.id}>
                      <div className="card-accent" style={{ background: `var(${column.colorVar})` }} />
                      <div className="card-body">
                        <div className="card-meta">
                          <span className={priorityDotClass(feature.priority)} />
                          {feature.priority.toLowerCase()} · {ageLabel(feature.ageHours)}
                        </div>
                        <div className="card-title">{feature.title}</div>
                        <div className="card-desc">{feature.description}</div>
                        <div className="card-jobs">
                          {Array.from({ length: Math.max(feature.jobsTotal, 1) }).map((_, index) => {
                            const active = index < feature.jobsDone;
                            return (
                              <span
                                key={`${feature.id}-pip-${index}`}
                                className="card-job-pip"
                                style={{ background: active ? "var(--positive)" : "var(--chalk)" }}
                              />
                            );
                          })}
                          <span className="card-job-count">
                            {feature.jobsDone}/{feature.jobsTotal || 0} done
                          </span>
                        </div>
                      </div>
                    </article>
                  ))
                )}
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
    </div>
  );
}
