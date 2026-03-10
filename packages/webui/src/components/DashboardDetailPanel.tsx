import { useEffect } from "react";
import type { FocusArea, Goal } from "../lib/queries";

type DashboardDetailPanelProps =
  | { type: "goal"; goal: Goal; color: string; onClose: () => void }
  | { type: "focusArea"; focusArea: FocusArea; onClose: () => void };

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function healthBadgeClass(health: string | null): string {
  const h = (health ?? "").toLowerCase();
  if (h === "on_track" || h === "healthy") return "detail-badge detail-badge--positive";
  if (h === "at_risk" || h === "waiting") return "detail-badge detail-badge--caution";
  if (h === "off_track" || h === "behind") return "detail-badge detail-badge--negative";
  return "detail-badge";
}

export default function DashboardDetailPanel(props: DashboardDetailPanelProps): JSX.Element {
  const { onClose } = props;

  useEffect(() => {
    function handleKey(e: KeyboardEvent): void {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose]);

  if (props.type === "goal") {
    const { goal, color } = props;
    const progress = goal.progress ?? 0;

    return (
      <>
        <div className="detail-backdrop" onClick={onClose} />
        <div className="detail-panel">
          <div className="detail-header">
            <span className="detail-dot" style={{ background: color }} />
            <div className="detail-header-text">
              <div className="detail-title">{goal.title}</div>
              {goal.status ? <span className="detail-badge detail-badge--active">{goal.status}</span> : null}
            </div>
            <button className="detail-close" type="button" onClick={onClose}>×</button>
          </div>

          <div className="detail-body">
            <table className="detail-meta-table">
              <tbody>
                <tr><td className="detail-meta-key">ID</td><td className="detail-meta-val">{goal.id.slice(0, 8)}</td></tr>
                {goal.time_horizon ? <tr><td className="detail-meta-key">Horizon</td><td className="detail-meta-val">{goal.time_horizon}</td></tr> : null}
                <tr>
                  <td className="detail-meta-key">Progress</td>
                  <td className="detail-meta-val">
                    <div className="detail-progress-bar">
                      <div className="detail-progress-fill" style={{ width: `${progress}%`, background: color }} />
                    </div>
                    <span className="detail-progress-label">{progress}%</span>
                  </td>
                </tr>
                {goal.target_date ? <tr><td className="detail-meta-key">Target date</td><td className="detail-meta-val">{formatDate(goal.target_date)}</td></tr> : null}
              </tbody>
            </table>

            {goal.description ? (
              <div className="detail-section">
                <div className="detail-section-title">Description</div>
                <div className="detail-prose">{goal.description}</div>
              </div>
            ) : null}

            {goal.metric ? (
              <div className="detail-section">
                <div className="detail-section-title">Metric</div>
                <div className="detail-prose">{goal.metric}</div>
              </div>
            ) : null}

            {goal.target ? (
              <div className="detail-section">
                <div className="detail-section-title">Target</div>
                <div className="detail-prose">{goal.target}</div>
              </div>
            ) : null}
          </div>
        </div>
      </>
    );
  }

  const { focusArea } = props;

  return (
    <>
      <div className="detail-backdrop" onClick={onClose} />
      <div className="detail-panel">
        <div className="detail-header">
          <span className="detail-dot" style={{ background: "var(--info)" }} />
          <div className="detail-header-text">
            <div className="detail-title">{focusArea.title}</div>
            <span className={healthBadgeClass(focusArea.health)}>
              {(focusArea.health ?? focusArea.status).replace(/_/g, " ")}
            </span>
          </div>
          <button className="detail-close" type="button" onClick={onClose}>×</button>
        </div>

        <div className="detail-body">
          <table className="detail-meta-table">
            <tbody>
              <tr><td className="detail-meta-key">ID</td><td className="detail-meta-val">{focusArea.id.slice(0, 8)}</td></tr>
              <tr><td className="detail-meta-key">Status</td><td className="detail-meta-val">{focusArea.status}</td></tr>
            </tbody>
          </table>

          {focusArea.domain_tags && focusArea.domain_tags.length > 0 ? (
            <div className="detail-section">
              <div className="detail-section-title">Domain Tags</div>
              <div className="detail-tags">
                {focusArea.domain_tags.map((tag) => (
                  <span className="detail-tag" key={tag}>{tag}</span>
                ))}
              </div>
            </div>
          ) : null}

          {focusArea.description ? (
            <div className="detail-section">
              <div className="detail-section-title">Description</div>
              <div className="detail-prose">{focusArea.description}</div>
            </div>
          ) : null}

          {focusArea.goals.length > 0 ? (
            <div className="detail-section">
              <div className="detail-section-title">Linked Goals ({focusArea.goals.length})</div>
              <div className="detail-jobs">
                {focusArea.goals.map((goal) => (
                  <div className="detail-job-row" key={goal.id}>
                    <span className="detail-job-dot" style={{ background: "var(--positive)" }} />
                    <div className="detail-job-info">
                      <div className="detail-job-title">{goal.title}</div>
                      <div className="detail-job-meta">{goal.progress ?? 0}% · {goal.time_horizon ?? "Near"}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </>
  );
}
