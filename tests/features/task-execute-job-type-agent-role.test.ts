/**
 * Feature: task-execute job type — agent role, MCP tools, and idea update surface
 *
 * Static analysis tests covering:
 * - workspace.ts: task-execute agent role prompt includes execution guidance
 * - agent-mcp-server.ts: update_idea tool supports output_path field
 * - update-idea edge function: supports output_path field and done/executing statuses
 * - agent role: reads enriched idea content and conversation history
 * - agent role: commits output to the correct repo directory
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
// AC: Agent reads enriched idea content and conversation history
// ---------------------------------------------------------------------------

describe("task-execute agent role reads enriched idea content and conversation history", () => {
  let workspaceSource = '';
  let executorSource = '';

  beforeAll(() => {
    workspaceSource = readSource(WORKSPACE_FILE);
    executorSource = readSource(
      path.join(REPO_ROOT, 'packages', 'local-agent', 'src', 'executor.ts'),
    );
  });

  it("task-execute role context includes instructions to read idea spec", () => {
    // The agent must read the idea's enriched spec (title, description, spec fields)
    const combined = workspaceSource + executorSource;
    expect(combined).toMatch(
      /task.execute[\s\S]{0,2000}?(spec|idea_record|description|enrich)/is,
    );
  });

  it("task-execute role context references conversation history (idea_messages)", () => {
    // The agent must read the full conversation history from idea_messages
    const combined = workspaceSource + executorSource;
    expect(combined).toMatch(
      /task.execute[\s\S]{0,2000}?(idea_messages|conversation.*history|message.*history)/is,
    );
  });

  it("task-execute role context looks up company project repo URL", () => {
    // The agent must look up company_project_id -> projects.repo_url to commit output
    const combined = workspaceSource + executorSource;
    expect(combined).toMatch(
      /task.execute[\s\S]{0,3000}?(repo_url|company_project|project.*repo)/is,
    );
  });
});

// ---------------------------------------------------------------------------
// AC: Presentations are generated as HTML and committed to company repo
// ---------------------------------------------------------------------------

describe("task-execute agent generates HTML presentations", () => {
  let workspaceSource = '';
  let executorSource = '';

  beforeAll(() => {
    workspaceSource = readSource(WORKSPACE_FILE);
    executorSource = readSource(
      path.join(REPO_ROOT, 'packages', 'local-agent', 'src', 'executor.ts'),
    );
  });

  it("task-execute role context instructs agent to generate presentations as HTML", () => {
    const combined = workspaceSource + executorSource;
    expect(combined).toMatch(
      /task.execute[\s\S]{0,3000}?(presentation.*html|html.*presentation|slides.*html)/is,
    );
  });

  it("task-execute role context specifies presentation output directory", () => {
    // Presentations go to sales/decks/ or marketing/ depending on context
    const combined = workspaceSource + executorSource;
    expect(combined).toMatch(
      /task.execute[\s\S]{0,3000}?(sales\/decks|marketing|decks)/is,
    );
  });
});

// ---------------------------------------------------------------------------
// AC: Output is committed to the correct directory in the company repo
// ---------------------------------------------------------------------------

describe("task-execute agent commits output to correct repo directory", () => {
  let workspaceSource = '';
  let executorSource = '';

  beforeAll(() => {
    workspaceSource = readSource(WORKSPACE_FILE);
    executorSource = readSource(
      path.join(REPO_ROOT, 'packages', 'local-agent', 'src', 'executor.ts'),
    );
  });

  it("task-execute role context specifies research output directory", () => {
    // Research outputs go to research/
    const combined = workspaceSource + executorSource;
    expect(combined).toMatch(
      /task.execute[\s\S]{0,3000}?research\//is,
    );
  });

  it("task-execute role context specifies docs output directory", () => {
    // Document outputs go to docs/
    const combined = workspaceSource + executorSource;
    expect(combined).toMatch(
      /task.execute[\s\S]{0,3000}?docs\//is,
    );
  });

  it("task-execute role context instructs to commit with a descriptive message referencing the idea", () => {
    // The commit message must reference the idea ID or title
    const combined = workspaceSource + executorSource;
    expect(combined).toMatch(
      /task.execute[\s\S]{0,3000}?(commit.*message|commit.*idea|idea.*commit)/is,
    );
  });
});

// ---------------------------------------------------------------------------
// AC: update_idea MCP tool supports output_path for completed task output
// ---------------------------------------------------------------------------

describe("update_idea MCP tool supports output_path field for task output", () => {
  let mcpSource = '';

  beforeAll(() => {
    mcpSource = readSource(MCP_SERVER_FILE);
  });

  it('agent-mcp-server.ts file exists and is non-empty', () => {
    expect(mcpSource, 'packages/local-agent/src/agent-mcp-server.ts is missing or empty').not.toBe('');
  });

  it("update_idea tool accepts an 'output_path' field for linking to committed output", () => {
    // After committing output, the agent calls update_idea with the file path/URL
    const updateIdeaBlock = mcpSource.match(
      /server\.tool\(\s*["']update_idea["'][\s\S]{0,2500}?\),?\s*\)/,
    );
    expect(
      updateIdeaBlock,
      "Expected update_idea tool definition in agent-mcp-server.ts.",
    ).not.toBeNull();
    expect(updateIdeaBlock![0]).toMatch(/output_path|output.*path|path.*output/i);
  });
});

// ---------------------------------------------------------------------------
// AC: update-idea edge function supports output_path and executing/done statuses
// ---------------------------------------------------------------------------

describe("update-idea edge function supports task-execute output fields", () => {
  let edgeFnSource = '';

  beforeAll(() => {
    edgeFnSource = readSource(UPDATE_IDEA_FUNCTION);
  });

  it('update-idea edge function file exists and is non-empty', () => {
    expect(edgeFnSource, 'supabase/functions/update-idea/index.ts is missing or empty').not.toBe('');
  });

  it("edge function body handles 'output_path' field from request", () => {
    // The task-execute agent sends output_path so the idea record stores the result location
    expect(edgeFnSource).toMatch(/output_path/);
  });

  it("edge function writes 'output_path' to the updates payload when provided", () => {
    expect(edgeFnSource).toMatch(/updates\.output_path\s*=\s*|updates\[['"]output_path['"]\]\s*=/);
  });

  it("edge function does not block 'executing' status transitions", () => {
    // The orchestrator sets idea to 'executing' when dispatching a task-execute job
    // The guard on 'promoted' must not inadvertently block 'executing'
    const guardBlock = edgeFnSource.match(
      /if\s*\(status\s*===\s*["']promoted["']\)[^}]{0,300}/s,
    );
    if (guardBlock) {
      expect(guardBlock![0]).not.toMatch(/executing/);
    }
  });
});

// ---------------------------------------------------------------------------
// AC: ask_user works during task execution for clarifications
// ---------------------------------------------------------------------------

describe("ask_user works during task-execute for clarifications", () => {
  let mcpSource = '';

  beforeAll(() => {
    mcpSource = readSource(MCP_SERVER_FILE);
  });

  it("ask_user tool is accessible during task-execute jobs", () => {
    // ask_user must be registered in the MCP server so task-execute agent can invoke it
    expect(mcpSource).toMatch(/["']ask_user["']/);
  });

  it("ask_user timeout path sets idea status to awaiting_response for task-execute", () => {
    // On 10-min timeout, ask_user suspends the task-execute job (same as triage)
    const askUserBlock = mcpSource.match(
      /server\.tool\(\s*["']ask_user["'][\s\S]{0,3000}?\)\s*\)/s,
    );
    expect(
      askUserBlock,
      "Expected ask_user tool definition in agent-mcp-server.ts.",
    ).not.toBeNull();
    expect(askUserBlock![0]).toMatch(/awaiting_response/);
  });
});

// ---------------------------------------------------------------------------
// AC: Orchestrator sets idea to 'done' when task-execute job completes
// ---------------------------------------------------------------------------

describe("Orchestrator sets idea to 'done' when task-execute job completes", () => {
  let orchestratorSource = '';

  beforeAll(() => {
    const orchestratorFile = path.join(
      REPO_ROOT, 'packages', 'orchestrator', 'src', 'index.ts',
    );
    orchestratorSource = readSource(orchestratorFile);
    if (!orchestratorSource) {
      // Try alternate location
      const altFile = path.join(REPO_ROOT, 'packages', 'orchestrator', 'src', 'orchestrator.ts');
      orchestratorSource = readSource(altFile);
    }
  });

  it("orchestrator source file exists and is non-empty", () => {
    expect(orchestratorSource, "packages/orchestrator/src/index.ts or orchestrator.ts is missing or empty").not.toBe('');
  });

  it("orchestrator references 'task-execute' job type", () => {
    expect(orchestratorSource).toMatch(/task.execute/i);
  });

  it("orchestrator sets idea status to 'done' after task-execute job completes", () => {
    // When the task-execute job finishes, the orchestrator marks the idea as done
    const taskBlock = orchestratorSource.match(
      /task.execute[\s\S]{0,1500}/s,
    );
    expect(taskBlock).not.toBeNull();
    expect(taskBlock![0]).toMatch(/done|["']done["']/);
  });
});
