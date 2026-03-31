import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'path';

import { runCLI } from './cli';
import {
  TERMINAL_ATTACH,
  TERMINAL_DETACH,
  TERMINAL_INPUT,
  TERMINAL_RESIZE,
} from './ipc-channels';
import { startPipelinePoller, stopPipelinePoller } from './poller';
import * as pty from './pty';

function hasCpoSession(statusPayload: unknown): boolean {
  if (!statusPayload || typeof statusPayload !== 'object') return false;

  const status = statusPayload as { local_sessions?: unknown };
  const sessions = status.local_sessions;
  if (!Array.isArray(sessions)) return false;

  return sessions.some((entry) => {
    if (typeof entry === 'string') {
      return entry.toLowerCase().includes('cpo');
    }

    if (!entry || typeof entry !== 'object') {
      return false;
    }

    const maybeSession = entry as { session?: unknown; name?: unknown; id?: unknown };
    return [maybeSession.session, maybeSession.name, maybeSession.id].some((value) =>
      typeof value === 'string' ? value.toLowerCase().includes('cpo') : false,
    );
  });
}

async function attachDefaultSession(): Promise<void> {
  const status = await runCLI(['status', '--json']);

  if (hasCpoSession(status)) {
    pty.attach('cpo');
    return;
  }

  pty.sendSyntheticTerminalMessage('No active agents — run `zazig start` to begin\r\n');
}

function registerTerminalIpcHandlers(): void {
  ipcMain.handle(TERMINAL_ATTACH, (_event, session: string) => pty.attach(session));
  ipcMain.handle(TERMINAL_DETACH, () => pty.detach());
  ipcMain.on(TERMINAL_INPUT, (_event, data: string) => pty.write(data));
  ipcMain.on(TERMINAL_RESIZE, (_event, { cols, rows }: { cols: number; rows: number }) => {
    pty.resize(cols, rows);
  });
}

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  win.loadFile(path.join(__dirname, 'index.html'));
  return win;
}

app.whenReady().then(() => {
  registerTerminalIpcHandlers();
  const win = createWindow();
  startPipelinePoller();
  win.webContents.once('did-finish-load', () => {
    void attachDefaultSession();
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('will-quit', () => {
  pty.detach();
  stopPipelinePoller();
});
