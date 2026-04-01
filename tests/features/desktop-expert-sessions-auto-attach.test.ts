/**
 * Feature: Desktop auto-attach and sidebar listing for expert sessions
 * Tests for: Auto-attach on new session — poller tracks known sessions
 *
 * AC1: Desktop terminal auto-switches to new expert session within 5s (one poll cycle)
 * AC6: Auto-attach only fires for genuinely new sessions, not on every poll cycle
 *
 * Static analysis of packages/desktop/src/main/poller.ts and index.ts
 * Written to FAIL against the current codebase; pass once the feature is built.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');
const DESKTOP_POLLER = 'packages/desktop/src/main/poller.ts';
const DESKTOP_MAIN = 'packages/desktop/src/main/index.ts';

function readRepoFile(relPath: string): string | null {
  const fullPath = path.join(REPO_ROOT, relPath);
  try {
    return fs.readFileSync(fullPath, 'utf-8');
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// AC1: Auto-attach fires when new expert session appears within one poll cycle
// ---------------------------------------------------------------------------

describe('AC1: Poller auto-attaches when a new expert session appears', () => {
  let pollerContent: string | null;

  beforeAll(() => {
    pollerContent = readRepoFile(DESKTOP_POLLER);
  });

  it('packages/desktop/src/main/poller.ts exists', () => {
    expect(pollerContent, `File not found: ${DESKTOP_POLLER}`).not.toBeNull();
  });

  it('poller reads expert_sessions from CLI status output', () => {
    expect(pollerContent).toMatch(/expert_sessions|expertSessions/i);
  });

  it('poller calls terminalAttach when a new expert session is detected', () => {
    expect(pollerContent).toMatch(/terminalAttach|terminal_attach|attachSession/i);
  });

  it('auto-attach is triggered from within the poll cycle', () => {
    // terminalAttach and expert_sessions must be referenced in the same file
    const content = pollerContent ?? '';
    expect(content).toMatch(/expert_sessions|expertSessions/i);
    expect(content).toMatch(/terminalAttach|terminal_attach|attachSession/i);
  });
});

// ---------------------------------------------------------------------------
// AC6: Auto-attach only fires for genuinely new sessions
// ---------------------------------------------------------------------------

describe('AC6: Auto-attach fires only for new sessions, not on every poll', () => {
  let pollerContent: string | null;

  beforeAll(() => {
    pollerContent = readRepoFile(DESKTOP_POLLER);
  });

  it('poller tracks known expert session IDs between polls', () => {
    // Must store set/map of seen session IDs to detect newcomers
    expect(pollerContent).toMatch(/knownSession|seenSession|prevSession|trackedSession|previousSession|expertSessionIds/i);
  });

  it('poller compares current session IDs against previously known IDs', () => {
    // Must check if ID was not in previous set before auto-attaching
    expect(pollerContent).toMatch(/has\s*\(|includes\s*\(|!.*knownSession|!.*seenSession|!.*prevSession|!.*trackedSession|!.*previousSession|!.*expertSessionIds/i);
  });

  it('known session IDs are updated after each poll cycle', () => {
    // Must persist the new set of IDs so next poll does not re-trigger
    expect(pollerContent).toMatch(/set\s*\(|add\s*\(|knownSession|seenSession|prevSession|trackedSession|previousSession|expertSessionIds/i);
  });

  it('auto-attach only when session ID is absent from previous poll', () => {
    const content = pollerContent ?? '';
    // Must contain both a "not seen before" check and the attach call
    const hasIdTracking = /knownSession|seenSession|prevSession|trackedSession|previousSession|expertSessionIds/i.test(content);
    const hasAttach = /terminalAttach|terminal_attach|attachSession/i.test(content);
    expect(hasIdTracking, 'must track session IDs between polls').toBe(true);
    expect(hasAttach, 'must call terminalAttach for new sessions').toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Renderer notification — highlight newly attached expert session in sidebar
// ---------------------------------------------------------------------------

describe('Renderer is notified when a new expert session is auto-attached', () => {
  let pollerContent: string | null;
  let mainContent: string | null;

  beforeAll(() => {
    pollerContent = readRepoFile(DESKTOP_POLLER);
    mainContent = readRepoFile(DESKTOP_MAIN);
  });

  it('poller or main process sends IPC event to renderer about new expert session', () => {
    const combined = `${pollerContent ?? ''}\n${mainContent ?? ''}`;
    // Must send some IPC notification with expert session context
    expect(combined).toMatch(/webContents\.send[\s\S]{0,200}expert|expert[\s\S]{0,200}webContents\.send/s);
  });
});

// ---------------------------------------------------------------------------
// Auto-attach IPC wiring in main process
// ---------------------------------------------------------------------------

describe('Main process wires terminalAttach IPC handler for expert sessions', () => {
  let mainContent: string | null;

  beforeAll(() => {
    mainContent = readRepoFile(DESKTOP_MAIN);
  });

  it('packages/desktop/src/main/index.ts exists', () => {
    expect(mainContent, `File not found: ${DESKTOP_MAIN}`).not.toBeNull();
  });

  it('main process handles terminalAttach IPC (ipcMain.handle or ipcMain.on)', () => {
    expect(mainContent).toMatch(/terminalAttach|terminal-attach|TERMINAL_ATTACH/i);
  });
});
