import React, { useEffect, useMemo, useState } from 'react';

type AnyRecord = Record<string, unknown>;

export interface PipelineJob {
  id: string;
  title: string;
  featureName: string;
  status: string;
  hasLocalSession: boolean;
  sessionName: string | null;
}

interface PipelineViewData {
  companyName: string;
  daemonRunning: boolean;
  activeJobs: PipelineJob[];
  failedFeatures: string[];
  backlogFeatures: string[];
  recentlyCompleted: string[];
}

interface PipelineColumnProps {
  activeSession: string | null;
  onJobClick: (job: PipelineJob) => void;
  onWatchClick: (job: PipelineJob) => void;
}

type Unsubscribe = () => void;
type ZazigBridge = {
  onPipelineUpdate?: (callback: (payload: unknown) => void) => Unsubscribe | void;
};
type WindowWithZazig = Window & {
  zazig?: ZazigBridge;
};

const SIDEBAR_WIDTH = 280;
const GREEN_DOT = '#22c55e';
const GREY_DOT = '#737d92';

const PLACEHOLDER_PIPELINE: PipelineViewData = {
  companyName: 'Acme Labs',
  daemonRunning: true,
  activeJobs: [
    {
      id: 'd43f65e6-0dce-4f65-a98a-eef5f5d75cb1',
      title: 'Implement desktop split layout',
      featureName: 'Electron desktop app v1.0',
      status: 'executing',
      hasLocalSession: true,
      sessionName: 'zazig-job-d43f65e6',
    },
    {
      id: 'c05562e2-2084-4126-a712-8e0e559f708d',
      title: 'Wire pipeline polling renderer bridge',
      featureName: 'Desktop data flow',
      status: 'dispatched',
      hasLocalSession: false,
      sessionName: null,
    },
  ],
  failedFeatures: ['Fix stale tmux cleanup on shutdown'],
  backlogFeatures: ['Add keyboard shortcuts for terminal pane', 'Add compact queue cards'],
  recentlyCompleted: [
    'Bootstrap Electron package scaffolding',
    'Add preload bridge for pipeline and terminal IPC',
    'CLI desktop command launch path',
    'Polling dedupe in main process',
    'Desktop build pipeline with esbuild',
  ],
};

function isRecord(value: unknown): value is AnyRecord {
  return typeof value === 'object' && value !== null;
}

function asRecord(value: unknown): AnyRecord {
  return isRecord(value) ? value : {};
}

function asRecordArray(value: unknown): AnyRecord[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isRecord);
}

function getString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function getNumber(value: unknown, fallback = 0): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  return fallback;
}

function parseContext(context: unknown): AnyRecord {
  if (isRecord(context)) return context;
  if (typeof context !== 'string') return {};

  try {
    const parsed = JSON.parse(context) as unknown;
    return asRecord(parsed);
  } catch {
    return {};
  }
}

function getTitlesFromItems(items: AnyRecord[], field = 'title'): string[] {
  return items
    .map((item) => getString(item[field], ''))
    .filter((title) => title.length > 0);
}

function getLocalSessionEntries(status: AnyRecord): unknown[] {
  const localSessions =
    status.local_sessions ??
    status.localSessions ??
    status.tmux_sessions ??
    status.tmuxSessions ??
    status.sessions;

  return Array.isArray(localSessions) ? localSessions : [];
}

function getSessionName(session: AnyRecord): string {
  return (
    getString(session.session_name) ||
    getString(session.sessionName) ||
    getString(session.session) ||
    getString(session.name)
  );
}

function findMatchingSessionName(jobId: string, sessionNames: string[]): string | null {
  if (!jobId) return null;

  const exact = sessionNames.find((name) => name.includes(jobId));
  if (exact) return exact;

  const shortId = jobId.slice(0, 8);
  if (!shortId) return null;

  const shortMatch = sessionNames.find((name) => name.includes(shortId));
  return shortMatch ?? null;
}

interface LocalSessionLookup {
  jobIds: Set<string>;
  sessionNames: string[];
  sessionByJobId: Map<string, string>;
}

