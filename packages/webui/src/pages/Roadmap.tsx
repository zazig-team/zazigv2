import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../lib/supabase";
import { useCompany } from "../hooks/useCompany";
import { useRealtimeTable } from "../hooks/useRealtimeTable";
import FeatureDetailPanel from "../components/FeatureDetailPanel";

// ─── Types ─────────────────────────────────────────

type NodeStatus = "shipped" | "active" | "draft" | "locked";

interface RoadmapNode {
  id: string;
  lane: string;
  col: number;
  icon: string;
  title: string;
  status: NodeStatus;
  progress: number;
  tooltip: string;
  deps: string[];
  unlocks: string[];
  details: string;
  nextUp?: boolean;
}

interface Lane {
  id: string;
  label: string;
}

interface CapabilityLaneRow {
  id: string;
  name: string;
  sort_order: number;
}

interface CapabilityRow {
  id: string;
  lane_id: string;
  title: string;
  icon: string;
  status: string;
  progress: number;
  depends_on: string[];
  sort_order: number;
  details: string | null;
  tooltip: string | null;
}

interface LinkedFeature {
  id: string;
  title: string;
  status: string;
}

// ─── Layout Constants ──────────────────────────────

const LANE_H = 86;
const LANE_TOP = 16;
const COL_W = 230;
const COL_LEFT = 160;
const NODE_W = 200;
const NODE_H = 68;

// ─── Helpers ───────────────────────────────────────

