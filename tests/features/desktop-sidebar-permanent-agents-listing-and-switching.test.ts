/**
 * Feature: Desktop — sidebar should list all permanent agents with switching
 * Feature ID: 11bdfcb1-7213-4282-b0fc-7cb16b1792ed
 *
 * Acceptance criteria covered:
 *  AC1: The sidebar lists ALL permanent agents (not just CPO), one entry per agent
 *  AC2: Each permanent agent entry shows the agent's role name and running status
 *  AC3: Clicking a permanent agent entry switches the terminal to that agent's session
 *  AC4: The active agent entry is highlighted (aria-pressed or active state)
 *  AC5: Agents without a local tmux session are shown with a grey indicator (non-clickable or disabled)
 *  AC6: Multiple permanent agents can be displayed simultaneously
 *  AC7: PipelineViewData includes a permanentAgents field populated from status.persistent_agents
 *  AC8: Session name is resolved per agent (by role suffix match or direct session field)
 *
 * Static analysis of:
 *   - packages/desktop/src/renderer/components/PipelineColumn.tsx
 *   - packages/desktop/src/renderer/App.tsx
 *   - packages/cli/src/commands/agents.ts
 *   - packages/cli/src/commands/status.ts
 *
 * Written to FAIL against the current codebase; pass once the feature is built.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');

const PIPELINE_COLUMN = 'packages/desktop/src/renderer/components/PipelineColumn.tsx';
const APP_TSX = 'packages/desktop/src/renderer/App.tsx';
const CLI_AGENTS = 'packages/cli/src/commands/agents.ts';
const CLI_STATUS = 'packages/cli/src/commands/status.ts';

function readRepoFile(relPath: string): string | null {
  const fullPath = path.join(REPO_ROOT, relPath);
  try {
    return fs.readFileSync(fullPath, 'utf-8');
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// AC7: PipelineViewData includes permanentAgents field
// ---------------------------------------------------------------------------

describe('AC7: PipelineViewData type includes permanentAgents field', () => {
  let pipelineColumn: string | null;

  beforeAll(() => {
    pipelineColumn = readRepoFile(PIPELINE_COLUMN);
  });

  it('PipelineColumn.tsx exists', () => {
    expect(pipelineColumn, `File not found: ${PIPELINE_COLUMN}`).not.toBeNull();
  });

  it('PipelineViewData interface has a permanentAgents (or persistent_agents) field', () => {
    expect(pipelineColumn).toMatch(/permanentAgents|persistent_agents\s*[?:]/);
  });

  it('permanentAgents field is typed as an array', () => {
    expect(pipelineColumn).toMatch(/permanentAgents\s*[?:][\s\S]{0,80}\[\]/);
  });
});

// ---------------------------------------------------------------------------
// AC1 + AC2: PermanentAgent entry type shape (role, status, sessionName)
// ---------------------------------------------------------------------------

describe('AC1/AC2: PermanentAgent entry interface has required fields', () => {
  let pipelineColumn: string | null;

  beforeAll(() => {
    pipelineColumn = readRepoFile(PIPELINE_COLUMN);
  });

  it('defines a type or interface for permanent agent entries', () => {
    // Must declare something like PermanentAgent or PermanentAgentEntry
    expect(pipelineColumn).toMatch(/interface\s+PermanentAgent|type\s+PermanentAgent/);
  });

  it('permanent agent entry includes a role field', () => {
    expect(pipelineColumn).toMatch(/\brole\b/);
  });

  it('permanent agent entry includes a status field', () => {
    expect(pipelineColumn).toMatch(/\bstatus\b/);
  });

  it('permanent agent entry includes a sessionName (or session_name) field', () => {
    expect(pipelineColumn).toMatch(/sessionName|session_name/);
  });

  it('permanent agent entry includes an id field', () => {
    expect(pipelineColumn).toMatch(/\bid\s*[?:]/);
  });
});

// ---------------------------------------------------------------------------
// AC7: parsePipelinePayload extracts persistent_agents into permanentAgents
// ---------------------------------------------------------------------------

describe('AC7: parsePipelinePayload builds permanentAgents from status.persistent_agents', () => {
  let pipelineColumn: string | null;

  beforeAll(() => {
    pipelineColumn = readRepoFile(PIPELINE_COLUMN);
  });

  it('parsePipelinePayload (or helper) reads status.persistent_agents', () => {
    expect(pipelineColumn).toMatch(/status\.persistent_agents|persistent_agents/);
  });

  it('parsePipelinePayload assigns permanentAgents in the returned PipelineViewData', () => {
    // The return object must set permanentAgents
    expect(pipelineColumn).toMatch(/permanentAgents\s*:/);
  });
});

// ---------------------------------------------------------------------------
// AC8: Session name resolution per agent (by role or direct session field)
// ---------------------------------------------------------------------------

describe('AC8: each permanent agent resolves a tmux session name', () => {
  let pipelineColumn: string | null;

  beforeAll(() => {
    pipelineColumn = readRepoFile(PIPELINE_COLUMN);
  });

  it('session resolution checks for a direct session_name or tmux_session on the agent', () => {
    // Must read session_name or tmux_session from the agent record
    expect(pipelineColumn).toMatch(/session_name|tmux_session/);
  });

  it('falls back to role-based suffix session matching for agents without explicit session', () => {
    // Role-based match: session ending in `-${role}` or similar
    expect(pipelineColumn).toMatch(/endsWith.*role|role.*endsWith/s);
  });

  it('getAgentSessionName or equivalent helper resolves sessions for permanent agents', () => {
    // A dedicated function or logic path for agent session lookup must exist
    expect(pipelineColumn).toMatch(/getAgentSession|agentSession|getPermanentAgentSession/i);
  });
});

// ---------------------------------------------------------------------------
// AC1 + AC6: Sidebar renders an "Agents" section with all permanent agents
// ---------------------------------------------------------------------------

describe('AC1/AC6: sidebar renders a section listing all permanent agents', () => {
  let pipelineColumn: string | null;

  beforeAll(() => {
    pipelineColumn = readRepoFile(PIPELINE_COLUMN);
  });

  it('PipelineColumn renders a section for permanent agents (Agents / Persistent Agents)', () => {
    // Section title should mention agents
    expect(pipelineColumn).toMatch(/Agents|Permanent Agents|persistent.?agents/i);
  });

  it('permanent agents section maps over permanentAgents array', () => {
    // Must iterate (map) over permanentAgents to render individual cards
    expect(pipelineColumn).toMatch(/permanentAgents\.map|pipeline\.permanentAgents\.map/);
  });

  it('permanent agent entries display the role name', () => {
    // Each rendered entry must show agent.role or similar
    expect(pipelineColumn).toMatch(/agent\.role|entry\.role/);
  });

  it('permanent agent entries have a clickable/interactive element', () => {
    // Must be a button, role="button", or onClick handler
    expect(pipelineColumn).toMatch(/onAgentClick|onPermanentAgentClick|onClick.*agent/is);
  });
});

// ---------------------------------------------------------------------------
// AC2: Permanent agent running status shown with visual indicator
// ---------------------------------------------------------------------------

describe('AC2: agent running status is shown with a status indicator', () => {
  let pipelineColumn: string | null;

  beforeAll(() => {
    pipelineColumn = readRepoFile(PIPELINE_COLUMN);
  });

  it('renders a status dot or indicator per agent entry', () => {
    // Green dot for running, grey for idle/stopped
    expect(pipelineColumn).toMatch(/agent\.status|agent\.hasLocalSession|agentRunning/i);
  });

  it('shows green indicator for running agent', () => {
    // The GREEN_DOT constant or #22c55e color used based on agent status
    expect(pipelineColumn).toMatch(/GREEN_DOT|#22c55e/);
  });
});

// ---------------------------------------------------------------------------
// AC3 + AC4: Clicking an agent switches terminal; active agent is highlighted
// ---------------------------------------------------------------------------

describe('AC3/AC4: clicking an agent switches to its session and highlights the active one', () => {
  let pipelineColumn: string | null;
  let appTsx: string | null;

  beforeAll(() => {
    pipelineColumn = readRepoFile(PIPELINE_COLUMN);
    appTsx = readRepoFile(APP_TSX);
  });

  it('PipelineColumnProps includes an onAgentClick handler', () => {
    expect(pipelineColumn).toMatch(/onAgentClick\s*[?:]|onPermanentAgentClick\s*[?:]/);
  });

  it('App.tsx provides an onAgentClick handler to PipelineColumn', () => {
    expect(appTsx).toMatch(/onAgentClick|onPermanentAgentClick/);
  });

  it('App.tsx attaches to the clicked agent tmux session on agent click', () => {
    // Must call terminalAttach or similar with the agent session name
    expect(appTsx).toMatch(/terminalAttach|TERMINAL_ATTACH|attachSession/i);
  });

  it('active agent entry has aria-pressed="true" when its session is the activeSession', () => {
    // Each agent card must track active state similar to job cards
    expect(pipelineColumn).toMatch(/aria-pressed/);
  });

  it('active agent card uses highlighted border/background (blue, like job cards)', () => {
    // Blue highlight styling: #60a5fa or #132847 must appear in agent card render path
    expect(pipelineColumn).toMatch(/#60a5fa|#132847/);
  });
});

// ---------------------------------------------------------------------------
// AC5: Agents without a local session show grey indicator
// ---------------------------------------------------------------------------

describe('AC5: agents without a local tmux session show grey indicator (non-interactive)', () => {
  let pipelineColumn: string | null;

  beforeAll(() => {
    pipelineColumn = readRepoFile(PIPELINE_COLUMN);
  });

  it('agent card uses grey indicator when session is absent', () => {
    expect(pipelineColumn).toMatch(/GREY_DOT|#737d92/);
  });

  it('agent card communicates when no session is available', () => {
    // Should either disable the click, or not include a session in the click handler
    expect(pipelineColumn).toMatch(/agent\.sessionName|hasSession|sessionName.*null/);
  });
});

// ---------------------------------------------------------------------------
// CLI: agents command includes tmux_session for persistent agents
// ---------------------------------------------------------------------------

describe('CLI agents command: persistent agent entries include tmux_session', () => {
  let cliAgents: string | null;

  beforeAll(() => {
    cliAgents = readRepoFile(CLI_AGENTS);
  });

  it('packages/cli/src/commands/agents.ts exists', () => {
    expect(cliAgents, `File not found: ${CLI_AGENTS}`).not.toBeNull();
  });

  it('persistent agent entries include tmux_session field', () => {
    expect(cliAgents).toMatch(/tmux_session/);
  });

  it('persistent agent tmux_session is resolved from live tmux session list', () => {
    // Must look up active tmux sessions to match to the agent role
    expect(cliAgents).toMatch(/tmux\s+list-sessions|tmux.*ls|listSessions|tmuxSessions/i);
  });
});

// ---------------------------------------------------------------------------
// CLI: status command persistent_agents entries include tmux_session
// ---------------------------------------------------------------------------

describe('CLI status command: persistent_agents entries include tmux_session for desktop poller', () => {
  let cliStatus: string | null;

  beforeAll(() => {
    cliStatus = readRepoFile(CLI_STATUS);
  });

  it('packages/cli/src/commands/status.ts exists', () => {
    expect(cliStatus, `File not found: ${CLI_STATUS}`).not.toBeNull();
  });

  it('JsonStatusAgent type includes tmux_session field', () => {
    // The status agent object type must expose tmux_session so the desktop can attach
    expect(cliStatus).toMatch(/tmux_session/);
  });

  it('persistent_agents in status output include a populated tmux_session per agent', () => {
    // The agent objects assembled in status output must include tmux_session assignment
    expect(cliStatus).toMatch(/tmux_session\s*:/);
  });
});