function getLocalSessionLookup(status: AnyRecord): LocalSessionLookup {
  const jobIds = new Set<string>();
  const sessionNames: string[] = [];
  const sessionByJobId = new Map<string, string>();

  for (const rawEntry of getLocalSessionEntries(status)) {
    if (typeof rawEntry === 'string') {
      const name = rawEntry.trim();
      if (name.length > 0) {
        sessionNames.push(name);
      }
      continue;
    }

    if (!isRecord(rawEntry)) {
      continue;
    }

    const session = rawEntry;
    const sessionName = getSessionName(session);
    if (sessionName.length > 0) {
      sessionNames.push(sessionName);
    }

    const directFields = [session.job_id, session.jobId, session.id, session.job];
    for (const value of directFields) {
      const id = getString(value);
      if (!id) continue;
      jobIds.add(id);
      if (sessionName.length > 0 && !sessionByJobId.has(id)) {
        sessionByJobId.set(id, sessionName);
      }
    }

    for (const job of asRecordArray(session.jobs)) {
      const id = getString(job.id) || getString(job.job_id) || getString(job.jobId);
      if (!id) continue;
      jobIds.add(id);
      if (sessionName.length > 0 && !sessionByJobId.has(id)) {
        sessionByJobId.set(id, sessionName);
      }
    }
  }

  return { jobIds, sessionNames, sessionByJobId };
}

function getFailedFeatures(standup: AnyRecord): string[] {
  const directFailed = getTitlesFromItems(asRecordArray(standup.failed));
  if (directFailed.length > 0) return directFailed;
  return [];
}

function getBacklogFeatures(standup: AnyRecord): string[] {
  const directBacklog = getTitlesFromItems(asRecordArray(standup.backlog));
  if (directBacklog.length > 0) return directBacklog;

  const queued = getTitlesFromItems(asRecordArray(standup.queued));
  if (queued.length > 0) return queued;

  const createdFromSnapshot = getTitlesFromItems(
    asRecordArray(asRecord(asRecord(standup.snapshot).features_by_status).created),
  );
  if (createdFromSnapshot.length > 0) return createdFromSnapshot;

  const backlogCount = getNumber(asRecord(standup.pipeline).backlog);
  if (backlogCount > 0) {
    return Array.from({ length: Math.min(backlogCount, 5) }, (_, index) => `Queued feature ${index + 1}`);
  }

  return [];
}

function getRecentlyCompleted(standup: AnyRecord): string[] {
  const completed = getTitlesFromItems(asRecordArray(standup.completed));
  if (completed.length > 0) return completed.slice(0, 5);

  const completedFromSnapshot = getTitlesFromItems(asRecordArray(asRecord(standup.snapshot).completed_features));
  if (completedFromSnapshot.length > 0) return completedFromSnapshot.slice(0, 5);

  return [];
}

function getActiveJobs(status: AnyRecord, standup: AnyRecord): PipelineJob[] {
  const statusJobs = asRecordArray(status.active_jobs);
  const fallbackFeatureNames = getTitlesFromItems(asRecordArray(standup.active));
  const localSessionLookup = getLocalSessionLookup(status);

  const jobs = statusJobs.map((job, index) => {
    const context = parseContext(job.context);
    const id = getString(job.id, `job-${index + 1}`);
    const title =
      getString(job.title) ||
      getString(job.job_title) ||
      getString(context.job_title) ||
      getString(context.title) ||
      getString(job.job_type, `Job ${index + 1}`);
    const featureName =
      getString(context.feature_title) ||
      getString(context.featureName) ||
      getString(asRecord(context.feature).title) ||
      fallbackFeatureNames[index] ||
      'Unknown feature';
    const directSessionName = getString(job.session_name) || getString(job.sessionName);
    const inferredSessionName =
      localSessionLookup.sessionByJobId.get(id) || findMatchingSessionName(id, localSessionLookup.sessionNames);
    const sessionName =
      directSessionName || inferredSessionName || (localSessionLookup.jobIds.has(id) ? id : null);

    // tmux local session indicator (green when active locally, grey when absent)
    const hasTmuxSession = Boolean(sessionName);

    return {
      id,
      title,
      featureName,
      status: getString(job.status, 'unknown'),
      hasLocalSession: hasTmuxSession,
      sessionName,
    };
  });

  if (jobs.length > 0) return jobs;

  return asRecordArray(standup.active).map((item, index) => {
    const title = getString(item.title, `Active item ${index + 1}`);
    const id = getString(item.id, `standup-active-${index + 1}`);
    const sessionName =
      localSessionLookup.sessionByJobId.get(id) ||
      findMatchingSessionName(id, localSessionLookup.sessionNames) ||
      (localSessionLookup.jobIds.has(id) ? id : null);
    return {
      id,
      title,
      featureName: title,
      status: getString(item.status, 'active'),
      hasLocalSession: Boolean(sessionName),
      sessionName: sessionName ?? null,
    };
  });
}

