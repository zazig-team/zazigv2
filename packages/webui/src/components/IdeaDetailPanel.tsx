import { useEffect, useState } from "react";
import { fetchIdeaDetail, type IdeaDetail } from "../lib/queries";
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
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export default function IdeaDetailPanel({ ideaId, colorVar, onClose }: IdeaDetailPanelProps): JSX.Element {
  const [data, setData] = useState<IdeaDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load(): Promise<void> {
      try {
        const result = await fetchIdeaDetail(ideaId);
        if (!cancelled) setData(result);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => { cancelled = true; };
  }, [ideaId]);

  useEffect(() => {
    function handleKey(e: KeyboardEvent): void {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose]);

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
                <span className={statusBadgeClass(data.status)}>{data.status}</span>
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
            </div>
          </>
        ) : null}
      </div>
    </>
  );
}
