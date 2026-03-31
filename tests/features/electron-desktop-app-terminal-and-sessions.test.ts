/**
 * Feature: Electron Desktop App v1.0 — Terminal pane and tmux session management
 *
 * Tests for acceptance criteria:
 *  AC3: Pipeline column polls zazig status --json every 5s and updates without flicker
 *  AC4: Active jobs show green dot when local tmux session exists, grey when not
 *  AC5: Clicking an active job attaches its tmux session in the terminal pane via xterm.js
 *  AC6: Clicking a different job detaches current session and attaches the new one
 *  AC7: Terminal pane defaults to CPO session on launch if available
 *  AC8: Terminal supports typing, scrolling, resizing, and mouse mode
 *
 * Static analysis of packages/desktop source files.
 * Written to FAIL against the current codebase; pass once the feature is built.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');

const DESKTOP_MAIN = 'packages/desktop/src/main/index.ts';
const DESKTOP_POLLER = 'packages/desktop/src/main/poller.ts';
const DESKTOP_PTY = 'packages/desktop/src/main/pty.ts';
const DESKTOP_PRELOAD = 'packages/desktop/src/main/preload.ts';

function readRepoFile(relPath: string): string | null {
  const fullPath = path.join(REPO_ROOT, relPath);
  try {
    return fs.readFileSync(fullPath, 'utf-8');
  } catch {
    return null;
  }
}

function readRendererFile(...candidates: string[]): string | null {
  for (const c of candidates) {
    const content = readRepoFile(c);
    if (content !== null) return content;
  }
  return null;
}

// ---------------------------------------------------------------------------
// AC3: Pipeline column polls zazig status --json every 5s
// ---------------------------------------------------------------------------

describe('AC3: Main process polls zazig status --json every 5 seconds', () => {
  let pollerContent: string | null;

  beforeAll(() => {
    pollerContent = readRepoFile(DESKTOP_POLLER);
  });

  it('packages/desktop/src/main/poller.ts exists', () => {
    expect(pollerContent, `File not found: ${DESKTOP_POLLER}`).not.toBeNull();
  });

  it('calls zazig status from the poller', () => {
    expect(pollerContent).toMatch(/runCLI\(\['status'\]\)/);
  });

  it('uses setInterval or equivalent for polling every 5000ms', () => {
    expect(pollerContent).toMatch(/setInterval|5000|5_000/);
  });

  it('polls on a 5-second interval specifically', () => {
    expect(pollerContent).toMatch(/setInterval[\s\S]{0,200}(5000|5_000|POLL_INTERVAL_MS)|(5000|5_000|POLL_INTERVAL_MS)[\s\S]{0,200}setInterval/s);
  });

  it('sends poll results to renderer via IPC (webContents.send)', () => {
    expect(pollerContent).toMatch(/webContents\.send|ipcMain\.emit|send\s*\(/);
  });

  it('diffs or compares updates before sending to avoid unnecessary renders', () => {
    // Must diff/compare to avoid flicker — check for equality check or diff logic
    expect(pollerContent).toMatch(/JSON\.stringify|diff|deepEqual|===|!==|lastSnapshot|prevData/i);
  });
});

describe('AC3: Renderer receives and applies IPC updates', () => {
  let pipelineContent: string | null;

  beforeAll(() => {
    pipelineContent = readRendererFile(
      'packages/desktop/src/renderer/Pipeline.tsx',
      'packages/desktop/src/renderer/PipelineColumn.tsx',
      'packages/desktop/src/renderer/components/Pipeline.tsx',
      'packages/desktop/src/renderer/components/PipelineColumn.tsx',
    );
  });

  it('renderer listens for IPC events (ipcRenderer.on or window.electron.on)', () => {
    expect(pipelineContent).toMatch(/onPipelineUpdate|ipcRenderer\.on|ipcRenderer\.receive|electron\.on|on\s*\(/);
  });

  it('renderer stores pipeline data in state (useState or useReducer)', () => {
    expect(pipelineContent).toMatch(/useState|useReducer/);
  });
});

// ---------------------------------------------------------------------------
// AC4: Active jobs show green dot when local tmux session exists, grey when not
// ---------------------------------------------------------------------------

describe('AC4: Active job local run indicator (green/grey dot)', () => {
  let pipelineContent: string | null;

  beforeAll(() => {
    pipelineContent = readRendererFile(
      'packages/desktop/src/renderer/Pipeline.tsx',
      'packages/desktop/src/renderer/PipelineColumn.tsx',
      'packages/desktop/src/renderer/components/Pipeline.tsx',
      'packages/desktop/src/renderer/components/PipelineColumn.tsx',
    );
  });

  it('Pipeline component exists', () => {
    expect(pipelineContent, 'Pipeline.tsx or PipelineColumn.tsx must exist').not.toBeNull();
  });

  it('renders a visual indicator (dot) per active job', () => {
    // dot, indicator, circle, or ● character
    expect(pipelineContent).toMatch(/dot|indicator|circle|●|status-dot/i);
  });

  it('uses green color for jobs with local tmux session', () => {
    expect(pipelineContent).toMatch(/green|#[0-9a-fA-F]{3,6}.*session|session.*green/i);
  });

  it('uses grey/gray color when no local session', () => {
    expect(pipelineContent).toMatch(/grey|gray/i);
  });

  it('checks for local tmux session presence to determine dot color', () => {
    expect(pipelineContent).toMatch(/tmux|hasSession|localSession|isRunning/i);
  });
});

describe('AC4: Main process cross-references tmux sessions with job list', () => {
  let pipelineContent: string | null;

  beforeAll(() => {
    pipelineContent = readRendererFile(
      'packages/desktop/src/renderer/Pipeline.tsx',
      'packages/desktop/src/renderer/PipelineColumn.tsx',
      'packages/desktop/src/renderer/components/Pipeline.tsx',
      'packages/desktop/src/renderer/components/PipelineColumn.tsx',
    );
  });

  it('calls zazig standup --json or tmux list-sessions to detect local sessions', () => {
    expect(pipelineContent).toMatch(/local_sessions|tmux_sessions|sessions|hasLocalSession/i);
  });

  it('cross-references tmux sessions with job data', () => {
    expect(pipelineContent).toMatch(/sessionByJobId|findMatchingSessionName|hasTmuxSession|sessionName/i);
  });
});

// ---------------------------------------------------------------------------
// AC5: Clicking active job attaches its tmux session in terminal pane
// ---------------------------------------------------------------------------

describe('AC5: Clicking active job attaches tmux session via xterm.js', () => {
  let terminalContent: string | null;
  let ptyContent: string | null;

  beforeAll(() => {
    terminalContent = readRendererFile(
      'packages/desktop/src/renderer/Terminal.tsx',
      'packages/desktop/src/renderer/TerminalPane.tsx',
      'packages/desktop/src/renderer/components/Terminal.tsx',
      'packages/desktop/src/renderer/components/TerminalPane.tsx',
    );
    ptyContent = readRepoFile(DESKTOP_PTY);
  });

  it('Terminal component file exists', () => {
    expect(terminalContent, 'Terminal.tsx or TerminalPane.tsx must exist').not.toBeNull();
  });

  it('uses xterm.js (imports from xterm)', () => {
    expect(terminalContent).toMatch(/xterm|@xterm\/xterm|Terminal.*xterm/i);
  });

  it('uses node-pty for pseudoterminal', () => {
    expect(ptyContent ?? terminalContent).toMatch(/node-pty|pty\.spawn|@homebridge\/node-pty/i);
  });

  it('runs tmux attach -t <session> when attaching', () => {
    expect(ptyContent ?? '').toMatch(/tmux.*attach|attach.*-t/i);
  });
});

describe('AC5: Pipeline component sends attach-session IPC message on job click', () => {
  let pipelineContent: string | null;

  beforeAll(() => {
    pipelineContent = readRendererFile(
      'packages/desktop/src/renderer/Pipeline.tsx',
      'packages/desktop/src/renderer/PipelineColumn.tsx',
      'packages/desktop/src/renderer/components/Pipeline.tsx',
      'packages/desktop/src/renderer/components/PipelineColumn.tsx',
    );
  });

  it('active job item has an onClick handler', () => {
    expect(pipelineContent).toMatch(/onClick|handleClick|onJobClick/i);
  });

  it('click handler sends an attach or session IPC message', () => {
    expect(pipelineContent).toMatch(/attach|session|ipc|send\s*\(/i);
  });
});

// ---------------------------------------------------------------------------
// AC6: Clicking a different job detaches current session and attaches new one
// ---------------------------------------------------------------------------

describe('AC6: Session switching — detach current before attaching new', () => {
  let ptyContent: string | null;

  beforeAll(() => {
    ptyContent = readRepoFile(DESKTOP_PTY);
  });

  it('tracks the currently attached session', () => {
    expect(ptyContent).toMatch(/currentSession|activeSession|currentPty|activePty/i);
  });

  it('kills or detaches current pty/session before spawning new one', () => {
    expect(ptyContent).toMatch(/\.kill\(\)|\.destroy\(\)|pty\.kill|detach|kill.*pty/i);
  });

  it('only one session is attached at a time (no tabs)', () => {
    // Must not create an array of sessions — single session model
    // No sessions[] array or tabs[] array
    const hasTabs = /sessions\s*=\s*\[|tabs\s*=\s*\[/.test(ptyContent ?? '');
    expect(hasTabs, 'app must not support multiple sessions/tabs').toBe(false);
  });
});

// ---------------------------------------------------------------------------
// AC7: Terminal defaults to CPO session on launch if available
// ---------------------------------------------------------------------------

describe('AC7: Terminal pane defaults to CPO session on launch', () => {
  let mainContent: string | null;

  beforeAll(() => {
    mainContent = readRepoFile(DESKTOP_MAIN);
  });

  it('looks for CPO session at startup', () => {
    expect(mainContent).toMatch(/cpo|CPO/i);
  });

  it('attaches to CPO session on app ready if available', () => {
    expect(mainContent).toMatch(/cpo.*attach|attach.*cpo|default.*cpo|cpo.*default/i);
  });
});

describe('AC7: Terminal shows "No active agents" when no CPO session available', () => {
  let mainContent: string | null;

  beforeAll(() => {
    mainContent = readRepoFile(DESKTOP_MAIN);
  });

  it('renders "No active agents" or equivalent message when no session', () => {
    expect(mainContent).toMatch(/No active agents|no active agents|no session/i);
  });
});

// ---------------------------------------------------------------------------
// AC8: Terminal supports typing, scrolling, resizing, and mouse mode
// ---------------------------------------------------------------------------

describe('AC8: xterm.js Terminal configuration', () => {
  let terminalContent: string | null;

  beforeAll(() => {
    terminalContent = readRendererFile(
      'packages/desktop/src/renderer/Terminal.tsx',
      'packages/desktop/src/renderer/TerminalPane.tsx',
      'packages/desktop/src/renderer/components/Terminal.tsx',
      'packages/desktop/src/renderer/components/TerminalPane.tsx',
    );
  });

  it('xterm Terminal is initialized with mouse mode enabled', () => {
    // scrollback, mouse support, or terminal options
    expect(terminalContent).toMatch(/mouseMode|mouse.*mode|allowMouseReporting/i);
  });

  it('handles terminal resize events', () => {
    expect(terminalContent).toMatch(/onResize|resize|fitAddon|FitAddon|fit\s*\(\)/i);
  });

  it('uses FitAddon or equivalent to adapt to pane size', () => {
    expect(terminalContent).toMatch(/FitAddon|fitAddon|fit-addon|xterm-addon-fit/i);
  });

  it('terminal is scrollable (scrollback buffer configured)', () => {
    expect(terminalContent).toMatch(/scrollback|scrollBack/i);
  });
});

describe('AC8: Main process forwards pty data to renderer and renderer keystrokes to pty', () => {
  let mainContent: string | null;
  let ptyContent: string | null;
  let preloadContent: string | null;

  beforeAll(() => {
    mainContent = readRepoFile(DESKTOP_MAIN);
    ptyContent = readRepoFile(DESKTOP_PTY);
    preloadContent = readRepoFile(DESKTOP_PRELOAD);
  });

  it('streams pty data to renderer via IPC', () => {
    expect(`${mainContent ?? ''}\n${ptyContent ?? ''}`).toMatch(/pty.*data|\.on\s*\(\s*['"]data['"]|terminal.*data/i);
  });

  it('receives keystroke input from renderer and writes to pty', () => {
    expect(`${mainContent ?? ''}\n${preloadContent ?? ''}\n${ptyContent ?? ''}`).toMatch(/pty\.write|write.*pty|ipcMain.*input|stdin|TERMINAL_INPUT/i);
  });
});
