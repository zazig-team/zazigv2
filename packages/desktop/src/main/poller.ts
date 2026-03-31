import { BrowserWindow } from 'electron';

import { runCLI } from './cli';
import { PIPELINE_UPDATE } from './ipc-channels';

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
    const [status, standup] = await Promise.all([runCLI(['status']), runCLI(['standup'])]);

    if (status === null && standup === null) {
      return;
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
