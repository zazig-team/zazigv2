import { useEffect, useMemo, useState } from "react";
import { useCompany } from "../hooks/useCompany";
import { fetchTeamPageData, type TeamPageData } from "../lib/queries";

function readable(value: string): string {
  return value.replace(/[-_]/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function heartbeatLabel(value: string | null): string {
  if (!value) {
    return "No heartbeat";
  }

  const seconds = Math.floor((Date.now() - Date.parse(value)) / 1000);
  if (Number.isNaN(seconds) || seconds < 0) {
    return "Unknown";
  }

  if (seconds < 60) {
    return `${seconds}s ago`;
  }

  return `${Math.floor(seconds / 60)}m ago`;
}

function statusDot(status: string | null | undefined): string {
  if (status === "online") {
    return "dot dot--positive";
  }
  if (status === "degraded") {
    return "dot dot--caution";
  }
  return "dot dot--offline";
}

const EMPTY_DATA: TeamPageData = {
  execCards: [],
  archetypeOptionsByRoleId: {},
  engineers: [],
  machines: [],
  contractors: [],
};

export default function Team(): JSX.Element {
  const { activeCompany } = useCompany();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<TeamPageData>(EMPTY_DATA);
  const [openPickerByCardId, setOpenPickerByCardId] = useState<Record<string, boolean>>({});

  useEffect(() => {
    async function loadTeamData(): Promise<void> {
      if (!activeCompany?.id) {
        setData(EMPTY_DATA);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const payload = await fetchTeamPageData(activeCompany.id);
        setData(payload);
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : String(loadError));
      } finally {
        setLoading(false);
      }
    }

    void loadTeamData();
  }, [activeCompany?.id]);

  const totalSlots = useMemo(() => {
    return data.machines.reduce((sum, machine) => sum + machine.slotsClaudeCode + machine.slotsCodex, 0);
  }, [data.machines]);

  const activeSlots = useMemo(() => {
    return data.engineers.length + data.execCards.length;
  }, [data.engineers.length, data.execCards.length]);

  return (
    <div className="team-page">
      <div className="layout team-layout">
        <div className="main">
          <div className="page-header fade-up d1">
            <div className="page-title">Your Team</div>
            <div className="page-subtitle">
              {data.execCards.length} execs and {data.engineers.length} engineers across {data.machines.length} machine
              {data.machines.length === 1 ? "" : "s"}. {activeSlots} of {totalSlots || 0} slots active.
            </div>
          </div>

          <section className="fade-up d2">
            <div className="section-label">
              Executives
              <span className="section-label-count">{data.execCards.length} persistent</span>
            </div>

            {data.execCards.length === 0 ? (
              <div className="sidebar-card">No executive personalities found.</div>
            ) : (
              data.execCards.map((exec) => {
                const pickerOpen = openPickerByCardId[exec.id] ?? false;

                return (
                  <article className="exec-card" key={exec.id}>
                    <div className="exec-header">
                      <div className="exec-identity">
                        <div className="exec-avatar">
                          {exec.roleName.slice(0, 2).toUpperCase()}
                          <div className="exec-status-dot dot--positive dot--breathe" />
                        </div>
                        <div className="exec-meta">
                          <div className="exec-role">{readable(exec.roleName)}</div>
                          <div className="exec-model">{exec.model} · persistent</div>
                        </div>
                      </div>
                      <div className="exec-status-area">
                        <div className="exec-current-task">Active strategy work</div>
                      </div>
                    </div>

                    <div className="archetype-section">
                      <div className="archetype-label">
                        Current Archetype
                        <button
                          className="archetype-change"
                          type="button"
                          onClick={() =>
                            setOpenPickerByCardId((current) => ({
                              ...current,
                              [exec.id]: !pickerOpen,
                            }))
                          }
                        >
                          Change
                        </button>
                      </div>

                      <div className="archetype-current">
                        <div className="archetype-icon" style={{ background: "var(--ember-dim)", color: "var(--ember)" }}>
                          ⚡
                        </div>
                        <div className="archetype-info">
                          <div className="archetype-name" style={{ color: "var(--ember)" }}>
                            {exec.archetypeName}
                          </div>
                          <div className="archetype-tagline">{exec.archetypeTagline || "No archetype tagline configured."}</div>
                          <div className="traits">
                            {exec.traits.length === 0 ? (
                              <span className="trait" style={{ background: "var(--chalk-light)", color: "var(--stone)" }}>
                                Defaults applied
                              </span>
                            ) : (
                              exec.traits.map((trait) => (
                                <span
                                  key={trait}
                                  className="trait"
                                  style={{ background: "var(--ember-dim)", color: "var(--ember)" }}
                                >
                                  {trait}
                                </span>
                              ))
                            )}
                          </div>
                        </div>
                      </div>
                    </div>

                    {pickerOpen ? (
                      <div className="archetype-picker visible">
                        <div className="archetype-picker-title">Archetype options will be writable in Phase 2.</div>
                      </div>
                    ) : null}

                    <div className="beliefs-section">
                      <div className="beliefs-label">Core Beliefs</div>
                      <div className="belief-list">
                        {exec.philosophy.length === 0 ? (
                          <div className="belief">
                            <div className="belief-marker" style={{ background: "var(--ember)" }} />
                            No philosophy statements configured.
                          </div>
                        ) : (
                          exec.philosophy.map((belief) => (
                            <div className="belief" key={belief}>
                              <div className="belief-marker" style={{ background: "var(--ember)" }} />
                              {belief}
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  </article>
                );
              })
            )}
          </section>
        </div>

        <aside className="sidebar">
          <section className="sidebar-card fade-up d2">
            <div className="sidebar-card-title">Engineers</div>
            {data.engineers.length === 0 ? (
              <div className="engineer-row">No active ephemeral jobs</div>
            ) : (
              data.engineers.map((engineer, index) => (
                <div className="engineer-row" key={engineer.id}>
                  <span className="dot dot--positive dot--breathe" style={{ width: 8, height: 8 }} />
                  <div className="engineer-avatar">E{index + 1}</div>
                  <div className="engineer-info">
                    <div className="engineer-name">{readable(engineer.role)}</div>
                    <div className="engineer-task">{engineer.title}</div>
                    <div className="engineer-model">{engineer.status}</div>
                  </div>
                  <div className="engineer-status">
                    <div className="engineer-jobs" style={{ color: "var(--positive)" }}>
                      1 job
                    </div>
                  </div>
                </div>
              ))
            )}
          </section>

          <section className="sidebar-card fade-up d3">
            <div className="sidebar-card-title">Machines</div>
            {data.machines.length === 0 ? (
              <div className="machine-heartbeat">No machines registered.</div>
            ) : (
              data.machines.map((machine) => (
                <div key={machine.id} className="machine-block">
                  <div className="machine-header">
                    <div className="machine-name">{machine.name}</div>
                    <div className="machine-status">
                      <span className={statusDot(machine.status)} style={{ width: 6, height: 6 }} />
                      {machine.status ?? "unknown"}
                    </div>
                  </div>

                  <div className="slot-row">
                    <span className="slot-label">Claude Code</span>
                    <div className="slot-pips">
                      {Array.from({ length: Math.max(machine.slotsClaudeCode, 1) }).map((_, index) => (
                        <span
                          key={`${machine.id}-claude-${index}`}
                          className={`slot-pip ${index < Math.min(machine.slotsClaudeCode, 2) ? "slot-pip--active" : "slot-pip--empty"}`}
                        />
                      ))}
                      <span className="slot-count">{Math.min(machine.slotsClaudeCode, 2)}/{machine.slotsClaudeCode}</span>
                    </div>
                  </div>

                  <div className="slot-row">
                    <span className="slot-label">Codex</span>
                    <div className="slot-pips">
                      {Array.from({ length: Math.max(machine.slotsCodex, 1) }).map((_, index) => (
                        <span key={`${machine.id}-codex-${index}`} className="slot-pip slot-pip--empty" />
                      ))}
                      <span className="slot-count">0/{machine.slotsCodex}</span>
                    </div>
                  </div>

                  <div className="machine-heartbeat">Last heartbeat: {heartbeatLabel(machine.lastHeartbeat)}</div>
                </div>
              ))
            )}
          </section>

          <section className="sidebar-card fade-up d4">
            <div className="sidebar-card-title">Contractors</div>
            <div className="contractor-list">
              {data.contractors.length === 0 ? (
                <div className="contractor-item">No contractor roles configured.</div>
              ) : (
                data.contractors.map((contractor) => (
                  <div className="contractor-item" key={contractor.id}>
                    <div>
                      <div className="contractor-name">{readable(contractor.name)}</div>
                      <div className="contractor-desc">{contractor.description ?? "On-demand role"}</div>
                    </div>
                    <span className="contractor-tag">on-demand</span>
                  </div>
                ))
              )}
            </div>
          </section>

          {loading ? <div className="inline-feedback">Loading team data...</div> : null}
          {error ? <div className="inline-feedback inline-feedback--error">{error}</div> : null}
        </aside>
      </div>
    </div>
  );
}
