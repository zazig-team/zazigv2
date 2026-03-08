import { useCallback, useEffect, useMemo, useState } from "react";
import { useCompany } from "../hooks/useCompany";
import { useRealtimeTable } from "../hooks/useRealtimeTable";
import { fetchIdeas, type Idea } from "../lib/queries";
import { supabase } from "../lib/supabase";
import IdeaDetailPanel from "../components/IdeaDetailPanel";

type TypeFilter = "all" | "idea" | "brief" | "bug" | "test";

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
  if (p === "urgent") return "ideas-priority-badge urgent";
  if (p === "high") return "ideas-priority-badge high";
  if (p === "low") return "ideas-priority-badge low";
  return "ideas-priority-badge medium";
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

function featureStatusBadgeClass(status: string): string {
  const s = status.toLowerCase();
  if (s === "complete" || s === "shipped") return "detail-badge detail-badge--positive";
  if (s === "failed" || s === "cancelled") return "detail-badge detail-badge--negative";
  if (s === "building" || s === "breaking_down" || s === "verifying") return "detail-badge detail-badge--active";
  if (s === "proposal" || s === "ready") return "detail-badge detail-badge--caution";
  return "detail-badge";
}

interface IdeaNodeProps {
  idea: Idea;
  variant: "workshop" | "inbox" | "parked";
  onClick: () => void;
  selected: boolean;
}

function IdeaNode({ idea, variant, onClick, selected }: IdeaNodeProps): JSX.Element {
  const type = idea.item_type ?? "idea";
  const colorVar = TYPE_COLOR_VAR[type] ?? "--col-ideas";

  return (
    <div
      className={`ideas-node ideas-node--${variant}${selected ? " ideas-node--selected" : ""}`}
      onClick={onClick}
    >
      <div className="ideas-node-accent" style={{ background: `var(${colorVar})` }} />
      <div className="ideas-node-icon">{TYPE_ICON[type] ?? "\u{1F4A1}"}</div>
      <div className="ideas-node-body">
        <div className="ideas-node-title">{idea.title ?? idea.raw_text}</div>
        <div className="ideas-node-meta">
          <span className="ideas-node-type" style={{ color: `var(${colorVar})` }}>{type}</span>
          <span className={priorityClass(idea.priority)}>{priorityLabel(idea.priority)}</span>
          <span className="ideas-node-source">{sourceLabel(idea)}</span>
          <span className="ideas-node-age">{ageLabel(idea.created_at)}</span>
        </div>
        {variant === "workshop" && idea.description && (
          <div className="ideas-node-desc">{idea.description}</div>
        )}
      </div>
    </div>
  );
}

interface ShippedIdeaNodeProps {
  idea: Idea;
  featureInfo: { title: string; status: string } | null;
  onClick: () => void;
  selected: boolean;
}

function ShippedIdeaNode({ idea, featureInfo, onClick, selected }: ShippedIdeaNodeProps): JSX.Element {
  const type = idea.item_type ?? "idea";
  const colorVar = TYPE_COLOR_VAR[type] ?? "--col-ideas";

  return (
    <div
      className={`ideas-node ideas-node--shipped${selected ? " ideas-node--selected" : ""}`}
      onClick={onClick}
    >
      <div className="ideas-node-accent" style={{ background: `var(${colorVar})` }} />
      <div className="ideas-node-icon">{TYPE_ICON[type] ?? "\u{1F4A1}"}</div>
      <div className="ideas-node-body">
        <div className="ideas-node-title">{idea.title ?? idea.raw_text}</div>
        <div className="ideas-node-meta">
          <span className="ideas-node-type" style={{ color: `var(${colorVar})` }}>{type}</span>
          {featureInfo ? (
            <span className={featureStatusBadgeClass(featureInfo.status)}>
              {featureInfo.status.replace(/_/g, " ")}
            </span>
          ) : (
            <span className="ideas-node-source">{idea.promoted_to_type ?? "promoted"}</span>
          )}
          {idea.promoted_at && (
            <span className="ideas-node-age">{ageLabel(idea.promoted_at)}</span>
          )}
        </div>
        {featureInfo && (
          <div className="ideas-node-desc">{featureInfo.title}</div>
        )}
      </div>
    </div>
  );
}

