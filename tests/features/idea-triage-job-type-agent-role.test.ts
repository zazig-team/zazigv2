/**
 * Feature: idea-triage job type — agent role, MCP tools, and idea update surface
 *
 * Static analysis tests covering:
 * - workspace.ts: idea-triage role entry in ROLE_DEFAULT_MCP_TOOLS
 * - agent-mcp-server.ts: update_idea tool supports type classification and pipeline statuses
 * - update-idea edge function: supports type field and enriched/awaiting_response statuses
 *
 * Written to FAIL until the feature is implemented.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');

const WORKSPACE_FILE = path.join(REPO_ROOT, 'packages', 'local-agent', 'src', 'workspace.ts');
const MCP_SERVER_FILE = path.join(REPO_ROOT, 'packages', 'local-agent', 'src', 'agent-mcp-server.ts');
const UPDATE_IDEA_FUNCTION = path.join(REPO_ROOT, 'supabase', 'functions', 'update-idea', 'index.ts');

function readSource(filePath: string): string {
  try {
    return fs.readFileSync(filePath, 'utf-8');
  } catch {
    return '';
  }
}

// ---------------------------------------------------------------------------
// AC: idea-triage role is in workspace ROLE_DEFAULT_MCP_TOOLS
// ---------------------------------------------------------------------------

describe("idea-triage role in ROLE_DEFAULT_MCP_TOOLS", () => {
  let workspaceSource = '';

  beforeAll(() => {
    workspaceSource = readSource(WORKSPACE_FILE);
  });

  it('workspace.ts file exists and is non-empty', () => {
    expect(workspaceSource, 'packages/local-agent/src/workspace.ts is missing or empty').not.toBe('');
  });

  it("includes 'idea-triage' in ROLE_DEFAULT_MCP_TOOLS", () => {
    expect(workspaceSource).toMatch(/idea-triage/);
  });

  it("idea-triage role entry grants ask_user tool", () => {
    // The idea-triage role must have ask_user in its MCP tool list
    const triageBlock = workspaceSource.match(
      /['""]idea-triage['""][^}]{0,300}/s,
    );
    expect(
      triageBlock,
      "Expected idea-triage entry in ROLE_DEFAULT_MCP_TOOLS to include ask_user.",
    ).not.toBeNull();
    expect(triageBlock![0]).toMatch(/ask_user/);
  });

  it("idea-triage role entry grants update_idea tool", () => {
    // The triage agent needs update_idea to set type, enrich fields, and set status
    const triageBlock = workspaceSource.match(
      /['""]idea-triage['""][^}]{0,300}/s,
    );
    expect(
      triageBlock,
      "Expected idea-triage entry in ROLE_DEFAULT_MCP_TOOLS to include update_idea.",
    ).not.toBeNull();
    expect(triageBlock![0]).toMatch(/update_idea/);
  });
});

// ---------------------------------------------------------------------------
// AC: update_idea MCP tool supports idea type classification
// ---------------------------------------------------------------------------

describe("update_idea MCP tool supports idea type classification", () => {
  let mcpSource = '';

  beforeAll(() => {
    mcpSource = readSource(MCP_SERVER_FILE);
  });

  it('agent-mcp-server.ts file exists and is non-empty', () => {
    expect(mcpSource, 'packages/local-agent/src/agent-mcp-server.ts is missing or empty').not.toBe('');
  });

  it("update_idea tool accepts a 'type' field for classification (bug/feature/task/initiative)", () => {
    // The update_idea schema must accept a type field so the triage agent can classify ideas
    const updateIdeaBlock = mcpSource.match(
      /server\.tool\(\s*["']update_idea["'][\s\S]{0,2000}?\),?\s*\)/,
    );
    expect(
      updateIdeaBlock,
      "Expected update_idea tool definition in agent-mcp-server.ts.",
    ).not.toBeNull();
    expect(updateIdeaBlock![0]).toMatch(/type.*bug.*feature|type.*classification|idea.*type/i);
  });

  it("update_idea type field includes 'bug' as a valid value", () => {
    const updateIdeaBlock = mcpSource.match(
      /server\.tool\(\s*["']update_idea["'][\s\S]{0,2000}?\),?\s*\)/,
    );
    expect(updateIdeaBlock).not.toBeNull();
    expect(updateIdeaBlock![0]).toMatch(/["']bug["']/);
  });

  it("update_idea type field includes 'feature' as a valid value", () => {
    const updateIdeaBlock = mcpSource.match(
      /server\.tool\(\s*["']update_idea["'][\s\S]{0,2000}?\),?\s*\)/,
    );
    expect(updateIdeaBlock).not.toBeNull();
    expect(updateIdeaBlock![0]).toMatch(/["']feature["']/);
  });

  it("update_idea type field includes 'task' as a valid value", () => {
    const updateIdeaBlock = mcpSource.match(
      /server\.tool\(\s*["']update_idea["'][\s\S]{0,2000}?\),?\s*\)/,
    );
    expect(updateIdeaBlock).not.toBeNull();
    expect(updateIdeaBlock![0]).toMatch(/["']task["']/);
  });

  it("update_idea type field includes 'initiative' as a valid value", () => {
    const updateIdeaBlock = mcpSource.match(
      /server\.tool\(\s*["']update_idea["'][\s\S]{0,2000}?\),?\s*\)/,
    );
    expect(updateIdeaBlock).not.toBeNull();
    expect(updateIdeaBlock![0]).toMatch(/["']initiative["']/);
  });
});

// ---------------------------------------------------------------------------
// AC: update_idea status enum includes pipeline statuses for triage completion
// ---------------------------------------------------------------------------

describe("update_idea status enum includes pipeline statuses", () => {
  let mcpSource = '';

  beforeAll(() => {
    mcpSource = readSource(MCP_SERVER_FILE);
  });

  it("update_idea status enum includes 'enriched'", () => {
    // Triage agent marks idea as 'enriched' when it has enough detail
    const updateIdeaBlock = mcpSource.match(
      /server\.tool\(\s*["']update_idea["'][\s\S]{0,2000}?\),?\s*\)/,
    );
    expect(updateIdeaBlock).not.toBeNull();
    expect(
      updateIdeaBlock![0],
      "update_idea status enum must include 'enriched' so triage agent can mark completion.",
    ).toMatch(/["']enriched["']/);
  });

  it("update_idea status enum includes 'awaiting_response'", () => {
    // ask_user timeout sets idea to awaiting_response — update_idea must accept this value
    const updateIdeaBlock = mcpSource.match(
      /server\.tool\(\s*["']update_idea["'][\s\S]{0,2000}?\),?\s*\)/,
    );
    expect(updateIdeaBlock).not.toBeNull();
    expect(
      updateIdeaBlock![0],
      "update_idea status enum must include 'awaiting_response' for ask_user timeout path.",
    ).toMatch(/["']awaiting_response["']/);
  });

  it("update_idea status enum includes 'triaging'", () => {
    // The idea is set to triaging when the job starts
    const updateIdeaBlock = mcpSource.match(
      /server\.tool\(\s*["']update_idea["'][\s\S]{0,2000}?\),?\s*\)/,
    );
    expect(updateIdeaBlock).not.toBeNull();
    expect(updateIdeaBlock![0]).toMatch(/["']triaging["']/);
  });
});

// ---------------------------------------------------------------------------
// AC: update-idea edge function accepts type field and enriched status
// ---------------------------------------------------------------------------

describe("update-idea edge function accepts idea type and pipeline statuses", () => {
  let edgeFnSource = '';

  beforeAll(() => {
    edgeFnSource = readSource(UPDATE_IDEA_FUNCTION);
  });

  it('update-idea edge function file exists and is non-empty', () => {
    expect(edgeFnSource, 'supabase/functions/update-idea/index.ts is missing or empty').not.toBe('');
  });

  it("edge function body destructures the 'type' field from the request", () => {
    // The triage agent sends type = 'bug' | 'feature' | 'task' | 'initiative'
    // The edge function must read and forward it to the ideas table
    expect(edgeFnSource).toMatch(/\btype\b.*=.*body\.|const\s*\{[^}]*\btype\b/s);
  });

  it("edge function writes 'type' to the updates payload when provided", () => {
    // updates.type = type (the ideas.type column from schema foundations)
    expect(edgeFnSource).toMatch(/updates\.type\s*=\s*type|updates\[['"]type['"]\]\s*=/);
  });

  it("edge function does not block 'enriched' status transitions", () => {
    // Current code blocks 'promoted' status — it must NOT block 'enriched'
    // Verify: 'enriched' is not in any rejection/guard block
    const guardBlock = edgeFnSource.match(
      /if\s*\(status\s*===\s*["']promoted["']\)[^}]{0,300}/s,
    );
    // The only guard should be for 'promoted', not 'enriched'
    expect(guardBlock).not.toBeNull();
    expect(guardBlock![0]).not.toMatch(/enriched/);
  });

  it("STATUS_EVENT_MAP includes 'enriched' event for idea enrichment", () => {
    // When triage completes (status → enriched), fire idea_enriched event
    expect(edgeFnSource).toMatch(/enriched.*idea_enriched|idea_enriched.*enriched/);
  });
});

// ---------------------------------------------------------------------------
// AC: ask_user tool sets idea status to awaiting_response on timeout
// ---------------------------------------------------------------------------

describe("ask_user tool sets idea to awaiting_response on timeout", () => {
  let mcpSource = '';

  beforeAll(() => {
    mcpSource = readSource(MCP_SERVER_FILE);
  });

  it("ask_user tool updates idea status to 'awaiting_response' on timeout", () => {
    // The ask_user implementation must set the idea to awaiting_response when 10-min expires
    const askUserBlock = mcpSource.match(
      /server\.tool\(\s*["']ask_user["'][\s\S]{0,3000}?\)\s*\)/s,
    );
    expect(
      askUserBlock,
      "Expected ask_user tool definition in agent-mcp-server.ts.",
    ).not.toBeNull();
    expect(askUserBlock![0]).toMatch(/awaiting_response/);
  });

  it("ask_user sets idea status via update_idea or direct Supabase call on timeout", () => {
    const askUserBlock = mcpSource.match(
      /server\.tool\(\s*["']ask_user["'][\s\S]{0,3000}?\)\s*\)/s,
    );
    expect(askUserBlock).not.toBeNull();
    // Must actually write awaiting_response to the DB on timeout, not just return error text
    const block = askUserBlock![0];
    expect(block).toMatch(/awaiting_response/);
    // Should involve supabase update or fetch to update-idea
    expect(block).toMatch(/supabase|fetch.*update-idea|update.*status/i);
  });
});
