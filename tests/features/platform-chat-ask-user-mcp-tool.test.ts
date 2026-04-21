/**
 * Feature: Platform chat system — ask_user MCP tool
 *
 * Tests that:
 * - ask_user tool is registered in agent-mcp-server.ts
 * - It is available to all job types (present in ROLE_DEFAULT_MCP_TOOLS or universally allowed)
 * - The tool inserts a message with sender='job'
 * - It implements a 10-minute timeout that sets idea status to awaiting_response
 * - It has a polling fallback when Realtime subscription fails
 *
 * Written to FAIL until the feature is implemented.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function readFile(relPath: string): string {
  try {
    return fs.readFileSync(path.join(REPO_ROOT, relPath), 'utf-8');
  } catch {
    return '';
  }
}

// ---------------------------------------------------------------------------
// AC: ask_user MCP tool exists and is registered in agent-mcp-server
// ---------------------------------------------------------------------------

describe('AC: ask_user MCP tool exists in agent-mcp-server.ts', () => {
  let mcpServer: string;

  beforeAll(() => {
    mcpServer = readFile('packages/local-agent/src/agent-mcp-server.ts');
  });

  it('agent-mcp-server.ts defines the ask_user tool via server.tool()', () => {
    expect(
      mcpServer,
      'ask_user tool not found in agent-mcp-server.ts. Add server.tool("ask_user", ...)',
    ).toMatch(/server\.tool\s*\(\s*["']ask_user["']/);
  });

  it('ask_user tool declares idea_id parameter', () => {
    // Find the ask_user tool block and verify its schema
    expect(mcpServer).toMatch(/idea_id/);
  });

  it('ask_user tool declares question parameter', () => {
    expect(mcpServer).toMatch(/question/);
  });

  it('ask_user tool description mentions asking the user', () => {
    // Should have a human-readable description
    expect(mcpServer).toMatch(/ask.*user|question.*user|send.*message.*user/i);
  });
});

// ---------------------------------------------------------------------------
// AC: ask_user is available to all job types
// ---------------------------------------------------------------------------

describe('AC: ask_user is available to all job types (workspace.ts)', () => {
  let workspace: string;

  beforeAll(() => {
    workspace = readFile('packages/local-agent/src/workspace.ts');
  });

  it('workspace.ts includes ask_user in ROLE_DEFAULT_MCP_TOOLS for all ephemeral roles', () => {
    // ask_user must be available to every job type.
    // Either it's in every role's list, or there's a universal/base tool list.
    // Check that workspace.ts references ask_user in its tool config.
    expect(
      workspace,
      'ask_user not referenced in workspace.ts ROLE_DEFAULT_MCP_TOOLS. Add it to all job type tool lists.',
    ).toMatch(/ask_user/);
  });

  it('ask_user is in the tools list for code/engineering job types', () => {
    // The engineering roles (senior-engineer, junior-engineer) must have ask_user
    const seniorSection = workspace.match(/"senior-engineer"[^}]+/s)?.[0] ?? '';
    const juniorSection = workspace.match(/"junior-engineer"[^}]+/s)?.[0] ?? '';
    const combined = seniorSection + juniorSection;
    expect(
      combined,
      'ask_user not found in senior-engineer or junior-engineer tool lists',
    ).toMatch(/ask_user/);
  });

  it('ask_user is in the tools list for test-engineer job type', () => {
    const testSection = workspace.match(/"test-engineer"[^}]+/s)?.[0] ?? '';
    expect(
      testSection,
      'ask_user not found in test-engineer tool list',
    ).toMatch(/ask_user/);
  });

  it('ask_user is in the tools list for breakdown-specialist job type', () => {
    const breakdownSection = workspace.match(/"breakdown-specialist"[^}]+/s)?.[0] ?? '';
    expect(
      breakdownSection,
      'ask_user not found in breakdown-specialist tool list',
    ).toMatch(/ask_user/);
  });
});

// ---------------------------------------------------------------------------
// AC: Calling ask_user inserts a message with sender='job'
// ---------------------------------------------------------------------------

describe('AC: ask_user inserts a message into idea_messages with sender=job', () => {
  let mcpServer: string;

  beforeAll(() => {
    mcpServer = readFile('packages/local-agent/src/agent-mcp-server.ts');
  });

  it('ask_user handler inserts into idea_messages table', () => {
    expect(mcpServer).toMatch(/idea.messages/i);
  });

  it("ask_user handler sets sender to 'job'", () => {
    expect(mcpServer).toMatch(/sender.*['"]job['"]|['"]job['"].*sender/);
  });

  it('ask_user handler includes job_id from environment variable', () => {
    // Should read ZAZIG_JOB_ID and include it in the insert
    expect(mcpServer).toMatch(/ZAZIG_JOB_ID|job_id.*env|env.*job_id/i);
  });
});

// ---------------------------------------------------------------------------
// AC: 10-minute timeout sets idea status to awaiting_response
// ---------------------------------------------------------------------------

describe('AC: ask_user 10-minute timeout sets idea status to awaiting_response', () => {
  let mcpServer: string;

  beforeAll(() => {
    mcpServer = readFile('packages/local-agent/src/agent-mcp-server.ts');
  });

  it('ask_user implements a timeout mechanism', () => {
    // Should have a timeout constant or setTimeout/Promise.race
    expect(mcpServer).toMatch(/timeout|setTimeout|Promise\.race/i);
  });

  it('timeout duration is 10 minutes (600000ms or 600 seconds)', () => {
    // 10 min = 600_000 ms or 600s
    expect(mcpServer).toMatch(/600[_]?000|10\s*\*\s*60/);
  });

  it("on timeout, idea status is set to 'awaiting_response'", () => {
    expect(mcpServer).toMatch(/awaiting_response/);
  });

  it('on timeout, returns a timeout signal so the job can exit cleanly', () => {
    // Should return some kind of timeout indicator
    expect(mcpServer).toMatch(/timeout|timed.out/i);
  });
});

// ---------------------------------------------------------------------------
// AC: User reply received via Realtime or polling fallback
// ---------------------------------------------------------------------------

describe('AC: ask_user subscribes to Realtime for user replies', () => {
  let mcpServer: string;

  beforeAll(() => {
    mcpServer = readFile('packages/local-agent/src/agent-mcp-server.ts');
  });

  it('ask_user subscribes to Realtime channel for idea_messages', () => {
    // Should use Supabase Realtime channel subscription
    expect(mcpServer).toMatch(/channel|subscribe|realtime/i);
  });

  it('ask_user filters Realtime events for sender=user replies', () => {
    expect(mcpServer).toMatch(/sender.*user|user.*sender/i);
  });
});

describe('AC: ask_user has polling fallback when Realtime fails', () => {
  let mcpServer: string;

  beforeAll(() => {
    mcpServer = readFile('packages/local-agent/src/agent-mcp-server.ts');
  });

  it('ask_user implements a polling fallback', () => {
    // Should have setInterval or a polling loop as fallback
    expect(mcpServer).toMatch(/poll|setInterval|fallback/i);
  });

  it('polling interval is between 3-5 seconds', () => {
    // 3000-5000ms polling interval
    expect(mcpServer).toMatch(/[3-5]000|[3-5]\s*\*\s*1000/);
  });
});
