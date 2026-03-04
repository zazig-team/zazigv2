import type { FocusArea, Goal } from "../lib/queries";
import FormattedProse from "./FormattedProse";

interface GoalDetailProps {
  type: "goal";
  goal: Goal;
  color: string;
  onClose: () => void;
}

interface FocusAreaDetailProps {
  type: "focusArea";
  focusArea: FocusArea;
  onClose: () => void;
}

type Props = GoalDetailProps | FocusAreaDetailProps;

function formatDate(value: string | null): string | null {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function healthBadgeClass(health: string | null): string {
  const h = (health ?? "").toLowerCase();
  if (h === "on_track" || h === "healthy") return "detail-badge detail-badge--positive";
  if (h === "behind") return "detail-badge detail-badge--negative";
  if (h === "waiting") return "detail-badge detail-badge--caution";
  return "detail-badge";
}

import { useEffect } from "react";

export default function DashboardDetailPanel(props: Props): JSX.Element {
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
    return (
      <>
        <div className="detail-backdrop" onClick={onClose} />
        <aside className="detail-panel">
          <header className="detail-header">
            <span className="col-dot" style={{ background: color }} />
            <h2 className="detail-title">{goal.title}</h2>
            <button className="detail-close" type="button" onClick={onClose}>Close</button>
          </header>
          <div className="detail-body">
            <table className="detail-meta-table">
              <tbody>
                <tr>
                  <td className="detail-meta-label">Status</td>
                  <td className="detail-meta-value">{goal.status ?? "active"}</td>
                </tr>
                <tr>
                  <td className="detail-meta-label">Time Horizon</td>
                  <td className="detail-meta-value">{goal.time_horizon ?? "Not set"}</td>
                </tr>
                <tr>
                  <td className="detail-meta-label">Progress</td>
                  <td className="detail-meta-value">{goal.progress ?? 0}%</td>
                </tr>
                {goal.target_date ? (
                  <tr>
                    <td className="detail-meta-label">Target Date</td>
                    <td className="detail-meta-value">{formatDate(goal.target_date)}</td>
                  </tr>
                ) : null}
              </tbody>
            </table>

            {goal.description ? (
              <section className="detail-section">
                <h3 className="detail-section-title">Description</h3>
                <div className="detail-prose"><FormattedProse text={goal.description} /></div>
              </section>
            ) : null}

            {goal.metric ? (
              <section className="detail-section">
                <h3 className="detail-section-title">Metric</h3>
                <div className="detail-prose"><FormattedProse text={goal.metric} /></div>
              </section>
            ) : null}

            {goal.target ? (
              <section className="detail-section">
                <h3 className="detail-section-title">Measurable Target</h3>
                <div className="detail-prose"><FormattedProse text={goal.target} /></div>
              </section>
            ) : null}
          </div>
        </aside>
      </>
    );
  }

  // Focus area detail
  const { focusArea } = props;
  return (
    <>
      <div className="detail-backdrop" onClick={onClose} />
      <aside className="detail-panel">
        <header className="detail-header">
          <h2 className="detail-title">{focusArea.title}</h2>
          {focusArea.health ? (
            <span className={healthBadgeClass(focusArea.health)}>
              {focusArea.health.replace(/_/g, " ")}
            </span>
          ) : (
            <span className="detail-badge">{focusArea.status}</span>
          )}
          <button className="detail-close" type="button" onClick={onClose}>Close</button>
        </header>
        <div className="detail-body">
          <table className="detail-meta-table">
            <tbody>
              <tr>
                <td className="detail-meta-label">Status</td>
                <td className="detail-meta-value">{focusArea.status}</td>
              </tr>
              {focusArea.health ? (
                <tr>
                  <td className="detail-meta-label">Health</td>
                  <td className="detail-meta-value">{focusArea.health.replace(/_/g, " ")}</td>
                </tr>
              ) : null}
              {focusArea.domain_tags && focusArea.domain_tags.length > 0 ? (
                <tr>
                  <td className="detail-meta-label">Domains</td>
                  <td className="detail-meta-value">{focusArea.domain_tags.join(", ")}</td>
                </tr>
              ) : null}
            </tbody>
          </table>

          {focusArea.description ? (
            <section className="detail-section">
              <h3 className="detail-section-title">Description</h3>
              <div className="detail-prose"><FormattedProse text={focusArea.description} /></div>
            </section>
          ) : null}

          {focusArea.goals.length > 0 ? (
            <section className="detail-section">
              <h3 className="detail-section-title">Linked Goals ({focusArea.goals.length})</h3>
              <div className="detail-jobs">
                {focusArea.goals.map((goal) => (
                  <div className="detail-job-row" key={goal.id}>
                    <span
                      className="detail-job-dot"
                      style={{ background: goal.status === "active" ? "var(--positive)" : "var(--dust)" }}
                    />
                    <span className="detail-job-title" title={goal.title}>
                      {goal.title}
                    </span>
                    <div className="detail-job-tags">
                      {goal.time_horizon ? (
                        <span className="detail-tag">{goal.time_horizon}</span>
                      ) : null}
                      {goal.target ? (
                        <span className="detail-tag">{goal.target}</span>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ) : null}
        </div>
      </aside>
    </>
  );
}
