import { useCallback, useEffect, useMemo, useState } from "react";
import { useCompany } from "../hooks/useCompany";
import { useRealtimeTable } from "../hooks/useRealtimeTable";
import { fetchIdeas, type Idea } from "../lib/queries";
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

function priorityDotClass(priority: string | null): string {
  const p = (priority ?? "medium").toLowerCase();
  if (p === "urgent") return "ideas-priority urgent";
  if (p === "high") return "ideas-priority high";
  if (p === "low") return "ideas-priority low";
  return "ideas-priority medium";
}

function sourceLabel(idea: Idea): string {
  // Use originator or infer source from data
  if (idea.originator) {
    const lower = idea.originator.toLowerCase();
    if (lower.includes("slack")) return "slack";
    if (lower.includes("telegram")) return "telegram";
    if (lower.includes("agent") || lower.includes("cpo") || lower.includes("monitoring")) return "agent";
    if (lower.includes("web")) return "web";
  }
  return "terminal";
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
          <span className={priorityDotClass(idea.priority)} />
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

export default function Ideas(): JSX.Element {
  const { activeCompanyId } = useCompany();
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [parkedCollapsed, setParkedCollapsed] = useState(false);

  const loadIdeas = useCallback(async () => {
    if (!activeCompanyId) return;
    try {
      const data = await fetchIdeas(activeCompanyId);
      setIdeas(data);
      setError(null);
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
    setIdeas((prev) => [row as unknown as Idea, ...prev]);
  }, []);

  const handleUpdate = useCallback((row: Record<string, unknown>) => {
    const updated = row as unknown as Idea;
    setIdeas((prev) => prev.map((i) => (i.id === updated.id ? updated : i)));
  }, []);

  const handleDelete = useCallback((row: Record<string, unknown>) => {
    const id = (row as { id?: string }).id;
    if (id) setIdeas((prev) => prev.filter((i) => i.id !== id));
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
    return { workshop: w, triaged: t, new: n, parked: p, total: ideas.length };
  }, [ideas]);

  // Type counts for filter tabs
  const typeCounts = useMemo(() => {
    const c = { all: ideas.length, idea: 0, brief: 0, bug: 0, test: 0 };
    for (const i of ideas) {
      if (i.item_type in c) c[i.item_type as keyof typeof c]++;
    }
    return c;
  }, [ideas]);

  const selectedIdea = useMemo(
    () => (selectedId ? ideas.find((i) => i.id === selectedId) : null),
    [ideas, selectedId],
  );

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

      {/* Empty state */}
      {filtered.length === 0 && (
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
