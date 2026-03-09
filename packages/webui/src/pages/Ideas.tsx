import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useCompany } from "../hooks/useCompany";
import { useRealtimeTable } from "../hooks/useRealtimeTable";
import {
  fetchIdeas,
  fetchIdeaDetail,
  fetchProjects,
  promoteIdea,
  updateIdeaStatus,
  requestTriageJob,
  type Idea,
  type IdeaDetail,
  type Project,
} from "../lib/queries";
import { supabase } from "../lib/supabase";
import FormattedProse from "../components/FormattedProse";

type TypeFilter = "all" | "idea" | "brief" | "bug" | "test";
type SectionTab = "inbox" | "triaged" | "workshop" | "parked" | "shipped";
type SortMode = "newest" | "oldest" | "priority";

const TYPE_ICON: Record<string, string> = {
  idea: "\u{1F4A1}",
  brief: "\u{1F4CB}",
  bug: "\u{1F41B}",
  test: "\u{1F9EA}",
};

const TYPE_COLOR_VAR: Record<string, string> = {
  idea: "--col-ideas",
  brief: "--col-brief",
  bug: "--col-bug",
  test: "--col-test",
};

function ageLabel(createdAt: string): string {
  const ms = Date.now() - new Date(createdAt).getTime();
  const hours = Math.floor(ms / 3_600_000);
  if (hours < 1) return "<1h";
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

function priorityLabel(priority: string | null): string {
  const p = (priority ?? "medium").toLowerCase();
  if (p === "urgent") return "urgent";
  if (p === "high") return "high";
  if (p === "low") return "low";
  return "med";
}

function priorityClass(priority: string | null): string {
  const p = (priority ?? "medium").toLowerCase();
  if (p === "urgent") return "il-priority urgent";
  if (p === "high") return "il-priority high";
  if (p === "low") return "il-priority low";
  return "il-priority medium";
}

function sourceLabel(idea: Idea): string {
  if (idea.originator) {
    const lower = idea.originator.toLowerCase();
    if (lower.includes("slack")) return "slack";
    if (lower.includes("telegram")) return "telegram";
    if (lower.includes("agent") || lower.includes("cpo") || lower.includes("monitoring")) return "agent";
    if (lower.includes("web")) return "web";
  }
  return "terminal";
}

function formatDate(iso: string | null): string {
  if (!iso) return "\u2014";
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

const PRIORITY_RANK: Record<string, number> = { urgent: 0, high: 1, medium: 2, low: 3 };

function priorityRank(priority: string | null): number {
  return PRIORITY_RANK[(priority ?? "medium").toLowerCase()] ?? 2;
}

function featureStatusLabel(status: string): string {
  return status.replace(/_/g, " ");
}

function featureStatusClass(status: string): string {
  const s = status.toLowerCase();
  if (s === "complete" || s === "shipped") return "il-feature-status positive";
  if (s === "failed" || s === "cancelled") return "il-feature-status negative";
  if (s === "building" || s === "verifying") return "il-feature-status active";
  return "il-feature-status";
}

/* ── Inline Detail (expanded row content) ── */

const STATUS_LABELS: Record<string, string> = {
  triaging: "Analysing",
  triaged: "Triaged",
  parked: "Parked",
  rejected: "Rejected",
  promoted: "Promoted",
  workshop: "Workshop",
};

interface InlineDetailProps {
  ideaId: string;
  colorVar: string;
  isShipped: boolean;
  onAction: (ideaId: string, newStatus: string) => void;
}

function InlineDetail({ ideaId, colorVar, isShipped, onAction }: InlineDetailProps): JSX.Element {
  const { activeCompanyId } = useCompany();
  const [data, setData] = useState<IdeaDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Promote state
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [promoting, setPromoting] = useState(false);
  const [promoteError, setPromoteError] = useState<string | null>(null);
  const [promoted, setPromoted] = useState(false);

  // Action state (triage/park/reject)
  const [actionInProgress, setActionInProgress] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionDone, setActionDone] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setPromoted(false);

    fetchIdeaDetail(ideaId).then((result) => {
      if (!cancelled) {
        setData(result);
        if (result.project_id) setSelectedProjectId(result.project_id);
      }
    }).catch((err) => {
      if (!cancelled) setError(err instanceof Error ? err.message : String(err));
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });

    return () => { cancelled = true; };
  }, [ideaId]);

  // Load projects for triaged ideas (promote) and new ideas (triage job needs project_id)
  useEffect(() => {
    if (!activeCompanyId || !data || !["triaged", "new"].includes(data.status)) return;
    let cancelled = false;

    fetchProjects(activeCompanyId).then((result) => {
      if (!cancelled) {
        setProjects(result);
        if (!selectedProjectId && result.length === 1) {
          setSelectedProjectId(result[0].id);
        }
      }
    }).catch(() => {});

    return () => { cancelled = true; };
  }, [activeCompanyId, data?.status]);

  async function handlePromote(): Promise<void> {
    if (!data || !selectedProjectId) return;
    setPromoting(true);
    setPromoteError(null);

    try {
      await promoteIdea({
        ideaId: data.id,
        promoteTo: "feature",
        projectId: selectedProjectId,
        title: data.title ?? undefined,
      });
      setPromoted(true);
      onAction(ideaId, "promoted");
    } catch (err) {
      setPromoteError(err instanceof Error ? err.message : String(err));
    } finally {
      setPromoting(false);
    }
  }

  async function handleAction(newStatus: string, label: string): Promise<void> {
    setActionInProgress(label);
    setActionError(null);
    try {
      await updateIdeaStatus(ideaId, newStatus);
      setActionDone(label);
      onAction(ideaId, newStatus);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err));
    } finally {
      setActionInProgress(null);
    }
  }

  async function handleBackgroundTriage(): Promise<void> {
    if (!activeCompanyId) return;
    const projectId = selectedProjectId ?? projects[0]?.id;
    if (!projectId) {
      setActionError("No project available for triage job");
      return;
    }
    setActionInProgress("Triage");
    setActionError(null);
    try {
      await updateIdeaStatus(ideaId, "triaging");
      await requestTriageJob({ companyId: activeCompanyId, projectId, ideaId });
      setActionDone("Triage");
      onAction(ideaId, "triaging");
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err));
    } finally {
      setActionInProgress(null);
    }
  }

  if (loading) return <div className="il-detail-loading">Loading...</div>;
  if (error) return <div className="il-detail-error">{error}</div>;
  if (!data) return <div className="il-detail-loading">No data</div>;

  const canPromote = data.status === "triaged" && !promoted && !isShipped;
  const readiness = canPromote ? [
    { label: "Has title", ok: Boolean(data.title?.trim()), hint: "Needs a clear title" },
    { label: "Has description", ok: Boolean(data.description?.trim()) || Boolean(data.raw_text && data.raw_text.length > 20), hint: "Needs description or detailed raw text" },
    { label: "Has project", ok: Boolean(selectedProjectId ?? data.project_id), hint: "Select a project below" },
  ] : [];
  const allReady = readiness.every((r) => r.ok);

  return (
    <div className="il-detail">
      <div className="il-detail-divider" />

      {/* Description / Raw text */}
      <div className="il-detail-text">
        <FormattedProse text={data.description && data.description !== data.raw_text ? data.description : data.raw_text} />
      </div>

      {/* Metadata */}
      <div className="il-detail-meta-row">
        {data.source && (
          <div className="il-detail-meta-item">
            <span className="il-detail-meta-key">Source</span>
            <span className="il-detail-meta-val">{data.source}</span>
          </div>
        )}
        {data.originator && (
          <div className="il-detail-meta-item">
            <span className="il-detail-meta-key">Originator</span>
            <span className="il-detail-meta-val">{data.originator}</span>
          </div>
        )}
        <div className="il-detail-meta-item">
          <span className="il-detail-meta-key">Created</span>
          <span className="il-detail-meta-val">{formatDate(data.created_at)}</span>
        </div>
        {data.item_type && (
          <div className="il-detail-meta-item">
            <span className="il-detail-meta-key">Type</span>
            <span className="il-detail-meta-val">{data.item_type}</span>
          </div>
        )}
        {data.priority && (
          <div className="il-detail-meta-item">
            <span className="il-detail-meta-key">Priority</span>
            <span className="il-detail-meta-val">{data.priority}</span>
          </div>
        )}
        {data.horizon && (
          <div className="il-detail-meta-item">
            <span className="il-detail-meta-key">Horizon</span>
            <span className="il-detail-meta-val">{data.horizon}</span>
          </div>
        )}
        {data.promoted_at && (
          <div className="il-detail-meta-item">
            <span className="il-detail-meta-key">Promoted</span>
            <span className="il-detail-meta-val">{formatDate(data.promoted_at)}</span>
          </div>
        )}
      </div>

      {/* Tags */}
      {data.tags && data.tags.length > 0 && (
        <div className="il-detail-tags">
          {data.tags.map((tag) => <span className="il-detail-tag" key={tag}>{tag}</span>)}
        </div>
      )}

      {/* Triage notes (from background triage agent) */}
      {data.triage_notes && (
        <div className="il-detail-section">
          <div className="il-detail-section-label">Triage Notes</div>
          <div className="il-detail-text">
            <FormattedProse text={data.triage_notes} />
          </div>
          {data.suggested_exec && (
            <div className="il-detail-meta-item" style={{ marginTop: 6 }}>
              <span className="il-detail-meta-key">Suggested exec</span>
              <span className="il-detail-meta-val">{data.suggested_exec}</span>
            </div>
          )}
        </div>
      )}

      {/* Clarification notes */}
      {data.clarification_notes && (
        <div className="il-detail-section">
          <div className="il-detail-section-label">Clarification Notes</div>
          <div className="il-detail-text">
            <FormattedProse text={data.clarification_notes} />
          </div>
        </div>
      )}

      {/* Promoted feature link */}
      {data.promotedFeature && (
        <div className="il-detail-section">
          <div className="il-detail-section-label">Promoted To</div>
          <div className="il-detail-linked">
            <span className="il-detail-linked-title">{data.promotedFeature.title}</span>
            <span className="il-detail-linked-status">{data.promotedFeature.status.replace(/_/g, " ")}</span>
          </div>
        </div>
      )}

      {/* Promote to pipeline */}
      {canPromote && (
        <div className="il-detail-section">
          <div className="il-detail-section-label">Push to Pipeline</div>
          <div className="il-promote-readiness">
            {readiness.map((r) => (
              <div className="il-promote-check" key={r.label}>
                <span className={r.ok ? "il-promote-icon ok" : "il-promote-icon missing"}>
                  {r.ok ? "\u2713" : "\u2717"}
                </span>
                <span>{r.label}</span>
                {!r.ok && r.hint && <span className="il-promote-hint">{r.hint}</span>}
              </div>
            ))}
          </div>

          {projects.length > 0 && (
            <div className="il-promote-project">
              <label className="il-promote-label" htmlFor={`promote-project-${ideaId}`}>Project</label>
              <select
                id={`promote-project-${ideaId}`}
                className="il-promote-select"
                value={selectedProjectId ?? ""}
                onChange={(e) => setSelectedProjectId(e.target.value || null)}
              >
                <option value="">Select project...</option>
                {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
          )}

          {promoteError && <div className="il-promote-error">{promoteError}</div>}

          <button
            className="il-action-primary"
            type="button"
            disabled={!allReady || promoting}
            onClick={handlePromote}
          >
            {promoting ? "Promoting..." : "Promote to Feature"}
          </button>
        </div>
      )}

      {promoted && (
        <div className="il-promote-success">Idea promoted to feature and pushed into the pipeline.</div>
      )}

      {/* Actions row for non-triaged items */}
      {!canPromote && !isShipped && !promoted && !actionDone && (
        <div className="il-detail-actions">
          {data.status === "new" && (
            <button className="il-action-secondary il-action-triage" type="button" disabled={!!actionInProgress} onClick={handleBackgroundTriage}>
              {actionInProgress === "Triage" ? "Commissioning..." : "Triage"}
            </button>
          )}
          {data.status !== "parked" && (
            <button className="il-action-secondary il-action-park" type="button" disabled={!!actionInProgress} onClick={() => handleAction("parked", "Park")}>
              {actionInProgress === "Park" ? "Parking..." : "Park"}
            </button>
          )}
          {data.status !== "rejected" && (
            <button className="il-action-secondary il-action-reject" type="button" disabled={!!actionInProgress} onClick={() => handleAction("rejected", "Reject")}>
              {actionInProgress === "Reject" ? "Rejecting..." : "Reject"}
            </button>
          )}
        </div>
      )}

      {actionError && <div className="il-promote-error">{actionError}</div>}
      {actionDone && <div className="il-promote-success">Idea {actionDone.toLowerCase()}d successfully.</div>}
    </div>
  );
}