function renderMarkdown(src: string): string {
  const blocks: string[] = [];
  let html = src.replace(/```(\w*)\n([\s\S]*?)```/g, (_, _lang: string, code: string) => {
    blocks.push(`<pre class="rm-pre"><code>${code.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</code></pre>`);
    return `\x00${blocks.length - 1}\x00`;
  });

  html = html.replace(/^(\|.+\|)\n(\|[-:\| ]+\|)\n((?:\|.+\|\n?)+)/gm, (_, hdr: string, _sep: string, body: string) => {
    const ths = hdr.split("|").slice(1, -1).map((h: string) => `<th>${h.trim()}</th>`).join("");
    const rows = body.trim().split("\n").map((r: string) => {
      const tds = r.split("|").slice(1, -1).map((c: string) => `<td>${c.trim()}</td>`).join("");
      return `<tr>${tds}</tr>`;
    }).join("");
    return `<table><thead><tr>${ths}</tr></thead><tbody>${rows}</tbody></table>`;
  });

  html = html.replace(/^### (.+)$/gm, '<h4>$1</h4>');
  html = html.replace(/^## (.+)$/gm, '<h3>$1</h3>');
  html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/`([^`\n]+)`/g, '<code>$1</code>');

  html = html.replace(/((?:^- .+$\n?)+)/gm, (m: string) => {
    const items = m.trim().split("\n").map((l: string) => `<li>${l.replace(/^- /, "")}</li>`).join("");
    return `<ul>${items}</ul>`;
  });

  html = html.replace(/((?:^\d+\. .+$\n?)+)/gm, (m: string) => {
    const items = m.trim().split("\n").map((l: string) => `<li>${l.replace(/^\d+\.\s*/, "")}</li>`).join("");
    return `<ol>${items}</ol>`;
  });

  html = html.split("\n\n").map((block) => {
    const t = block.trim();
    if (!t || t.startsWith("<") || t.startsWith("\x00")) return t;
    return `<p>${t.replace(/\n/g, " ")}</p>`;
  }).join("\n");

  blocks.forEach((code, i) => { html = html.replace(`\x00${i}\x00`, code); });
  return html;
}

function buildPath(targetId: string, nodeMap: Map<string, RoadmapNode>): RoadmapNode[] {
  const visited = new Set<string>();
  const path: RoadmapNode[] = [];
  const byTitle = new Map<string, RoadmapNode>();
  for (const n of nodeMap.values()) {
    byTitle.set(n.title, n);
  }
  function walk(id: string): void {
    if (visited.has(id)) return;
    visited.add(id);
    const node = nodeMap.get(id);
    if (!node) return;
    for (const depTitle of node.deps) {
      const dep = byTitle.get(depTitle);
      if (dep) walk(dep.id);
    }
    path.push(node);
  }
  walk(targetId);
  return path;
}

function depsStatus(node: RoadmapNode, nodeMap: Map<string, RoadmapNode>): { done: number; total: number; items: Array<{ title: string; status: NodeStatus }> } {
  const items = node.deps.map((depTitle) => {
    const dep = [...nodeMap.values()].find((n) => n.title === depTitle);
    return { title: depTitle, status: (dep?.status ?? "locked") as NodeStatus };
  });
  const done = items.filter((d) => d.status === "shipped").length;
  return { done, total: items.length, items };
}

const STATUS_ICON: Record<NodeStatus, string> = { shipped: "\u2713", active: "\u25D1", draft: "\u25CB", locked: "\u25CB" };

function statusBadgeClass(status: string): string {
  const s = status.toLowerCase();
  if (s === "complete" || s === "shipped") return "detail-badge detail-badge--positive";
  if (s === "failed" || s === "cancelled") return "detail-badge detail-badge--negative";
  if (s === "building" || s === "breaking_down" || s === "verifying") return "detail-badge detail-badge--active";
  if (s === "proposal" || s === "ready") return "detail-badge detail-badge--caution";
  return "detail-badge";
}

// ─── Component ─────────────────────────────────────

export default function Roadmap(): JSX.Element {
  const { activeCompany } = useCompany();
  const [selectedNode, setSelectedNode] = useState<RoadmapNode | null>(null);
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);
  const [lanes, setLanes] = useState<Lane[]>([]);
  const [nodes, setNodes] = useState<RoadmapNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [linkedFeatures, setLinkedFeatures] = useState<LinkedFeature[]>([]);
  const [featuresLoading, setFeaturesLoading] = useState(false);
  const [selectedFeature, setSelectedFeature] = useState<{ id: string; colorVar: string } | null>(null);
  const refreshTimerRef = useRef<number | null>(null);

  const fetchData = useCallback(async () => {
    if (!activeCompany?.id) {
      setLanes([]);
      setNodes([]);
      setLoading(false);
      return;
    }

    try {
      const [lanesResult, capsResult] = await Promise.all([
        supabase
          .from("capability_lanes")
          .select("id, name, sort_order")
          .eq("company_id", activeCompany.id)
          .order("sort_order"),
        supabase
          .from("capabilities")
          .select("id, lane_id, title, icon, status, progress, depends_on, sort_order, details, tooltip")
          .eq("company_id", activeCompany.id)
          .order("lane_id")
          .order("sort_order"),
      ]);

      if (lanesResult.error) throw lanesResult.error;
      if (capsResult.error) throw capsResult.error;

      const laneRows = (lanesResult.data ?? []) as CapabilityLaneRow[];
      const capRows = (capsResult.data ?? []) as CapabilityRow[];

      // Build lane name lookup
      const laneNameById = new Map<string, string>();
      for (const lane of laneRows) {
        laneNameById.set(lane.id, lane.name);
      }

      // Build title lookup by id for deps resolution
      const titleById = new Map<string, string>();
      for (const cap of capRows) {
        titleById.set(cap.id, cap.title);
      }

      // Build inverse deps (unlocks): which nodes list this node in their depends_on
      const unlocksMap = new Map<string, string[]>();
      for (const cap of capRows) {
        for (const depId of cap.depends_on ?? []) {
          const depTitle = titleById.get(depId);
          if (depTitle) {
            const existing = unlocksMap.get(depId) ?? [];
            existing.push(cap.title);
            unlocksMap.set(depId, existing);
          }
        }
      }

      // Map to Lane[]
      const mappedLanes: Lane[] = laneRows.map((lane) => ({
        id: lane.id,
        label: lane.name,
      }));

      // Map to RoadmapNode[]
      const mappedNodes: RoadmapNode[] = capRows.map((cap) => ({
        id: cap.id,
        lane: laneNameById.get(cap.lane_id) ?? "",
        col: cap.sort_order,
        icon: cap.icon,
        title: cap.title,
        status: cap.status as NodeStatus,
        progress: cap.progress,
        tooltip: cap.tooltip ?? "",
        deps: (cap.depends_on ?? []).map((depId) => titleById.get(depId) ?? depId),
        unlocks: unlocksMap.get(cap.id) ?? [],
        details: cap.details ?? "",
      }));

      setLanes(mappedLanes);
      setNodes(mappedNodes);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [activeCompany?.id]);

  useEffect(() => {
    setLoading(true);
    void fetchData();
  }, [fetchData]);

  // Fetch linked features when a node is selected
  useEffect(() => {
    if (!selectedNode || !activeCompany?.id) {
      setLinkedFeatures([]);
      return;
    }

    let cancelled = false;
    setFeaturesLoading(true);

    async function loadFeatures(): Promise<void> {
      const { data, error: featError } = await supabase
        .from("features")
        .select("id, title, status")
        .eq("capability_id", selectedNode!.id);

      if (cancelled) return;

      if (featError) {
        setLinkedFeatures([]);
      } else {
        setLinkedFeatures((data ?? []) as LinkedFeature[]);
      }
      setFeaturesLoading(false);
    }

    void loadFeatures();
    return () => { cancelled = true; };
  }, [selectedNode?.id, activeCompany?.id]);

  // Realtime subscriptions
  const scheduleRefresh = useCallback(() => {
    if (refreshTimerRef.current !== null) {
      window.clearTimeout(refreshTimerRef.current);
    }
    refreshTimerRef.current = window.setTimeout(() => {
      void fetchData();
      refreshTimerRef.current = null;
    }, 300);
  }, [fetchData]);

  useEffect(() => {
    return () => {
      if (refreshTimerRef.current !== null) {
        window.clearTimeout(refreshTimerRef.current);
      }
    };
  }, []);

  const realtimeEnabled = Boolean(activeCompany?.id);
  const realtimeFilter = activeCompany?.id
    ? `company_id=eq.${activeCompany.id}`
    : undefined;

  useRealtimeTable({
    table: "capabilities",
    filter: realtimeFilter,
    enabled: realtimeEnabled,
    onInsert: scheduleRefresh,
    onUpdate: scheduleRefresh,
    onDelete: scheduleRefresh,
  });

  useRealtimeTable({
    table: "capability_lanes",
    filter: realtimeFilter,
    enabled: realtimeEnabled,
    onInsert: scheduleRefresh,
    onUpdate: scheduleRefresh,
    onDelete: scheduleRefresh,
  });

  const nodeMap = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);
  const laneIndex = useMemo(() => new Map(lanes.map((l, i) => [l.label, i])), [lanes]);

  const maxCol = nodes.length > 0 ? Math.max(...nodes.map((n) => n.col)) : 0;
  const totalWidth = COL_LEFT + (maxCol + 1) * COL_W + 80;
  const totalHeight = LANE_TOP + lanes.length * LANE_H + 40;

  const nodeX = useCallback((n: RoadmapNode) => COL_LEFT + n.col * COL_W, []);
  const nodeY = useCallback((n: RoadmapNode) => LANE_TOP + (laneIndex.get(n.lane) ?? 0) * LANE_H, [laneIndex]);

  const buildNext = useMemo(() =>
    nodes.filter((n) =>
      n.status !== "shipped" &&
      n.deps.every((depTitle) => {
        const dep = [...nodeMap.values()].find((nd) => nd.title === depTitle);
        return dep && (dep.status === "shipped" || dep.status === "active");
      }),
    ).sort((a, b) => {
      if (a.status === "active" && b.status !== "active") return -1;
      if (b.status === "active" && a.status !== "active") return 1;
      return 0;
    }).slice(0, 6),
  [nodes, nodeMap]);

  const highlightSet = useMemo(() => {
    if (!hoveredNode) return null;
    const set = new Set<string>([hoveredNode]);
    const walkUp = (id: string): void => {
      const n = nodeMap.get(id);
      if (!n || set.has(id)) return;
      set.add(id);
      // Find nodes by dep titles
      for (const depTitle of n.deps) {
        const dep = [...nodeMap.values()].find((nd) => nd.title === depTitle);
        if (dep) walkUp(dep.id);
      }
    };
    const walkDown = (id: string): void => {
      const n = nodeMap.get(id);
      if (!n || set.has(id)) return;
      set.add(id);
      for (const unlockTitle of n.unlocks) {
        const unlock = [...nodeMap.values()].find((nd) => nd.title === unlockTitle);
        if (unlock) walkDown(unlock.id);
      }
    };
    const node = nodeMap.get(hoveredNode);
    if (node) {
      for (const depTitle of node.deps) {
        const dep = [...nodeMap.values()].find((nd) => nd.title === depTitle);
        if (dep) walkUp(dep.id);
      }
      for (const unlockTitle of node.unlocks) {
        const unlock = [...nodeMap.values()].find((nd) => nd.title === unlockTitle);
        if (unlock) walkDown(unlock.id);
      }
    }
    return set;
  }, [hoveredNode, nodeMap]);

  const statusCounts = useMemo(() => ({
    shipped: nodes.filter((n) => n.status === "shipped").length,
    active: nodes.filter((n) => n.status === "active").length,
    draft: nodes.filter((n) => n.status === "draft").length,
    locked: nodes.filter((n) => n.status === "locked").length,
  }), [nodes]);

  if (loading) {
    return (
      <div className="roadmap-page">
        <div className="page-header">
          <div className="page-header-left">
            <div className="page-title">Roadmap</div>
          </div>
        </div>
        <div className="inline-feedback">Loading roadmap...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="roadmap-page">
        <div className="page-header">
          <div className="page-header-left">
            <div className="page-title">Roadmap</div>
          </div>
        </div>
        <div className="inline-feedback inline-feedback--error">{error}</div>
      </div>
    );
  }

  if (nodes.length === 0) {
    return (
      <div className="roadmap-page">
        <div className="page-header">
          <div className="page-header-left">
            <div className="page-title">Roadmap</div>
          </div>
        </div>
        <div className="inline-feedback">No capabilities found. The CPO will populate the roadmap as your product takes shape.</div>
      </div>
    );
  }

  // Build a lookup from title to node for connection drawing
  const nodeByTitle = new Map(nodes.map((n) => [n.title, n]));

  return (
    <div className="roadmap-page">
      <div className="page-header">
        <div className="page-header-left">
          <div className="page-title">Roadmap</div>
          <div className="page-stats">
            <div className="page-stat">Shipped <span className="page-stat-value" style={{ color: "var(--positive)" }}>{statusCounts.shipped}</span></div>
            <div className="page-stat">Active <span className="page-stat-value" style={{ color: "var(--ember)" }}>{statusCounts.active}</span></div>
            <div className="page-stat">Designed <span className="page-stat-value" style={{ color: "var(--info)" }}>{statusCounts.draft}</span></div>
            <div className="page-stat">Locked <span className="page-stat-value" style={{ color: "var(--dust)" }}>{statusCounts.locked}</span></div>
          </div>
        </div>
        <div className="page-header-right">
          <div className="roadmap-legend">
            <span className="roadmap-legend-item"><span className="roadmap-legend-dot" style={{ background: "var(--positive)" }} />Shipped</span>
            <span className="roadmap-legend-item"><span className="roadmap-legend-dot" style={{ background: "var(--ember)" }} />Active</span>
            <span className="roadmap-legend-item"><span className="roadmap-legend-dot" style={{ background: "var(--info)" }} />Designed</span>
            <span className="roadmap-legend-item"><span className="roadmap-legend-dot" style={{ background: "var(--dust)" }} />Locked</span>
          </div>
        </div>
      </div>

      <section className="roadmap-next">
        <div className="section-label">
          Build Next
          <span className="section-label-count">{buildNext.length} items</span>
        </div>
        <div className="roadmap-next-cards">
          {buildNext.map((node) => (
            <button key={node.id} className="roadmap-next-card" type="button" onClick={() => setSelectedNode(node)}>
              <span className="roadmap-next-icon">{node.icon}</span>
              <div className="roadmap-next-text">
                <div className="roadmap-next-title">{node.title}</div>
                <div className="roadmap-next-unlocks">
                  {node.unlocks.length > 0
                    ? `Unlocks: ${node.unlocks.join(", ")}`
                    : "Endgame capability"}
                </div>
              </div>
              <span className={`roadmap-node-dot roadmap-node-dot--${node.status}`} />
            </button>
          ))}
        </div>
      </section>

      <div className="roadmap-scroll">
        <div className="roadmap-grid" style={{ width: totalWidth, height: totalHeight }}>
          <div className="roadmap-lane-labels">
            {lanes.map((lane, i) => (
              <div key={lane.id} className="roadmap-lane-label" style={{ top: LANE_TOP + i * LANE_H + 12 }}>
                {lane.label}
              </div>
            ))}
          </div>

          {lanes.map((_, i) => (
            <div key={`stripe-${i}`} className="roadmap-lane-stripe" style={{ top: LANE_TOP + i * LANE_H - 4, left: COL_LEFT - 10, width: totalWidth - COL_LEFT }} />
          ))}

          <svg className="roadmap-connections" width={totalWidth} height={totalHeight}>
            {nodes.flatMap((node) =>
              node.unlocks.map((unlockTitle) => {
                const target = nodeByTitle.get(unlockTitle);
                if (!target) return null;
                const x1 = nodeX(node) + NODE_W + 3;
                const y1 = nodeY(node) + NODE_H / 2;
                const x2 = nodeX(target) - 3;
                const y2 = nodeY(target) + NODE_H / 2;

                let color: string;
                let opacity: number;
                let dashArray: string | undefined;
                if (node.status === "shipped" && target.status === "shipped") {
                  color = "var(--positive)"; opacity = 0.45;
                } else if (node.status === "shipped" || node.status === "active") {
                  color = "var(--ember)"; opacity = 0.35;
                } else {
                  color = "var(--dust)"; opacity = 0.25; dashArray = "4,4";
                }

                if (highlightSet) {
                  if (highlightSet.has(node.id) && highlightSet.has(target.id)) {
                    opacity = Math.min(opacity * 2.5, 1);
                  } else {
                    opacity = 0.06;
                  }
                }

                const sameLane = node.lane === target.lane;
                const gap = x2 - x1;
                const key = `${node.id}-${target.id}`;

                return (
                  <g key={key}>
                    {sameLane && gap > 0 && gap < COL_W + 20 ? (
                      <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={color} strokeOpacity={opacity} strokeWidth={2} />
                    ) : (
                      <path
                        d={`M${x1},${y1} C${x1 + Math.max(30, Math.abs(gap) * 0.35)},${y1} ${x2 - Math.max(30, Math.abs(gap) * 0.35)},${y2} ${x2},${y2}`}
                        fill="none" stroke={color} strokeOpacity={opacity} strokeWidth={2} strokeDasharray={dashArray}
                      />
                    )}
                    <polygon
                      points={`${x2},${y2} ${x2 - 5},${y2 - 3} ${x2 - 5},${y2 + 3}`}
                      fill={color} fillOpacity={opacity}
                    />
                  </g>
                );
              }),
            )}
          </svg>

          {nodes.map((node) => {
            const deps = depsStatus(node, nodeMap);
            const dimmed = highlightSet !== null && !highlightSet.has(node.id);
            const isNext = node.nextUp || (node.status !== "shipped" && deps.total > 0 && deps.done === deps.total);

            return (
              <div
                key={node.id}
                className={`roadmap-node roadmap-node--${node.status}${isNext ? " roadmap-node--next" : ""}${dimmed ? " roadmap-node--dimmed" : ""}`}
                style={{ left: nodeX(node), top: nodeY(node), width: NODE_W, height: NODE_H }}
                onClick={() => setSelectedNode(node)}
                onMouseEnter={() => setHoveredNode(node.id)}
                onMouseLeave={() => setHoveredNode(null)}
              >
                <div className="roadmap-node-accent" />
                <div className="roadmap-node-body">
                  <div className="roadmap-node-header">
                    <span className="roadmap-node-icon">{node.icon}</span>
                    <span className="roadmap-node-title">{node.title}</span>
                    {isNext && node.status !== "shipped" ? <span className="roadmap-next-badge">NEXT</span> : null}
                    <span className={`roadmap-node-dot roadmap-node-dot--${node.status}`} />
                  </div>
                  {node.progress > 0 && node.progress < 100 ? (
                    <div className="roadmap-node-progress">
                      <div className={`roadmap-node-progress-fill roadmap-node-progress-fill--${node.status}`} style={{ width: `${node.progress}%` }} />
                    </div>
                  ) : null}
                  {deps.total > 0 ? (
                    <div className="roadmap-node-deps">
                      {deps.items.map((d, i) => (
                        <span key={i}>
                          {i > 0 ? " " : ""}
                          <span className={`roadmap-dep-indicator roadmap-dep-indicator--${d.status}`}>{STATUS_ICON[d.status]}</span>
                          {" "}{d.title}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {selectedNode ? (
        <>
          <div className="roadmap-detail-overlay" onClick={() => setSelectedNode(null)} />
          <aside className="roadmap-detail-panel">
            <header className="roadmap-detail-header">
              <span className="roadmap-detail-icon">{selectedNode.icon}</span>
              <div className="roadmap-detail-header-text">
                <div className="roadmap-detail-title">{selectedNode.title}</div>
                <div className="roadmap-detail-meta">
                  <span className={`roadmap-detail-badge roadmap-detail-badge--${selectedNode.status}`}>
                    {selectedNode.status}
                  </span>
                  {selectedNode.progress > 0 && selectedNode.progress < 100 ? (
                    <span className="roadmap-detail-progress">{selectedNode.progress}% complete</span>
                  ) : selectedNode.progress === 100 ? (
                    <span className="roadmap-detail-progress">Complete</span>
                  ) : null}
                </div>
              </div>
              <button className="roadmap-detail-close" type="button" onClick={() => setSelectedNode(null)}>&times;</button>
            </header>

            <div className="roadmap-detail-body">
              {/* Lane & summary info */}
              <div className="roadmap-detail-summary">
                <div className="roadmap-detail-lane">
                  <span className="roadmap-detail-lane-label">Lane</span>
                  <span className="roadmap-detail-lane-value">{selectedNode.lane}</span>
                </div>
                {selectedNode.progress > 0 && (
                  <div className="roadmap-detail-progress-bar">
                    <div className="roadmap-detail-progress-track">
                      <div
                        className={`roadmap-detail-progress-fill roadmap-detail-progress-fill--${selectedNode.status}`}
                        style={{ width: `${selectedNode.progress}%` }}
                      />
                    </div>
                    <span className="roadmap-detail-progress-text">{selectedNode.progress}%</span>
                  </div>
                )}
                {selectedNode.deps.length > 0 && (() => {
                  const ds = depsStatus(selectedNode, nodeMap);
                  return (
                    <div className="roadmap-detail-deps-summary">
                      <span className="roadmap-detail-deps-count">{ds.done}/{ds.total}</span> dependencies shipped
                    </div>
                  );
                })()}
              </div>

              {/* Tooltip as description */}
              {selectedNode.tooltip && (
                <p className="roadmap-detail-tooltip">{selectedNode.tooltip}</p>
              )}

              {/* Status explanation */}
              {selectedNode.status === "locked" && (
                <p className="roadmap-detail-status-note">Blocked — waiting on dependencies to ship before work can begin.</p>
              )}
              {selectedNode.status === "draft" && selectedNode.progress === 0 && (
                <p className="roadmap-detail-status-note">Designed but not yet started.</p>
              )}

              {/* Markdown details */}
              {selectedNode.details && (
                <div dangerouslySetInnerHTML={{ __html: renderMarkdown(selectedNode.details) }} />
              )}
            </div>

            <footer className="roadmap-detail-footer">
              {selectedNode.deps.length > 0 ? (
                <div>
                  <div className="section-label" style={{ marginBottom: 6 }}>Build Path</div>
                  <div className="roadmap-build-path">
                    {buildPath(selectedNode.id, nodeMap).map((step, i, arr) => (
                      <span key={step.id} className="roadmap-build-step">
                        <button
                          type="button"
                          className={`roadmap-dep-chip roadmap-dep-chip--${step.status}`}
                          onClick={() => setSelectedNode(step)}
                        >
                          <span className={`roadmap-dep-dot roadmap-dep-dot--${step.status}`} />
                          {step.icon} {step.title}
                        </button>
                        {i < arr.length - 1 ? <span className="roadmap-build-arrow">&rarr;</span> : null}
                      </span>
                    ))}
                  </div>
                </div>
              ) : null}
              {selectedNode.unlocks.length > 0 ? (
                <div>
                  <div className="section-label" style={{ marginBottom: 6 }}>Unlocks</div>
                  <div className="roadmap-dep-chips">
                    {selectedNode.unlocks.map((unlockTitle) => {
                      const target = nodeByTitle.get(unlockTitle);
                      if (!target) return null;
                      return (
                        <button key={target.id} type="button" className={`roadmap-dep-chip roadmap-dep-chip--${target.status}`} onClick={() => setSelectedNode(target)}>
                          <span className={`roadmap-dep-dot roadmap-dep-dot--${target.status}`} />
                          {target.icon} {target.title}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : null}

              {/* Features linked to this capability */}
              <div>
                <div className="section-label" style={{ marginBottom: 6 }}>Features</div>
                {featuresLoading ? (
                  <div className="col-empty">Loading features...</div>
                ) : linkedFeatures.length === 0 ? (
                  <div className="col-empty">No features linked</div>
                ) : (
                  <div className="roadmap-linked-features">
                    {linkedFeatures.map((feat) => (
                      <button
                        key={feat.id}
                        type="button"
                        className="roadmap-linked-feature"
                        onClick={() => setSelectedFeature({ id: feat.id, colorVar: "--col-building" })}
                      >
                        <span className="roadmap-linked-feature-title">{feat.title}</span>
                        <span className={statusBadgeClass(feat.status)}>{feat.status.replace(/_/g, " ")}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </footer>
          </aside>
        </>
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
