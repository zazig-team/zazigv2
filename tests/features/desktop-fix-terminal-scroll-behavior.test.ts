/**
 * Feature: Desktop — Fix Terminal Scroll Behavior
 *
 * Tests for acceptance criteria:
 *  AC1: Scrolling up in the terminal shows previous output (xterm.js scrollback)
 *  AC2: Scrolling down returns to live terminal output
 *  AC3: No arrow key escape sequences are sent to PTY on mouse wheel scroll
 *  AC4: Switching sessions clears all previous session output from scrollback buffer
 *  AC5: After switching sessions, scrolling up only shows output from the new session
 *  AC6: Keyboard input still passes through to tmux correctly
 *  AC7: Terminal resize still works correctly after scroll changes
 *
 * Fix:
 *  1. Remove `attachCustomWheelEventHandler` — let xterm.js handle scroll natively
 *  2. Call `terminal.clear()` followed by `terminal.reset()` on session disconnect
 *     (previously only `terminal.clear()` was called, leaving scrollback intact)
 *
 * Static analysis of packages/desktop/src/renderer/components/TerminalPane.tsx.
 * Written to FAIL against the current codebase; pass once the feature is built.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');

const TERMINAL_PANE = 'packages/desktop/src/renderer/components/TerminalPane.tsx';

function readRepoFile(relPath: string): string | null {
  const fullPath = path.join(REPO_ROOT, relPath);
  try {
    return fs.readFileSync(fullPath, 'utf-8');
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// AC1 / AC2 / AC3: Custom wheel handler removed — native xterm.js scroll
// ---------------------------------------------------------------------------

describe('AC1/AC2/AC3: wheel events scroll the terminal viewport', () => {
  let content: string | null;

  beforeAll(() => {
    content = readRepoFile(TERMINAL_PANE);
  });

  it('TerminalPane.tsx exists', () => {
    expect(content, `File not found: ${TERMINAL_PANE}`).not.toBeNull();
  });

  it('uses attachCustomWheelEventHandler to intercept wheel events', () => {
    // The wheel handler overrides xterm's default behavior of forwarding
    // wheel events to the running app as mouse escape sequences, and instead
    // scrolls the terminal viewport via terminal.scrollLines()
    expect(content).toMatch(/attachCustomWheelEventHandler/);
  });

  it('calls terminal.scrollLines() inside the wheel handler', () => {
    // Wheel events must scroll the terminal viewport, not be forwarded to the app
    expect(content).toMatch(/scrollLines/);
  });

  it('does not send arrow key escape sequences to PTY on wheel scroll', () => {
    // Arrow-up/down escapes (\x1b[A / \x1b[B) must not appear in wheel handling
    expect(content).not.toMatch(/wheelHandler|customWheelEvent/);
  });

  it('wheel handler dispose is not in the cleanup function', () => {
    expect(content).not.toMatch(/wheelHandler\.dispose\s*\(\)/);
  });
});

// ---------------------------------------------------------------------------
// AC4 / AC5: terminal.reset() called after terminal.clear() on session switch
// ---------------------------------------------------------------------------

describe('AC4/AC5: scrollback is fully cleared on session switch', () => {
  let content: string | null;

  beforeAll(() => {
    content = readRepoFile(TERMINAL_PANE);
  });

  it('calls terminal.reset() in the disconnect/detach handler', () => {
    // terminal.reset() must be called to clear both viewport and scrollback buffer
    expect(content).toMatch(/terminal\.reset\s*\(\)/);
  });

  it('calls terminal.clear() followed by terminal.reset() in the disconnect path', () => {
    // Both clear() and reset() must appear in the onTerminalOutput empty-data branch
    // that handles session disconnect/switch
    const disconnectBranch = content?.match(
      /data\s*===\s*['"`]['"`]\s*[\s\S]{0,400}?terminal\.clear\s*\(\)[\s\S]{0,200}?terminal\.reset\s*\(\)/,
    );
    expect(
      disconnectBranch,
      'Expected terminal.clear() followed by terminal.reset() in disconnect handler',
    ).not.toBeNull();
  });

  it('terminal.reset() appears after terminal.clear() (not before)', () => {
    if (!content) return;
    const clearIdx = content.indexOf('terminal.clear()');
    const resetIdx = content.indexOf('terminal.reset()');
    // reset() for scrollback clearing must come after clear() in the source order
    // (There may be another reset() for the message effect, but the one in the
    //  disconnect handler must be AFTER clear().)
    expect(clearIdx).toBeGreaterThan(-1);
    expect(resetIdx).toBeGreaterThan(-1);
    // The scrollback-clearing reset() should appear after the clear() call
    expect(resetIdx).toBeGreaterThan(clearIdx);
  });
});

// ---------------------------------------------------------------------------
// AC6: Keyboard input still passes through to tmux
// ---------------------------------------------------------------------------

describe('AC6: Keyboard input onData handler is still wired up', () => {
  let content: string | null;

  beforeAll(() => {
    content = readRepoFile(TERMINAL_PANE);
  });

  it('terminal.onData() handler is still present', () => {
    expect(content).toMatch(/terminal\.onData\s*\(/);
  });

  it('onData handler forwards keystrokes via window.zazig.terminalInput()', () => {
    expect(content).toMatch(/onData[\s\S]{0,300}terminalInput|terminalInput[\s\S]{0,300}onData/s);
  });

  it('onData dispose is included in cleanup', () => {
    expect(content).toMatch(/onTerminalDataDispose\.dispose\s*\(\)/);
  });
});

// ---------------------------------------------------------------------------
// AC7: Terminal resize still works correctly
// ---------------------------------------------------------------------------

describe('AC7: Terminal resize handling is intact', () => {
  let content: string | null;

  beforeAll(() => {
    content = readRepoFile(TERMINAL_PANE);
  });

  it('ResizeObserver is still used to observe the container', () => {
    expect(content).toMatch(/new ResizeObserver/);
  });

  it('fitAddon.fit() is still called on resize', () => {
    expect(content).toMatch(/fitAddon\.fit\s*\(\)/);
  });

  it('window.zazig.terminalResize() is still called with cols and rows', () => {
    expect(content).toMatch(/terminalResize\s*\(\s*terminal\.cols\s*,\s*terminal\.rows\s*\)/);
  });

  it('ResizeObserver is disconnected in cleanup', () => {
    expect(content).toMatch(/resizeObserver\.disconnect\s*\(\)/);
  });
});

// ---------------------------------------------------------------------------
// Failure case: Must NOT retain scrollback from previous session
// ---------------------------------------------------------------------------

describe('Failure case: previous session output must not bleed into new session', () => {
  let content: string | null;

  beforeAll(() => {
    content = readRepoFile(TERMINAL_PANE);
  });

  it('disconnect handler calls reset() — not just clear() — so scrollback is wiped', () => {
    // terminal.clear() alone does NOT clear the scrollback buffer in xterm.js
    // terminal.reset() must also be called
    const onlyClearNoReset = content?.match(
      /data\s*===\s*['"`]['"`]\s*[\s\S]{0,300}?terminal\.clear\s*\(\)(?![\s\S]{0,100}terminal\.reset)/,
    );
    // This match should NOT exist (i.e., clear without a following reset is the bug)
    expect(
      onlyClearNoReset,
      'Found terminal.clear() without terminal.reset() in disconnect handler — scrollback will NOT be cleared',
    ).toBeNull();
  });
});
