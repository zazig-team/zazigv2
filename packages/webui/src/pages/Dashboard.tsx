import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "../hooks/useAuth";
import { useCompany } from "../hooks/useCompany";
import { useRealtimeTable } from "../hooks/useRealtimeTable";
import DashboardDetailPanel from "../components/DashboardDetailPanel";
import {
  fetchActionItems,
  fetchActivity,
  fetchCompletedFeatures,
  fetchDashboardTeam,
  fetchDecisions,
  fetchFocusAreas,
  fetchGoals,
  fetchPulseMetrics,
  getAccessToken,
  resolveActionItem,
  resolveDecision,
  type ActionItem,
  type CompletedFeature,
  type Decision,
  type EventItem,
  type FocusArea,
  type Goal,
  type Idea,
  type PulseMetrics,
  type TeamSidebarData,
} from "../lib/queries";

function greetingForHour(hour: number): string {
  if (hour < 12) {
    return "Good morning";
  }
  if (hour < 18) {
    return "Good afternoon";
  }
  return "Good evening";
}

function userDisplayName(rawName: unknown, fallbackEmail: string | undefined): string {
  if (typeof rawName === "string" && rawName.trim().length > 0) {
    return rawName.split(" ")[0] ?? rawName;
  }

  if (!fallbackEmail) {
    return "Founder";
  }

  return fallbackEmail.split("@")[0] ?? "Founder";
}

function formatFriendlyDate(date: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);
}

function formatTime(iso: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(iso));
}

function formatExpiresIn(expiresAt: string): string {
  const delta = Date.parse(expiresAt) - Date.now();
  if (delta <= 0) {
    return "Expired";
  }

  const hours = Math.floor(delta / 3_600_000);
  if (hours < 1) {
    return "Expires soon";
  }
  if (hours < 24) {
    return `Expires in ${hours}h`;
  }
  return `Expires in ${Math.floor(hours / 24)}d`;
}

function eventTone(eventType: string): "positive" | "caution" | "negative" | "info" {
  if (eventType.includes("fail") || eventType.includes("error")) {
    return "negative";
  }
  if (eventType.includes("retry") || eventType.includes("blocked")) {
    return "caution";
  }
  if (eventType.includes("merge") || eventType.includes("ship") || eventType.includes("complete")) {
    return "positive";
  }
  return "info";
}

function eventSummary(item: EventItem): string {
  if (item.detail && typeof item.detail === "object") {
    const maybeMessage =
      (typeof item.detail.message === "string" && item.detail.message) ||
      (typeof item.detail.summary === "string" && item.detail.summary) ||
      (typeof item.detail.title === "string" && item.detail.title) ||
      null;

    if (maybeMessage) {
      return maybeMessage;
    }
  }

  return item.event_type.replace(/_/g, " ");
}

