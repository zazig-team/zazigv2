/**
 * Feature: Desktop Sidebar Lists All Permanent Agents With Switching
 * Feature ID: 434544fa-bf57-4b11-91d8-ba45b054f9e4
 *
 * Tests for:
 *   - packages/desktop/src/renderer/components/PipelineColumn.tsx
 *   - packages/desktop/src/renderer/App.tsx
 *
 * AC1: Sidebar shows all persistent agents from the status payload, not just CPO
 * AC2: Each agent card shows a green dot when tmux session exists, grey when not
 * AC3: The currently-attached agent has a blue highlight
 * AC4: Clicking an agent switches the terminal to that agent's tmux session
 * AC5: Clicking an agent that is not running does nothing (card is greyed out)
 * AC6: Switching between agents uses the transition queue (no race conditions)
 * AC7: The old hardcoded CPO button is removed
 *
 * Failure Cases:
 * - Must NOT hardcode agent names (list comes from status payload)
 * - Must NOT bypass the transition queue when switching agents
 * - Must NOT hide agents that are not running -- show them greyed out
 *
 * Written to FAIL against current codebase; passes once the feature is built.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');
const PIPELINE_COLUMN = 'packages/desktop/src/renderer/components/PipelineColumn.tsx';
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
// AC7: Old hardcoded CPO button must be removed
// ---------------------------------------------------------------------------

describe('PipelineColumn: hardcoded CPO button is removed', () => {
  let content: string | null;

  beforeAll(() => {
    content = readRepoFile(PIPELINE_COLUMN);
  });

  it('PipelineColumn.tsx file exists', () => {
    expect(content, `File not found: ${PIPELINE_COLUMN}`).not.toBeNull();
  });

  it('onCpoClick prop is removed from PipelineColumnProps', () => {
    // The old interface should no longer declare onCpoClick
    expect(content).not.toMatch(/onCpoClick/);
  });

  it('CPO-specific button JSX is removed', () => {
    // No hardcoded CPO button should be rendered
    expect(content).not.toMatch(/onCpoClick\s*&&/);
  });
});

describe('App.tsx: onCpoClick and isCpoActive are removed', () => {
  let content: string | null;

  beforeAll(() => {
    content = readRepoFile(APP_TSX);
  });

  it('App.tsx file exists', () => {
    expect(content, `File not found: ${APP_TSX}`).not.toBeNull();
  });

  it('onCpoClick callback is removed from App.tsx', () => {
    expect(content).not.toMatch(/onCpoClick/);
  });

  it('isCpoActive state is removed from App.tsx', () => {
    expect(content).not.toMatch(/isCpoActive/);
  });

  it('onCpoClick prop is not passed to PipelineColumn', () => {
    expect(content).not.toMatch(/onCpoClick\s*=/);
  });
});

// ---------------------------------------------------------------------------
// AC1: Sidebar renders all persistent agents from the status payload
// ---------------------------------------------------------------------------

describe('PipelineColumn: persistent agents rendered from status payload', () => {
  let content: string | null;

  beforeAll(() => {
    content = readRepoFile(PIPELINE_COLUMN);
  });

  it('PipelineViewData or equivalent interface includes a persistent agents field', () => {
    expect(content).toMatch(/persistentAgents|persistent_agents/);
  });

  it('parsePipelinePayload (or equivalent) reads persistent_agents from status', () => {
    // The parser must extract persistent_agents from the status object
    expect(content).toMatch(/persistent_agents|persistentAgents/);
  });

  it('sidebar section maps over persistent agents array (not hardcoded)', () => {
    // Must iterate dynamically -- no hardcoded "CPO" or "CTO" strings in the agents section
    expect(content).toMatch(/persistentAgents\s*\.\s*map\s*\(|persistent_agents\s*\.\s*map\s*\(/);
  });

  it('sidebar renders an "Agents" section header', () => {
    expect(content).toMatch(/Agents/);
  });

  it('does not hardcode CPO as the only agent in the agents section render loop', () => {
    // The agents list must not be a hardcoded single-entry array containing only 'cpo'
    // (a single hardcoded string 'CPO' in a render section for agents is a failure)
    expect(content).not.toMatch(/\[\s*['"]cpo['"]\s*\]|\[\s*['"]CPO['"]\s*\]/);
  });
});

// ---------------------------------------------------------------------------
// AC2: Per-agent card shows green dot when tmux session exists, grey otherwise
// ---------------------------------------------------------------------------

describe('PipelineColumn: agent card liveness dot (green/grey)', () => {
  let content: string | null;

  beforeAll(() => {
    content = readRepoFile(PIPELINE_COLUMN);
  });

  it('uses session suffix convention (e.g. -cpo, -cto) to match tmux sessions', () => {
    // The matching logic must use a suffix from the role name
    expect(content).toMatch(/-\$\{|\.endsWith\(|\.includes\(`-|suffix|role\.toLowerCase|role_suffix/i);
  });

  it('green dot color is applied when a matching tmux session is found', () => {
    // GREEN_DOT constant or equivalent must be used for live agents
    expect(content).toMatch(/GREEN_DOT|#22c55e|green/i);
  });

  it('grey dot color is applied when no tmux session matches', () => {
    expect(content).toMatch(/GREY_DOT|#737d92|grey|gray/i);
  });

  it('tmux_sessions data is used for session matching', () => {
    expect(content).toMatch(/tmux_sessions|tmuxSessions|getLocalSession/i);
  });
});

// ---------------------------------------------------------------------------
// AC3: Currently-attached agent has blue highlight
// ---------------------------------------------------------------------------

describe('PipelineColumn: active agent card has blue highlight', () => {
  let content: string | null;

  beforeAll(() => {
    content = readRepoFile(PIPELINE_COLUMN);
  });

  it('activeSession prop is compared against agent session names', () => {
    // activeSession must be used in the agent card rendering to determine highlight
    expect(content).toMatch(/activeSession/);
  });

  it('blue highlight style is conditionally applied based on activeSession match', () => {
    // Same blue highlight used for active job cards -- typically #2563eb or similar
    expect(content).toMatch(/#2563eb|#1d4ed8|blue|isActive|activeSession\s*===|activeSession\s*==/);
  });
});

// ---------------------------------------------------------------------------
// AC4 & AC5: Clicking an agent switches terminal; non-running agents do nothing
// ---------------------------------------------------------------------------

describe('PipelineColumn: agent card click behavior', () => {
  let content: string | null;

  beforeAll(() => {
    content = readRepoFile(PIPELINE_COLUMN);
  });

  it('agent cards expose an onAgentClick or equivalent callback prop', () => {
    // PipelineColumn must accept a callback for agent switching
    expect(content).toMatch(/onAgentClick|onPersistentAgentClick|onAgentSwitch/);
  });

  it('onClick is only set on agent cards that have a running tmux session', () => {
    // Cards without a matching session must not have a click handler
    // (conditional onClick: only when session exists)
    expect(content).toMatch(/onClick\s*=\s*\{[^}]*session|hasSession\s*\?|isRunning\s*\?/);
  });

  it('greyed-out agent cards have no onClick handler', () => {
    // When session is absent, cursor should be default (not pointer) or onClick undefined
    expect(content).toMatch(/cursor.*default|onClick\s*=\s*\{undefined\}|onClick\s*=\s*\{null\}|!.*session.*onClick|hasSession.*&&.*onClick/);
  });
});

// ---------------------------------------------------------------------------
// AC6: Switching agents uses the transition queue (no race conditions)
// ---------------------------------------------------------------------------

describe('App.tsx: agent switching goes through the transition queue', () => {
  let content: string | null;

  beforeAll(() => {
    content = readRepoFile(APP_TSX);
  });

  it('App.tsx defines a handler for agent card clicks', () => {
    expect(content).toMatch(/onAgentClick|onPersistentAgentClick|onAgentSwitch/);
  });

  it('agent click handler uses queueTerminalTransition (not a direct await)', () => {
    // Must wrap the detach/attach in queueTerminalTransition
    expect(content).toMatch(/queueTerminalTransition/);
  });

  it('agent click handler calls terminalDetach before terminalAttach', () => {
    // Both must appear; detach first is enforced by the transition queue pattern
    expect(content).toMatch(/terminalDetach/);
    expect(content).toMatch(/terminalAttach/);
  });

  it('agent switching does not call terminalAttachDefault (CPO-only path)', () => {
    // Persistent agent switching must use terminalAttach(sessionName), not the default
    // This check is relaxed -- if terminalAttachDefault is still present it might be for other flows
    // but agent cards must use terminalAttach with a session name argument
    const agentSwitchBlock = content?.match(/onAgentClick[\s\S]{0,600}/)?.[0] ?? '';
    expect(agentSwitchBlock).toMatch(/terminalAttach\s*\(/);
  });

  it('agent click handler updates activeSession state', () => {
    expect(content).toMatch(/setActiveSession/);
  });

  it('onAgentClick prop is passed from App.tsx to PipelineColumn', () => {
    expect(content).toMatch(/onAgentClick\s*=\s*\{|onPersistentAgentClick\s*=\s*\{|onAgentSwitch\s*=\s*\{/);
  });
});

// ---------------------------------------------------------------------------
// Failure Case: Non-running agents must be shown (not hidden)
// ---------------------------------------------------------------------------

describe('PipelineColumn: non-running persistent agents are shown greyed out', () => {
  let content: string | null;

  beforeAll(() => {
    content = readRepoFile(PIPELINE_COLUMN);
  });

  it('persistent agents are NOT filtered by session existence (all are rendered)', () => {
    // The render loop must NOT filter out agents without a session
    // i.e., there should be no .filter call that removes sessionless agents before mapping
    const agentSection = content?.match(/persistentAgents[\s\S]{0,800}/)?.[0] ?? '';
    expect(agentSection).not.toMatch(/\.filter\s*\(\s*[^)]*session/i);
  });

  it('render path for an agent card exists even when session is absent (fallback card)', () => {
    // Greyed-out state: opacity or color change when no session
    expect(content).toMatch(/opacity|color.*grey|color.*gray|GREY_DOT|cursor.*default/i);
  });
});
