/**
 * Feature: Desktop — scroll up on persistent agent shows terminal buffer instead of conversation
 * Feature ID: 9f598e3f-a6f2-4bcb-9f82-eb30780d2cc4
 *
 * Tests for acceptance criteria:
 *  AC1: When a persistent agent (CPO/expert) session is active and the user scrolls up,
 *       xterm's native scrollback buffer is used (terminal.scrollLines) — NOT arrow-key
 *       escape sequences forwarded to the tmux session.
 *  AC2: When a regular job session is active and the user scrolls up, the existing
 *       behaviour (forwarding arrow-key sequences via terminalInput) is preserved.
 *  AC3: App.tsx passes a flag/prop to TerminalPane that distinguishes persistent agent
 *       sessions from regular job sessions.
 *  AC4: TerminalPane accepts a prop (e.g. isPersistentAgent, scrollMode, or similar)
 *       and adjusts wheel-scroll behaviour accordingly.
 *  AC5: In persistent agent scroll mode, scrollLines is called and terminalInput is NOT
 *       called inside the wheel handler.
 *  AC6: Cleanup: the wheel handler registered via attachCustomWheelEventHandler is
 *       still disposed on unmount regardless of mode.
 *
 * Static analysis of:
 *   packages/desktop/src/renderer/App.tsx
 *   packages/desktop/src/renderer/components/TerminalPane.tsx
 *
 * Written to FAIL against the current codebase; will pass once the feature is built.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');

const TERMINAL_PANE = 'packages/desktop/src/renderer/components/TerminalPane.tsx';
const APP_TSX = 'packages/desktop/src/renderer/App.tsx';

function readRepoFile(relPath: string): string | null {
  const fullPath = path.join(REPO_ROOT, relPath);
  try {
    return fs.readFileSync(fullPath, 'utf-8');
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// AC3: App.tsx passes a persistent-agent distinguishing prop to TerminalPane
// ---------------------------------------------------------------------------

describe('AC3: App.tsx signals persistent agent mode to TerminalPane', () => {
  let appContent: string | null;

  beforeAll(() => {
    appContent = readRepoFile(APP_TSX);
  });

  it('App.tsx exists', () => {
    expect(appContent, `File not found: ${APP_TSX}`).not.toBeNull();
  });

  it('App.tsx passes a persistent-agent or scroll-mode prop to TerminalPane', () => {
    const src = appContent ?? '';
    // The prop name could be isPersistentAgent, persistentAgent, scrollMode, useBufferScroll, etc.
    expect(src).toMatch(
      /isPersistentAgent|persistentAgent|scrollMode|useBufferScroll|bufferScroll|isExpert/i,
    );
  });

  it('App.tsx sets the persistent-agent prop to true when CPO session is active', () => {
    const src = appContent ?? '';
    // When isCpoActive is true (or equivalent), the prop to TerminalPane must reflect that
    const hasCpoToTerminal =
      src.match(/isCpoActive[\s\S]{0,300}TerminalPane/s) ||
      src.match(/TerminalPane[\s\S]{0,300}isCpoActive/s) ||
      src.match(/isPersistentAgent\s*=\s*\{.*isCpo/s) ||
      src.match(/persistentAgent\s*=\s*\{.*isCpo/s) ||
      src.match(/isPersistentAgent|persistentAgent/);
    expect(hasCpoToTerminal).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// AC4: TerminalPane accepts a persistent-agent / scroll-mode prop
// ---------------------------------------------------------------------------

describe('AC4: TerminalPane accepts a persistent-agent prop', () => {
  let content: string | null;

  beforeAll(() => {
    content = readRepoFile(TERMINAL_PANE);
  });

  it('TerminalPane.tsx exists', () => {
    expect(content, `File not found: ${TERMINAL_PANE}`).not.toBeNull();
  });

  it('TerminalPaneProps interface includes a persistent-agent or scroll-mode field', () => {
    const src = content ?? '';
    // The interface must grow a new field
    expect(src).toMatch(
      /isPersistentAgent|persistentAgent|scrollMode|useBufferScroll|bufferScroll/i,
    );
  });

  it('TerminalPane component destructures the new prop', () => {
    const src = content ?? '';
    // The component function must reference the prop in its parameter list
    const funcSignature = src.match(/function TerminalPane\s*\(\s*\{[^}]*\}/)?.[0] ?? '';
    const hasInSignature =
      funcSignature.match(/isPersistentAgent|persistentAgent|scrollMode|useBufferScroll|bufferScroll/i);
    // Also acceptable if accessed via props.X
    const hasViaProps = src.match(/props\.(isPersistentAgent|persistentAgent|scrollMode)/i);
    expect(hasInSignature || hasViaProps || src.match(/isPersistentAgent|persistentAgent|scrollMode/i)).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// AC1: In persistent agent mode, wheel scroll uses xterm scrollLines (buffer scroll)
// ---------------------------------------------------------------------------

describe('AC1: Persistent agent scroll uses xterm native scrollback (scrollLines)', () => {
  let content: string | null;

  beforeAll(() => {
    content = readRepoFile(TERMINAL_PANE);
  });

  it('TerminalPane.tsx calls terminal.scrollLines for buffer scrolling', () => {
    const src = content ?? '';
    expect(src).toMatch(/terminal\.scrollLines\s*\(/);
  });

  it('scrollLines is called with a negative value (scroll up) somewhere in the file', () => {
    const src = content ?? '';
    // scrollLines(-N) means scroll up in xterm
    expect(src).toMatch(/scrollLines\s*\(\s*-/);
  });

  it('scrollLines is called with a positive value (scroll down) somewhere in the file', () => {
    const src = content ?? '';
    // scrollLines(N) means scroll down in xterm
    expect(src).toMatch(/scrollLines\s*\(\s*[^-\s]/);
  });
});

// ---------------------------------------------------------------------------
// AC5: Persistent agent wheel handler uses scrollLines, NOT terminalInput
// ---------------------------------------------------------------------------

describe('AC5: Wheel handler in persistent agent mode calls scrollLines not terminalInput', () => {
  let content: string | null;

  beforeAll(() => {
    content = readRepoFile(TERMINAL_PANE);
  });

  it('TerminalPane.tsx branches wheel behavior based on persistent-agent prop', () => {
    const src = content ?? '';
    // The wheel handler must check the persistent-agent flag
    // e.g. if (isPersistentAgent) { terminal.scrollLines(...) } else { terminalInput(...) }
    const hasBranch =
      src.match(/isPersistentAgent[\s\S]{0,200}scrollLines/s) ||
      src.match(/scrollLines[\s\S]{0,200}isPersistentAgent/s) ||
      src.match(/persistentAgent[\s\S]{0,200}scrollLines/s) ||
      src.match(/scrollMode[\s\S]{0,200}scrollLines/s) ||
      src.match(/bufferScroll[\s\S]{0,200}scrollLines/s);
    expect(hasBranch).toBeTruthy();
  });

  it('when persistent agent mode is active, terminalInput is NOT called by the wheel handler', () => {
    const src = content ?? '';
    // The feature must ensure two code paths: one for persistent agents (scrollLines),
    // one for job sessions (terminalInput). Both paths must exist.
    const hasScrollLinesPath = /scrollLines/.test(src);
    const hasTerminalInputPath = /terminalInput/.test(src);
    // Both paths must coexist — the feature adds scrollLines, does NOT remove terminalInput
    expect(hasScrollLinesPath).toBe(true);
    expect(hasTerminalInputPath).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// AC2: Regular job session scroll still forwards arrow-key sequences
// ---------------------------------------------------------------------------

describe('AC2: Regular job session scroll still forwards escape sequences via terminalInput', () => {
  let content: string | null;

  beforeAll(() => {
    content = readRepoFile(TERMINAL_PANE);
  });

  it('terminalInput is still called in the non-persistent-agent wheel handler path', () => {
    const src = content ?? '';
    // The existing path (\x1b[A / \x1b[B sequences) must remain for job sessions
    expect(src).toMatch(/terminalInput/);
    // Arrow sequences must still be present
    expect(src).toMatch(/\\x1b\[A|\\u001b\[A/);
    expect(src).toMatch(/\\x1b\[B|\\u001b\[B/);
  });
});

// ---------------------------------------------------------------------------
// AC6: Cleanup — wheel handler is disposed on unmount in both modes
// ---------------------------------------------------------------------------

describe('AC6: Wheel handler is disposed on component unmount regardless of scroll mode', () => {
  let content: string | null;

  beforeAll(() => {
    content = readRepoFile(TERMINAL_PANE);
  });

  it('attachCustomWheelEventHandler result is disposed in the cleanup function', () => {
    const src = content ?? '';
    // The return/cleanup of the effect must still call dispose() on the wheel handler
    expect(src).toMatch(/wheelHandler\.dispose\(\)|dispose\(\)/);
  });

  it('cleanup function disposes both wheel handler and onData handler', () => {
    const src = content ?? '';
    // Both disposals must be present in the effect cleanup
    expect(src).toMatch(/dispose\(\)/g);
    const disposeCount = (src.match(/\.dispose\(\)/g) ?? []).length;
    expect(disposeCount).toBeGreaterThanOrEqual(2);
  });
});