/* ── Main Ideas Page ── */

export default function Ideas(): JSX.Element {
  const { activeCompanyId } = useCompany();
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [promotedIdeas, setPromotedIdeas] = useState<Idea[]>([]);
  const [featureStatuses, setFeatureStatuses] = useState<Map<string, { title: string; status: string }>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [activeTab, setActiveTab] = useState<SectionTab>("inbox");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [sortMode, setSortMode] = useState<SortMode>("newest");
  const [dismissedIdeas, setDismissedIdeas] = useState<Map<string, string>>(new Map());
  const listRef = useRef<HTMLDivElement>(null);

  const loadIdeas = useCallback(async () => {
    if (!activeCompanyId) return;
    try {
      const [activeData, promotedData] = await Promise.all([
        fetchIdeas(activeCompanyId),
        fetchIdeas(activeCompanyId, ["promoted"]),
      ]);
      setIdeas(activeData);
      setPromotedIdeas(promotedData);
      setError(null);

      const featureIds = promotedData
        .filter((i) => i.promoted_to_type === "feature" && i.promoted_to_id)
        .map((i) => i.promoted_to_id as string);

      if (featureIds.length > 0) {
        const { data } = await supabase
          .from("features")
          .select("id, title, status")
          .in("id", featureIds);

        const map = new Map<string, { title: string; status: string }>();
        for (const f of (data ?? []) as Array<{ id: string; title: string; status: string }>) {
          map.set(f.id, { title: f.title, status: f.status });
        }
        setFeatureStatuses(map);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [activeCompanyId]);

  useEffect(() => {
    void loadIdeas();
  }, [loadIdeas]);

  // Realtime
  const handleInsert = useCallback((row: Record<string, unknown>) => {
    const idea = row as unknown as Idea;
    if (idea.status === "promoted") {
      setPromotedIdeas((prev) => [idea, ...prev]);
    } else {
      setIdeas((prev) => [idea, ...prev]);
    }
  }, []);

  const handleUpdate = useCallback((row: Record<string, unknown>) => {
    const updated = row as unknown as Idea;
    if (updated.status === "promoted") {
      setIdeas((prev) => prev.filter((i) => i.id !== updated.id));
      setPromotedIdeas((prev) => {
        const exists = prev.some((i) => i.id === updated.id);
        return exists ? prev.map((i) => (i.id === updated.id ? updated : i)) : [updated, ...prev];
      });
    } else {
      setPromotedIdeas((prev) => prev.filter((i) => i.id !== updated.id));
      setIdeas((prev) => {
        const exists = prev.some((i) => i.id === updated.id);
        return exists ? prev.map((i) => (i.id === updated.id ? updated : i)) : [updated, ...prev];
      });
    }
  }, []);

  const handleDelete = useCallback((row: Record<string, unknown>) => {
    const id = (row as { id?: string }).id;
    if (id) {
      setIdeas((prev) => prev.filter((i) => i.id !== id));
      setPromotedIdeas((prev) => prev.filter((i) => i.id !== id));
    }
  }, []);

  useRealtimeTable({
    table: "ideas",
    filter: activeCompanyId ? `company_id=eq.${activeCompanyId}` : undefined,
    enabled: Boolean(activeCompanyId),
    onInsert: handleInsert,
    onUpdate: handleUpdate,
    onDelete: handleDelete,
  });

  // Filter by type
  const filtered = useMemo(() => {
    if (typeFilter === "all") return ideas;
    return ideas.filter((i) => i.item_type === typeFilter);
  }, [ideas, typeFilter]);

  const filteredPromoted = useMemo(() => {
    if (typeFilter === "all") return promotedIdeas;
    return promotedIdeas.filter((i) => i.item_type === typeFilter);
  }, [promotedIdeas, typeFilter]);

  // Group by section
  const sections = useMemo(() => ({
    inbox: filtered.filter((i) => i.status === "new" || i.status === "triaging"),
    triaged: filtered.filter((i) => i.status === "triaged"),
    workshop: filtered.filter((i) => i.status === "workshop"),
    parked: filtered.filter((i) => i.status === "parked"),
    shipped: filteredPromoted,
  }), [filtered, filteredPromoted]);

  const activeItems = useMemo(() => {
    const items = [...sections[activeTab]];
    if (sortMode === "oldest") {
      items.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    } else if (sortMode === "newest") {
      items.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    } else if (sortMode === "priority") {
      items.sort((a, b) => priorityRank(a.priority) - priorityRank(b.priority));
    }
    return items;
  }, [sections, activeTab, sortMode]);

  // Section counts (unfiltered for tab badges)
  const tabCounts = useMemo(() => ({
    inbox: ideas.filter((i) => i.status === "new" || i.status === "triaging").length,
    triaged: ideas.filter((i) => i.status === "triaged").length,
    workshop: ideas.filter((i) => i.status === "workshop").length,
    parked: ideas.filter((i) => i.status === "parked").length,
    shipped: promotedIdeas.length,
  }), [ideas, promotedIdeas]);

  // Type counts
  const typeCounts = useMemo(() => {
    const allIdeas = [...ideas, ...promotedIdeas];
    const c = { all: allIdeas.length, idea: 0, brief: 0, bug: 0, test: 0 };
    for (const i of allIdeas) {
      if (i.item_type in c) c[i.item_type as keyof typeof c]++;
    }
    return c;
  }, [ideas, promotedIdeas]);

  // Toggle expand
  function toggleExpand(id: string): void {
    setExpandedId((prev) => prev === id ? null : id);
  }

  // Handle idea action (triage/park/reject/promote) — show toast then remove
  function handleIdeaAction(ideaId: string, newStatus: string): void {
    const label = STATUS_LABELS[newStatus] ?? newStatus;
    setDismissedIdeas((prev) => new Map(prev).set(ideaId, `Moved to ${label}`));
    setExpandedId(null);

    // After toast animation, actually update local state to move the idea
    setTimeout(() => {
      setDismissedIdeas((prev) => {
        const next = new Map(prev);
        next.delete(ideaId);
        return next;
      });
      setIdeas((prev) => prev.map((i) => i.id === ideaId ? { ...i, status: newStatus } : i));
    }, 3000);
  }

  // Keyboard navigation
  useEffect(() => {
    function handleKey(e: KeyboardEvent): void {
      if (!activeItems.length) return;
      const idx = expandedId ? activeItems.findIndex((i) => i.id === expandedId) : -1;

      if (e.key === "ArrowDown" || e.key === "j") {
        e.preventDefault();
        const next = activeItems[Math.min(idx + 1, activeItems.length - 1)];
        if (next) {
          setExpandedId(next.id);
          setTimeout(() => {
            document.getElementById(`il-row-${next.id}`)?.scrollIntoView({ behavior: "smooth", block: "nearest" });
          }, 50);
        }
      } else if (e.key === "ArrowUp" || e.key === "k") {
        e.preventDefault();
        const prev = activeItems[Math.max(idx - 1, 0)];
        if (prev) {
          setExpandedId(prev.id);
          setTimeout(() => {
            document.getElementById(`il-row-${prev.id}`)?.scrollIntoView({ behavior: "smooth", block: "nearest" });
          }, 50);
        }
      } else if (e.key === "Escape") {
        setExpandedId(null);
      }
    }

    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [activeItems, expandedId]);

  if (loading) {
    return (
      <main className="ideas-page">
        <div className="ideas-loading">Loading ideas...</div>
      </main>
    );
  }

  if (error) {
    return (
      <main className="ideas-page">
        <div className="ideas-error">{error}</div>
      </main>
    );
  }

  const isShippedTab = activeTab === "shipped";

  return (
    <main className="ideas-page">
      {/* Header */}
      <div className="il-header">
        <h1 className="il-title">Ideas</h1>
      </div>

      {/* Section tabs */}
      <div className="il-tabs">
        {(["inbox", "triaged", "workshop", "parked", "shipped"] as SectionTab[]).map((tab) => (
          <button
            key={tab}
            className={`il-tab${activeTab === tab ? " active" : ""}`}
            onClick={() => { setActiveTab(tab); setExpandedId(null); }}
            type="button"
          >
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
            <span className="il-tab-count">{tabCounts[tab]}</span>
          </button>
        ))}
      </div>

      {/* Type filter (secondary) */}
      <div className="il-type-filters">
        {(["all", "idea", "brief", "bug", "test"] as TypeFilter[]).map((t) => (
          <button
            key={t}
            className={`il-type-btn${typeFilter === t ? " active" : ""}`}
            onClick={() => setTypeFilter(t)}
            type="button"
          >
            {t === "all" ? "All" : `${t.charAt(0).toUpperCase() + t.slice(1)}s`}
            <span className="il-type-count">{typeCounts[t]}</span>
          </button>
        ))}
      </div>

      {/* Sort controls */}
      <div className="il-sort-bar">
        <span className="il-sort-label">Sort</span>
        {([["newest", "Newest first"], ["oldest", "Oldest first"], ["priority", "Priority"]] as [SortMode, string][]).map(([mode, label]) => (
          <button
            key={mode}
            className={`il-sort-btn${sortMode === mode ? " active" : ""}`}
            onClick={() => setSortMode(mode)}
            type="button"
          >
            {label}
            {sortMode === mode && (
              <span className="il-sort-arrow">{mode === "oldest" ? "\u2191" : "\u2193"}</span>
            )}
          </button>
        ))}
      </div>

      {/* List */}
      <div className="il-list" ref={listRef}>
        {activeItems.length === 0 && (
          <div className="il-empty">No {activeTab} ideas{typeFilter !== "all" ? ` of type "${typeFilter}"` : ""}.</div>
        )}
        {activeItems.map((idea, idx) => {
          const dismissMsg = dismissedIdeas.get(idea.id);
          if (dismissMsg) {
            return (
              <div key={idea.id} className="il-row-dismissed">
                <span className="il-dismissed-text">{dismissMsg}</span>
                <span className="il-dismissed-title">{idea.title ?? idea.raw_text}</span>
              </div>
            );
          }

          const type = idea.item_type ?? "idea";
          const colorVar = TYPE_COLOR_VAR[type] ?? "--col-ideas";
          const isExpanded = expandedId === idea.id;
          const isTriaging = idea.status === "triaging";
          const fInfo = isShippedTab && idea.promoted_to_id ? featureStatuses.get(idea.promoted_to_id) ?? null : null;

          return (
            <div
              key={idea.id}
              id={`il-row-${idea.id}`}
              className={`il-row${isExpanded ? " expanded" : ""}${isTriaging ? " triaging" : ""}`}
              style={{ animationDelay: `${Math.min(idx * 0.02, 0.3)}s` }}
            >
              <div className="il-row-summary" onClick={() => !isTriaging && toggleExpand(idea.id)}>
                <div className="il-row-accent" style={{ background: `var(${colorVar})` }} />
                <div className="il-row-icon">{TYPE_ICON[type] ?? "\u{1F4A1}"}</div>
                <div className="il-row-body">
                  <div className="il-row-title">{idea.title ?? idea.raw_text}</div>
                  {isTriaging ? (
                    <div className="il-row-analysing">Analysing... an agent is triaging this idea</div>
                  ) : (
                    <div className="il-row-desc">
                      {idea.description ?? idea.raw_text}
                    </div>
                  )}
                </div>
                <div className="il-row-meta">
                  {isTriaging ? (
                    <span className="il-triaging-badge">triaging</span>
                  ) : isShippedTab && fInfo ? (
                    <span className={featureStatusClass(fInfo.status)}>{featureStatusLabel(fInfo.status)}</span>
                  ) : (
                    <span className={priorityClass(idea.priority)}>{priorityLabel(idea.priority)}</span>
                  )}
                  <span className="il-source">{sourceLabel(idea)}</span>
                  <span className="il-age">{ageLabel(isShippedTab && idea.promoted_at ? idea.promoted_at : idea.created_at)}</span>
                </div>
                <div className="il-chevron">{!isTriaging && <span className="il-chevron-icon">{"\u25B6"}</span>}</div>
              </div>

              {isExpanded && (
                <InlineDetail
                  ideaId={idea.id}
                  colorVar={colorVar}
                  isShipped={isShippedTab}
                  onAction={handleIdeaAction}
                />
              )}
            </div>
          );
        })}
      </div>
    </main>
  );
}