function readableRole(value: string): string {
  return value.replace(/[-_]/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function heartbeatAge(lastHeartbeat: string | null | undefined): string {
  if (!lastHeartbeat) {
    return "No heartbeat";
  }

  const deltaSeconds = Math.floor((Date.now() - Date.parse(lastHeartbeat)) / 1000);
  if (Number.isNaN(deltaSeconds) || deltaSeconds < 0) {
    return "Unknown";
  }

  if (deltaSeconds < 60) {
    return `${deltaSeconds}s ago`;
  }

  const minutes = Math.floor(deltaSeconds / 60);
  return `${minutes}m ago`;
}

const EMPTY_PULSE: PulseMetrics = {
  activeFeatures: 0,
  mergedFeatures: 0,
  failedFeatures: 0,
  activeJobs: 0,
  totalJobs: 0,
  shipRate: 0,
};

const EMPTY_TEAM: TeamSidebarData = {
  members: [],
  machineHeartbeatById: {},
};

type FocusBadgeTone = "badge--positive" | "badge--negative" | "badge--caution" | "badge--neutral";

function focusBadgeDetails(focusArea: FocusArea): { label: string; tone: FocusBadgeTone } {
  const health = focusArea.health?.toLowerCase() ?? null;

  if (health) {
    if (health === "on_track" || health === "healthy") {
      return { label: health.replace(/_/g, " "), tone: "badge--positive" };
    }
    if (health === "at_risk" || health === "waiting") {
      return { label: health.replace(/_/g, " "), tone: "badge--caution" };
    }
    if (health === "off_track" || health === "behind") {
      return { label: health.replace(/_/g, " "), tone: "badge--negative" };
    }
    if (health === "later") {
      return { label: health, tone: "badge--neutral" };
    }
  }

  const status = focusArea.status.toLowerCase();
  if (status === "active") {
    return { label: focusArea.status, tone: "badge--positive" };
  }
  if (status === "paused") {
    return { label: focusArea.status, tone: "badge--caution" };
  }
  return { label: focusArea.status, tone: "badge--neutral" };
}

export default function Dashboard(): JSX.Element {
  const { user } = useAuth();
  const { activeCompany } = useCompany();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [goals, setGoals] = useState<Goal[]>([]);
  const [focusAreas, setFocusAreas] = useState<FocusArea[]>([]);
  const [activity, setActivity] = useState<EventItem[]>([]);
  const [pulse, setPulse] = useState<PulseMetrics>(EMPTY_PULSE);
  const [team, setTeam] = useState<TeamSidebarData>(EMPTY_TEAM);
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [actionItems, setActionItems] = useState<ActionItem[]>([]);
  const [noteText, setNoteText] = useState<Record<string, string>>({});
  const [decidingId, setDecidingId] = useState<string | null>(null);

  const [selectedGoal, setSelectedGoal] = useState<{ goal: Goal; color: string } | null>(null);
  const [selectedFocusArea, setSelectedFocusArea] = useState<FocusArea | null>(null);
  const [completedFeatures, setCompletedFeatures] = useState<CompletedFeature[]>([]);
  const [showProduction, setShowProduction] = useState(false);
  const refreshTimerRef = useRef<number | null>(null);

  const refreshDecisions = useCallback(async (): Promise<void> => {
    if (!activeCompany?.id) {
      setDecisions([]);
      return;
    }

    try {
      const data = await fetchDecisions(activeCompany.id);
      setDecisions(data);
    } catch {
      setDecisions([]);
    }
  }, [activeCompany?.id]);

  const refreshActionItems = useCallback(async (): Promise<void> => {
    if (!activeCompany?.id) {
      setActionItems([]);
      return;
    }

    try {
      const data = await fetchActionItems(activeCompany.id);
      setActionItems(data);
    } catch {
      setActionItems([]);
    }
  }, [activeCompany?.id]);

  const loadDashboardData = useCallback(async (): Promise<void> => {
    if (!activeCompany?.id) {
      setGoals([]);
      setFocusAreas([]);
      setActivity([]);
      setPulse(EMPTY_PULSE);
      setTeam(EMPTY_TEAM);
      setDecisions([]);
      setActionItems([]);
      setCompletedFeatures([]);
      setNoteText({});
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Ensure the session is fresh before starting the batch.
      // This refreshes the client for direct queries and returns the token for edge functions.
      await getAccessToken();

      const [
        goalsResult,
        focusAreasResult,
        activityResult,
        pulseResult,
        teamResult,
        decisionsResult,
        actionItemsResult,
        completedFeaturesResult,
      ] = await Promise.allSettled([
        fetchGoals(activeCompany.id),
        fetchFocusAreas(activeCompany.id),
        fetchActivity(activeCompany.id),
        fetchPulseMetrics(activeCompany.id),
        fetchDashboardTeam(activeCompany.id),
        fetchDecisions(activeCompany.id),
        fetchActionItems(activeCompany.id),
        fetchCompletedFeatures(activeCompany.id),
      ]);

      setGoals(goalsResult.status === "fulfilled" ? goalsResult.value.slice(0, 3) : []);
      setFocusAreas(focusAreasResult.status === "fulfilled" ? focusAreasResult.value.slice(0, 5) : []);
      setActivity(activityResult.status === "fulfilled" ? activityResult.value : []);
      setPulse(pulseResult.status === "fulfilled" ? pulseResult.value : EMPTY_PULSE);
      setTeam(teamResult.status === "fulfilled" ? teamResult.value : EMPTY_TEAM);
      setDecisions(decisionsResult.status === "fulfilled" ? decisionsResult.value : []);
      setActionItems(actionItemsResult.status === "fulfilled" ? actionItemsResult.value : []);
      setCompletedFeatures(completedFeaturesResult.status === "fulfilled" ? completedFeaturesResult.value : []);

      // Surface first error for visibility
      const firstError = [goalsResult, focusAreasResult, activityResult, pulseResult, teamResult]
        .find((r): r is PromiseRejectedResult => r.status === "rejected");
      if (firstError) {
        const reason = firstError.reason;
        setError(reason instanceof Error ? reason.message : String(reason));
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : String(loadError));
    } finally {
      setLoading(false);
    }
  }, [activeCompany?.id]);

  useEffect(() => {
    void loadDashboardData();
  }, [loadDashboardData]);

  useEffect(() => {
    return () => {
      if (refreshTimerRef.current !== null) {
        window.clearTimeout(refreshTimerRef.current);
      }
    };
  }, []);

  const scheduleRealtimeRefresh = useCallback(() => {
    if (refreshTimerRef.current !== null) {
      window.clearTimeout(refreshTimerRef.current);
    }

    refreshTimerRef.current = window.setTimeout(() => {
      void loadDashboardData();
      refreshTimerRef.current = null;
    }, 300);
  }, [loadDashboardData]);

  const realtimeEnabled = Boolean(activeCompany?.id);
  const realtimeFilter = activeCompany?.id
    ? `company_id=eq.${activeCompany.id}`
    : undefined;

  useRealtimeTable({
    table: "features",
    filter: realtimeFilter,
    enabled: realtimeEnabled,
    onInsert: scheduleRealtimeRefresh,
    onUpdate: scheduleRealtimeRefresh,
  });

  useRealtimeTable({
    table: "jobs",
    filter: realtimeFilter,
    enabled: realtimeEnabled,
    onInsert: scheduleRealtimeRefresh,
    onUpdate: scheduleRealtimeRefresh,
  });

  useRealtimeTable({
    table: "machines",
    filter: realtimeFilter,
    enabled: realtimeEnabled,
    onInsert: scheduleRealtimeRefresh,
    onUpdate: scheduleRealtimeRefresh,
  });

  useRealtimeTable({
    table: "decisions",
    filter: realtimeFilter,
    enabled: realtimeEnabled,
    onInsert: refreshDecisions,
    onUpdate: refreshDecisions,
  });

  useRealtimeTable({
    table: "action_items",
    filter: realtimeFilter,
    enabled: realtimeEnabled,
    onInsert: refreshActionItems,
    onUpdate: refreshActionItems,
  });

  const displayName = userDisplayName(user?.user_metadata?.name, user?.email);
  const now = new Date();
  const greeting = greetingForHour(now.getHours());

  const greetingSummary = useMemo(() => {
    return `Your team shipped ${pulse.mergedFeatures} feature${pulse.mergedFeatures === 1 ? "" : "s"} recently. ` +
      `Pipeline has ${pulse.activeFeatures} active item${pulse.activeFeatures === 1 ? "" : "s"}. ` +
      `CPO has ${decisions.length} decision${decisions.length === 1 ? "" : "s"} waiting for you.`;
  }, [decisions.length, pulse.activeFeatures, pulse.mergedFeatures]);

  const handleResolveActionItem = async (id: string): Promise<void> => {
    try {
      await resolveActionItem(id);
      setActionItems((prev) => prev.filter((item) => item.id !== id));
    } catch (resolveError) {
      setError(resolveError instanceof Error ? resolveError.message : String(resolveError));
    }
  };

  const handleDecision = async (
    decisionId: string,
    action: "resolve" | "defer" | "add_note",
    selectedOption?: string,
    note?: string,
  ): Promise<void> => {
    const cleanedNote = typeof note === "string" ? note.trim() : "";

    if (action === "add_note" && !cleanedNote) {
      setError("Write a note before sending.");
      return;
    }

    setDecidingId(decisionId);
    try {
      await resolveDecision({
        decisionId,
        action,
        selectedOption,
        note: cleanedNote || undefined,
      });
      if (action === "add_note") {
        setNoteText((prev) => ({ ...prev, [decisionId]: "" }));
        return;
      }

      setDecisions((prev) => prev.filter((decision) => decision.id !== decisionId));
    } catch (decisionError) {
      setError(decisionError instanceof Error ? decisionError.message : String(decisionError));
    } finally {
      setDecidingId(null);
    }
  };

  return (
    <div className="dashboard-page">
      <div className="layout">
        <div className="main">
          <section className="fade-up d1">
            <div className="greeting">
              {greeting}, {displayName}
            </div>
            <div className="greeting-date">{formatFriendlyDate(now)}</div>
            <div className="greeting-summary">{greetingSummary}</div>
          </section>

          <section className="fade-up d2">
            <div className="section-label">
              Goals
              <span className="section-label-count">{goals.length} active</span>
            </div>
            <div className="goals-grid">
              {goals.map((goal, index) => {
                const progress = goal.progress ?? 0;
                const color = ["var(--ember)", "var(--caution)", "var(--info)"][index] ?? "var(--ember)";
                return (
                  <article
                    className="goal-card goal-card--clickable"
                    key={goal.id}
                    onClick={() => setSelectedGoal({ goal, color })}
                    style={{ borderLeftColor: color, "--goal-color": color } as React.CSSProperties}
                  >
                    <div className="goal-rank" style={{ color }}>{index + 1}</div>
                    <div className="goal-horizon">{goal.time_horizon ?? "Near"}</div>
                    <div className="goal-title">{goal.title}</div>
                    <div className="goal-progress" style={{ background: `color-mix(in srgb, ${color} 15%, var(--chalk-light))` }}>
                      <div className="goal-progress-fill" style={{ width: `${progress}%`, background: color }} />
                    </div>
                    <div className="goal-meta">
                      <span className="goal-target">
                        {goal.target ?? goal.metric ?? "Target pending"}
                        {goal.target_date ? ` · ${goal.target_date}` : ""}
                      </span>
                      <span className="goal-percent" style={{ color }}>{progress}%</span>
                    </div>
                  </article>
                );
              })}
            </div>
          </section>

          <section className="fade-up d3">
            <div className="section-label">
              Needs You
              <span className="section-label-count section-label-count--caution">
                {actionItems.length} action{actionItems.length === 1 ? "" : "s"}
              </span>
            </div>
            {actionItems.length === 0 ? (
              <div className="empty-state">Nothing needs your attention right now.</div>
            ) : (
              actionItems.map((item) => (
                <article className="action-card" key={item.id}>
                  <div className="action-icon">!</div>
                  <div className="action-content">
                    <div className="action-title">{item.title}</div>
                    {item.detail ? <div className="action-detail">{item.detail}</div> : null}
                  </div>
                  <button
                    className="action-cta"
                    type="button"
                    onClick={() => void handleResolveActionItem(item.id)}
                  >
                    {item.cta_label}
                  </button>
                </article>
              ))
            )}
          </section>

          <section className="fade-up d4">
            <div className="section-label">
              Decisions Waiting
              <span className="section-label-count section-label-count--ember">
                {decisions.length} pending
              </span>
            </div>
            {decisions.length === 0 ? (
              <div className="empty-state">No decisions waiting.</div>
            ) : (
              decisions.map((decision) => {
                const recommended = decision.options.find((option) => option.recommended);
                const expiresIn = decision.expires_at
                  ? formatExpiresIn(decision.expires_at)
                  : null;

                return (
                  <article className="decision-card" key={decision.id}>
                    <div className="decision-header">
                      <span className="decision-from">
                        {decision.from_role.toUpperCase()} · {decision.category}
                      </span>
                      {expiresIn ? (
                        <span className="decision-urgency">{expiresIn}</span>
                      ) : null}
                    </div>
                    <div className="decision-title">{decision.title}</div>
                    {decision.context ? (
                      <div className="decision-context">{decision.context}</div>
                    ) : null}
                    <div className="decision-options">
                      {decision.options.map((option, index) => (
                        <span
                          key={`${decision.id}-${option.label}-${index}`}
                          className={`decision-option${option.recommended ? " decision-option--recommended" : ""}`}
                        >
                          {option.label}
                        </span>
                      ))}
                    </div>
                    {decision.recommendation_rationale ? (
                      <div className="decision-rec">{decision.recommendation_rationale}</div>
                    ) : null}
                    <input
                      className="decision-note-input"
                      type="text"
                      placeholder="Add note for CPO..."
                      value={noteText[decision.id] ?? ""}
                      onChange={(event) =>
                        setNoteText((prev) => ({ ...prev, [decision.id]: event.target.value }))}
                    />
                    <div className="decision-footer">
                      {recommended ? (
                        <button
                          className="decision-action"
                          type="button"
                          disabled={decidingId === decision.id}
                          onClick={() => void handleDecision(decision.id, "resolve", recommended.label)}
                        >
                          Accept recommendation
                        </button>
                      ) : null}
                      <button
                        className="decision-action"
                        type="button"
                        disabled={decidingId === decision.id || !(noteText[decision.id] ?? "").trim()}
                        onClick={() =>
                          void handleDecision(
                            decision.id,
                            "add_note",
                            undefined,
                            noteText[decision.id],
                          )}
                      >
                        Add a note
                      </button>
                      <button
                        className="decision-action"
                        type="button"
                        disabled={decidingId === decision.id}
                        onClick={() =>
                          void handleDecision(
                            decision.id,
                            "defer",
                            undefined,
                            noteText[decision.id],
                          )}
                      >
                        Defer
                      </button>
                    </div>
                  </article>
                );
              })
            )}
          </section>

          <section className="fade-up d6">
            <div className="section-label">Today</div>
            <div className="feed-fade">
              <div className="feed-scroll">
                {activity.length === 0 ? (
                  <div className="feed-item">
                    <div className="feed-time">--:--</div>
                    <div className="feed-content">
                      <div className="feed-what">No activity yet for this company.</div>
                    </div>
                  </div>
                ) : (
                  activity.map((item) => {
                    const tone = eventTone(item.event_type);
                    return (
                      <div className="feed-item" key={item.id}>
                        <div className="feed-time">{formatTime(item.created_at)}</div>
                        <div className="feed-dot-col">
                          <span className={`dot dot--${tone}`} />
                        </div>
                        <div className="feed-content">
                          <div className="feed-who">{item.role ?? "System"}</div>
                          <div className="feed-what">{eventSummary(item)}</div>
                        </div>
                      </div>
                    );
                  })
                )}
                <button className="feed-load-more" type="button">
                  Show yesterday
                </button>
              </div>
            </div>
          </section>

          <section className="fade-up d7">
            <div className="section-label">
              Shipped to Staging
              <span className="section-label-count">
                {completedFeatures.filter((f) => !f.promoted_version).length} features
              </span>
            </div>
            {completedFeatures.filter((f) => !f.promoted_version).length === 0 ? (
              <div className="empty-state">No features shipped to staging.</div>
            ) : (
              completedFeatures
                .filter((f) => !f.promoted_version)
                .map((feature) => (
                  <article className="feature-card" key={feature.id}>
                    <div className="feature-title">{feature.title}</div>
                    {feature.staging_verified_by ? (
                      <span className="badge badge--positive">✓ Verified by {feature.staging_verified_by}</span>
                    ) : null}
                  </article>
                ))
            )}
          </section>

          <section className="fade-up d7b">
            <div className="section-label">
              Shipped to Production
              <span className="section-label-count">
                {completedFeatures.filter((f) => f.promoted_version !== null && f.promoted_version !== undefined).length} features
              </span>
              <button
                className="section-label-toggle"
                type="button"
                onClick={() => setShowProduction((prev) => !prev)}
              >
                {showProduction ? "Hide" : "Show"}
              </button>
            </div>
            {showProduction ? (
              completedFeatures.filter((f) => f.promoted_version !== null && f.promoted_version !== undefined).length === 0 ? (
                <div className="empty-state">No features shipped to production.</div>
              ) : (
                completedFeatures
                  .filter((f) => f.promoted_version !== null && f.promoted_version !== undefined)
                  .map((feature) => (
                    <article className="feature-card" key={feature.id}>
                      <div className="feature-title">{feature.title}</div>
                      <span className="badge badge--positive version-badge">{feature.promoted_version}</span>
                    </article>
                  ))
              )
            ) : null}
          </section>

          {error ? <div className="inline-feedback inline-feedback--error">{error}</div> : null}
          {loading ? <div className="inline-feedback">Refreshing dashboard...</div> : null}
        </div>

        <aside className="sidebar">
          <section className="sidebar-card fade-up d2">
            <div className="sidebar-card-title">Pulse</div>
            <div className="pulse-grid">
              <div className="pulse-card">
                <div className="pulse-label">Ship Rate</div>
                <div className="pulse-value" style={{ color: "var(--positive)" }}>
                  {pulse.shipRate}%
                </div>
                <div className="pulse-sub">{pulse.activeJobs} active jobs</div>
              </div>
              <div className="pulse-card">
                <div className="pulse-label">Pipeline Active</div>
                <div className="pulse-value">{pulse.activeFeatures}</div>
                <div className="pulse-sub">{pulse.failedFeatures} failed</div>
              </div>
            </div>
          </section>

          <section className="sidebar-card fade-up d4">
            <div className="sidebar-card-title">Focus Areas</div>
            {focusAreas.length === 0 ? (
              <div className="focus-item">No focus areas found</div>
            ) : (
              focusAreas.map((focusArea) => {
                const { label, tone } = focusBadgeDetails(focusArea);

                return (
                  <div className="focus-item focus-item--clickable" key={focusArea.id} onClick={() => setSelectedFocusArea(focusArea)}>
                    <div>
                      <span className="focus-name">{focusArea.title}</span>
                      <div className="focus-sub">
                        {focusArea.goals.length} linked goal{focusArea.goals.length === 1 ? "" : "s"}
                      </div>
                    </div>
                    <span className={`badge ${tone}`}>
                      <span className="badge-dot" />
                      {label}
                    </span>
                  </div>
                );
              })
            )}
          </section>

          <section className="sidebar-card fade-up d6">
            <div className="sidebar-card-title">Your Team</div>
            {team.members.length === 0 ? (
              <div className="team-member">No active jobs</div>
            ) : (
              team.members.map((member) => {
                const initials = member.role
                  .split(/[-_\s]+/)
                  .map((part) => part[0]?.toUpperCase() ?? "")
                  .join("")
                  .slice(0, 2);

                return (
                  <div className="team-member" key={member.role}>
                    <span className="dot dot--positive dot--breathe" style={{ width: 8, height: 8 }} />
                    <div className="team-avatar">{initials}</div>
                    <div className="team-info">
                      <div className="team-name">{readableRole(member.role)}</div>
                      <div className="team-task">
                        Heartbeat {heartbeatAge(Object.values(team.machineHeartbeatById)[0] ?? null)}
                      </div>
                    </div>
                    <div className="team-slots">{member.activeJobs} jobs</div>
                  </div>
                );
              })
            )}
          </section>
        </aside>
      </div>

      {selectedGoal ? (
        <DashboardDetailPanel
          type="goal"
          goal={selectedGoal.goal}
          color={selectedGoal.color}
          onClose={() => setSelectedGoal(null)}
        />
      ) : null}

      {selectedFocusArea ? (
        <DashboardDetailPanel
          type="focusArea"
          focusArea={selectedFocusArea}
          onClose={() => setSelectedFocusArea(null)}
        />
      ) : null}
    </div>
  );
}
