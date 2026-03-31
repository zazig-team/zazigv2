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

function hasCpoRunning(statusPayload: unknown): boolean {
  if (!statusPayload || typeof statusPayload !== 'object') return false;
  const status = statusPayload as { persistent_agents?: unknown[] };
  if (!Array.isArray(status.persistent_agents)) return false;
  return status.persistent_agents.some((agent) => {
    if (!agent || typeof agent !== 'object') return false;
    const a = agent as { role?: string; status?: string };
    return a.role === 'cpo' && a.status === 'running';
  });
}

async function findCpoTmuxSession(): Promise<string | null> {
  const { execFile } = await import('child_process');
  const { promisify } = await import('util');
  const execFileAsync = promisify(execFile);
  try {
    const { stdout } = await execFileAsync('tmux', ['list-sessions', '-F', '#{session_name}']);
    const sessions = stdout.trim().split('\n');
    return sessions.find((s) => s.endsWith('-cpo')) ?? null;
  } catch {
    return null;
  }
}

async function attachDefaultSession(): Promise<void> {
  const status = await runCLI(['status']);

  if (hasCpoRunning(status)) {
    const tmuxSession = await findCpoTmuxSession();
    if (tmuxSession) {
      pty.attach(tmuxSession);
      return;
    }
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

  if (prefs.selectedCompanyId && companies.some((c) => c.id === prefs.selectedCompanyId)) {
    selectedId = prefs.selectedCompanyId;
  } else if (companies.length > 0) {
    selectedId = companies[0].id;
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
  win.webContents.once('did-finish-load', async () => {
    await initCompanies();
    startPipelinePoller();
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
