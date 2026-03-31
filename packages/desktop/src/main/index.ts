import { app, BrowserWindow, ipcMain } from 'electron';
import fs from 'fs';
import os from 'os';
import path from 'path';

import { runCLI, setActiveCompanyId } from './cli';
import {
  COMPANIES_LOADED,
  SELECT_COMPANY,
  TERMINAL_ATTACH,
  TERMINAL_DETACH,
  TERMINAL_INPUT,
  TERMINAL_RESIZE,
} from './ipc-channels';
import { resetPollerSnapshot, startPipelinePoller, stopPipelinePoller } from './poller';
import * as pty from './pty';

interface Company {
  id: string;
  name: string;
}

interface DesktopPrefs {
  selectedCompanyId?: string;
}

const PREFS_PATH = path.join(os.homedir(), '.zazigv2', 'desktop-prefs.json');

function loadPrefs(): DesktopPrefs {
  try {
    const raw = fs.readFileSync(PREFS_PATH, 'utf8');
    return JSON.parse(raw) as DesktopPrefs;
  } catch {
    return {};
  }
}

function savePrefs(prefs: DesktopPrefs): void {
  try {
    const dir = path.dirname(PREFS_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(PREFS_PATH, JSON.stringify(prefs, null, 2), 'utf8');
  } catch (error) {
    console.error('[desktop] Failed to save prefs', error);
  }
}

function findCpoSessionName(statusPayload: unknown): string | null {
  if (!statusPayload || typeof statusPayload !== 'object') return null;

  const status = statusPayload as { local_sessions?: unknown };
  const sessions = status.local_sessions;
  if (!Array.isArray(sessions)) return null;

  for (const entry of sessions) {
    if (typeof entry === 'string' && entry.toLowerCase().includes('cpo')) {
      return entry;
    }

    if (!entry || typeof entry !== 'object') continue;

    const maybeSession = entry as { session?: string; name?: string; id?: string };
    for (const value of [maybeSession.session, maybeSession.name, maybeSession.id]) {
      if (typeof value === 'string' && value.toLowerCase().includes('cpo')) {
        return value;
      }
    }
  }

  return null;
}

async function attachDefaultSession(): Promise<void> {
  const status = await runCLI(['status', '--json']);

  const cpoSession = findCpoSessionName(status);
  if (cpoSession) {
    pty.attach(cpoSession);
    return;
  }

  const cliBin = process.env.ZAZIG_CLI_BIN || 'zazig';
  pty.sendSyntheticTerminalMessage(`No active agents — run \`${cliBin} start\` to begin\r\n`);
}

function broadcastCompaniesLoaded(payload: { companies: Company[]; selectedId: string | null }): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send(COMPANIES_LOADED, payload);
    }
  }
}

async function initCompanies(): Promise<void> {
  const result = await runCLI(['companies']);
  if (!result || typeof result !== 'object') {
    broadcastCompaniesLoaded({ companies: [], selectedId: null });
    return;
  }

  const raw = result as { companies?: unknown };
  const companies: Company[] = Array.isArray(raw.companies)
    ? (raw.companies as Company[]).filter(
        (c) => c && typeof c.id === 'string' && typeof c.name === 'string',
      )
    : [];

  const prefs = loadPrefs();
  let selectedId: string | null = null;

  if (companies.length === 1) {
    selectedId = companies[0].id;
  } else if (prefs.selectedCompanyId && companies.some((c) => c.id === prefs.selectedCompanyId)) {
    selectedId = prefs.selectedCompanyId;
  }

  if (selectedId) {
    setActiveCompanyId(selectedId);
    savePrefs({ ...prefs, selectedCompanyId: selectedId });
    resetPollerSnapshot();
  }

  broadcastCompaniesLoaded({ companies, selectedId });
}

function registerTerminalIpcHandlers(): void {
  ipcMain.handle(TERMINAL_ATTACH, (_event, session: string) => pty.attach(session));
  ipcMain.handle(TERMINAL_DETACH, () => pty.detach());
  ipcMain.on(TERMINAL_INPUT, (_event, data: string) => pty.write(data));
  ipcMain.on(TERMINAL_RESIZE, (_event, { cols, rows }: { cols: number; rows: number }) => {
    pty.resize(cols, rows);
  });
  ipcMain.on(SELECT_COMPANY, (_event, id: string) => {
    setActiveCompanyId(id);
    savePrefs({ selectedCompanyId: id });
    resetPollerSnapshot();
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
    void initCompanies();
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
