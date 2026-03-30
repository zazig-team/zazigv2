/**
 * Feature: TUI Phase 1b — Top bar with live agent tabs from tmux
 *
 * Tests for acceptance criteria:
 * - Top bar shows CPO and CTO as tabs when daemon has those agents running
 * - First tab is selected by default
 * - Tab key / number keys switch the selected session
 * - Expert sessions appear dynamically within 5 seconds of spawning
 * - Expert sessions disappear within 5 seconds of ending
 *
 * These tests do static analysis of source files to verify required
 * implementation patterns. Written to FAIL against the current codebase
 * and pass once the feature is implemented.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');

const TMUX_TS = 'packages/tui/src/lib/tmux.ts';
const USE_TMUX_SESSIONS_TS = 'packages/tui/src/hooks/useTmuxSessions.ts';
const TOP_BAR_TSX = 'packages/tui/src/components/TopBar.tsx';
const APP_TSX = 'packages/tui/src/App.tsx';

function readRepoFile(relPath: string): string | null {
  const fullPath = path.join(REPO_ROOT, relPath);
  try {
    return fs.readFileSync(fullPath, 'utf-8');
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// AC1: tmux.ts — listAgentSessions() discovers zazig sessions
// ---------------------------------------------------------------------------

describe('AC1: listAgentSessions() shells out to tmux and filters zazig sessions', () => {
  let content: string | null;

  beforeAll(() => {
    content = readRepoFile(TMUX_TS);
  });

  it('packages/tui/src/lib/tmux.ts exists', () => {
    expect(content, `File not found: ${TMUX_TS}`).not.toBeNull();
  });

  it('exports listAgentSessions function', () => {
    expect(content).toMatch(/export.*listAgentSessions|export\s+async\s+function\s+listAgentSessions/);
  });

  it('shells out to tmux list-sessions', () => {
    expect(content).toMatch(/tmux.*list-sessions|list-sessions/);
  });

  it('filters sessions by the zazig naming pattern (<machine>-<companyId>-<role>)', () => {
    // Pattern must match the <machine>-<companyId>-<role> structure
    expect(content).toMatch(/zazig|companyId|machine.*role|role.*machine/);
  });

  it('returns objects with role, sessionName, and isAlive fields', () => {
    expect(content).toMatch(/role/);
    expect(content).toMatch(/sessionName/);
    expect(content).toMatch(/isAlive/);
  });

  it('distinguishes persistent agents (cpo, cto, vpe) from expert sessions', () => {
    expect(content).toMatch(/cpo|cto|vpe/);
    expect(content).toMatch(/persistent|expert/);
  });
});

// ---------------------------------------------------------------------------
// AC2: useTmuxSessions hook — polls every 5s and manages selectedSession
// ---------------------------------------------------------------------------

describe('AC2: useTmuxSessions hook polls listAgentSessions every 5 seconds', () => {
  let content: string | null;

  beforeAll(() => {
    content = readRepoFile(USE_TMUX_SESSIONS_TS);
  });

  it('packages/tui/src/hooks/useTmuxSessions.ts exists', () => {
    expect(content, `File not found: ${USE_TMUX_SESSIONS_TS}`).not.toBeNull();
  });

  it('imports or calls listAgentSessions', () => {
    expect(content).toMatch(/listAgentSessions/);
  });

  it('polls on a 5-second interval', () => {
    // Must use setInterval or equivalent with 5000ms
    expect(content).toMatch(/5000|5_000/);
  });

  it('returns sessions list from the hook', () => {
    expect(content).toMatch(/sessions|return.*sessions/);
  });

  it('returns selectedSession state', () => {
    expect(content).toMatch(/selectedSession/);
  });

  it('returns a setter for selectedSession', () => {
    // setSelectedSession or equivalent setter
    expect(content).toMatch(/setSelectedSession|selectedSession.*setter/);
  });

  it('cleans up the interval on unmount', () => {
    // useEffect with cleanup: clearInterval
    expect(content).toMatch(/clearInterval/);
  });
});

// ---------------------------------------------------------------------------
// AC3: Top bar shows CPO and CTO tabs when those agents are alive
// ---------------------------------------------------------------------------

describe('AC3: TopBar renders agent tabs from the session list', () => {
  let content: string | null;

  beforeAll(() => {
    content = readRepoFile(TOP_BAR_TSX);
  });

  it('packages/tui/src/components/TopBar.tsx exists', () => {
    expect(content, `File not found: ${TOP_BAR_TSX}`).not.toBeNull();
  });

  it('accepts a sessions prop', () => {
    expect(content).toMatch(/sessions/);
  });

  it('renders each session as a tab', () => {
    // Maps over sessions to render tabs
    expect(content).toMatch(/sessions\.map|sessions\s*\.\s*map/);
  });

  it('shows persistent agents dimmed when not alive (isAlive check)', () => {
    expect(content).toMatch(/isAlive/);
    expect(content).toMatch(/dim|dimColor|opacity|color.*gray|gray.*color/i);
  });

  it('shows expert sessions with a bullet indicator', () => {
    expect(content).toMatch(/bullet|•|●|expert/);
  });

  it('highlights the active/selected tab (inverse or underline)', () => {
    expect(content).toMatch(/inverse|underline|selected|active.*tab|tab.*active/i);
  });

  it('shows placeholder metrics on the right side: "0 active  0/0 slots"', () => {
    expect(content).toMatch(/0 active|0\/0 slots/);
  });
});

// ---------------------------------------------------------------------------
// AC4: Keyboard navigation — Tab key and number keys switch selected session
// ---------------------------------------------------------------------------

describe('AC4: Keyboard shortcuts switch selected session tab', () => {
  let content: string | null;

  beforeAll(() => {
    content = readRepoFile(TOP_BAR_TSX);
  });

  it('handles Tab key to cycle to next session', () => {
    // Must handle 'tab' key input
    expect(content).toMatch(/tab|Tab/);
  });

  it('handles number keys 1-9 to select session by index', () => {
    // Must handle digit/number key inputs for direct selection
    expect(content).toMatch(/1.*9|digit|[0-9].*key|key.*[0-9]|parseInt|Number\(/);
  });

  it('accepts selectedSession prop or manages selection', () => {
    expect(content).toMatch(/selectedSession|onSelect|setSelected/);
  });
});

// ---------------------------------------------------------------------------
// AC5: Expert sessions appear dynamically within 5 seconds
// ---------------------------------------------------------------------------

describe('AC5: Expert sessions appear and disappear within 5 seconds via polling', () => {
  let hookContent: string | null;
  let tmuxContent: string | null;

  beforeAll(() => {
    hookContent = readRepoFile(USE_TMUX_SESSIONS_TS);
    tmuxContent = readRepoFile(TMUX_TS);
  });

  it('hook polling interval is at most 5000ms so new sessions appear within 5s', () => {
    // The interval must be <= 5000ms
    const match = hookContent?.match(/(\d+).*(?:interval|Interval|setInterval)/)?.[1]
      ?? hookContent?.match(/setInterval[\s\S]{0,30}(\d{4,5})/)?.[1];
    if (match) {
      expect(parseInt(match, 10)).toBeLessThanOrEqual(5000);
    } else {
      // Check for 5000 or 5_000 literal
      expect(hookContent).toMatch(/5000|5_000/);
    }
  });

  it('listAgentSessions returns sessions that are currently alive', () => {
    // Each returned session must have an isAlive field
    expect(tmuxContent).toMatch(/isAlive/);
  });

  it('dead/ended expert sessions are excluded or marked not alive', () => {
    // Either filter out dead sessions or set isAlive = false
    expect(tmuxContent).toMatch(/isAlive.*false|filter.*alive|alive.*filter/i);
  });
});

// ---------------------------------------------------------------------------
// AC6: App.tsx wires useTmuxSessions and lifts selectedSession to App state
// ---------------------------------------------------------------------------

describe('AC6: App.tsx wires useTmuxSessions and lifts selectedSession state', () => {
  let content: string | null;

  beforeAll(() => {
    content = readRepoFile(APP_TSX);
  });

  it('packages/tui/src/App.tsx exists', () => {
    expect(content, `File not found: ${APP_TSX}`).not.toBeNull();
  });

  it('imports or uses useTmuxSessions', () => {
    expect(content).toMatch(/useTmuxSessions/);
  });

  it('passes sessions and selectedSession to TopBar', () => {
    expect(content).toMatch(/TopBar/);
    expect(content).toMatch(/sessions/);
    expect(content).toMatch(/selectedSession/);
  });

  it('passes selectedSession down so SessionPane can use it', () => {
    // selectedSession must be available at App level (not buried in TopBar only)
    expect(content).toMatch(/selectedSession/);
  });
});
