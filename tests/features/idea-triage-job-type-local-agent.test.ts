/**
 * Feature: idea-triage job type — local agent executor handling
 *
 * Static analysis tests covering:
 * - executor.ts: recognizes 'idea-triage' as a valid job type
 * - executor.ts: passes ZAZIG_IDEA_ID env to triage agent spawns
 * - executor.ts: checks on_hold periodically and exits cleanly when set
 * - executor.ts: handles idea-triage as a separate execution path from code jobs
 *
 * Written to FAIL until the feature is implemented.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');

const EXECUTOR_FILE = path.join(REPO_ROOT, 'packages', 'local-agent', 'src', 'executor.ts');
const WORKSPACE_FILE = path.join(REPO_ROOT, 'packages', 'local-agent', 'src', 'workspace.ts');

function readSource(filePath: string): string {
  try {
    return fs.readFileSync(filePath, 'utf-8');
  } catch {
    return '';
  }
}

// ---------------------------------------------------------------------------
// AC: Local agent recognizes idea-triage as a valid job type
// ---------------------------------------------------------------------------

describe("Local agent recognizes 'idea-triage' as a valid job type", () => {
  let executorSource = '';

  beforeAll(() => {
    executorSource = readSource(EXECUTOR_FILE);
  });

  it('executor.ts file exists and is non-empty', () => {
    expect(executorSource, 'packages/local-agent/src/executor.ts is missing or empty').not.toBe('');
  });

  it("executor.ts references 'idea-triage' job type", () => {
    expect(
      executorSource,
      "executor.ts must reference 'idea-triage' to handle this job type.",
    ).toMatch(/idea-triage/);
  });

  it("executor has a handler path for idea-triage card type", () => {
    // The executor must branch on cardType === 'idea-triage' (or similar)
    // similar to how it branches on cardType === 'persistent_agent' or 'combine'
    expect(executorSource).toMatch(
      /cardType.*idea.triage|idea.triage.*cardType|cardType.*===.*idea/i,
    );
  });

  it("idea-triage job type launches the triage agent role", () => {
    // When handling idea-triage, the executor must set up a workspace with the
    // idea-triage role — not a generic ephemeral job
    const triageBlock = executorSource.match(
      /idea-triage[\s\S]{0,500}/,
    );
    expect(triageBlock).not.toBeNull();
    expect(triageBlock![0]).toMatch(/idea.triage.*role|role.*idea.triage|triage.*agent/i);
  });
});

// ---------------------------------------------------------------------------
// AC: Executor passes ZAZIG_IDEA_ID env to triage agent spawns
// ---------------------------------------------------------------------------

describe("Executor passes ZAZIG_IDEA_ID to idea-triage agent", () => {
  let executorSource = '';

  beforeAll(() => {
    executorSource = readSource(EXECUTOR_FILE);
  });

  it("executor.ts defines or references ZAZIG_IDEA_ID environment variable", () => {
    // The triage agent needs to know which idea it's triaging
    // The ask_user tool also needs this to post to the correct idea thread
    expect(executorSource).toMatch(/ZAZIG_IDEA_ID/);
  });

  it("ZAZIG_IDEA_ID is set from the job's idea_id field", () => {
    // The StartJob message for idea-triage jobs includes idea_id
    // The executor must forward it as ZAZIG_IDEA_ID env to the tmux session
    const envBlock = executorSource.match(
      /ZAZIG_IDEA_ID[^};\n]{0,200}/s,
    );
    expect(
      envBlock,
      "Expected ZAZIG_IDEA_ID to be set from idea_id in the executor.",
    ).not.toBeNull();
    expect(envBlock![0]).toMatch(/idea_id|ideaId/i);
  });
});

// ---------------------------------------------------------------------------
// AC: Executor checks on_hold and exits cleanly when set
// ---------------------------------------------------------------------------

describe("Executor exits cleanly when on_hold is set for idea-triage jobs", () => {
  let executorSource = '';

  beforeAll(() => {
    executorSource = readSource(EXECUTOR_FILE);
  });

  it("executor.ts references 'on_hold' for idea-triage job monitoring", () => {
    // The executor must periodically check on_hold status for triage jobs
    expect(executorSource).toMatch(/on_hold/);
  });

  it("on_hold check is associated with idea-triage job execution", () => {
    // The on_hold check must appear in a block related to idea-triage or idea jobs
    const onHoldBlock = executorSource.match(
      /on_hold[\s\S]{0,500}/,
    );
    expect(onHoldBlock).not.toBeNull();
    // Should reference idea or triage context
    expect(onHoldBlock![0]).toMatch(/idea|triage|job.*hold|hold.*job/i);
  });

  it("on_hold check queries the idea or job record from the database", () => {
    // To detect on_hold, the executor must poll either the idea or job record
    const onHoldBlock = executorSource.match(
      /on_hold[\s\S]{0,800}/s,
    );
    expect(onHoldBlock).not.toBeNull();
    // Should involve a DB query (supabase.from or similar)
    expect(onHoldBlock![0]).toMatch(/supabase|\.from\(|ideas|jobs/i);
  });

  it("on_hold detection leads to a clean job exit (kill or stop)", () => {
    // When on_hold is set, the executor should kill the tmux session and clean up
    const onHoldBlock = executorSource.match(
      /on_hold[\s\S]{0,1200}/s,
    );
    expect(onHoldBlock).not.toBeNull();
    expect(onHoldBlock![0]).toMatch(/kill|exit|stop|abort|terminate|sendKeys.*exit/i);
  });
});

// ---------------------------------------------------------------------------
// AC: Bug classification includes codebase research context in job context
// ---------------------------------------------------------------------------

describe("Triage agent role prompt includes research guidance for idea types", () => {
  let workspaceSource = '';
  let executorSource = '';

  beforeAll(() => {
    workspaceSource = readSource(WORKSPACE_FILE);
    executorSource = readSource(EXECUTOR_FILE);
  });

  it("idea-triage role context includes research instructions", () => {
    // The triage agent's CLAUDE.md context must instruct it to research
    // (codebase search, git log, web search) based on idea type
    // This can be in the workspace builder, executor context assembly, or a DB role prompt
    const combined = workspaceSource + executorSource;
    expect(combined).toMatch(
      /idea.triage[\s\S]{0,2000}?(research|codebase|git log|web search|enrich)/is,
    );
  });

  it("idea-triage role context references idea type classification", () => {
    // The role prompt/context must instruct the agent to classify as bug/feature/task/initiative
    const combined = workspaceSource + executorSource;
    expect(combined).toMatch(
      /idea.triage[\s\S]{0,2000}?(bug|feature|task|initiative)/is,
    );
  });
});

// ---------------------------------------------------------------------------
// AC: Triage job uses appropriate slot type and does not over-consume capacity
// ---------------------------------------------------------------------------

describe("idea-triage job type uses appropriate capacity slot", () => {
  let executorSource = '';

  beforeAll(() => {
    executorSource = readSource(EXECUTOR_FILE);
  });

  it("idea-triage job type is handled with a slot allocation strategy", () => {
    // The executor should allocate capacity for idea-triage jobs
    // (either its own slot type or reusing claude_code slot)
    expect(executorSource).toMatch(/idea.triage[\s\S]{0,500}?(slot|claude_code|capacity)/is);
  });
});

// ---------------------------------------------------------------------------
// AC: ask_user timeout path in executor context (idea moves to awaiting_response)
// ---------------------------------------------------------------------------

describe("ask_user timeout causes job to exit with idea in awaiting_response status", () => {
  let executorSource = '';
  let mcpServerSource = '';

  beforeAll(() => {
    executorSource = readSource(EXECUTOR_FILE);
    mcpServerSource = fs.existsSync(
      path.join(REPO_ROOT, 'packages', 'local-agent', 'src', 'agent-mcp-server.ts'),
    )
      ? fs.readFileSync(
          path.join(REPO_ROOT, 'packages', 'local-agent', 'src', 'agent-mcp-server.ts'),
          'utf-8',
        )
      : '';
  });

  it("ask_user 10-minute timeout constant is defined", () => {
    // The ask_user implementation has a 10-min (600_000ms) timeout
    expect(mcpServerSource).toMatch(/600[_,]000|ASK_USER_TIMEOUT/);
  });

  it("ask_user timeout path sets idea status to awaiting_response", () => {
    // On timeout, ask_user must:
    // 1. Update the idea status to 'awaiting_response'
    // 2. Return a timeout signal so the job exits
    expect(mcpServerSource).toMatch(/awaiting_response/);
    const askUserBlock = mcpServerSource.match(
      /["']ask_user["'][\s\S]{0,3000}/,
    );
    expect(askUserBlock).not.toBeNull();
    const block = askUserBlock![0];
    // The timeout path (after 600s) should set awaiting_response
    expect(block).toMatch(/timeout[\s\S]{0,500}awaiting_response|awaiting_response[\s\S]{0,500}timeout/is);
  });
});

// ---------------------------------------------------------------------------
// AC: Triage completes without questions for clear, detailed ideas
// ---------------------------------------------------------------------------

describe("Triage agent role is designed to complete without questions for clear ideas", () => {
  let executorSource = '';
  let workspaceSource = '';

  beforeAll(() => {
    executorSource = readSource(EXECUTOR_FILE);
    workspaceSource = readSource(WORKSPACE_FILE);
  });

  it("idea-triage role context instructs agent to be opinionated and not over-ask", () => {
    // The role prompt must discourage excessive questioning for clear ideas
    // This could be in the DB role prompt, workspace builder, or executor context assembly
    const combined = workspaceSource + executorSource;
    // Look for guidance near idea-triage context: opinionated, minimal questions, or skip ask_user
    // for clear ideas
    expect(combined).toMatch(
      /idea.triage[\s\S]{0,2000}?(opinionated|minimal.*question|don.*over.ask|clear.*idea.*without|without.*question)/is,
    );
  });
});
