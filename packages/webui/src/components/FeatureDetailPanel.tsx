import { useEffect, useState } from "react";
import { fetchFeatureDetail, type FeatureDetail } from "../lib/queries";
import FormattedProse from "./FormattedProse";

interface FeatureDetailPanelProps {
  featureId: string;
  colorVar: string;
  onClose: () => void;
}

function statusBadgeClass(status: string): string {
  const s = status.toLowerCase();
  if (s === "complete" || s === "shipped") return "detail-badge detail-badge--positive";
  if (s === "failed" || s === "cancelled") return "detail-badge detail-badge--negative";
  if (s === "building" || s === "breaking_down" || s === "verifying") return "detail-badge detail-badge--active";
  if (s === "proposal" || s === "ready") return "detail-badge detail-badge--caution";
  return "detail-badge";
}

function jobDotColor(status: string): string {
  const s = status.toLowerCase();
  if (s === "complete") return "var(--positive)";
  if (s === "failed") return "var(--negative)";
  if (s === "executing" || s === "dispatched") return "var(--ember)";
  return "var(--chalk)";
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export default function FeatureDetailPanel({ featureId, colorVar, onClose }: FeatureDetailPanelProps): JSX.Element {
  const [data, setData] = useState<FeatureDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load(): Promise<void> {
      try {
        const result = await fetchFeatureDetail(featureId);
        if (!cancelled) setData(result);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => { cancelled = true; };
  }, [featureId]);

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
                <div className="detail-title">{data.title}</div>
                <span className={statusBadgeClass(data.status)}>{data.status.replace(/_/g, " ")}</span>
              </div>
              <button className="detail-close" type="button" onClick={onClose}>×</button>
            </div>

            <div className="detail-body">
              <table className="detail-meta-table">
                <tbody>
                  <tr><td className="detail-meta-key">ID</td><td className="detail-meta-val">{data.id.slice(0, 8)}</td></tr>
                  {data.priority ? <tr><td className="detail-meta-key">Priority</td><td className="detail-meta-val">{data.priority}</td></tr> : null}
                  {data.branch ? <tr><td className="detail-meta-key">Branch</td><td className="detail-meta-val">{data.branch}</td></tr> : null}
                  {data.created_by ? <tr><td className="detail-meta-key">Created by</td><td className="detail-meta-val">{data.created_by}</td></tr> : null}
                  {data.verification_type ? <tr><td className="detail-meta-key">Verification</td><td className="detail-meta-val">{data.verification_type}</td></tr> : null}
                  <tr><td className="detail-meta-key">Created</td><td className="detail-meta-val">{formatDate(data.created_at)}</td></tr>
                  {data.completed_at ? <tr><td className="detail-meta-key">Completed</td><td className="detail-meta-val">{formatDate(data.completed_at)}</td></tr> : null}
                </tbody>
              </table>

              {data.sourceIdea ? (
                <div className="detail-section">
                  <div className="detail-section-title">Source Idea</div>
                  <div className="detail-linked-card">
                    <div className="detail-linked-title">{data.sourceIdea.title}</div>
                    {data.sourceIdea.promoted_at ? (
                      <div className="detail-linked-meta">Promoted {formatDate(data.sourceIdea.promoted_at)}</div>
                    ) : null}
                  </div>
                </div>
              ) : null}

              {data.description ? (
                <div className="detail-section">
                  <div className="detail-section-title">Description</div>
                  <FormattedProse text={data.description} />
                </div>
              ) : null}

              {data.jobs.length > 0 ? (
                <div className="detail-section">
                  <div className="detail-section-title">Jobs ({data.jobs.length})</div>
                  <div className="detail-jobs">
                    {data.jobs.map((job) => (
                      <div className="detail-job-row" key={job.id}>
                        <span className="detail-job-dot" style={{ background: jobDotColor(job.status) }} />
                        <div className="detail-job-info">
                          <div className="detail-job-title">{job.title}</div>
                          <div className="detail-job-meta">{job.status} · {job.role}{job.model ? ` · ${job.model}` : ""}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              {data.spec ? (
                <div className="detail-section">
                  <div className="detail-section-title">Spec</div>
                  <FormattedProse text={data.spec} preformatted />
                </div>
              ) : null}

              {data.acceptance_tests ? (
                <div className="detail-section">
                  <div className="detail-section-title">Acceptance Tests</div>
                  <FormattedProse text={data.acceptance_tests} preformatted />
                </div>
              ) : null}

              {data.pr_url ? (
                <div className="detail-section">
                  <a className="detail-pr-link" href={data.pr_url} target="_blank" rel="noopener noreferrer">
                    View Pull Request ↗
                  </a>
                </div>
              ) : null}
            </div>
          </>
        ) : null}
      </div>
    </>
  );
}
