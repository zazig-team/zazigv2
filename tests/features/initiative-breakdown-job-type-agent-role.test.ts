/**
 * Feature: initiative-breakdown job type — agent role, MCP tools, and child idea creation
 *
 * Static analysis tests covering:
 * - workspace.ts: initiative-breakdown (or breakdown-specialist) role in ROLE_DEFAULT_MCP_TOOLS
 * - agent-mcp-server.ts: create_idea tool supports required fields (title, description,
 *   originator, source, company_id, tags) and does NOT set project_id
 * - agent-mcp-server.ts: update_idea status includes 'spawned' and 'breaking_down'
 * - ask_user works during breakdown for clarifications (same 10-min timeout pattern)
 * - Parent idea description/spec is updated with breakdown summary
 * - Child ideas reference the parent via tags (parent:idea-uuid)
 * - Child ideas do not have project_id set (triage assigns it)
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

function readSource(filePath: string): string {
  try {
    return fs.readFileSync(filePath, 'utf-8');
  } catch {
    return '';
  }
}

// ---------------------------------------------------------------------------
// AC: initiative-breakdown role is in workspace ROLE_DEFAULT_MCP_TOOLS
// ---------------------------------------------------------------------------

describe("initiative-breakdown role in ROLE_DEFAULT_MCP_TOOLS", () => {
  let workspaceSource = '';

  beforeAll(() => {
    workspaceSource = readSource(WORKSPACE_FILE);
  });

  it('workspace.ts file exists and is non-empty', () => {
    expect(workspaceSource, 'packages/local-agent/src/workspace.ts is missing or empty').not.toBe('');
  });

  it("includes 'initiative-breakdown' or 'breakdown-specialist' in ROLE_DEFAULT_MCP_TOOLS", () => {
    // The initiative-breakdown role must have an entry in ROLE_DEFAULT_MCP_TOOLS
    // Either as 'initiative-breakdown' or using the existing 'breakdown-specialist' key
    expect(workspaceSource).toMatch(/initiative.breakdown|breakdown.specialist/);
  });

  it("initiative-breakdown role entry grants ask_user tool", () => {
    // The breakdown agent must have ask_user so it can ask clarifying questions
    const breakdownBlock = workspaceSource.match(
      /['""](?:initiative.breakdown|breakdown.specialist)['""][^}]{0,300}/s,
    );
    expect(
      breakdownBlock,
      "Expected initiative-breakdown or breakdown-specialist entry in ROLE_DEFAULT_MCP_TOOLS.",
    ).not.toBeNull();
    expect(breakdownBlock![0]).toMatch(/ask_user/);
  });

  it("initiative-breakdown role entry grants create_idea or batch_create_ideas tool", () => {
    // The breakdown agent must be able to create child ideas
    const breakdownBlock = workspaceSource.match(
      /['""](?:initiative.breakdown|breakdown.specialist)['""][^}]{0,300}/s,
    );
    expect(
      breakdownBlock,
      "Expected initiative-breakdown or breakdown-specialist to include create_idea or batch_create_ideas.",
    ).not.toBeNull();
    expect(breakdownBlock![0]).toMatch(/create_idea|batch_create_ideas/);
  });

  it("initiative-breakdown role entry grants update_idea tool", () => {
    // The breakdown agent needs update_idea to write the breakdown summary back to the parent idea
    const breakdownBlock = workspaceSource.match(
      /['""](?:initiative.breakdown|breakdown.specialist)['""][^}]{0,300}/s,
    );
    expect(
      breakdownBlock,
      "Expected initiative-breakdown or breakdown-specialist to include update_idea.",
    ).not.toBeNull();
    expect(breakdownBlock![0]).toMatch(/update_idea/);
  });
});

// ---------------------------------------------------------------------------
// AC: create_idea tool supports required fields for child idea creation
// ---------------------------------------------------------------------------

describe("create_idea MCP tool supports required fields for child ideas", () => {
  let mcpSource = '';

  beforeAll(() => {
    mcpSource = readSource(MCP_SERVER_FILE);
  });

  it('agent-mcp-server.ts file exists and is non-empty', () => {
    expect(mcpSource, 'packages/local-agent/src/agent-mcp-server.ts is missing or empty').not.toBe('');
  });

  it("create_idea tool exists in agent-mcp-server.ts", () => {
    expect(mcpSource).toMatch(/server\.tool\(\s*["']create_idea["']/);
  });

  it("create_idea tool accepts a 'title' field", () => {
    const createIdeaBlock = mcpSource.match(
      /server\.tool\(\s*["']create_idea["'][\s\S]{0,2000}?\),?\s*\)/,
    );
    expect(createIdeaBlock, "Expected create_idea tool definition").not.toBeNull();
    expect(createIdeaBlock![0]).toMatch(/\btitle\b/);
  });

  it("create_idea tool accepts a 'description' field", () => {
    const createIdeaBlock = mcpSource.match(
      /server\.tool\(\s*["']create_idea["'][\s\S]{0,2000}?\),?\s*\)/,
    );
    expect(createIdeaBlock).not.toBeNull();
    expect(createIdeaBlock![0]).toMatch(/\bdescription\b/);
  });

  it("create_idea tool accepts 'originator' and 'source' fields", () => {
    const createIdeaBlock = mcpSource.match(
      /server\.tool\(\s*["']create_idea["'][\s\S]{0,2000}?\),?\s*\)/,
    );
    expect(createIdeaBlock).not.toBeNull();
    expect(createIdeaBlock![0]).toMatch(/originator/);
    expect(createIdeaBlock![0]).toMatch(/source/);
  });

  it("create_idea tool accepts a 'tags' field for parent reference", () => {
    // Child ideas must tag the parent idea via 'parent:idea-uuid' in the tags field
    const createIdeaBlock = mcpSource.match(
      /server\.tool\(\s*["']create_idea["'][\s\S]{0,2000}?\),?\s*\)/,
    );
    expect(createIdeaBlock).not.toBeNull();
    expect(createIdeaBlock![0]).toMatch(/\btags\b/);
  });

  it("create_idea tool does NOT require project_id (triage assigns it)", () => {
    // Child ideas must NOT have project_id set — the triage job assigns the correct project
    const createIdeaBlock = mcpSource.match(
      /server\.tool\(\s*["']create_idea["'][\s\S]{0,2000}?\),?\s*\)/,
    );
    expect(createIdeaBlock).not.toBeNull();
    // project_id should either be absent or optional in the create_idea schema
    const block = createIdeaBlock![0];
    const projectIdMatch = block.match(/project_id[\s\S]{0,100}/);
    if (projectIdMatch) {
      // If project_id exists in the schema, it must be optional
      expect(projectIdMatch[0]).toMatch(/optional\(\)|\.optional|z\.string\(\)\.optional/);
    }
    // Passing: project_id is absent or optional (child ideas don't set it)
  });
});

// ---------------------------------------------------------------------------
// AC: update_idea status enum includes 'spawned' for orchestrator completion
// ---------------------------------------------------------------------------

describe("update_idea status enum includes 'spawned' and 'breaking_down'", () => {
  let mcpSource = '';

  beforeAll(() => {
    mcpSource = readSource(MCP_SERVER_FILE);
  });

  it("update_idea status enum includes 'spawned'", () => {
    // When breakdown completes, the orchestrator marks the parent idea as 'spawned'
    // The update_idea tool must accept this value
    const updateIdeaBlock = mcpSource.match(
      /server\.tool\(\s*["']update_idea["'][\s\S]{0,2000}?\),?\s*\)/,
    );
    expect(
      updateIdeaBlock,
      "Expected update_idea tool definition in agent-mcp-server.ts.",
    ).not.toBeNull();
    expect(
      updateIdeaBlock![0],
      "update_idea status enum must include 'spawned' for breakdown completion.",
    ).toMatch(/["']spawned["']/);
  });

  it("update_idea status enum includes 'breaking_down'", () => {
    // The idea transitions to 'breaking_down' when the initiative-breakdown job starts
    const updateIdeaBlock = mcpSource.match(
      /server\.tool\(\s*["']update_idea["'][\s\S]{0,2000}?\),?\s*\)/,
    );
    expect(updateIdeaBlock).not.toBeNull();
    expect(updateIdeaBlock![0]).toMatch(/["']breaking_down["']/);
  });
});

// ---------------------------------------------------------------------------
// AC: ask_user works during breakdown for clarifications
// ---------------------------------------------------------------------------

describe("ask_user works during initiative-breakdown for clarifications", () => {
  let mcpSource = '';

  beforeAll(() => {
    mcpSource = readSource(MCP_SERVER_FILE);
  });

  it("ask_user tool exists in agent-mcp-server.ts with a timeout", () => {
    // The breakdown agent can call ask_user — same 10-min idle timeout / suspend-resume pattern
    expect(mcpSource).toMatch(/["']ask_user["']/);
  });

  it("ask_user timeout constant (600_000ms or ASK_USER_TIMEOUT) is defined", () => {
    // The ask_user implementation must have a 10-minute timeout
    expect(mcpSource).toMatch(/600[_,]000|ASK_USER_TIMEOUT/);
  });

  it("ask_user handles suspension so breakdown can be resumed after user responds", () => {
    // When ask_user times out, the job must suspend (same pattern as triage)
    // so it can be resumed when the user responds
    const askUserBlock = mcpSource.match(
      /["']ask_user["'][\s\S]{0,3000}/,
    );
    expect(askUserBlock).not.toBeNull();
    expect(askUserBlock![0]).toMatch(/suspend|awaiting_response|on_hold|timeout/i);
  });
});

// ---------------------------------------------------------------------------
// AC: Parent idea description/spec is updated with breakdown summary
// ---------------------------------------------------------------------------

describe("Agent role context instructs updating parent idea with breakdown summary", () => {
  let workspaceSource = '';
  let mcpSource = '';

  beforeAll(() => {
    workspaceSource = readSource(WORKSPACE_FILE);
    mcpSource = readSource(MCP_SERVER_FILE);
  });

  it("update_idea tool accepts a 'spec' or 'description' field for breakdown summary", () => {
    // After creating child ideas, the breakdown agent must update the parent idea
    // with a summary of the breakdown and links to child ideas
    const updateIdeaBlock = mcpSource.match(
      /server\.tool\(\s*["']update_idea["'][\s\S]{0,2000}?\),?\s*\)/,
    );
    expect(updateIdeaBlock, "Expected update_idea tool in agent-mcp-server.ts").not.toBeNull();
    expect(updateIdeaBlock![0]).toMatch(/spec|description/i);
  });

  it("initiative-breakdown role context references updating parent idea after breakdown", () => {
    // The workspace setup or role prompt must instruct the agent to update the parent idea
    const combined = workspaceSource + mcpSource;
    expect(combined).toMatch(
      /initiative.breakdown[\s\S]{0,3000}?(update.*parent|parent.*update|summary.*breakdown|breakdown.*summary)/is,
    );
  });
});

// ---------------------------------------------------------------------------
// AC: Child ideas reference the parent via tags (parent:idea-uuid)
// ---------------------------------------------------------------------------

describe("Child ideas reference parent idea via tags", () => {
  let workspaceSource = '';
  let mcpSource = '';

  beforeAll(() => {
    workspaceSource = readSource(WORKSPACE_FILE);
    mcpSource = readSource(MCP_SERVER_FILE);
  });

  it("initiative-breakdown context references 'parent:' tag convention for child ideas", () => {
    // The role prompt or workspace context must instruct the agent to tag child ideas
    // with 'parent:idea-uuid' to track lineage
    const combined = workspaceSource + mcpSource;
    expect(combined).toMatch(/parent:.*idea|parent.*tag|tag.*parent/i);
  });
});

// ---------------------------------------------------------------------------
// AC: Agent reads enriched idea content and conversation history
// ---------------------------------------------------------------------------

describe("Agent reads enriched idea content and conversation history", () => {
  let workspaceSource = '';
  let mcpSource = '';

  beforeAll(() => {
    workspaceSource = readSource(WORKSPACE_FILE);
    mcpSource = readSource(MCP_SERVER_FILE);
  });

  it("initiative-breakdown role context or MCP tools include query_ideas for reading idea content", () => {
    // The breakdown agent must read the idea record (title, description, spec)
    // and conversation history before breaking it down
    const breakdownBlock = workspaceSource.match(
      /['""](?:initiative.breakdown|breakdown.specialist)['""][^}]{0,300}/s,
    );
    expect(breakdownBlock, "Expected breakdown role entry in ROLE_DEFAULT_MCP_TOOLS").not.toBeNull();
    expect(breakdownBlock![0]).toMatch(/query_ideas/);
  });
});
