import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "../hooks/useAuth";
import { useCompany } from "../hooks/useCompany";
import { useRealtimeTable } from "../hooks/useRealtimeTable";
import {
  fetchActivity,
  fetchDashboardTeam,
  fetchFocusAreas,
  fetchGoals,
  fetchPulseMetrics,
  submitIdea,
  type EventItem,
  type FocusArea,
  type Goal,
  type PulseMetrics,
  type TeamSidebarData,
} from "../lib/queries";

interface DecisionPlaceholder {
  from: string;
  urgency: string;
  title: string;
  context: string;
  options: string[];
  recommendation: string;
}

const NEEDS_YOU_PLACEHOLDER = {
  title: "Stripe API key needed for payment integration",
  detail: "Onboarding flow is blocked. Engineer cannot proceed without live credentials.",
  cta: "Provide key",
};

const DECISIONS_PLACEHOLDER: DecisionPlaceholder = {
  from: "CPO · Tactical",
  urgency: "Expires in 22h",
  title: "Three features are ready for breakdown. Which should we prioritise?",
  context:
    "Pipeline has capacity for 2 concurrent builds. The full-loop focus area directly unblocks onboarding.",
  options: ["Onboarding flow", "Pipeline retry logic", "Slack notifications"],
  recommendation:
    "CPO recommends Onboarding flow — directly unblocks Goal 1 and the Full Loop focus area.",
};

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
    if (health === "behind") {
      return { label: health, tone: "badge--negative" };
    }
    if (health === "waiting") {
      return { label: health, tone: "badge--caution" };
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

  const [ideaText, setIdeaText] = useState("");
  const [ideaSubmitting, setIdeaSubmitting] = useState(false);
  const [ideaMessage, setIdeaMessage] = useState<string | null>(null);
  const refreshTimerRef = useRef<number | null>(null);

  const loadDashboardData = useCallback(async (): Promise<void> => {
    if (!activeCompany?.id) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const [goalsData, focusAreasData, activityData, pulseData, teamData] = await Promise.all([
        fetchGoals(activeCompany.id),
        fetchFocusAreas(activeCompany.id),
        fetchActivity(activeCompany.id),
        fetchPulseMetrics(activeCompany.id),
        fetchDashboardTeam(activeCompany.id),
      ]);

      setGoals(goalsData.slice(0, 3));
      setFocusAreas(focusAreasData.slice(0, 5));
      setActivity(activityData);
      setPulse(pulseData);
      setTeam(teamData);
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

  const displayName = userDisplayName(user?.user_metadata?.name, user?.email);
  const now = new Date();
  const greeting = greetingForHour(now.getHours());

  const greetingSummary = useMemo(() => {
    return `Your team shipped ${pulse.mergedFeatures} feature${pulse.mergedFeatures === 1 ? "" : "s"} recently. ` +
      `Pipeline has ${pulse.activeFeatures} active item${pulse.activeFeatures === 1 ? "" : "s"}. ` +
      `CPO has 3 decisions waiting for you.`;
  }, [pulse.activeFeatures, pulse.mergedFeatures]);

  const onSubmitIdea = async (): Promise<void> => {
    if (!activeCompany?.id) {
      setIdeaMessage("No company selected");
      return;
    }

    if (!ideaText.trim()) {
      setIdeaMessage("Write an idea first");
      return;
    }

    setIdeaSubmitting(true);
    setIdeaMessage(null);

    try {
      await submitIdea({
        companyId: activeCompany.id,
        rawText: ideaText.trim(),
        originator: user?.email ?? "founder",
      });
      setIdeaText("");
      setIdeaMessage("Idea sent to inbox");
    } catch (submitError) {
      const message = submitError instanceof Error ? submitError.message : String(submitError);
      const lower = message.toLowerCase();
      const friendlyMessage = lower.includes("permission") || lower.includes("rls")
        ? "Idea submission blocked — RLS policy needed"
        : message;
      setIdeaMessage(friendlyMessage);
    } finally {
      setIdeaSubmitting(false);
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
                  <article className="goal-card" key={goal.id}>
                    <div className="goal-rank">{index + 1}</div>
                    <div className="goal-horizon">{goal.time_horizon ?? "Near"}</div>
                    <div className="goal-title">{goal.title}</div>
                    <div className="goal-progress">
                      <div className="goal-progress-fill" style={{ width: `${progress}%`, background: color }} />
                    </div>
                    <div className="goal-meta">
                      <span className="goal-target">
                        {goal.target ?? goal.metric ?? "Target pending"}
                        {goal.target_date ? ` · ${goal.target_date}` : ""}
                      </span>
                      <span className="goal-percent">{progress}%</span>
                    </div>
                  </article>
                );
              })}
            </div>
          </section>

          <section className="fade-up d3">
            <div className="section-label">
              Needs You
              <span className="section-label-count section-label-count--caution">1 action</span>
            </div>
            <article className="action-card">
              <div className="action-icon">!</div>
              <div className="action-content">
                <div className="action-title">{NEEDS_YOU_PLACEHOLDER.title}</div>
                <div className="action-detail">{NEEDS_YOU_PLACEHOLDER.detail}</div>
              </div>
              <button className="action-cta" type="button">
                {NEEDS_YOU_PLACEHOLDER.cta}
              </button>
            </article>
          </section>

          <section className="fade-up d4">
            <div className="section-label">
              Decisions Waiting
              <span className="section-label-count section-label-count--ember">3 pending</span>
            </div>
            <article className="decision-card">
              <div className="decision-header">
                <span className="decision-from">{DECISIONS_PLACEHOLDER.from}</span>
                <span className="decision-urgency">{DECISIONS_PLACEHOLDER.urgency}</span>
              </div>
              <div className="decision-title">{DECISIONS_PLACEHOLDER.title}</div>
              <div className="decision-context">{DECISIONS_PLACEHOLDER.context}</div>
              <div className="decision-options">
                {DECISIONS_PLACEHOLDER.options.map((option, index) => (
                  <span
                    className={`decision-option${index === 0 ? " decision-option--recommended" : ""}`}
                    key={option}
                  >
                    {option}
                  </span>
                ))}
              </div>
              <div className="decision-rec">{DECISIONS_PLACEHOLDER.recommendation}</div>
              <div className="decision-footer">
                <button className="decision-action" type="button">
                  Accept recommendation
                </button>
                <button className="decision-action" type="button">
                  Add a note
                </button>
                <button className="decision-action" type="button">
                  Defer
                </button>
              </div>
            </article>
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

          <section className="fade-up d8">
            <div className="ideas-bar">
              <div className="ideas-bar-icon">+</div>
              <input
                type="text"
                placeholder="Share an idea you'd love to see built..."
                value={ideaText}
                onChange={(event) => setIdeaText(event.target.value)}
              />
              <button type="button" disabled={ideaSubmitting} onClick={() => void onSubmitIdea()}>
                {ideaSubmitting ? "Sending..." : "Send idea"}
              </button>
            </div>
            {ideaMessage ? <div className="inline-feedback">{ideaMessage}</div> : null}
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
                  <div className="focus-item" key={focusArea.id}>
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
    </div>
  );
}
