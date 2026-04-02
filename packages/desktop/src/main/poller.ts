import { BrowserWindow } from 'electron';
import { execFile } from 'child_process';
import { promisify } from 'util';

import { runCLI } from './cli';
import { PIPELINE_UPDATE } from './ipc-channels';
import * as pty from './pty';

const execFileAsync = promisify(execFile);
const POLL_INTERVAL_MS = 5000;

type PipelinePayload = {
  status: unknown;
};

type AnyRecord = Record<string, unknown>;
type ExpertSession = AnyRecord & {
  id: string;
  session_id: string;
  status: string;
  tmux_alive?: boolean;
  transient?: boolean;
};

let pollTimer: NodeJS.Timeout | null = null;
let previousSnapshot: string | null = null;
let pollInFlight = false;
let expertSessionsInitialized = false;
const knownExpertSessionIds = new Set<string>();

function isRecord(value: unknown): value is AnyRecord {
  return typeof value === 'object' && value !== null;
}

function getString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function getTmuxSessionNameFromExpertSession(session: AnyRecord): string {
  const explicitTmuxSession =
    getString(session.session_id) ||
    getString(session.sessionId) ||
    getString(session.tmux_session) ||
    getString(session.tmuxSession) ||
    getString(session.session_name) ||
    getString(session.sessionName);
  if (explicitTmuxSession.startsWith('expert-')) {
    return explicitTmuxSession;
  }

  const expertId =
    getString(session.id) ||
    getString(session.expert_session_id) ||
    getString(session.expertSessionId) ||
    getString(session.session_uuid) ||
    getString(session.sessionUuid) ||
    explicitTmuxSession;
  if (!expertId) {
    return '';
  }

  return `expert-${expertId.slice(0, 8)}`;
}

function getTmuxSessionNamesFromStatus(status: AnyRecord): string[] {
  const rawTmuxSessions =
    status.tmux_sessions ??
    status.tmuxSessions ??
    status.local_sessions ??
    status.localSessions;

  if (!Array.isArray(rawTmuxSessions)) {
    return [];
  }

  const tmuxSessions: string[] = [];
  for (const rawSession of rawTmuxSessions) {
    if (typeof rawSession === 'string') {
      const name = rawSession.trim();
      if (name.length > 0) tmuxSessions.push(name);
      continue;
    }

    if (!isRecord(rawSession)) continue;
    const sessionName =
      getString(rawSession.session_name) ||
      getString(rawSession.sessionName) ||
      getString(rawSession.name);
    if (sessionName.length > 0) {
      tmuxSessions.push(sessionName);
    }
  }

  return tmuxSessions;
}

function getExpertSessions(status: AnyRecord, tmuxSessionNames: Set<string>): ExpertSession[] {
  const rawExpertSessions = status.expert_sessions ?? status.expertSessions;
  if (!Array.isArray(rawExpertSessions)) {
    return [];
  }

  const sessions: ExpertSession[] = [];
  for (const rawSession of rawExpertSessions) {
    if (!isRecord(rawSession)) continue;

    const id =
      getString(rawSession.id) ||
      getString(rawSession.expert_session_id) ||
      getString(rawSession.expertSessionId) ||
      getString(rawSession.session_uuid) ||
      getString(rawSession.sessionUuid) ||
      getString(rawSession.session_id) ||
      getString(rawSession.sessionId);
    const sessionId =
      getString(rawSession.session_id) ||
      getString(rawSession.sessionId) ||
      getString(rawSession.tmux_session) ||
      getString(rawSession.tmuxSession) ||
      getString(rawSession.session_name) ||
      getString(rawSession.sessionName);
    const statusValue = getString(rawSession.status).toLowerCase();
    if (!id) continue;

    const nextSession: ExpertSession = {
      ...rawSession,
      id,
      session_id: sessionId,
      status: statusValue || getString(rawSession.status),
    };

    if (statusValue === 'run') {
      const expectedTmuxSession = getTmuxSessionNameFromExpertSession(rawSession);
      nextSession.tmux_alive = expectedTmuxSession.length > 0 && tmuxSessionNames.has(expectedTmuxSession);
    } else if (statusValue === 'requested' || statusValue === 'claimed' || statusValue === 'starting') {
      nextSession.transient = true;
    }

    sessions.push(nextSession);
  }

  return sessions;
}

function terminalAttach(session: string): void {
  try {
    pty.attach(session);
  } catch (error) {
    console.error(`[desktop] Failed to auto-attach expert session ${session}`, error);
  }
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
      terminalAttach(session.session_id);
      knownExpertSessionIds.add(session.session_id);
    }
  }

  for (const knownSessionId of Array.from(knownExpertSessionIds)) {
    if (!currentIds.has(knownSessionId)) {
      knownExpertSessionIds.delete(knownSessionId);
    }
  }
}

function resetExpertSessionTracking(): void {
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
    const statusTmuxSessions = getTmuxSessionNamesFromStatus(pipelineStatus);
    const mergedTmuxSessions = new Set<string>([...statusTmuxSessions, ...tmuxSessions]);
    pipelineStatus.tmux_sessions = Array.from(mergedTmuxSessions);

    const expertSessions = getExpertSessions(pipelineStatus, mergedTmuxSessions);
    pipelineStatus.expert_sessions = expertSessions;
    syncExpertSessions(
      expertSessions.filter((session) => session.status === 'run' && session.tmux_alive === true),
    );

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
