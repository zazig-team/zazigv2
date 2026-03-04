import { useEffect, useState } from "react";
import { fetchFeatureDetail, type FeatureDetail } from "../lib/queries";
import FormattedProse from "./FormattedProse";

interface Props {
  featureId: string;
  colorVar: string;
  onClose: () => void;
}

function statusBadgeClass(status: string): string {
  switch (status) {
    case "complete":
    case "merged":
      return "detail-badge detail-badge--positive";
    case "failed":
    case "cancelled":
      return "detail-badge detail-badge--negative";
    case "building":
    case "executing":
    case "dispatched":
      return "detail-badge detail-badge--active";
    case "blocked":
      return "detail-badge detail-badge--caution";
    default:
      return "detail-badge";
  }
}

function jobStatusDot(status: string): string {
  switch (status) {
    case "complete":
      return "var(--positive)";
    case "failed":
    case "cancelled":
      return "var(--negative)";
    case "executing":
    case "dispatched":
      return "var(--ember)";
    case "blocked":
      return "var(--caution)";
    default:
      return "var(--dust)";
  }
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-GB", { month: "short", day: "numeric" }) +
    ", " +
    d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function priorityDotColor(priority: string): string {
  switch (priority.toLowerCase()) {
    case "urgent":
      return "var(--negative)";
    case "high":
      return "var(--ember)";
    case "low":
      return "var(--dust)";
    default:
      return "var(--caution)";
  }
}

function truncateId(id: string): string {
  return id.length > 8 ? id.slice(0, 8) + "..." : id;
}

export default function FeatureDetailPanel({ featureId, colorVar, onClose }: Props): JSX.Element {
  const [detail, setDetail] = useState<FeatureDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    setLoading(true);
    setError(null);

    fetchFeatureDetail(featureId)
      .then((data) => {
        if (!cancelled) {
          setDetail(data);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [featureId]);

  // Close on Escape
  useEffect(() => {
    function handleKey(e: KeyboardEvent): void {
      if (e.key === "Escape") {
        onClose();
      }
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose]);

  return (
    <>
      <div className="detail-backdrop" onClick={onClose} />
      <aside className="detail-panel">
        {loading ? (
          <div className="detail-loading">Loading...</div>
        ) : error ? (
          <div className="detail-error">{error}</div>
        ) : detail ? (
          <>
            <header className="detail-header">
              <span className="col-dot" style={{ background: `var(${colorVar})` }} />
              <h2 className="detail-title">{detail.title}</h2>
              <span className={statusBadgeClass(detail.status)}>
                {detail.status.replace(/_/g, " ").toUpperCase()}
              </span>
              <button className="detail-close" type="button" onClick={onClose}>
                Close
              </button>
            </header>

            <div className="detail-body">
              {/* Metadata table */}
              <table className="detail-meta-table">
                <tbody>
                  <tr>
                    <td className="detail-meta-label">ID</td>
                    <td className="detail-meta-value mono">{detail.id}</td>
                  </tr>
                  <tr>
                    <td className="detail-meta-label">Priority</td>
                    <td className="detail-meta-value">
                      <span
                        className="detail-priority-dot"
                        style={{ background: priorityDotColor(detail.priority) }}
                      />
                      {detail.priority}
                    </td>
                  </tr>
                  {detail.branch ? (
                    <tr>
                      <td className="detail-meta-label">Branch</td>
                      <td className="detail-meta-value mono">{detail.branch}</td>
                    </tr>
                  ) : null}
                  {detail.createdBy ? (
                    <tr>
                      <td className="detail-meta-label">Created by</td>
                      <td className="detail-meta-value">{detail.createdBy}</td>
                    </tr>
                  ) : null}
                  <tr>
                    <td className="detail-meta-label">Created</td>
                    <td className="detail-meta-value">{formatDate(detail.createdAt)}</td>
                  </tr>
                  <tr>
                    <td className="detail-meta-label">Updated</td>
                    <td className="detail-meta-value">{formatDate(detail.updatedAt)}</td>
                  </tr>
                  {detail.completedAt ? (
                    <tr>
                      <td className="detail-meta-label">Completed</td>
                      <td className="detail-meta-value">{formatDate(detail.completedAt)}</td>
                    </tr>
                  ) : null}
                  {detail.verificationType && detail.verificationType !== "passive" ? (
                    <tr>
                      <td className="detail-meta-label">Verification</td>
                      <td className="detail-meta-value">{detail.verificationType}</td>
                    </tr>
                  ) : null}
                </tbody>
              </table>

              {/* Source Idea */}
              {detail.sourceIdea ? (
                <section className="detail-section">
                  <h3 className="detail-section-title">Source Idea</h3>
                  <div className="detail-source-idea">
                    <div className="detail-source-idea-title">
                      {detail.sourceIdea.title ?? detail.sourceIdea.rawText}
                    </div>
                    {detail.sourceIdea.promotedAt ? (
                      <div className="detail-source-idea-meta">
                        Promoted {formatDate(detail.sourceIdea.promotedAt)}
                      </div>
                    ) : null}
                  </div>
                </section>
              ) : null}

              {/* Description */}
              {detail.description ? (
                <section className="detail-section">
                  <h3 className="detail-section-title">Description</h3>
                  <div className="detail-prose"><FormattedProse text={detail.description} /></div>
                </section>
              ) : null}

              {/* Jobs */}
              {detail.jobs.length > 0 ? (
                <section className="detail-section">
                  <h3 className="detail-section-title">Jobs ({detail.jobs.length})</h3>
                  <div className="detail-jobs">
                    {detail.jobs.map((job) => (
                      <div className="detail-job-row" key={job.id}>
                        <span
                          className="detail-job-dot"
                          style={{ background: jobStatusDot(job.status) }}
                        />
                        <span className="detail-job-title" title={job.title}>
                          {job.title}
                        </span>
                        <div className="detail-job-tags">
                          <span className={statusBadgeClass(job.status)}>
                            {job.status}
                          </span>
                          <span className="detail-tag">{job.role}</span>
                          {job.model ? (
                            <span className="detail-tag">{job.model}</span>
                          ) : null}
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              ) : null}

              {/* Spec */}
              {detail.spec ? (
                <section className="detail-section">
                  <h3 className="detail-section-title">Spec</h3>
                  <div className="detail-prose detail-prose--pre">{detail.spec}</div>
                </section>
              ) : null}

              {/* Acceptance Tests */}
              {detail.acceptanceTests ? (
                <section className="detail-section">
                  <h3 className="detail-section-title">Acceptance Tests</h3>
                  <div className="detail-prose detail-prose--pre">{detail.acceptanceTests}</div>
                </section>
              ) : null}

              {/* PR Link */}
              {detail.prUrl ? (
                <section className="detail-section">
                  <a
                    className="detail-pr-link"
                    href={detail.prUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    View PR on GitHub
                  </a>
                </section>
              ) : null}
            </div>
          </>
        ) : null}
      </aside>
    </>
  );
}
