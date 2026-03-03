import { useEffect, useState } from "react";
import { fetchIdeaDetail, type IdeaDetail } from "../lib/queries";

interface Props {
  ideaId: string;
  colorVar: string;
  onClose: () => void;
}

function statusBadgeClass(status: string): string {
  switch (status) {
    case "promoted":
    case "done":
      return "detail-badge detail-badge--positive";
    case "rejected":
      return "detail-badge detail-badge--negative";
    case "triaged":
      return "detail-badge detail-badge--active";
    case "parked":
      return "detail-badge detail-badge--caution";
    default:
      return "detail-badge";
  }
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

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-GB", { month: "short", day: "numeric" }) +
    ", " +
    d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function featureStatusBadgeClass(status: string): string {
  switch (status) {
    case "complete":
    case "merged":
      return "detail-badge detail-badge--positive";
    case "failed":
    case "cancelled":
      return "detail-badge detail-badge--negative";
    case "building":
    case "executing":
      return "detail-badge detail-badge--active";
    default:
      return "detail-badge";
  }
}

export default function IdeaDetailPanel({ ideaId, colorVar, onClose }: Props): JSX.Element {
  const [detail, setDetail] = useState<IdeaDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    setLoading(true);
    setError(null);

    fetchIdeaDetail(ideaId)
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
  }, [ideaId]);

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
              <h2 className="detail-title">{detail.title ?? detail.rawText}</h2>
              <span className={statusBadgeClass(detail.status)}>
                {detail.status.toUpperCase()}
              </span>
              <button className="detail-close" type="button" onClick={onClose}>
                Close
              </button>
            </header>

            <div className="detail-body">
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
                  {detail.originator ? (
                    <tr>
                      <td className="detail-meta-label">Originator</td>
                      <td className="detail-meta-value">{detail.originator}</td>
                    </tr>
                  ) : null}
                  {detail.source ? (
                    <tr>
                      <td className="detail-meta-label">Source</td>
                      <td className="detail-meta-value">
                        {detail.source}
                        {detail.sourceRef ? ` (${detail.sourceRef})` : ""}
                      </td>
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
                </tbody>
              </table>

              {detail.tags.length > 0 ? (
                <section className="detail-section">
                  <h3 className="detail-section-title">Tags</h3>
                  <div className="detail-tags-list">
                    {detail.tags.map((tag) => (
                      <span className="detail-tag" key={tag}>{tag}</span>
                    ))}
                  </div>
                </section>
              ) : null}

              {detail.rawText ? (
                <section className="detail-section">
                  <h3 className="detail-section-title">Raw Idea</h3>
                  <div className="detail-prose">{detail.rawText}</div>
                </section>
              ) : null}

              {detail.description && detail.description !== detail.rawText ? (
                <section className="detail-section">
                  <h3 className="detail-section-title">Description</h3>
                  <div className="detail-prose">{detail.description}</div>
                </section>
              ) : null}

              {detail.clarificationNotes ? (
                <section className="detail-section">
                  <h3 className="detail-section-title">Clarification Notes</h3>
                  <div className="detail-prose">{detail.clarificationNotes}</div>
                </section>
              ) : null}

              {detail.promotedFeature ? (
                <section className="detail-section">
                  <h3 className="detail-section-title">Promoted To</h3>
                  <div className="detail-source-idea">
                    <div className="detail-source-idea-title">
                      {detail.promotedFeature.title}
                    </div>
                    <div className="detail-source-idea-meta">
                      <span className={featureStatusBadgeClass(detail.promotedFeature.status)}>
                        {detail.promotedFeature.status.replace(/_/g, " ")}
                      </span>
                      {detail.promotedAt ? (
                        <span style={{ marginLeft: 8 }}>
                          Promoted {formatDate(detail.promotedAt)}
                        </span>
                      ) : null}
                    </div>
                  </div>
                </section>
              ) : null}
            </div>
          </>
        ) : null}
      </aside>
    </>
  );
}
