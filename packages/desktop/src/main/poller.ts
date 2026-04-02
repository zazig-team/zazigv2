import { BrowserWindow } from 'electron';
import { execFile } from 'child_process';
import { promisify } from 'util';

import { runCLI } from './cli';
import { EXPERT_SESSION_AUTO_SWITCH, PIPELINE_UPDATE } from './ipc-channels';

const execFileAsync = promisify(execFile);
const POLL_INTERVAL_MS = 5000;

type PipelinePayload = {
  status: unknown;
};

type AnyRecord = Record<string, unknown>;
type ExpertSession = AnyRecord & {
  session_id: string;
};

let pollTimer: NodeJS.Timeout | null = null;
let previousSnapshot: string | null = null;
let pollInFlight = false;
let expertSessionsInitialized = false;
const knownExpertSessionIds = new Set<string>();

function isRecord(value: unknown): value is AnyRecord {
  return typeof value === 'object' && value !== null;
}

function getExpertSessions(status: AnyRecord): ExpertSession[] {
  const rawExpertSessions = status.expert_sessions ?? status.expertSessions;
  if (!Array.isArray(rawExpertSessions)) {
    return [];
  }

  const sessions: ExpertSession[] = [];
  for (const rawSession of rawExpertSessions) {
    if (!isRecord(rawSession)) continue;

    const sessionId =
      typeof rawSession.session_id === 'string'
        ? rawSession.session_id
        : typeof rawSession.sessionId === 'string'
          ? rawSession.sessionId
          : '';
    if (!sessionId) continue;

    sessions.push({
      ...rawSession,
      session_id: sessionId,
    });
  }

  return sessions;
}

function broadcastExpertSessionAutoSwitch(sessionId: string): void {
  // Broadcast 'expert-session:auto-switch' so the renderer owns attach/detach sequencing.
  for (const window of BrowserWindow.getAllWindows()) {
    if (window.isDestroyed()) continue;
    window.webContents.send(EXPERT_SESSION_AUTO_SWITCH, sessionId);
  }
}

function enrichExpertSessionsWithLiveness(
  expertSessions: ExpertSession[],
  tmuxSessions: string[],
): ExpertSession[] {
  return expertSessions.map((session) => {
    const status = typeof session.status === 'string' ? session.status : '';
    if (status !== 'run') {
      return session;
    }
    const rawId = session.session_id;
    const tmuxName = rawId.startsWith('expert-')
      ? rawId
      : `expert-${rawId.slice(0, 8)}`;
    const tmuxAlive = tmuxSessions.includes(tmuxName);
    return { ...session, tmux_alive: tmuxAlive };
  });
}

function syncExpertSessions(expertSessions: ExpertSession[]): void {
  const currentIds = new Set<string>(expertSessions.map((session) => session.session_id));

  if (!expertSessionsInitialized) {
    for (const sessionId of currentIds) {
      knownExpertSessionIds.add(sessionId);
    }
    expertSessionsInitialized = true;
    return;
  }

  for (const session of expertSessions) {
    if (!knownExpertSessionIds.has(session.session_id)) {
      broadcastExpertSessionAutoSwitch(session.session_id);
      knownExpertSessionIds.add(session.session_id);
    }
  }

  for (const knownSessionId of Array.from(knownExpertSessionIds)) {
    if (!currentIds.has(knownSessionId)) {
      knownExpertSessionIds.delete(knownSessionId);
    }
  }
}

export function resetExpertSessionTracking(): void {
  // SELECT_COMPANY is handled in main/index.ts and calls resetExpertSessionTracking().
  knownExpertSessionIds.clear();
  expertSessionsInitialized = false;
}

function broadcastPipelineUpdate(payload: PipelinePayload): void {
  for (const window of BrowserWindow.getAllWindows()) {
    if (window.isDestroyed()) continue;
    window.webContents.send(PIPELINE_UPDATE, payload);
  }
}

async function pollOnce(): Promise<void> {
  if (pollInFlight) return;

  pollInFlight = true;
  try {
    const [status, tmuxSessions] = await Promise.all([
      runCLI(['status']),
      execFileAsync('tmux', ['list-sessions', '-F', '#{session_name}'])
        .then(({ stdout }) => stdout.trim().split('\n').filter(Boolean))
        .catch(() => [] as string[]),
    ]);

    if (status === null) {
      return;
    }

    if (!isRecord(status)) {
      return;
    }

    const pipelineStatus: AnyRecord = { ...status };

    // Inject tmux session names into status so the renderer can match jobs to local sessions
    if (tmuxSessions.length > 0) {
      pipelineStatus.tmux_sessions = tmuxSessions;
    }

    const expertSessions = getExpertSessions(pipelineStatus);
    const enrichedExpertSessions = enrichExpertSessionsWithLiveness(expertSessions, tmuxSessions);
    pipelineStatus.expert_sessions = enrichedExpertSessions;
    syncExpertSessions(expertSessions);

    const payload: PipelinePayload = { status: pipelineStatus };
    const snapshot = JSON.stringify(payload);

    if (snapshot === previousSnapshot) {
      return;
    }

    previousSnapshot = snapshot;
    broadcastPipelineUpdate(payload);
  } catch (error) {
    console.error('[desktop] Pipeline poll failed', error);
  } finally {
    pollInFlight = false;
  }
}

export function startPipelinePoller(): void {
  if (pollTimer) return;

  void pollOnce();
  pollTimer = setInterval(() => {
    void pollOnce();
  }, POLL_INTERVAL_MS);
}

export function stopPipelinePoller(): void {
  if (!pollTimer) return;

  clearInterval(pollTimer);
  pollTimer = null;
  previousSnapshot = null;
  resetExpertSessionTracking();
}

export function resetPollerSnapshot(): void {
  previousSnapshot = null;
  void pollOnce();
}
