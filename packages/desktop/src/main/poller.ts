import { BrowserWindow } from 'electron';
import { execFile } from 'child_process';
import { promisify } from 'util';

import { runCLI } from './cli';
import { PIPELINE_UPDATE } from './ipc-channels';

const execFileAsync = promisify(execFile);
const POLL_INTERVAL_MS = 5_000;

type PipelinePayload = {
  status: unknown;
  standup: unknown;
};

let pollTimer: NodeJS.Timeout | null = null;
let previousSnapshot: string | null = null;
let pollInFlight = false;

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
    const [status, standup, tmuxSessions] = await Promise.all([
      runCLI(['status']),
      runCLI(['standup']),
      execFileAsync('tmux', ['list-sessions', '-F', '#{session_name}'])
        .then(({ stdout }) => stdout.trim().split('\n').filter(Boolean))
        .catch(() => [] as string[]),
    ]);

    if (status === null && standup === null) {
      return;
    }

    // Inject tmux session names into status so the renderer can match jobs to local sessions
    if (status && typeof status === 'object' && tmuxSessions.length > 0) {
      (status as Record<string, unknown>).tmux_sessions = tmuxSessions;
    }

    const payload: PipelinePayload = { status, standup };
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
}

export function resetPollerSnapshot(): void {
  previousSnapshot = null;
  void pollOnce();
}
