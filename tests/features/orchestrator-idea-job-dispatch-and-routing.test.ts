/**
 * Feature: Orchestrator — idea job dispatch and routing
 *
 * Tests for all acceptance criteria of the orchestrator idea lifecycle
 * state machine: watching for new/enriched/completed ideas and dispatching
 * the appropriate jobs.
 *
 * These tests do static analysis of the orchestrator edge function source.
 * Written to FAIL until the feature is implemented.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');
const ORCHESTRATOR_FILE = path.join(
  REPO_ROOT,
  'supabase',
  'functions',
  'orchestrator',
  'index.ts',
);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let orchestratorSource = '';

function readOrchestrator(): string {
  try {
    return fs.readFileSync(ORCHESTRATOR_FILE, 'utf-8');
  } catch {
    return '';
  }
}

// ---------------------------------------------------------------------------
// AC1: New ideas get an idea-triage job created
// ---------------------------------------------------------------------------

describe("AC1: New ideas (status='new', on_hold=false) get an idea-triage job created", () => {
  beforeAll(() => {
    orchestratorSource = readOrchestrator();
  });

  it('orchestrator file exists and is non-empty', () => {
    expect(
      orchestratorSource,
      'supabase/functions/orchestrator/index.ts is missing or empty.',
    ).not.toBe('');
  });

  it("queries ideas where status = 'new'", () => {
    expect(orchestratorSource).toMatch(/status.*['"=].*new|['"=].*new.*status/i);
  });

  it("filters out ideas where on_hold = true (queries on_hold = false)", () => {
    expect(orchestratorSource).toMatch(/on_hold.*false|eq.*on_hold.*false/i);
  });

  it("creates a job with job_type 'idea-triage'", () => {
    expect(orchestratorSource).toMatch(/idea-triage/);
  });

  it('sets idea_id on the created triage job', () => {
    // The job record inserted for triage must include idea_id
    expect(orchestratorSource).toMatch(/idea_id/);
  });

  it('includes idea raw_text, title, or description in the triage job brief', () => {
    // The triage job brief should incorporate the idea's content
    expect(orchestratorSource).toMatch(/raw_text|brief.*idea|idea.*brief/i);
  });

  it('sets company_id on the created triage job from the idea', () => {
    expect(orchestratorSource).toMatch(/company_id/);
  });
});

// ---------------------------------------------------------------------------
// AC2: Idea status transitions atomically to 'triaging' when job is created
// ---------------------------------------------------------------------------

describe("AC2: Idea status transitions atomically to 'triaging' when triage job is created", () => {
  beforeAll(() => {
    orchestratorSource = readOrchestrator();
  });

  it("updates idea status to 'triaging'", () => {
    expect(orchestratorSource).toMatch(/status.*triaging|triaging.*status/i);
  });

  it('uses atomic / optimistic-lock pattern to prevent double-dispatch (WHERE status = current_status RETURNING)', () => {
    // Atomic transition: UPDATE ... WHERE status = 'new' RETURNING or eq-chain before update
    // Either raw SQL with RETURNING or Supabase .update().eq('status', 'new') with select()
    expect(orchestratorSource).toMatch(
      /eq.*status.*new|WHERE.*status.*=.*new|update.*eq.*status.*new/i,
    );
  });
});

// ---------------------------------------------------------------------------
// AC3: Enriched bug/feature ideas are promoted to features via promote-idea
// ---------------------------------------------------------------------------

describe("AC3: Enriched bug/feature ideas are promoted to features via promote-idea", () => {
  beforeAll(() => {
    orchestratorSource = readOrchestrator();
  });

  it("queries ideas where status = 'enriched'", () => {
    expect(orchestratorSource).toMatch(/enriched/);
  });

  it("reads the idea's type field to make routing decision", () => {
    // The orchestrator must branch on idea.type
    expect(orchestratorSource).toMatch(/idea.*type|type.*bug|type.*feature|\.type\b/i);
  });

  it("calls promote-idea (or promote_idea) for bug/feature type ideas", () => {
    expect(orchestratorSource).toMatch(/promote.?idea|promote_idea/i);
  });

  it("sets idea status to 'routed' after promotion", () => {
    expect(orchestratorSource).toMatch(/routed/);
  });
});

// ---------------------------------------------------------------------------
// AC4: Enriched task ideas get a task-execute job, status moves to 'executing'
// ---------------------------------------------------------------------------

describe("AC4: Enriched task ideas get a task-execute job created, status moves to 'executing'", () => {
  beforeAll(() => {
    orchestratorSource = readOrchestrator();
  });

  it("creates a job with job_type 'task-execute' for task ideas", () => {
    expect(orchestratorSource).toMatch(/task-execute/);
  });

  it("sets idea status to 'executing' when routing a task", () => {
    // The 'executing' transition for the task routing path (not the resume-awaiting-response path)
    // is part of the new routing logic
    const taskRoutingBlock = orchestratorSource.match(
      /task.{0,300}executing|executing.{0,300}task/is,
    );
    expect(
      taskRoutingBlock,
      "Expected 'task-execute' and 'executing' status to appear together in the routing logic.",
    ).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// AC5: Enriched initiative ideas get initiative-breakdown job, status = 'breaking_down'
// ---------------------------------------------------------------------------

describe("AC5: Enriched initiative ideas get an initiative-breakdown job, status moves to 'breaking_down'", () => {
  beforeAll(() => {
    orchestratorSource = readOrchestrator();
  });

  it("creates a job with job_type 'initiative-breakdown' for initiative ideas", () => {
    expect(orchestratorSource).toMatch(/initiative-breakdown/);
  });

  it("sets idea status to 'breaking_down' when routing an initiative", () => {
    expect(orchestratorSource).toMatch(/breaking_down/);
  });
});

// ---------------------------------------------------------------------------
// AC6: Completed task-execute jobs move idea to 'done'
// ---------------------------------------------------------------------------

describe("AC6: Completed task-execute jobs move idea to 'done'", () => {
  beforeAll(() => {
    orchestratorSource = readOrchestrator();
  });

  it("watches for completed task-execute jobs", () => {
    // The orchestrator must check completed jobs with job_type 'task-execute'
    expect(orchestratorSource).toMatch(/task-execute/);
  });

  it("sets idea status to 'done' when the task-execute job completes", () => {
    expect(orchestratorSource).toMatch(/done/);
  });

  it("task-execute completion sets 'done' in proximity to task-execute references", () => {
    const taskDoneBlock = orchestratorSource.match(
      /task-execute.{0,500}done|done.{0,500}task-execute/is,
    );
    expect(
      taskDoneBlock,
      "Expected 'done' status assignment near 'task-execute' job type reference in the orchestrator.",
    ).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// AC7: Completed initiative-breakdown jobs move idea to 'spawned'
// ---------------------------------------------------------------------------

describe("AC7: Completed initiative-breakdown jobs move idea to 'spawned'", () => {
  beforeAll(() => {
    orchestratorSource = readOrchestrator();
  });

  it("watches for completed initiative-breakdown jobs", () => {
    expect(orchestratorSource).toMatch(/initiative-breakdown/);
  });

  it("sets idea status to 'spawned' when the initiative-breakdown job completes", () => {
    expect(orchestratorSource).toMatch(/spawned/);
  });

  it("initiative-breakdown completion sets 'spawned' in proximity to initiative-breakdown references", () => {
    const breakdownSpawnedBlock = orchestratorSource.match(
      /initiative-breakdown.{0,500}spawned|spawned.{0,500}initiative-breakdown/is,
    );
    expect(
      breakdownSpawnedBlock,
      "Expected 'spawned' status assignment near 'initiative-breakdown' job type reference.",
    ).not.toBeNull();
  });

  it("transitions parent idea from breaking_down to spawned on completed initiative-breakdown jobs", () => {
    const transitionBlock = orchestratorSource.match(
      /row\.job_type\s*===\s*["']initiative-breakdown["'][\s\S]{0,500}transitionIdeaStatusIfExpected\([\s\S]{0,300}["']breaking_down["'][\s\S]{0,160}["']spawned["']/is,
    );
    expect(
      transitionBlock,
      "Expected completion watcher to call transitionIdeaStatusIfExpected(..., 'breaking_down', 'spawned') for initiative-breakdown jobs.",
    ).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// AC8: on_hold ideas are skipped by all watch loops
// ---------------------------------------------------------------------------

describe('AC8: on_hold ideas are skipped by all watch loops', () => {
  beforeAll(() => {
    orchestratorSource = readOrchestrator();
  });

  it('references on_hold in the orchestrator (the column is checked in queries)', () => {
    expect(orchestratorSource).toMatch(/on_hold/);
  });

  it("filters on_hold = false when querying 'new' ideas for triage dispatch", () => {
    // The new-idea watch loop must include on_hold = false
    const newIdeasBlock = orchestratorSource.match(
      /status.*new.{0,300}on_hold|on_hold.{0,300}status.*new/is,
    );
    expect(
      newIdeasBlock,
      "Expected 'on_hold' filter in the query for new ideas (triage dispatch).",
    ).not.toBeNull();
  });

  it("filters on_hold = false when querying 'enriched' ideas for routing", () => {
    const enrichedBlock = orchestratorSource.match(
      /enriched.{0,300}on_hold|on_hold.{0,300}enriched/is,
    );
    expect(
      enrichedBlock,
      "Expected 'on_hold' filter in the query for enriched ideas (routing).",
    ).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// AC9: No double-dispatch — atomic status transitions prevent duplicate jobs
// ---------------------------------------------------------------------------

describe('AC9: No double-dispatch — atomic status transitions prevent duplicate jobs', () => {
  beforeAll(() => {
    orchestratorSource = readOrchestrator();
  });

  it('uses optimistic locking (eq on status before update) to prevent races', () => {
    // Pattern: update().eq('status', expectedStatus) means "only update if still in this status"
    // This is the supabase-client optimistic lock pattern
    expect(orchestratorSource).toMatch(
      /\.update\(.*\)[\s\S]{0,200}\.eq\(.*status/i,
    );
  });

  it('checks for an existing active job before creating a new one per idea', () => {
    // One active job per idea: the orchestrator must guard against creating a duplicate
    expect(orchestratorSource).toMatch(/active.*job.*idea|idea.*active.*job|already.*job|job.*idea_id/i);
  });

  it("initiative-breakdown route goes through dispatchIdeaStageJob, which applies hasActiveJobForIdea guard", () => {
    const initiativeRouteBlock = orchestratorSource.match(
      /if\s*\(ideaType\s*===\s*["']initiative["']\)[\s\S]{0,600}dispatchIdeaStageJob\([\s\S]{0,400}jobType:\s*["']initiative-breakdown["']/is,
    );
    expect(initiativeRouteBlock).not.toBeNull();
    expect(orchestratorSource).toMatch(
      /async function dispatchIdeaStageJob[\s\S]{0,1800}hasActiveJobForIdea\(/,
    );
  });
});

// ---------------------------------------------------------------------------
// AC10: Concurrency limits are respected
// ---------------------------------------------------------------------------

describe('AC10: Concurrency limits are respected per company', () => {
  beforeAll(() => {
    orchestratorSource = readOrchestrator();
  });

  it('defines or references a max concurrent idea-triage jobs limit', () => {
    // Should have a constant or config value for max concurrent triage jobs (default 3)
    expect(orchestratorSource).toMatch(
      /MAX.*TRIAGE|TRIAGE.*MAX|max.*triage|triage.*concurr|concurr.*triage|idea.triage.*limit|limit.*idea.triage/i,
    );
  });

});

// ---------------------------------------------------------------------------
// AC11: One active job per idea at a time
// ---------------------------------------------------------------------------

describe('AC11: Only one active job per idea at a time', () => {
  beforeAll(() => {
    orchestratorSource = readOrchestrator();
  });

  it('checks idea_id when querying for active jobs to prevent duplicate dispatch', () => {
    // Before creating a new job for an idea, the orchestrator must verify no active job exists
    // This is done by querying jobs where idea_id = <id> and status is active/running
    expect(orchestratorSource).toMatch(/idea_id/);
  });

  it('skips job creation if an active job already exists for the idea', () => {
    // The guard: if (activeJob) continue; or similar
    expect(orchestratorSource).toMatch(
      /active.*job.*skip|skip.*active.*job|already.*active|has.*active|active.*exists/i,
    );
  });
});

// ---------------------------------------------------------------------------
// AC12: Existing feature pipeline loops are not affected
// ---------------------------------------------------------------------------

describe('AC12: Existing feature pipeline loops are not affected', () => {
  beforeAll(() => {
    orchestratorSource = readOrchestrator();
  });

  it('existing triggerCombining or triggerMerging references are preserved', () => {
    expect(orchestratorSource).toMatch(/triggerCombining|triggerMerging|triggerTestWriting/);
  });

  it('new idea dispatch functions coexist alongside the existing pipeline', () => {
    // Both the new 'idea-triage' job creation AND existing feature pipeline functions
    // must be present in the same file
    const hasNewDispatch = /idea-triage/.test(orchestratorSource);
    const hasExistingPipeline = /triggerCombining|triggerMerging|auto[_-]?triage/i.test(orchestratorSource);
    expect(hasNewDispatch, "New 'idea-triage' dispatch not found.").toBe(true);
    expect(hasExistingPipeline, "Existing feature pipeline references have been removed.").toBe(true);
  });
});
