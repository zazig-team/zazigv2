/**
 * Feature: Expert Session Liveness: tmux as Source of Truth
 * Tests for: ExpertSessionManager — uses 'run' status, never writes completed/running
 *
 * AC5: Starting a new expert session transitions through requested, claimed, starting, run and stops
 * AC7: The DB row retains status run permanently after the session ends -- no status update on exit
 * Failure Case 3: ExpertSessionManager must NOT write completed or any post-run status to the DB
 *
 * Static analysis of packages/local-agent/src/expert-session-manager.ts
 * Written to FAIL against the current codebase; passes once the feature is built.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');
const MANAGER_PATH = 'packages/local-agent/src/expert-session-manager.ts';

function readRepoFile(relPath: string): string | null {
  const fullPath = path.join(REPO_ROOT, relPath);
  try {
    return fs.readFileSync(fullPath, 'utf-8');
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// ExpertSessionManager must set status 'run' (not 'running')
// ---------------------------------------------------------------------------

describe('ExpertSessionManager: sets status run on session launch', () => {
  let content: string | null;

  beforeAll(() => {
    content = readRepoFile(MANAGER_PATH);
  });

  it('expert-session-manager.ts file exists', () => {
    expect(content, `File not found: ${MANAGER_PATH}`).not.toBeNull();
  });

  it("sets status to 'run' when session is launched", () => {
    // Must assign 'run' as the status string somewhere (status update call)
    expect(content).toMatch(/'run'/);
  });

  it("does NOT set status to 'running' at any point", () => {
    // 'running' must no longer appear as a status value being written
    // Allow the word in comments but not as a string literal status value
    expect(content).not.toMatch(/status\s*[:=,]\s*['"`]running['"`]/);
  });
});

// ---------------------------------------------------------------------------
// ExpertSessionManager must NOT write completed status or completed_at
// ---------------------------------------------------------------------------

describe('ExpertSessionManager: does not write completed status or completed_at on exit', () => {
  let content: string | null;

  beforeAll(() => {
    content = readRepoFile(MANAGER_PATH);
  });

  it("does NOT set status to 'completed'", () => {
    // The word completed must not appear as a written status value
    expect(content).not.toMatch(/status\s*[:=,]\s*['"`]completed['"`]/);
  });

  it('does NOT write completed_at to the DB', () => {
    // completed_at must not be used in any DB update call
    expect(content).not.toMatch(/completed_at\s*:/);
  });

  it('handleSessionExit or exit handler does NOT update DB status', () => {
    // If handleSessionExit exists, it must not contain a DB status update
    // Check that any exit handler does not write status after 'run'
    const exitBlock = content?.match(/handleSessionExit[\s\S]{0,500}/)?.[0] ?? '';
    // The exit handler must not write status = 'completed' or similar
    expect(exitBlock).not.toMatch(/status\s*[:=,]\s*['"`]completed['"`]/);
    expect(exitBlock).not.toMatch(/status\s*[:=,]\s*['"`]running['"`]/);
  });
});

// ---------------------------------------------------------------------------
// Tmux polling loop may remain but must not write status back to DB
// ---------------------------------------------------------------------------

describe('ExpertSessionManager: tmux polling loop does not write status to DB', () => {
  let content: string | null;

  beforeAll(() => {
    content = readRepoFile(MANAGER_PATH);
  });

  it('file references tmux session checking (expert- prefix)', () => {
    // The 10s polling loop should still check tmux sessions
    expect(content).toMatch(/expert-/);
  });

  it('polling loop that detects tmux exit does not call a DB status update', () => {
    // Look for the polling/interval section and confirm no .update({ status: }) after exit detection
    // The tmux check block must not contain a status update to DB for completion
    const tmuxBlock = content?.match(/setInterval[\s\S]{0,1000}|pollTmux[\s\S]{0,1000}/)?.[0] ?? '';
    expect(tmuxBlock).not.toMatch(/status\s*[:=,]\s*['"`]completed['"`]/);
  });
});

// ---------------------------------------------------------------------------
// Status transition path: requested → claimed → starting → run (terminal)
// ---------------------------------------------------------------------------

describe('ExpertSessionManager: terminal status is run (no further transitions)', () => {
  let content: string | null;

  beforeAll(() => {
    content = readRepoFile(MANAGER_PATH);
  });

  it("'run' is the final status written by ExpertSessionManager", () => {
    // The word 'run' must appear as a status assignment
    expect(content).toMatch(/'run'/);
  });

  it('no post-run status transitions are written', () => {
    // After setting 'run', no other status values should be set on the session row
    // Verify no writes to status with values other than the launch-path statuses
    const statusWrites = content?.match(/status\s*[:=,]\s*['"`]\w+['"`]/g) ?? [];
    const forbidden = statusWrites.filter(s =>
      /completed|running|done|finished|exited/.test(s)
    );
    expect(forbidden).toHaveLength(0);
  });
});
