/**
 * Feature: task-execute job type — local agent executor handling
 *
 * Static analysis tests covering:
 * - executor.ts: recognizes 'task-execute' as a valid job type
 * - executor.ts: launches the task-execute agent role
 * - executor.ts: passes ZAZIG_IDEA_ID to task-execute agent
 * - executor.ts: handles on_hold suspend/resume for task-execute jobs
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
// AC: Local agent recognizes task-execute as a valid job type
// ---------------------------------------------------------------------------

describe("Local agent recognizes 'task-execute' as a valid job type", () => {
  let executorSource = '';

  beforeAll(() => {
    executorSource = readSource(EXECUTOR_FILE);
  });

  it('executor.ts file exists and is non-empty', () => {
    expect(executorSource, 'packages/local-agent/src/executor.ts is missing or empty').not.toBe('');
  });

  it("executor.ts references 'task-execute' job type", () => {
    expect(
      executorSource,
      "executor.ts must reference 'task-execute' to handle this job type.",
    ).toMatch(/task-execute/);
  });

  it("executor has a handler path for task-execute card type", () => {
    // The executor must branch on cardType === 'task-execute' (or similar)
    expect(executorSource).toMatch(
      /cardType.*task.execute|task.execute.*cardType|cardType.*===.*task/i,
    );
  });

  it("task-execute job type launches the task-execute agent role", () => {
    // When handling task-execute, the executor must set up a workspace with the
    // task-execute role — not a generic ephemeral code job
    const taskBlock = executorSource.match(
      /task-execute[\s\S]{0,500}/,
    );
    expect(taskBlock).not.toBeNull();
    expect(taskBlock![0]).toMatch(/task.execute.*role|role.*task.execute|task.*agent/i);
  });
});

// ---------------------------------------------------------------------------
// AC: Executor passes ZAZIG_IDEA_ID to task-execute agent
// ---------------------------------------------------------------------------

describe("Executor passes ZAZIG_IDEA_ID to task-execute agent", () => {
  let executorSource = '';

  beforeAll(() => {
    executorSource = readSource(EXECUTOR_FILE);
  });

  it("executor.ts defines or references ZAZIG_IDEA_ID environment variable for task-execute", () => {
    // The task-execute agent needs to know which idea it is executing
    // ask_user also needs this to post to the correct idea thread
    expect(executorSource).toMatch(/ZAZIG_IDEA_ID/);
  });

  it("ZAZIG_IDEA_ID is set from the job's idea_id field for task-execute jobs", () => {
    // The StartJob for task-execute jobs includes idea_id
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
// AC: task-execute job uses on_hold suspend/resume pattern
// ---------------------------------------------------------------------------

describe("Executor handles on_hold suspend/resume for task-execute jobs", () => {
  let executorSource = '';

  beforeAll(() => {
    executorSource = readSource(EXECUTOR_FILE);
  });

  it("executor.ts references 'on_hold' for task-execute job monitoring", () => {
    // The executor must check on_hold status for task-execute jobs (same as idea-triage)
    expect(executorSource).toMatch(/on_hold/);
  });

  it("on_hold detection leads to a clean job exit for task-execute", () => {
    // When on_hold is set, the executor should kill the tmux session and clean up
    const onHoldBlock = executorSource.match(
      /on_hold[\s\S]{0,1200}/s,
    );
    expect(onHoldBlock).not.toBeNull();
    expect(onHoldBlock![0]).toMatch(/kill|exit|stop|abort|terminate|sendKeys.*exit/i);
  });
});

// ---------------------------------------------------------------------------
// AC: task-execute job type uses appropriate capacity slot
// ---------------------------------------------------------------------------

describe("task-execute job type uses appropriate capacity slot", () => {
  let executorSource = '';

  beforeAll(() => {
    executorSource = readSource(EXECUTOR_FILE);
  });

  it("task-execute job type is handled with a slot allocation strategy", () => {
    expect(executorSource).toMatch(/task.execute[\s\S]{0,500}?(slot|claude_code|capacity)/is);
  });
});

// ---------------------------------------------------------------------------
// AC: workspace.ts maps task-execute role to appropriate defaults
// ---------------------------------------------------------------------------

describe("workspace.ts includes task-execute role in ROLE_DEFAULT_MCP_TOOLS", () => {
  let workspaceSource = '';

  beforeAll(() => {
    workspaceSource = readSource(WORKSPACE_FILE);
  });

  it('workspace.ts file exists and is non-empty', () => {
    expect(workspaceSource, 'packages/local-agent/src/workspace.ts is missing or empty').not.toBe('');
  });

  it("workspace.ts references 'task-execute' role", () => {
    expect(workspaceSource).toMatch(/task-execute/);
  });

  it("task-execute role entry grants ask_user tool", () => {
    // The task-execute agent needs ask_user for clarifying questions mid-execution
    const taskBlock = workspaceSource.match(
      /['""]task-execute['""][^}]{0,300}/s,
    );
    expect(
      taskBlock,
      "Expected task-execute entry in ROLE_DEFAULT_MCP_TOOLS to include ask_user.",
    ).not.toBeNull();
    expect(taskBlock![0]).toMatch(/ask_user/);
  });

  it("task-execute role entry grants update_idea tool", () => {
    // The task-execute agent needs update_idea to record output path after completion
    const taskBlock = workspaceSource.match(
      /['""]task-execute['""][^}]{0,300}/s,
    );
    expect(
      taskBlock,
      "Expected task-execute entry in ROLE_DEFAULT_MCP_TOOLS to include update_idea.",
    ).not.toBeNull();
    expect(taskBlock![0]).toMatch(/update_idea/);
  });
});

// ---------------------------------------------------------------------------
// AC: executor defaults task-execute jobs to the task-executor role
// ---------------------------------------------------------------------------

describe("Executor defaults task-execute jobs to the task-executor workspace role", () => {
  let executorSource = '';

  beforeAll(() => {
    executorSource = readSource(EXECUTOR_FILE);
  });

  it("executor sets role to 'task-executor' (or similar) for task-execute card type", () => {
    // When handling task-execute, the executor must assign the correct agent role
    // (parallel to how idea-triage defaults to 'triage-analyst')
    expect(executorSource).toMatch(/task.execut(e|or).*role|role.*task.execut(e|or)/i);
  });

  it("executor forwards ideaId to workspace config for task-execute jobs", () => {
    // The task-execute workspace needs ideaId to read context and post updates
    const taskBlock = executorSource.match(
      /task.execute[\s\S]{0,800}/s,
    );
    expect(taskBlock).not.toBeNull();
    expect(taskBlock![0]).toMatch(/ideaId|idea_id/i);
  });
});
