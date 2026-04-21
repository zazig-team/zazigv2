/**
 * Feature: initiative-breakdown job type — local agent executor handling
 *
 * Static analysis tests covering:
 * - executor.ts: recognizes 'initiative-breakdown' as a valid job type
 * - executor.ts: defaults to breakdown-specialist role (or equivalent) for initiative-breakdown jobs
 * - executor.ts: passes ZAZIG_IDEA_ID env to breakdown agent spawns
 * - executor.ts: checks idea status periodically and exits cleanly when on_hold
 * - orchestrator: sets parent idea to 'spawned' when job completes
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
// AC: Local agent recognizes initiative-breakdown as a valid job type
// ---------------------------------------------------------------------------

describe("Local agent recognizes 'initiative-breakdown' as a valid job type", () => {
  let executorSource = '';

  beforeAll(() => {
    executorSource = readSource(EXECUTOR_FILE);
  });

  it('executor.ts file exists and is non-empty', () => {
    expect(executorSource, 'packages/local-agent/src/executor.ts is missing or empty').not.toBe('');
  });

  it("executor.ts references 'initiative-breakdown' job type", () => {
    expect(
      executorSource,
      "executor.ts must reference 'initiative-breakdown' to handle this job type.",
    ).toMatch(/initiative-breakdown/);
  });

  it("executor has a handler path for initiative-breakdown card type", () => {
    // The executor must branch on cardType === 'initiative-breakdown'
    // similar to how it branches on 'idea-triage'
    expect(executorSource).toMatch(
      /cardType.*initiative.breakdown|initiative.breakdown.*cardType|isInitiativeBreakdown/i,
    );
  });

  it("initiative-breakdown job type launches the breakdown agent role", () => {
    // When handling initiative-breakdown, the executor must set up a workspace
    // with an appropriate breakdown role — not a generic ephemeral job
    const breakdownBlock = executorSource.match(
      /initiative.breakdown[\s\S]{0,500}/,
    );
    expect(breakdownBlock).not.toBeNull();
    expect(breakdownBlock![0]).toMatch(
      /breakdown.specialist|initiative.breakdown.*role|role.*breakdown/i,
    );
  });
});

// ---------------------------------------------------------------------------
// AC: Executor passes ZAZIG_IDEA_ID to initiative-breakdown agent
// ---------------------------------------------------------------------------

describe("Executor passes ZAZIG_IDEA_ID to initiative-breakdown agent", () => {
  let executorSource = '';

  beforeAll(() => {
    executorSource = readSource(EXECUTOR_FILE);
  });

  it("executor.ts resolves ideaId for initiative-breakdown jobs", () => {
    // The breakdown agent needs to know which idea it's breaking down.
    // The executor must extract idea_id from context and forward it.
    const breakdownBlock = executorSource.match(
      /initiative.breakdown[\s\S]{0,800}/s,
    );
    expect(breakdownBlock, "Expected initiative-breakdown block in executor.ts").not.toBeNull();
    expect(breakdownBlock![0]).toMatch(/ideaId|idea_id|ZAZIG_IDEA_ID/i);
  });

  it("ZAZIG_IDEA_ID is set from the job's idea_id for breakdown jobs", () => {
    // The executor must forward ideaId as ZAZIG_IDEA_ID env to the tmux session,
    // following the same pattern as idea-triage jobs
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
// AC: initiative-breakdown jobs pick up ideas with status='breaking_down'
// ---------------------------------------------------------------------------

describe("initiative-breakdown job type picks up ideas with status='breaking_down'", () => {
  let executorSource = '';

  beforeAll(() => {
    executorSource = readSource(EXECUTOR_FILE);
  });

  it("'breaking_down' status is associated with initiative-breakdown job handling", () => {
    // The executor or orchestrator must recognize 'breaking_down' as the status
    // that triggers an initiative-breakdown job
    expect(executorSource).toMatch(/breaking_down/);
  });

  it("on_hold check is associated with initiative-breakdown job execution", () => {
    // Like idea-triage, the breakdown job must check on_hold and exit cleanly
    const onHoldBlock = executorSource.match(
      /on_hold[\s\S]{0,800}/s,
    );
    expect(onHoldBlock).not.toBeNull();
    // The on_hold check must cover idea jobs (triage or breakdown)
    expect(onHoldBlock![0]).toMatch(/idea|triage|breakdown|job.*hold|hold.*job/i);
  });
});

// ---------------------------------------------------------------------------
// AC: Orchestrator sets parent idea to 'spawned' when job completes
// ---------------------------------------------------------------------------

describe("Orchestrator sets parent idea to 'spawned' when initiative-breakdown completes", () => {
  let executorSource = '';

  beforeAll(() => {
    executorSource = readSource(EXECUTOR_FILE);
  });

  it("executor.ts or orchestrator references 'spawned' status for idea completion", () => {
    // When the breakdown job completes, the orchestrator must set the parent
    // idea status to 'spawned' to indicate it has been broken down
    expect(executorSource).toMatch(/spawned/);
  });

  it("'spawned' status transition is linked to initiative-breakdown completion", () => {
    // The 'spawned' status transition must appear in context of breakdown or idea job completion
    const spawnedBlock = executorSource.match(
      /spawned[\s\S]{0,600}/s,
    );
    expect(spawnedBlock).not.toBeNull();
    expect(spawnedBlock![0]).toMatch(/initiative.breakdown|breakdown|idea|triage/i);
  });
});

// ---------------------------------------------------------------------------
// AC: initiative-breakdown uses appropriate capacity slot
// ---------------------------------------------------------------------------

describe("initiative-breakdown job type uses appropriate capacity slot", () => {
  let executorSource = '';

  beforeAll(() => {
    executorSource = readSource(EXECUTOR_FILE);
  });

  it("initiative-breakdown job type is handled with a slot allocation strategy", () => {
    // The executor should allocate capacity for initiative-breakdown jobs
    // (either its own slot type or reusing claude_code slot)
    expect(executorSource).toMatch(
      /initiative.breakdown[\s\S]{0,500}?(slot|claude_code|capacity)/is,
    );
  });
});

// ---------------------------------------------------------------------------
// AC: workspace.ts includes breakdown role context
// ---------------------------------------------------------------------------

describe("Workspace sets up breakdown-specialist context for initiative-breakdown", () => {
  let workspaceSource = '';
  let executorSource = '';

  beforeAll(() => {
    workspaceSource = readSource(WORKSPACE_FILE);
    executorSource = readSource(EXECUTOR_FILE);
  });

  it("initiative-breakdown role context includes child idea creation guidance", () => {
    // The breakdown agent's context must instruct it to create child ideas
    const combined = workspaceSource + executorSource;
    expect(combined).toMatch(
      /initiative.breakdown[\s\S]{0,2000}?(create.idea|child.*idea|idea.*child|breakdown)/is,
    );
  });
});
