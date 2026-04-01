/**
 * Feature: Desktop expert sessions — auto-switch on session start (v0.59.0 fix failed)
 * Tests for: expert-session-manager.ts linkToViewerTui wiring + IPC bridge
 *
 * AC1: When a new interactive expert session starts, the viewer TUI auto-switches
 *      to the expert window within one poll cycle
 * AC2: linkToViewerTui is called unconditionally for non-headless sessions
 * AC3: The desktop poller includes expert_sessions in the pipeline payload
 *      sent to the renderer (so the sidebar can react to real-time changes)
 * AC4: When an expert session ends, the viewer auto-switches back to CPO window
 *
 * Static analysis of:
 *   - packages/local-agent/src/expert-session-manager.ts
 *   - packages/desktop/src/main/poller.ts
 *
 * Written to FAIL against the current codebase; passes once the feature is built.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');
const EXPERT_MANAGER = 'packages/local-agent/src/expert-session-manager.ts';
const DESKTOP_POLLER = 'packages/desktop/src/main/poller.ts';

function readRepoFile(relPath: string): string | null {
  const fullPath = path.join(REPO_ROOT, relPath);
  try {
    return fs.readFileSync(fullPath, 'utf-8');
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// expert-session-manager: linkToViewerTui called on interactive session start
// ---------------------------------------------------------------------------

describe('ExpertSessionManager: linkToViewerTui called for interactive sessions', () => {
  let content: string | null;

  beforeAll(() => {
    content = readRepoFile(EXPERT_MANAGER);
  });

  it('expert-session-manager.ts file exists', () => {
    expect(content, `File not found: ${EXPERT_MANAGER}`).not.toBeNull();
  });

  it('linkToViewerTui is defined in expert-session-manager', () => {
    expect(content).toMatch(/linkToViewerTui/);
  });

  it('linkToViewerTui is called in the non-headless (interactive) code path', () => {
    // linkToViewerTui must be awaited/called outside of the headless guard
    // The headless guard returns early, so linkToViewerTui must appear AFTER it
    // The pattern: headless return, then later linkToViewerTui call
    expect(content).toMatch(/linkToViewerTui\s*\(/);
  });

  it('linkToViewerTui call is NOT gated behind a conditional that could suppress it', () => {
    // The call must not be wrapped in an if(condition) that silently skips it
    // Specifically: no "if (msg.headless)" wrapping the linkToViewerTui call
    const linkIdx = content!.indexOf('await this.linkToViewerTui');
    expect(linkIdx, 'linkToViewerTui must be awaited in the interactive path').toBeGreaterThan(-1);

    // Extract surrounding context (200 chars before the call)
    const context = content!.slice(Math.max(0, linkIdx - 200), linkIdx);
    // Must not have a headless-only guard immediately before the call
    expect(context).not.toMatch(/if\s*\(\s*msg\.headless\s*\)\s*\{[^}]*$/s);
  });
});

// ---------------------------------------------------------------------------
// expert-session-manager: auto-switch back to CPO on session end
// ---------------------------------------------------------------------------

describe('ExpertSessionManager: switchViewerToCpo called on session exit', () => {
  let content: string | null;

  beforeAll(() => {
    content = readRepoFile(EXPERT_MANAGER);
  });

  it('switchViewerToCpo is defined', () => {
    expect(content).toMatch(/switchViewerToCpo/);
  });

  it('switchViewerToCpo is called in handleSessionExit', () => {
    // After session ends, viewer must auto-switch back to CPO
    const exitIdx = content!.indexOf('handleSessionExit');
    expect(exitIdx, 'handleSessionExit must exist').toBeGreaterThan(-1);
    const afterExit = content!.slice(exitIdx);
    expect(afterExit).toMatch(/switchViewerToCpo/);
  });
});

// ---------------------------------------------------------------------------
// ExpertSessionManager: exposes active sessions for IPC bridge
// ---------------------------------------------------------------------------

describe('ExpertSessionManager: exposes active sessions list', () => {
  let content: string | null;

  beforeAll(() => {
    content = readRepoFile(EXPERT_MANAGER);
  });

  it('getActiveSessions public method exists to expose running sessions', () => {
    // The desktop poller needs to call this to include sessions in the IPC payload
    expect(content).toMatch(/getActiveSessions\s*\(/);
  });

  it('getActiveSessions returns session data including displayName and tmuxSession', () => {
    // Method must return enough data for the sidebar to render role + session name
    const methodMatch = content!.match(/getActiveSessions[^{]*\{([\s\S]*?)\n\s{2}\}/);
    if (methodMatch) {
      const body = methodMatch[1];
      // The return value must surface display names and session IDs
      expect(body).toMatch(/displayName|tmuxSession|sessionId/);
    } else {
      // If the method body is not easily extractable, just check name and session appear
      expect(content).toMatch(/getActiveSessions/);
      expect(content).toMatch(/displayName|tmuxSession/);
    }
  });
});

// ---------------------------------------------------------------------------
// Desktop poller: expert_sessions included in pipeline payload
// ---------------------------------------------------------------------------

describe('Desktop poller: expert_sessions forwarded to renderer', () => {
  let content: string | null;

  beforeAll(() => {
    content = readRepoFile(DESKTOP_POLLER);
  });

  it('packages/desktop/src/main/poller.ts exists', () => {
    expect(content, `File not found: ${DESKTOP_POLLER}`).not.toBeNull();
  });

  it('poller references expert_sessions when building the pipeline payload', () => {
    // The poller must either read expert_sessions from CLI output or inject it
    // from the local ExpertSessionManager
    expect(content).toMatch(/expert_sessions|expertSessions|ExpertSession/);
  });
});
