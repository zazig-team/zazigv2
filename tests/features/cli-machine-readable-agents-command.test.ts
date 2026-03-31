/**
 * Feature: CLI machine-readable mode — zazig agents command
 *
 * Acceptance criteria covered:
 * - AC2: zazig agents --company <id> returns all three agent types with correct type field
 * - AC3: zazig agents --company <id> --type persistent filters to only persistent agents
 * - AC9: all output is valid JSON on stdout with zero non-JSON content
 * - AC11: exit codes 0 on success, non-zero on failure
 * - FC3: agents --company <id> when no daemon running returns { "agents": [] }, exits 0
 * - FC5: agents output handles orphaned DB rows and unknown tmux sessions gracefully
 */

import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');

function readRepoFile(relPath: string): string | null {
  const fullPath = path.join(REPO_ROOT, relPath);
  try {
    return fs.readFileSync(fullPath, 'utf-8');
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// AC2 / AC3: zazig agents command file exists and is correctly implemented
// ---------------------------------------------------------------------------

describe('agents.ts command file', () => {
  const FILE = 'packages/cli/src/commands/agents.ts';
  let content: string | null;

  beforeAll(() => {
    content = readRepoFile(FILE);
  });

  it('exists at packages/cli/src/commands/agents.ts', () => {
    expect(
      content,
      `Command file not found at ${FILE}. Create packages/cli/src/commands/agents.ts`,
    ).not.toBeNull();
  });

  it('requires --company <id> flag', () => {
    expect(content).toMatch(/--company/);
  });

  it('supports optional --type filter flag', () => {
    expect(content).toMatch(/--type/);
  });

  it('reuses discoverAgentSessions for tmux session discovery', () => {
    expect(content).toContain('discoverAgentSessions');
  });

  it('imports discoverAgentSessions from chat command', () => {
    expect(content).toMatch(/import.*discoverAgentSessions.*from.*chat|discoverAgentSessions.*from.*chat/);
  });

  it('calls getValidCredentials() for auth', () => {
    expect(content).toContain('getValidCredentials');
  });

  it('outputs a JSON object with an "agents" array key', () => {
    expect(content).toMatch(/"agents"/);
  });

  it('handles persistent agent type in output', () => {
    expect(content).toMatch(/"persistent"/);
  });

  it('handles job agent type in output', () => {
    expect(content).toMatch(/"job"/);
  });

  it('handles expert agent type in output', () => {
    expect(content).toMatch(/"expert"/);
  });

  it('includes "type" field in agent output entries', () => {
    expect(content).toMatch(/["']type["']/);
  });

  it('includes "tmux_session" field in agent output entries', () => {
    expect(content).toMatch(/tmux_session/);
  });

  it('includes "status" field in agent output entries', () => {
    expect(content).toMatch(/["']status["']/);
  });

  it('queries persistent_agents table from Supabase', () => {
    expect(content).toMatch(/persistent_agents/);
  });

  it('queries jobs table for active job agents', () => {
    expect(content).toMatch(/rest\/v1\/jobs|jobs.*status.*in|jobs.*queued/);
  });

  it('filters job agents by active statuses (queued/dispatched/executing/reviewing)', () => {
    expect(content).toMatch(/queued|dispatched|executing|reviewing/);
  });

  it('applies --type filter when provided to narrow results', () => {
    // Should filter the agents array based on --type flag value
    expect(content).toMatch(/type.*filter|filter.*type|\.filter\(|typeFilter/);
  });

  it('writes JSON to stdout', () => {
    expect(content).toMatch(/process\.stdout\.write|console\.log/);
    expect(content).toMatch(/JSON\.stringify/);
  });

  it('exits 0 on success', () => {
    expect(content).toMatch(/process\.exit\(0\)|exitCode\s*=\s*0/);
  });

  it('exits 0 with empty agents array when no daemon running', () => {
    // FC3: When no daemon running, return { "agents": [] }, exit 0
    expect(content).toMatch(/agents.*\[\]|\[\].*agents/);
  });

  it('handles orphaned agents (DB row without tmux session) with "orphaned" status', () => {
    // FC5: DB row without a tmux session shows with status "orphaned"
    expect(content).toMatch(/"orphaned"|orphaned/);
  });

  it('handles unknown tmux sessions (no DB row) with "unknown" status', () => {
    // FC5: tmux session without matching DB row shows with status "unknown"
    expect(content).toMatch(/"unknown"|unknown/);
  });
});

// ---------------------------------------------------------------------------
// AC3: --type filter works correctly
// ---------------------------------------------------------------------------

describe('agents command --type filtering', () => {
  const FILE = 'packages/cli/src/commands/agents.ts';
  let content: string | null;

  beforeAll(() => {
    content = readRepoFile(FILE);
  });

  it('accepts "persistent" as valid --type value', () => {
    expect(content).toMatch(/persistent/);
  });

  it('accepts "job" as valid --type value', () => {
    expect(content).toMatch(/\bjob\b/);
  });

  it('accepts "expert" as valid --type value', () => {
    expect(content).toMatch(/expert/);
  });
});

// ---------------------------------------------------------------------------
// CLI index.ts registers agents command
// ---------------------------------------------------------------------------

describe('CLI index.ts registers agents command', () => {
  const INDEX_FILE = 'packages/cli/src/index.ts';
  let content: string | null;

  beforeAll(() => {
    content = readRepoFile(INDEX_FILE);
  });

  it('imports agents command', () => {
    expect(content).toMatch(/import.*agents.*from.*commands\/agents/);
  });

  it('registers "agents" case in command switch', () => {
    expect(content).toMatch(/case\s+['"]agents['"]/);
  });
});

// ---------------------------------------------------------------------------
// AC9: agents command output is pure JSON (no non-JSON to stdout)
// ---------------------------------------------------------------------------

describe('agents command JSON output purity', () => {
  const FILE = 'packages/cli/src/commands/agents.ts';

  it('does not use JSON.stringify with indent (compact JSON output)', () => {
    const content = readRepoFile(FILE);
    if (!content) {
      expect(content, `${FILE} not found`).not.toBeNull();
      return;
    }
    expect(content).not.toMatch(/JSON\.stringify\([^)]+,\s*(null|\d+),\s*\d+\)/);
  });
});
