/**
 * Feature: Desktop Expert Session Auto-Switch and Sidebar State Sync
 * Feature ID: 5b40e4e1-fa75-439e-b185-141764a66be1
 *
 * Acceptance Criteria:
 * AC1: Starting a new expert session auto-switches terminal AND updates sidebar highlight
 * AC2: Expert session card shows blue highlight when it is the active session
 * AC3: Clicking an expert session card switches terminal and updates activeSession state
 * AC4: Rapid switching between agents, jobs, and expert sessions does not race or corrupt state
 * AC5: Switching companies resets expert session tracking — no false auto-switches
 * AC6: Manual session switches after an auto-switch work correctly (correct session is detached)
 *
 * Failure Cases:
 * FC1: Must NOT call pty.attach() directly from poller.ts — must route through IPC + transition queue
 * FC2: Must NOT leave activeSession stale after an auto-switch
 * FC3: Must NOT auto-switch to expert sessions from a previous company after company switch
 *
 * Static analysis of:
 *   - packages/desktop/src/main/poller.ts
 *   - packages/desktop/src/renderer/App.tsx
 *   - packages/desktop/src/renderer/components/PipelineColumn.tsx
 *
 * Written to FAIL against the current codebase; passes once the feature is built.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');

const POLLER_PATH = 'packages/desktop/src/main/poller.ts';
const APP_TSX_PATH = 'packages/desktop/src/renderer/App.tsx';
const PIPELINE_COLUMN_PATH = 'packages/desktop/src/renderer/components/PipelineColumn.tsx';

function readRepoFile(relPath: string): string | null {
  const fullPath = path.join(REPO_ROOT, relPath);
  try {
    return fs.readFileSync(fullPath, 'utf-8');
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// FC1/AC1: poller.ts must broadcast IPC event, NOT call pty.attach() directly
// ---------------------------------------------------------------------------

describe('poller.ts: syncExpertSessions routes through IPC, not direct pty.attach()', () => {
  let content: string | null;

  beforeAll(() => {
    content = readRepoFile(POLLER_PATH);
  });

  it('poller.ts file exists', () => {
    expect(content, `File not found: ${POLLER_PATH}`).not.toBeNull();
  });

  it('syncExpertSessions function is defined in poller.ts', () => {
    expect(content).toMatch(/syncExpertSessions/);
  });

  it('poller.ts broadcasts expert-session:auto-switch IPC event on new session', () => {
    // Must emit/send an IPC event like 'expert-session:auto-switch'
    expect(content).toMatch(/expert-session[:\-]auto-?switch|expert_session[:\-]auto_?switch/);
  });

  it('poller.ts does NOT call pty.attach() directly inside syncExpertSessions (FC1)', () => {
    // Find syncExpertSessions function body and verify no direct pty.attach() call
    const syncIdx = content!.indexOf('syncExpertSessions');
    expect(syncIdx, 'syncExpertSessions must exist in poller.ts').toBeGreaterThan(-1);

    // Extract from syncExpertSessions to end of file (rough extraction)
    const afterSync = content!.slice(syncIdx);

    // pty.attach() must not be called directly in the expert session sync path
    // It should instead broadcast an IPC event
    expect(afterSync).not.toMatch(/pty\s*\.\s*attach\s*\(/);
  });

  it('poller.ts sends session ID with the IPC auto-switch event', () => {
    // The IPC event must carry the session ID so App.tsx can route correctly
    // Look for sessionId or session_id being passed with the event
    expect(content).toMatch(/expert-session[:\-]auto-?switch|expert_session[:\-]auto_?switch/);
    // And the broadcast must include a session identifier
    expect(content).toMatch(/sessionId|session_id|tmuxSession|tmux_session/);
  });
});

// ---------------------------------------------------------------------------
// AC5/FC3: poller.ts resets expert session tracking on company switch
// ---------------------------------------------------------------------------

describe('poller.ts: resetExpertSessionTracking called on SELECT_COMPANY', () => {
  let content: string | null;

  beforeAll(() => {
    content = readRepoFile(POLLER_PATH);
  });

  it('resetExpertSessionTracking function is defined in poller.ts', () => {
    expect(content).toMatch(/resetExpertSessionTracking/);
  });

  it('resetExpertSessionTracking is called when SELECT_COMPANY IPC is received', () => {
    // Must reset tracking on company switch to prevent stale session IDs
    // from triggering false auto-switches to the previous company's sessions (FC3)
    const selectCompanyIdx = content!.indexOf('SELECT_COMPANY');
    expect(selectCompanyIdx, 'SELECT_COMPANY handler must exist in poller.ts').toBeGreaterThan(-1);

    // After SELECT_COMPANY, resetExpertSessionTracking must be called
    const afterSelectCompany = content!.slice(selectCompanyIdx, selectCompanyIdx + 500);
    expect(afterSelectCompany).toMatch(/resetExpertSessionTracking/);
  });

  it('poller.ts does NOT rely solely on poller stop to reset expert tracking (AC5)', () => {
    // resetExpertSessionTracking must be called at least in the SELECT_COMPANY path,
    // not only in a stop/cleanup path
    const stopIdx = content!.indexOf('stop(');
    const selectCompanyIdx = content!.indexOf('SELECT_COMPANY');

    // Both should exist but SELECT_COMPANY must also trigger the reset
    expect(selectCompanyIdx).toBeGreaterThan(-1);

    // Verify that the reset appears in the SELECT_COMPANY handler context
    const selectCompanySection = content!.slice(
      selectCompanyIdx,
      Math.min(selectCompanyIdx + 1000, content!.length)
    );
    expect(selectCompanySection).toMatch(/resetExpertSessionTracking/);
  });
});

// ---------------------------------------------------------------------------
// AC1/FC2: App.tsx handles expert-session:auto-switch and updates activeSession
// ---------------------------------------------------------------------------

describe('App.tsx: handles expert-session:auto-switch IPC and updates activeSession state', () => {
  let content: string | null;

  beforeAll(() => {
    content = readRepoFile(APP_TSX_PATH);
  });

  it('App.tsx file exists', () => {
    expect(content, `File not found: ${APP_TSX_PATH}`).not.toBeNull();
  });

  it('App.tsx listens for expert-session:auto-switch IPC event', () => {
    expect(content).toMatch(/expert-session[:\-]auto-?switch|expert_session[:\-]auto_?switch/);
  });

  it('App.tsx routes expert auto-switch through transitionQueueRef (AC4)', () => {
    // Must use the transition queue to prevent races, same as job switching
    expect(content).toMatch(/transitionQueueRef/);

    // The expert-session auto-switch handler must enqueue through transitionQueueRef
    const switchIdx = content!.indexOf('expert-session');
    if (switchIdx > -1) {
      // Look in a wider context for transition queue usage near expert session handling
      const expertSection = content!.slice(
        Math.max(0, switchIdx - 100),
        Math.min(switchIdx + 1000, content!.length)
      );
      expect(expertSection).toMatch(/transitionQueueRef|transitionQueue/);
    }
  });

  it('App.tsx updates activeSession state when expert auto-switch fires (FC2)', () => {
    // activeSession state must be set in the auto-switch handler
    // so the sidebar highlight is updated
    expect(content).toMatch(/setActiveSession|activeSession/);

    // Must update activeSession in the context of expert session handling
    const switchIdx = content!.indexOf('expert-session');
    if (switchIdx > -1) {
      const expertSection = content!.slice(
        Math.max(0, switchIdx - 100),
        Math.min(switchIdx + 1500, content!.length)
      );
      expect(expertSection).toMatch(/setActiveSession|activeSession/);
    }
  });

  it('App.tsx updates activeSessionRef.current on expert auto-switch (AC6)', () => {
    // activeSessionRef.current must be updated so subsequent manual switches
    // know which session to detach from
    expect(content).toMatch(/activeSessionRef\s*\.\s*current/);
  });
});

// ---------------------------------------------------------------------------
// AC3: App.tsx provides onExpertClick callback that routes through transition queue
// ---------------------------------------------------------------------------

describe('App.tsx: provides onExpertClick prop that routes through transition queue', () => {
  let content: string | null;

  beforeAll(() => {
    content = readRepoFile(APP_TSX_PATH);
  });

  it('App.tsx defines an onExpertClick handler', () => {
    // Must be a dedicated callback passed as prop to PipelineColumn
    expect(content).toMatch(/onExpertClick/);
  });

  it('onExpertClick handler routes through transitionQueueRef (AC4)', () => {
    // Manual click must also use the transition queue to prevent races
    const clickIdx = content!.indexOf('onExpertClick');
    expect(clickIdx, 'onExpertClick must exist in App.tsx').toBeGreaterThan(-1);

    const clickSection = content!.slice(
      Math.max(0, clickIdx - 100),
      Math.min(clickIdx + 1000, content!.length)
    );
    expect(clickSection).toMatch(/transitionQueueRef|transitionQueue/);
  });

  it('onExpertClick updates activeSession state (AC3)', () => {
    const clickIdx = content!.indexOf('onExpertClick');
    if (clickIdx > -1) {
      const clickSection = content!.slice(
        Math.max(0, clickIdx - 100),
        Math.min(clickIdx + 1500, content!.length)
      );
      expect(clickSection).toMatch(/setActiveSession|activeSession/);
    }
  });
});

// ---------------------------------------------------------------------------
// AC2: PipelineColumn.tsx shows blue highlight based on activeSession prop
// ---------------------------------------------------------------------------

describe('PipelineColumn.tsx: expert session card shows active highlight based on activeSession', () => {
  let content: string | null;

  beforeAll(() => {
    content = readRepoFile(PIPELINE_COLUMN_PATH);
  });

  it('PipelineColumn.tsx file exists', () => {
    expect(content, `File not found: ${PIPELINE_COLUMN_PATH}`).not.toBeNull();
  });

  it('PipelineColumn accepts activeSession prop', () => {
    // Must accept activeSession as a prop to compare against expert session IDs
    expect(content).toMatch(/activeSession/);
  });

  it('expert session card compares activeSession against session ID for highlight (AC2)', () => {
    // Must compare activeSession with expert session ID, same pattern as job cards
    // Look for activeSession being used in the expert sessions rendering section
    expect(content).toMatch(/activeSession/);

    // There must be a comparison between activeSession and expert session id/sessionId
    expect(content).toMatch(
      /activeSession\s*===\s*[a-zA-Z_.]*[Ii][Dd]|[a-zA-Z_.]*[Ii][Dd]\s*===\s*activeSession/
    );
  });

  it('expert session card applies active styling class when session is active (AC2)', () => {
    // The blue highlight must be applied — look for a conditional className/style
    // in the expert sessions rendering context
    expect(content).toMatch(/expertSessions|expert_sessions/);

    // Must have some active/selected class indicator in that section
    expect(content).toMatch(/active|selected|highlight|border-blue|bg-blue/i);
  });
});

// ---------------------------------------------------------------------------
// AC3/FC1: PipelineColumn.tsx uses onExpertClick callback, not inline terminalAttach
// ---------------------------------------------------------------------------

describe('PipelineColumn.tsx: expert session click uses onExpertClick callback prop', () => {
  let content: string | null;

  beforeAll(() => {
    content = readRepoFile(PIPELINE_COLUMN_PATH);
  });

  it('PipelineColumn accepts onExpertClick callback prop', () => {
    // The inline terminalAttach call must be replaced with a callback prop
    expect(content).toMatch(/onExpertClick/);
  });

  it('expert session card onClick calls onExpertClick, not inline terminalAttach (FC1)', () => {
    // Find the expert sessions rendering section and verify it uses onExpertClick
    const expertIdx = content!.indexOf('expertSessions');
    if (expertIdx > -1) {
      // Look in a reasonable window after expertSessions for the onClick handler
      const expertSection = content!.slice(
        expertIdx,
        Math.min(expertIdx + 2000, content!.length)
      );
      // Should use onExpertClick callback
      expect(expertSection).toMatch(/onExpertClick/);
      // Should NOT call terminalAttach inline in the expert session card click handler
      // (terminalAttach may exist elsewhere for job cards, but not inline in expert card onClick)
      expect(expertSection).not.toMatch(/onClick[^}]{0,50}terminalAttach[^}]{0,50}expert/s);
    }
  });

  it('PipelineColumn does not call window.electron.terminalAttach inline for expert sessions', () => {
    // The expert session click handler must not bypass App.tsx state by calling terminalAttach directly
    const expertIdx = content!.indexOf('expertSessions');
    if (expertIdx > -1) {
      const expertSection = content!.slice(
        expertIdx,
        Math.min(expertIdx + 2000, content!.length)
      );
      // terminalAttach must not appear directly in the expert card rendering section
      expect(expertSection).not.toMatch(/window\.electron\.terminalAttach\s*\(/);
    }
  });
});

// ---------------------------------------------------------------------------
// AC4/AC6: App.tsx transition queue prevents races on rapid switching
// ---------------------------------------------------------------------------

describe('App.tsx: transition queue prevents races across all session types', () => {
  let content: string | null;

  beforeAll(() => {
    content = readRepoFile(APP_TSX_PATH);
  });

  it('App.tsx defines transitionQueueRef for serializing transitions', () => {
    expect(content).toMatch(/transitionQueueRef/);
  });

  it('all session switches (job, expert auto, expert manual) enqueue through transitionQueueRef (AC4)', () => {
    // Count transitionQueueRef usages — must appear multiple times to cover all switch paths
    const matches = content!.match(/transitionQueueRef/g);
    expect(matches, 'transitionQueueRef must be used in multiple switch paths').not.toBeNull();
    expect(matches!.length).toBeGreaterThanOrEqual(3);
  });

  it('activeSessionRef.current is updated before completing each transition (AC6)', () => {
    // activeSessionRef.current must be assigned within transition handlers
    // so that the next transition correctly detaches the previous session
    const refMatches = content!.match(/activeSessionRef\s*\.\s*current\s*=/g);
    expect(refMatches, 'activeSessionRef.current must be assigned in transition handlers').not.toBeNull();
    expect(refMatches!.length).toBeGreaterThanOrEqual(1);
  });
});
