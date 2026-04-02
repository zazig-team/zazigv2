/**
 * Feature: Expert Session Liveness: tmux as Source of Truth
 * Tests for: Desktop sidebar — 2-day filter, tmux liveness check, green dot / hide logic
 *
 * AC2: Desktop sidebar only shows sessions from the last 2 days
 * AC3: A run session with a live tmux window shows a green dot
 * AC4: A run session without a tmux window does not appear in the sidebar
 * AC6: Killing a tmux expert session causes it to disappear from the sidebar on next poll (within 5s)
 * Failure Case 1: Desktop must NOT show sessions older than 2 days regardless of status
 * Failure Case 2: Desktop must NOT show a green dot for a session whose tmux window has exited
 *
 * Static analysis of:
 *   packages/cli/src/commands/status.ts
 *   packages/desktop/src/main/poller.ts
 *   packages/desktop/src/renderer/components/PipelineColumn.tsx
 * Written to FAIL against the current codebase; passes once the feature is built.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');

const CLI_STATUS = 'packages/cli/src/commands/status.ts';
const POLLER = 'packages/desktop/src/main/poller.ts';
const PIPELINE_COLUMN = 'packages/desktop/src/renderer/components/PipelineColumn.tsx';

function readRepoFile(relPath: string): string | null {
  const fullPath = path.join(REPO_ROOT, relPath);
  try {
    return fs.readFileSync(fullPath, 'utf-8');
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// CLI status.ts: 2-day filter applied to expert sessions query
// ---------------------------------------------------------------------------

describe('CLI status: filters expert sessions to last 2 days', () => {
  let content: string | null;

  beforeAll(() => {
    content = readRepoFile(CLI_STATUS);
  });

  it('packages/cli/src/commands/status.ts exists', () => {
    expect(content, `File not found: ${CLI_STATUS}`).not.toBeNull();
  });

  it('status query filters expert sessions by created_at within 2 days', () => {
    // Must apply a time-based filter: created_at > now() - interval '2 days'
    // or equivalent JavaScript date arithmetic (2 * 24 * 60 * 60 * 1000 etc.)
    expect(content).toMatch(/2\s*days?|2\s*\*\s*24|172800|gte.*created_at|created_at.*gte/i);
  });

  it('status query filters by allowed statuses (requested, claimed, starting, run)', () => {
    // Must filter status to the active set — run must be included
    expect(content).toMatch(/'run'|"run"|`run`/);
    // and not include completed or running as filter values
    expect(content).not.toMatch(/status.*'completed'|status.*'running'/);
  });

  it("status query status list includes 'requested'", () => {
    expect(content).toMatch(/'requested'|"requested"/);
  });

  it("status query status list includes 'claimed'", () => {
    expect(content).toMatch(/'claimed'|"claimed"/);
  });

  it("status query status list includes 'starting'", () => {
    expect(content).toMatch(/'starting'|"starting"/);
  });
});

// ---------------------------------------------------------------------------
// Desktop poller.ts: tmux liveness check for 'run' sessions
// ---------------------------------------------------------------------------

describe('Desktop poller: checks tmux liveness for run sessions', () => {
  let content: string | null;

  beforeAll(() => {
    content = readRepoFile(POLLER);
  });

  it('packages/desktop/src/main/poller.ts exists', () => {
    expect(content, `File not found: ${POLLER}`).not.toBeNull();
  });

  it("poller checks tmux sessions for sessions with status 'run'", () => {
    // Must branch on status === 'run' and check tmux
    expect(content).toMatch(/'run'|"run"|`run`/);
  });

  it('poller uses expert-{first8chars} naming convention for tmux session names', () => {
    // Must construct session name with expert- prefix and first 8 chars of id
    expect(content).toMatch(/expert-/);
    // Must extract first 8 characters (slice(0,8) or substring(0,8))
    expect(content).toMatch(/slice\s*\(\s*0\s*,\s*8\s*\)|substring\s*\(\s*0\s*,\s*8\s*\)/);
  });

  it('poller executes a tmux has-session or ls-sessions check', () => {
    // Must call tmux has-session or list-sessions to verify liveness
    expect(content).toMatch(/has-session|list-sessions|ls-sessions/);
  });

  it('poller hides run sessions whose tmux window does not exist', () => {
    // When tmux check fails, session must be excluded from sidebar data
    expect(content).toMatch(/filter|alive|liveness|tmuxAlive|isAlive/i);
  });

  it('poller poll interval is 5 seconds or less for expert session liveness', () => {
    // The poll cycle must be short enough to detect exit within 5s
    // 5000ms or less for the expert session liveness check
    expect(content).toMatch(/[1-5]000|[1-5]\s*\*\s*1000/);
  });
});

// ---------------------------------------------------------------------------
// PipelineColumn.tsx: green dot for alive run sessions, hidden if no tmux
// ---------------------------------------------------------------------------

describe('PipelineColumn: shows green dot for alive run session, hides dead ones', () => {
  let content: string | null;

  beforeAll(() => {
    content = readRepoFile(PIPELINE_COLUMN);
  });

  it('packages/desktop/src/renderer/components/PipelineColumn.tsx exists', () => {
    expect(content, `File not found: ${PIPELINE_COLUMN}`).not.toBeNull();
  });

  it("PipelineColumn handles 'run' status for expert sessions", () => {
    expect(content).toMatch(/'run'|"run"|`run`/);
  });

  it('PipelineColumn shows a green indicator for alive run sessions', () => {
    // Must have a green color or alive state indicator
    expect(content).toMatch(/green|alive|tmuxAlive|isAlive/i);
  });

  it('PipelineColumn does NOT render run sessions that lack tmux liveness', () => {
    // Sessions without tmux must be filtered/hidden — not rendered
    // Look for a conditional or filter that excludes non-alive run sessions
    expect(content).toMatch(/alive|isAlive|tmuxAlive|filter.*run|run.*filter/i);
  });

  it('sessions in requested, claimed, starting show a spinner or pending indicator', () => {
    // Transient states must show a spinner/yellow indicator
    expect(content).toMatch(/spinner|pending|yellow|loading|starting/i);
  });

  it('failed and cancelled sessions are not shown in the sidebar', () => {
    // failed and cancelled must not be rendered (filtered out in the query or component)
    // The component should not explicitly render these status values
    const rendersFailed = content?.match(/status.*failed.*render|render.*failed.*status/i);
    expect(rendersFailed).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Desktop: sessions older than 2 days do not appear
// ---------------------------------------------------------------------------

describe('Desktop: sessions older than 2 days are excluded', () => {
  let pollerContent: string | null;
  let statusContent: string | null;

  beforeAll(() => {
    pollerContent = readRepoFile(POLLER);
    statusContent = readRepoFile(CLI_STATUS);
  });

  it('either poller or CLI status enforces the 2-day cutoff', () => {
    const combined = (pollerContent ?? '') + (statusContent ?? '');
    // Must contain a 2-day / 48-hour / 172800s cutoff
    expect(combined).toMatch(/2\s*days?|48\s*hours?|172800|2\s*\*\s*24/i);
  });
});
