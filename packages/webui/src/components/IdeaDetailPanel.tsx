import { useEffect, useState } from "react";
import { fetchIdeaDetail, fetchProjects, promoteIdea, type IdeaDetail, type Project } from "../lib/queries";
import { useCompany } from "../hooks/useCompany";
import FormattedProse from "./FormattedProse";

interface IdeaDetailPanelProps {
  ideaId: string;
  colorVar: string;
  onClose: () => void;
}

function statusBadgeClass(status: string): string {
  const s = status.toLowerCase();
  if (s === "promoted" || s === "done") return "detail-badge detail-badge--positive";
  if (s === "rejected") return "detail-badge detail-badge--negative";
  if (s === "triaged") return "detail-badge detail-badge--active";
  if (s === "parked") return "detail-badge detail-badge--caution";
  return "detail-badge";
}

function formatDate(iso: string | null): string {
  if (!iso) return "\u2014";
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

type ReadinessItem = { label: string; ok: boolean; hint?: string };

function getReadiness(data: IdeaDetail): ReadinessItem[] {
  return [
    {
      label: "Has title",
      ok: Boolean(data.title && data.title.trim()),
      hint: "Needs a clear title",
    },
    {
      label: "Has description",
      ok: Boolean(data.description && data.description.trim()) || Boolean(data.raw_text && data.raw_text.length > 20),
      hint: "Needs description or detailed raw text",
    },
    {
      label: "Has project",
      ok: Boolean(data.project_id),
      hint: "Select a project below",
    },
  ];
}

export default function IdeaDetailPanel({ ideaId, colorVar, onClose }: IdeaDetailPanelProps): JSX.Element {
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

  useEffect(() => {
    let cancelled = false;

    async function load(): Promise<void> {
      try {
        const result = await fetchIdeaDetail(ideaId);
        if (!cancelled) {
          setData(result);
          if (result.project_id) setSelectedProjectId(result.project_id);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => { cancelled = true; };
  }, [ideaId]);

  // Load projects when we have a triaged idea
  useEffect(() => {
    if (!activeCompanyId || !data || data.status !== "triaged") return;
    let cancelled = false;

    fetchProjects(activeCompanyId).then((result) => {
      if (!cancelled) {
        setProjects(result);
        // Auto-select if only one project or if idea already has one
        if (!selectedProjectId && result.length === 1) {
          setSelectedProjectId(result[0].id);
        }
      }
    }).catch(() => {});

    return () => { cancelled = true; };
  }, [activeCompanyId, data?.status]);

  useEffect(() => {
    function handleKey(e: KeyboardEvent): void {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose]);

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
    } catch (err) {
      setPromoteError(err instanceof Error ? err.message : String(err));
    } finally {
      setPromoting(false);
    }
  }

  const canPromote = data?.status === "triaged" && !promoted;
  const readiness = data ? getReadiness({
    ...data,
    project_id: selectedProjectId ?? data.project_id,
  }) : [];
  const allReady = readiness.every((r) => r.ok);

  return (
    <>
      <div className="detail-backdrop" onClick={onClose} />
      <div className="detail-panel">
        {loading ? (
          <div className="detail-body"><div className="detail-loading">Loading...</div></div>
        ) : error ? (
          <div className="detail-body"><div className="detail-error">{error}</div></div>
        ) : data ? (
          <>
            <div className="detail-header">
              <span className="detail-dot" style={{ background: `var(${colorVar})` }} />
              <div className="detail-header-text">
                <div className="detail-title">{data.title ?? data.raw_text}</div>
                <span className={statusBadgeClass(promoted ? "promoted" : data.status)}>
                  {promoted ? "promoted" : data.status}
                </span>
              </div>
              <button className="detail-close" type="button" onClick={onClose}>×</button>
            </div>

            <div className="detail-body">
              <table className="detail-meta-table">
                <tbody>
                  <tr><td className="detail-meta-key">ID</td><td className="detail-meta-val">{data.id.slice(0, 8)}</td></tr>
                  {data.priority ? <tr><td className="detail-meta-key">Priority</td><td className="detail-meta-val">{data.priority}</td></tr> : null}
                  {data.originator ? <tr><td className="detail-meta-key">Originator</td><td className="detail-meta-val">{data.originator}</td></tr> : null}
                  {data.source ? <tr><td className="detail-meta-key">Source</td><td className="detail-meta-val">{data.source}</td></tr> : null}
                  {data.item_type ? <tr><td className="detail-meta-key">Type</td><td className="detail-meta-val">{data.item_type}</td></tr> : null}
                  {data.horizon ? <tr><td className="detail-meta-key">Horizon</td><td className="detail-meta-val">{data.horizon}</td></tr> : null}
                  <tr><td className="detail-meta-key">Created</td><td className="detail-meta-val">{formatDate(data.created_at)}</td></tr>
                  {data.promoted_at ? <tr><td className="detail-meta-key">Promoted</td><td className="detail-meta-val">{formatDate(data.promoted_at)}</td></tr> : null}
                </tbody>
              </table>

              {data.tags && data.tags.length > 0 ? (
                <div className="detail-section">
                  <div className="detail-section-title">Tags</div>
                  <div className="detail-tags">
                    {data.tags.map((tag) => (
                      <span className="detail-tag" key={tag}>{tag}</span>
                    ))}
                  </div>
                </div>
              ) : null}

              <div className="detail-section">
                <div className="detail-section-title">Raw Text</div>
                <FormattedProse text={data.raw_text} />
              </div>

              {data.description && data.description !== data.raw_text ? (
                <div className="detail-section">
                  <div className="detail-section-title">Description</div>
                  <FormattedProse text={data.description} />
                </div>
              ) : null}

              {data.clarification_notes ? (
                <div className="detail-section">
                  <div className="detail-section-title">Clarification Notes</div>
                  <FormattedProse text={data.clarification_notes} />
                </div>
              ) : null}

              {data.promotedFeature ? (
                <div className="detail-section">
                  <div className="detail-section-title">Promoted To</div>
                  <div className="detail-linked-card">
                    <div className="detail-linked-title">{data.promotedFeature.title}</div>
                    <div className="detail-linked-meta">{data.promotedFeature.status.replace(/_/g, " ")}</div>
                  </div>
                </div>
              ) : null}

              {/* --- Promote to Pipeline --- */}
              {data.status === "developing" ? (
                <div className="detail-section">
                  <div className="flex items-center gap-2" style={{ color: "var(--muted-foreground)", fontSize: "0.875rem" }}>
                    <span className="il-triage-spinner" />
                    <span>Spec in progress...</span>
                  </div>
                </div>
              ) : (
                <>
                  {canPromote ? (
                    <div className="detail-section promote-section">
                      <div className="detail-section-title">Push to Pipeline</div>

                      <div className="promote-readiness">
                        {readiness.map((r) => (
                          <div className="promote-check" key={r.label}>
                            <span className={`promote-check-icon ${r.ok ? "promote-check--ok" : "promote-check--missing"}`}>
                              {r.ok ? "\u2713" : "\u2717"}
                            </span>
                            <span className="promote-check-label">{r.label}</span>
                            {!r.ok && r.hint ? <span className="promote-check-hint">{r.hint}</span> : null}
                          </div>
                        ))}
                      </div>

                      {projects.length > 0 ? (
                        <div className="promote-project-picker">
                          <label className="promote-label" htmlFor="promote-project">Project</label>
                          <select
                            id="promote-project"
                            className="promote-select"
                            value={selectedProjectId ?? ""}
                            onChange={(e) => setSelectedProjectId(e.target.value || null)}
                          >
                            <option value="">Select project...</option>
                            {projects.map((p) => (
                              <option key={p.id} value={p.id}>{p.name}</option>
                            ))}
                          </select>
                        </div>
                      ) : null}

                      {promoteError ? (
                        <div className="promote-error">{promoteError}</div>
                      ) : null}

                      <button
                        className="promote-btn"
                        type="button"
                        disabled={!allReady || promoting}
                        onClick={handlePromote}
                      >
                        {promoting ? "Promoting..." : "Promote to Feature"}
                      </button>
                    </div>
                  ) : null}

                  {promoted ? (
                    <div className="detail-section">
                      <div className="promote-success">Idea promoted to feature and pushed into the pipeline.</div>
                    </div>
                  ) : null}
                </>
              )}
            </div>
          </>
        ) : null}
      </div>
    </>
  );
}
