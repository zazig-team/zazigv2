/**
 * Feature: Desktop — terminal scroll prints escape characters instead of scrolling
 *
 * Tests for acceptance criteria:
 *  AC1: Scroll up with mouse wheel in job terminal — scrolls up, no escape chars printed
 *  AC2: Scroll down with mouse wheel — scrolls back down, no escape chars printed
 *  AC3: Wheel scrolling works in both tmux and non-tmux sessions
 *  AC4: Keyboard input still works after scrolling
 *  AC5: No raw escape sequences appear during any mouse interaction
 *
 * Root cause: TerminalPane.tsx had a dead `mouseEvents` hack that wrote to a
 * non-existent xterm.js property. No wheel event forwarding was configured so
 * tmux mouse-mode escape sequences were printed as literal text.
 *
 * Fix: Remove dead hack; add `terminal.attachCustomWheelEventHandler` that
 * converts browser wheel events to arrow-up/down escape sequences sent via
 * `window.zazig.terminalInput()`.
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
// AC5: Dead mouseEvents hack removed — no raw escape sequences from mouse
// ---------------------------------------------------------------------------

describe('AC5: Dead mouseEvents hack is removed from TerminalPane', () => {
  let content: string | null;

  beforeAll(() => {
    content = readRepoFile(TERMINAL_PANE);
  });

  it('TerminalPane.tsx exists', () => {
    expect(content, `File not found: ${TERMINAL_PANE}`).not.toBeNull();
  });

  it('does not write to a non-existent mouseEvents property on terminal.options', () => {
    // The old hack: (terminal.options as unknown as { mouseEvents?: boolean }).mouseEvents = ...
    expect(content).not.toMatch(/\.mouseEvents\s*=/);
  });

  it('does not set mouseModeEnabled via the dead options hack', () => {
    expect(content).not.toMatch(/mouseModeEnabled/);
  });

  it('does not cast terminal.options to inject mouseEvents', () => {
    // Specifically the pattern: { mouseEvents?: boolean }
    expect(content).not.toMatch(/mouseEvents\?\s*:\s*boolean/);
  });
});

// ---------------------------------------------------------------------------
// AC1 & AC2: Wheel events are intercepted and converted to scroll sequences
// ---------------------------------------------------------------------------

describe('AC1/AC2: attachCustomWheelEventHandler intercepts scroll events', () => {
  let content: string | null;

  beforeAll(() => {
    content = readRepoFile(TERMINAL_PANE);
  });

  it('calls terminal.attachCustomWheelEventHandler', () => {
    expect(content).toMatch(/attachCustomWheelEventHandler/);
  });

  it('sends arrow-up escape sequence on wheel scroll up', () => {
    // Arrow up: \x1b[A  OR  ESC[A
    expect(content).toMatch(/\\x1b\[A|\\u001b\[A|ESC\[A/i);
  });

  it('sends arrow-down escape sequence on wheel scroll down', () => {
    // Arrow down: \x1b[B  OR  ESC[B
    expect(content).toMatch(/\\x1b\[B|\\u001b\[B|ESC\[B/i);
  });

  it('forwards wheel-derived input via window.zazig.terminalInput()', () => {
    // The wheel handler must route through terminalInput, not terminal.write
    expect(content).toMatch(/zazig\.terminalInput\s*\(/);
  });

  it('wheel handler returns true to suppress default browser scrolling', () => {
    // attachCustomWheelEventHandler callback must return true to consume the event
    expect(content).toMatch(/return\s+true/);
  });
});

// ---------------------------------------------------------------------------
// AC3: Works in both tmux and non-tmux sessions (handler is always attached)
// ---------------------------------------------------------------------------

describe('AC3: Wheel handler is unconditionally attached (works in tmux and non-tmux)', () => {
  let content: string | null;

  beforeAll(() => {
    content = readRepoFile(TERMINAL_PANE);
  });

  it('attachCustomWheelEventHandler is called without a tmux-specific condition guard', () => {
    // The handler must not be gated on a tmux variable
    // It should appear in the effect body, not inside an if (isTmux) block
    const handlerIdx = content?.indexOf('attachCustomWheelEventHandler') ?? -1;
    expect(handlerIdx).toBeGreaterThan(-1);

    // Check there is no tmux boolean check immediately wrapping the call
    const surroundingCode = content?.slice(
      Math.max(0, handlerIdx - 200),
      handlerIdx + 50,
    ) ?? '';
    expect(surroundingCode).not.toMatch(/if\s*\(\s*(isTmux|tmuxMode|tmuxEnabled)\s*\)/i);
  });
});

// ---------------------------------------------------------------------------
// AC4: Keyboard input still works after scrolling
// ---------------------------------------------------------------------------

describe('AC4: Keyboard onData handler is still wired up after the wheel fix', () => {
  let content: string | null;

  beforeAll(() => {
    content = readRepoFile(TERMINAL_PANE);
  });

  it('terminal.onData() handler is still present', () => {
    expect(content).toMatch(/terminal\.onData\s*\(/);
  });

  it('onData handler forwards keystrokes via window.zazig.terminalInput()', () => {
    // Verify onData still calls terminalInput — required for keyboard input
    expect(content).toMatch(/onData[\s\S]{0,300}terminalInput|terminalInput[\s\S]{0,300}onData/s);
  });

  it('onData dispose is included in cleanup / return function', () => {
    expect(content).toMatch(/onTerminalDataDispose\.dispose\(\)|\.dispose\(\)/);
  });
});

// ---------------------------------------------------------------------------
// AC5 (extended): No raw escape sequences printed from wheel events
// ---------------------------------------------------------------------------

describe('AC5 (extended): terminal.write() is not called in the wheel event handler', () => {
  let content: string | null;

  beforeAll(() => {
    content = readRepoFile(TERMINAL_PANE);
  });

  it('wheel handler body does not call terminal.write()', () => {
    // Find the attachCustomWheelEventHandler call and inspect its callback body.
    // The callback should call terminalInput, NOT terminal.write, to avoid echoing escape chars.
    const match = content?.match(
      /attachCustomWheelEventHandler\s*\(\s*\([\s\S]{0,600}?\)\s*=>\s*\{([\s\S]{0,400}?)\}/,
    );
    if (match) {
      const handlerBody = match[0];
      expect(handlerBody).not.toMatch(/terminal\.write\s*\(/);
    } else {
      // If the regex didn't capture, do a looser check: no terminal.write near the handler
      const handlerIdx = content?.indexOf('attachCustomWheelEventHandler') ?? -1;
      const nearby = content?.slice(handlerIdx, handlerIdx + 500) ?? '';
      expect(nearby).not.toMatch(/terminal\.write\s*\(/);
    }
  });
});