function parsePipelinePayload(payload: unknown): PipelineViewData {
  const root = asRecord(payload);
  const status = asRecord(root.status);
  const standup = asRecord(root.standup);
  const companyName =
    getString(status.company_name) ||
    getString(status.companyName) ||
    getString(asRecord(status.company).name) ||
    'Unknown company';

  return {
    companyName,
    daemonRunning: Boolean(status.running),
    activeJobs: getActiveJobs(status, standup),
    failedFeatures: getFailedFeatures(standup),
    backlogFeatures: getBacklogFeatures(standup),
    recentlyCompleted: getRecentlyCompleted(standup),
  };
}

function StatusBar(props: { companyName: string; daemonRunning: boolean }): React.JSX.Element {
  const { companyName, daemonRunning } = props;
  return (
    <div
      style={{
        borderBottom: '1px solid #243148',
        padding: '12px 14px',
        background: '#0c1322',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
        <span
          aria-label={daemonRunning ? 'daemon running' : 'daemon stopped'}
          style={{
            width: 9,
            height: 9,
            borderRadius: '50%',
            backgroundColor: daemonRunning ? GREEN_DOT : '#ef4444',
            boxShadow: daemonRunning ? '0 0 8px rgba(34, 197, 94, 0.45)' : 'none',
          }}
        />
        <span style={{ fontSize: 12, color: '#9ba7be', letterSpacing: 0.4 }}>
          {daemonRunning ? 'Daemon running' : 'Daemon stopped'}
        </span>
      </div>
      <div style={{ fontWeight: 600, fontSize: 14 }}>{companyName}</div>
    </div>
  );
}

function EmptyState(props: { text: string }): React.JSX.Element {
  return <div style={{ color: '#8f9bb1', fontSize: 12 }}>{props.text}</div>;
}

function Section(props: { title: string; children: React.ReactNode; red?: boolean }): React.JSX.Element {
  return (
    <section
      style={{
        marginBottom: 10,
        border: '1px solid #273246',
        borderRadius: 10,
        padding: 10,
        background: props.red ? '#3b141a' : '#101a2c',
      }}
    >
      <h3 style={{ margin: '0 0 8px 0', fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.6 }}>
        {props.title}
      </h3>
      {props.children}
    </section>
  );
}

export default function PipelineColumn({
  activeSession,
  onJobClick,
  onWatchClick,
}: PipelineColumnProps): React.JSX.Element {
  const [pipeline, setPipeline] = useState<PipelineViewData>(PLACEHOLDER_PIPELINE);
  const [hasLiveUpdate, setHasLiveUpdate] = useState(false);
  const [isCompletedOpen, setIsCompletedOpen] = useState(false); // collapsed by default

  useEffect(() => {
    const bridge = (window as WindowWithZazig).zazig;
    if (!bridge?.onPipelineUpdate) {
      return undefined;
    }

    const unsubscribe = bridge.onPipelineUpdate((payload: unknown) => {
      setPipeline(parsePipelinePayload(payload));
      setHasLiveUpdate(true);
    });

    return () => {
      if (typeof unsubscribe === 'function') {
        unsubscribe();
      }
    };
  }, []);

  const completedItems = useMemo(() => pipeline.recentlyCompleted.slice(0, 5), [pipeline.recentlyCompleted]);

  return (
    <aside
      style={{
        width: SIDEBAR_WIDTH,
        flex: `0 0 ${SIDEBAR_WIDTH}px`,
        height: '100vh',
        display: 'flex',
        flexDirection: 'column',
        background: '#0a1220',
        color: '#e4ebff',
        borderRight: '1px solid #22314b',
      }}
    >
      <StatusBar companyName={pipeline.companyName} daemonRunning={pipeline.daemonRunning} />

      <div style={{ padding: 10, overflowY: 'auto', flex: 1 }}>
        <Section title="Active Jobs">
          {pipeline.activeJobs.length === 0 ? (
            <EmptyState text="No active jobs." />
          ) : (
            <div style={{ display: 'grid', gap: 8 }}>
              {pipeline.activeJobs.map((job) => {
                const isActive = Boolean(activeSession && job.sessionName && activeSession === job.sessionName);

                return (
                  <div
                    key={job.id}
                    role="button"
                    tabIndex={0}
                    aria-pressed={isActive}
                    onClick={() => onJobClick(job)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        onJobClick(job);
                      }
                    }}
                    style={{
                      border: isActive ? '1px solid #60a5fa' : '1px solid #2a3852',
                      borderRadius: 8,
                      padding: 8,
                      background: isActive ? '#132847' : '#0d1728',
                      boxShadow: isActive ? 'inset 0 0 0 1px rgba(96, 165, 250, 0.45)' : 'none',
                      cursor: 'pointer',
                    }}
                  >
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <span
                        title={job.hasLocalSession ? 'tmux session running locally' : 'no local tmux session'}
                        style={{
                          width: 8,
                          height: 8,
                          minWidth: 8,
                          borderRadius: '50%',
                          background: job.hasLocalSession ? GREEN_DOT : GREY_DOT,
                        }}
                      />
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div
                          style={{
                            fontSize: 13,
                            fontWeight: 600,
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                          }}
                        >
                          {job.title}
                        </div>
                        <div
                          style={{
                            fontSize: 11,
                            color: '#94a2bc',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                          }}
                        >
                          {job.featureName}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          onWatchClick(job);
                        }}
                        style={{
                          border: '1px solid #35507a',
                          borderRadius: 6,
                          background: '#132746',
                          color: '#d9e8ff',
                          fontSize: 11,
                          fontWeight: 600,
                          padding: '4px 8px',
                          cursor: 'pointer',
                        }}
                      >
                        Watch
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Section>

        <Section title="Failed Features" red>
          {pipeline.failedFeatures.length === 0 ? (
            <EmptyState text="No failed features." />
          ) : (
            <ul style={{ margin: 0, paddingLeft: 16, color: '#fecaca', fontSize: 12 }}>
              {pipeline.failedFeatures.map((feature) => (
                <li key={feature} style={{ marginBottom: 4 }}>
                  {feature}
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section title="Backlog">
          {pipeline.backlogFeatures.length === 0 ? (
            <EmptyState text="No queued features." />
          ) : (
            <ul style={{ margin: 0, paddingLeft: 16, fontSize: 12 }}>
              {pipeline.backlogFeatures.map((feature) => (
                <li key={feature} style={{ marginBottom: 4 }}>
                  {feature}
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section title="Recently Completed">
          <button
            type="button"
            onClick={() => setIsCompletedOpen((open) => !open)}
            style={{
              border: '1px solid #2a3952',
              borderRadius: 6,
              background: '#121f33',
              color: '#d8e5ff',
              fontSize: 11,
              fontWeight: 600,
              padding: '4px 8px',
              cursor: 'pointer',
              marginBottom: isCompletedOpen ? 8 : 0,
            }}
          >
            {isCompletedOpen ? 'Hide' : 'Show'} last 5
          </button>
          {isCompletedOpen ? (
            completedItems.length === 0 ? (
              <EmptyState text="No completed items yet." />
            ) : (
              <ul style={{ margin: 0, paddingLeft: 16, fontSize: 12 }}>
                {completedItems.map((feature) => (
                  <li key={feature} style={{ marginBottom: 4 }}>
                    {feature}
                  </li>
                ))}
              </ul>
            )
          ) : null}
        </Section>

        {!hasLiveUpdate ? (
          <div style={{ fontSize: 11, color: '#8ea0c1', marginTop: 4 }}>
            Showing sample data until pipeline update arrives.
          </div>
        ) : null}
      </div>
    </aside>
  );
}