export default function Ideas(): JSX.Element {
  const { activeCompanyId } = useCompany();
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [promotedIdeas, setPromotedIdeas] = useState<Idea[]>([]);
  const [featureStatuses, setFeatureStatuses] = useState<Map<string, { title: string; status: string }>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [parkedCollapsed, setParkedCollapsed] = useState(false);
  const [shippedCollapsed, setShippedCollapsed] = useState(false);

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

      // Fetch linked feature statuses for promoted ideas
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

  // Realtime updates
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
  const workshop = useMemo(() => filtered.filter((i) => i.status === "workshop"), [filtered]);
  const triaged = useMemo(() => filtered.filter((i) => i.status === "triaged"), [filtered]);
  const newItems = useMemo(() => filtered.filter((i) => i.status === "new"), [filtered]);
  const parkedSoon = useMemo(
    () => filtered.filter((i) => i.status === "parked" && i.horizon === "soon"),
    [filtered],
  );
  const parkedLater = useMemo(
    () => filtered.filter((i) => i.status === "parked" && (i.horizon === "later" || !i.horizon)),
    [filtered],
  );

  // Counts for flow bar (unfiltered)
  const counts = useMemo(() => {
    const w = ideas.filter((i) => i.status === "workshop").length;
    const t = ideas.filter((i) => i.status === "triaged").length;
    const n = ideas.filter((i) => i.status === "new").length;
    const p = ideas.filter((i) => i.status === "parked").length;
    const s = promotedIdeas.length;
    return { workshop: w, triaged: t, new: n, parked: p, shipped: s, total: ideas.length + s };
  }, [ideas, promotedIdeas]);

  // Type counts for filter tabs
  const typeCounts = useMemo(() => {
    const allIdeas = [...ideas, ...promotedIdeas];
    const c = { all: allIdeas.length, idea: 0, brief: 0, bug: 0, test: 0 };
    for (const i of allIdeas) {
      if (i.item_type in c) c[i.item_type as keyof typeof c]++;
    }
    return c;
  }, [ideas, promotedIdeas]);

  const selectedIdea = useMemo(() => {
    if (!selectedId) return null;
    return ideas.find((i) => i.id === selectedId) ?? promotedIdeas.find((i) => i.id === selectedId) ?? null;
  }, [ideas, promotedIdeas, selectedId]);

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

  return (
    <main className="ideas-page">
      {/* Page header */}
      <div className="ideas-header">
        <div className="ideas-header-left">
          <h1 className="ideas-title">Ideas</h1>
          <div className="ideas-stats">
            <span className="ideas-stat">
              <span className="ideas-stat-count">{counts.total}</span> total
            </span>
          </div>
        </div>
      </div>

      {/* Flow bar */}
      <div className="ideas-flow-bar">
        <div className="ideas-flow-stage">
          <span className="ideas-flow-label">New</span>
          <span className="ideas-flow-count">{counts.new}</span>
        </div>
        <span className="ideas-flow-arrow">{"\u25B8"}</span>
        <div className="ideas-flow-stage">
          <span className="ideas-flow-label">Triaged</span>
          <span className="ideas-flow-count">{counts.triaged}</span>
        </div>
        <span className="ideas-flow-arrow">{"\u25B8"}</span>
        <div className="ideas-flow-stage">
          <span className="ideas-flow-label">Workshop</span>
          <span className="ideas-flow-count">{counts.workshop}</span>
        </div>
        <span className="ideas-flow-arrow">{"\u25B8"}</span>
        <div className={`ideas-flow-stage${counts.parked === 0 ? " dimmed" : ""}`}>
          <span className="ideas-flow-label">Parked</span>
          <span className="ideas-flow-count">{counts.parked}</span>
        </div>
        <span className="ideas-flow-arrow">{"\u25B8"}</span>
        <div className={`ideas-flow-stage${counts.shipped === 0 ? " dimmed" : ""}`}>
          <span className="ideas-flow-label">Shipped</span>
          <span className="ideas-flow-count">{counts.shipped}</span>
        </div>
      </div>

      {/* Type filter tabs */}
      <div className="ideas-filter-bar">
        {(["all", "idea", "brief", "bug", "test"] as TypeFilter[]).map((t) => (
          <button
            key={t}
            className={`ideas-filter-tab${typeFilter === t ? " active" : ""}`}
            onClick={() => setTypeFilter(t)}
            type="button"
          >
            {t === "all" ? "All" : t.charAt(0).toUpperCase() + t.slice(1)}s
            <span className="ideas-filter-count">{typeCounts[t]}</span>
          </button>
        ))}
      </div>

      {/* Workshop section */}
      {workshop.length > 0 && (
        <div className="ideas-section">
          <div className="ideas-section-header">
            <span className="ideas-section-label">Workshop</span>
            <span className="ideas-section-count">{workshop.length}</span>
            <div className="ideas-section-line" />
          </div>
          <div className="ideas-node-grid">
            {workshop.map((idea) => (
              <IdeaNode
                key={idea.id}
                idea={idea}
                variant="workshop"
                onClick={() => setSelectedId(idea.id)}
                selected={selectedId === idea.id}
              />
            ))}
          </div>
        </div>
      )}

      {/* Inbox: Triaged */}
      {triaged.length > 0 && (
        <div className="ideas-section">
          <div className="ideas-section-header">
            <span className="ideas-section-label">Triaged</span>
            <span className="ideas-section-count">{triaged.length}</span>
            <div className="ideas-section-line" />
          </div>
          <div className="ideas-node-grid">
            {triaged.map((idea) => (
              <IdeaNode
                key={idea.id}
                idea={idea}
                variant="inbox"
                onClick={() => setSelectedId(idea.id)}
                selected={selectedId === idea.id}
              />
            ))}
          </div>
        </div>
      )}

      {/* Inbox: New */}
      {newItems.length > 0 && (
        <div className="ideas-section">
          <div className="ideas-section-header">
            <span className="ideas-section-label">Inbox</span>
            <span className="ideas-section-count">{newItems.length}</span>
            <div className="ideas-section-line" />
          </div>
          <div className="ideas-node-grid">
            {newItems.map((idea) => (
              <IdeaNode
                key={idea.id}
                idea={idea}
                variant="inbox"
                onClick={() => setSelectedId(idea.id)}
                selected={selectedId === idea.id}
              />
            ))}
          </div>
        </div>
      )}

      {/* Parked section */}
      {(parkedSoon.length > 0 || parkedLater.length > 0) && (
        <div className="ideas-section">
          <div
            className="ideas-section-header"
            onClick={() => setParkedCollapsed(!parkedCollapsed)}
            style={{ cursor: "pointer" }}
          >
            <span className={`ideas-section-toggle${parkedCollapsed ? " collapsed" : ""}`}>{"\u25BE"}</span>
            <span className="ideas-section-label">Parked</span>
            <span className="ideas-section-count">{parkedSoon.length + parkedLater.length}</span>
            <div className="ideas-section-line" />
          </div>
          {!parkedCollapsed && (
            <>
              {parkedSoon.length > 0 && (
                <div className="ideas-sub-section">
                  <div className="ideas-sub-label">Review Soon</div>
                  <div className="ideas-node-grid">
                    {parkedSoon.map((idea) => (
                      <IdeaNode
                        key={idea.id}
                        idea={idea}
                        variant="parked"
                        onClick={() => setSelectedId(idea.id)}
                        selected={selectedId === idea.id}
                      />
                    ))}
                  </div>
                </div>
              )}
              {parkedLater.length > 0 && (
                <div className="ideas-sub-section">
                  <div className="ideas-sub-label">Long Term</div>
                  <div className="ideas-node-grid">
                    {parkedLater.map((idea) => (
                      <IdeaNode
                        key={idea.id}
                        idea={idea}
                        variant="parked"
                        onClick={() => setSelectedId(idea.id)}
                        selected={selectedId === idea.id}
                      />
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Shipped section — promoted ideas with linked feature status */}
      {filteredPromoted.length > 0 && (
        <div className="ideas-section">
          <div
            className="ideas-section-header"
            onClick={() => setShippedCollapsed(!shippedCollapsed)}
            style={{ cursor: "pointer" }}
          >
            <span className={`ideas-section-toggle${shippedCollapsed ? " collapsed" : ""}`}>{"\u25BE"}</span>
            <span className="ideas-section-label">Shipped</span>
            <span className="ideas-section-count">{filteredPromoted.length}</span>
            <div className="ideas-section-line" />
          </div>
          {!shippedCollapsed && (
            <div className="ideas-node-grid">
              {filteredPromoted.map((idea) => (
                <ShippedIdeaNode
                  key={idea.id}
                  idea={idea}
                  featureInfo={idea.promoted_to_id ? featureStatuses.get(idea.promoted_to_id) ?? null : null}
                  onClick={() => setSelectedId(idea.id)}
                  selected={selectedId === idea.id}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Empty state */}
      {filtered.length === 0 && filteredPromoted.length === 0 && (
        <div className="ideas-empty">No ideas found.</div>
      )}

      {/* Detail panel */}
      {selectedId && selectedIdea && (
        <IdeaDetailPanel
          ideaId={selectedId}
          colorVar={TYPE_COLOR_VAR[selectedIdea.item_type] ?? "--col-ideas"}
          onClose={() => setSelectedId(null)}
        />
      )}
    </main>
  );
}
