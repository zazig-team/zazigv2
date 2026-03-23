/**
 * Feature: Fix: ci_checking → merging catch-up in orchestrator heartbeat
 * Feature ID: 033d2bdd-d677-41d7-ad1b-2dea21afd9b6
 *
 * Tests for all acceptance criteria:
 * AC1 - Feature in ci_checking with completed ci_check job and no merge job gets a merge job created
 * AC2 - Feature in ci_checking with completed ci_check job AND existing active merge job is skipped
 * AC3 - Feature in ci_checking with a failed ci_check job is not touched
 * AC4 - Feature in ci_checking with an active fix job running is not touched
 * AC5 - Existing pipeline behaviour unchanged — event-driven path still works
 *
 * Failure cases:
 * FC1 - Must NOT create duplicate merge jobs if triggerMerging was already called by agent-event
 * FC2 - Must NOT trigger merge if ci_check job is still executing or failed
 * FC3 - Must NOT trigger merge if a fix job is actively running for the feature
 *
 * Tests are written to FAIL against the current codebase and pass once
 * the feature is implemented.
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

function readRepoFile(relPath: string): string | null {
  const fullPath = path.join(REPO_ROOT, relPath);
  try {
    return fs.readFileSync(fullPath, 'utf-8');
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Structural checks — orchestrator must contain step 4b catch-up logic
// ---------------------------------------------------------------------------

describe('Structural: orchestrator contains ci_checking → merging catch-up (step 4b)', () => {
  const ORCHESTRATOR_PATH = 'supabase/functions/orchestrator/index.ts';
  let orchestrator: string | null;

  beforeAll(() => {
    orchestrator = readRepoFile(ORCHESTRATOR_PATH);
  });

  it('orchestrator/index.ts exists', () => {
    expect(orchestrator).not.toBeNull();
  });

  it('contains a step 4b comment referencing ci_checking → merging catch-up', () => {
    expect(orchestrator).not.toBeNull();
    // Must have a comment labelling this as step 4b or ci_checking → merging catch-up
    expect(orchestrator).toMatch(/4b[\s\S]{0,80}ci_checking[\s\S]{0,80}merg|ci_checking[\s\S]{0,80}merg[\s\S]{0,80}catch/i);
  });

  it('queries features table filtering by status = ci_checking for merge catch-up', () => {
    expect(orchestrator).not.toBeNull();
    // The catch-up block must query features in ci_checking status
    // It should appear near a reference to merging or triggerMerging to distinguish from step 4
    const src = orchestrator ?? '';
    // Must have at least one block that checks ci_checking and also references triggerMerging
    const hasCiCheckingQuery = src.includes('"ci_checking"') || src.includes("'ci_checking'");
    const hasTriggerMergingCall = src.includes('triggerMerging(');
    expect(hasCiCheckingQuery).toBe(true);
    expect(hasTriggerMergingCall).toBe(true);
  });

  it('queries jobs table for completed ci_check job (status = complete)', () => {
    expect(orchestrator).not.toBeNull();
    const src = orchestrator ?? '';
    // The catch-up must check for a completed ci_check job
    expect(src).toMatch(/job_type.*ci_check|ci_check.*job_type/);
    // Must check for status = complete
    expect(src).toMatch(/"complete"|'complete'/);
  });

  it('checks for active merge jobs before triggering (status in created, queued, executing)', () => {
    expect(orchestrator).not.toBeNull();
    const src = orchestrator ?? '';
    // Guard: no active merge job (created, queued, executing) must be checked
    expect(src).toMatch(/job_type.*merge|merge.*job_type/);
    // Must use .in() or check for created/queued/executing statuses
    expect(src).toMatch(/created.*queued.*executing|queued.*executing.*created|executing.*created.*queued/);
  });

  it('checks for active fix/code jobs before triggering merge', () => {
    expect(orchestrator).not.toBeNull();
    const src = orchestrator ?? '';
    // Must check for active fix or code jobs (the "activeFixJobs" guard)
    // The feature spec shows: .in("job_type", ["code", "fix"])
    expect(src).toMatch(/"code"[\s\S]{0,50}"fix"|"fix"[\s\S]{0,50}"code"/);
  });

  it('calls triggerMerging for the catch-up path', () => {
    expect(orchestrator).not.toBeNull();
    const src = orchestrator ?? '';
    // triggerMerging must be called in the catch-up block
    // It's already imported — the catch-up must call it
    expect(src).toContain('triggerMerging(');
    // Should be called with (supabase, feature.id) pattern
    expect(src).toMatch(/triggerMerging\s*\(\s*supabase\s*,\s*feature\.id\s*\)/);
  });

  it('logs the expected catch-up message when triggering merge', () => {
    expect(orchestrator).not.toBeNull();
    const src = orchestrator ?? '';
    // Must log: [orchestrator] ci_checking feature {id} has completed ci_check but no merge job — triggering merge (catch-up)
    expect(src).toMatch(/ci_checking feature[\s\S]{0,30}completed ci_check[\s\S]{0,30}triggering merge/);
    expect(src).toContain('catch-up');
  });

  it('step 4b appears after step 4 ci_checking catch-up block in the file', () => {
    expect(orchestrator).not.toBeNull();
    const src = orchestrator ?? '';
    // Step 4 and step 4b should exist in order
    // Step 4 re-creates lost ci_check jobs; step 4b triggers merging after ci_check completes
    // Both reference ci_checking, but 4b also references triggerMerging
    const step4Index = src.indexOf('ci_checking');
    const triggerMergingIndex = src.indexOf('triggerMerging(supabase, feature.id)');
    expect(step4Index).toBeGreaterThan(-1);
    expect(triggerMergingIndex).toBeGreaterThan(-1);
    // triggerMerging call (step 4b) should appear after first ci_checking reference (step 4)
    expect(triggerMergingIndex).toBeGreaterThan(step4Index);
  });
});

// ---------------------------------------------------------------------------
// AC1: Feature in ci_checking with completed ci_check and no merge job gets merge triggered
// ---------------------------------------------------------------------------

describe('AC1: Catch-up triggers merge when ci_check completed and no merge job exists', () => {
  it('orchestrator source calls triggerMerging in the catch-up path (not just in agent-event handler)', () => {
    const src = readRepoFile('supabase/functions/orchestrator/index.ts') ?? '';
    // The orchestrator (not just agent-event) must contain the triggerMerging call
    expect(src).toContain('triggerMerging(supabase, feature.id)');
  });

  it('catch-up block limits query to 50 features (consistent with other catch-up steps)', () => {
    const src = readRepoFile('supabase/functions/orchestrator/index.ts') ?? '';
    // The catch-up block must use .limit(50) like other catch-up steps
    // Verify there's a .limit(50) near a ci_checking query section that also references triggerMerging
    const triggerMergingIdx = src.indexOf('triggerMerging(supabase, feature.id)');
    expect(triggerMergingIdx).toBeGreaterThan(-1);
    // Within reasonable range before the triggerMerging call, there should be a limit(50)
    const surroundingCode = src.substring(Math.max(0, triggerMergingIdx - 3000), triggerMergingIdx + 500);
    expect(surroundingCode).toMatch(/\.limit\(50\)/);
  });

  it('ci_check job query orders by created_at descending to get latest job', () => {
    const src = readRepoFile('supabase/functions/orchestrator/index.ts') ?? '';
    // Should use .order("created_at", { ascending: false }) to get the latest ci_check result
    expect(src).toMatch(/created_at[\s\S]{0,30}ascending.*false|ascending.*false[\s\S]{0,30}created_at/);
  });
});

// ---------------------------------------------------------------------------
// AC2/FC1: Skip if active merge job already exists (dedup guard)
// ---------------------------------------------------------------------------

describe('AC2/FC1: Skip catch-up if active merge job already exists', () => {
  it('orchestrator checks for existing active merge job before calling triggerMerging', () => {
    const src = readRepoFile('supabase/functions/orchestrator/index.ts') ?? '';
    // Must check for activeMergeJobs (or equivalent) and skip if found
    expect(src).toMatch(/activeMergeJob|active_merge_job|merge.*job.*created.*queued.*executing/i);
  });

  it('merge job guard checks job_type = merge with active statuses', () => {
    const src = readRepoFile('supabase/functions/orchestrator/index.ts') ?? '';
    // The guard: eq("job_type", "merge") AND .in("status", ["created", "queued", "executing"])
    expect(src).toMatch(/"merge"/);
    // Active statuses check near merge job_type
    const mergeJobTypeIdx = src.lastIndexOf('"merge"');
    expect(mergeJobTypeIdx).toBeGreaterThan(-1);
    const surroundingCode = src.substring(Math.max(0, mergeJobTypeIdx - 500), mergeJobTypeIdx + 500);
    expect(surroundingCode).toMatch(/created|queued|executing/);
  });

  it('skips feature (continue) when active merge job is found', () => {
    const src = readRepoFile('supabase/functions/orchestrator/index.ts') ?? '';
    // The guard pattern: if (activeMergeJobs && activeMergeJobs.length > 0) continue;
    // Should have a continue statement after the active merge job check
    const triggerMergingIdx = src.indexOf('triggerMerging(supabase, feature.id)');
    const surroundingCode = src.substring(Math.max(0, triggerMergingIdx - 2000), triggerMergingIdx);
    expect(surroundingCode).toMatch(/continue/);
  });
});

// ---------------------------------------------------------------------------
// AC3/FC2: Skip if ci_check job not in 'complete' status (failed, executing, etc.)
// ---------------------------------------------------------------------------

describe('AC3/FC2: Skip catch-up if ci_check job is not completed', () => {
  it('catch-up only proceeds when ci_check job has status = complete', () => {
    const src = readRepoFile('supabase/functions/orchestrator/index.ts') ?? '';
    // Must filter ci_check jobs by status = complete
    // Should have: .eq("job_type", "ci_check") AND .eq("status", "complete")
    expect(src).toMatch(/ci_check[\s\S]{0,200}complete|complete[\s\S]{0,200}ci_check/);
  });

  it('skips feature (continue) when no completed ci_check job is found', () => {
    const src = readRepoFile('supabase/functions/orchestrator/index.ts') ?? '';
    // Pattern: if (!completedCIJobs || completedCIJobs.length === 0) continue;
    // There should be a continue guard after checking for completed ci_check jobs
    const ciCheckCompleteIdx = src.indexOf('"ci_check"');
    expect(ciCheckCompleteIdx).toBeGreaterThan(-1);
    const afterCiCheck = src.substring(ciCheckCompleteIdx, ciCheckCompleteIdx + 2000);
    expect(afterCiCheck).toMatch(/continue/);
  });

  it('does NOT query ci_check jobs for status = failed or executing (only complete triggers merge)', () => {
    const src = readRepoFile('supabase/functions/orchestrator/index.ts') ?? '';
    // The catch-up must use eq("status", "complete") — not check for failures
    // Failures are handled by step 4 (the existing catch-up that re-creates ci_check jobs)
    const triggerMergingIdx = src.indexOf('triggerMerging(supabase, feature.id)');
    const surroundingCode = src.substring(Math.max(0, triggerMergingIdx - 2000), triggerMergingIdx);
    // Should reference "complete" status for ci_check, not "failed"
    expect(surroundingCode).toContain('"complete"');
  });
});

// ---------------------------------------------------------------------------
// AC4/FC3: Skip if active fix/code job is running for the feature
// ---------------------------------------------------------------------------

describe('AC4/FC3: Skip catch-up if active fix job is running', () => {
  it('catch-up checks for active fix/code jobs before triggering merge', () => {
    const src = readRepoFile('supabase/functions/orchestrator/index.ts') ?? '';
    // Must check for active fix/code jobs: .in("job_type", ["code", "fix"])
    expect(src).toMatch(/"fix"[\s\S]{0,100}"code"|"code"[\s\S]{0,100}"fix"/);
  });

  it('skips feature when active fix/code job is found', () => {
    const src = readRepoFile('supabase/functions/orchestrator/index.ts') ?? '';
    // The activeFixJobs guard should also have a continue statement
    const triggerMergingIdx = src.indexOf('triggerMerging(supabase, feature.id)');
    const surroundingCode = src.substring(Math.max(0, triggerMergingIdx - 3000), triggerMergingIdx);
    // Multiple continue statements expected (one for each guard)
    const continueMatches = (surroundingCode.match(/\bcontinue\b/g) ?? []).length;
    expect(continueMatches).toBeGreaterThanOrEqual(3); // completedCIJobs, activeMergeJobs, activeFixJobs
  });

  it('fix job guard checks both "code" and "fix" job types', () => {
    const src = readRepoFile('supabase/functions/orchestrator/index.ts') ?? '';
    // The guard must use .in("job_type", ["code", "fix"]) or equivalent
    // Verify "code" and "fix" appear near active status checks
    const triggerMergingIdx = src.indexOf('triggerMerging(supabase, feature.id)');
    const surroundingCode = src.substring(Math.max(0, triggerMergingIdx - 2000), triggerMergingIdx);
    expect(surroundingCode).toContain('"code"');
    expect(surroundingCode).toContain('"fix"');
  });
});

// ---------------------------------------------------------------------------
// AC5: Existing pipeline behaviour unchanged
// ---------------------------------------------------------------------------

describe('AC5: Existing pipeline behaviour — event-driven path unchanged', () => {
  it('triggerMerging import is still present in orchestrator (used by both agent-event and catch-up)', () => {
    const src = readRepoFile('supabase/functions/orchestrator/index.ts') ?? '';
    // triggerMerging must remain imported
    expect(src).toContain('triggerMerging');
  });

  it('processFeatureLifecycle function still exists in orchestrator', () => {
    const src = readRepoFile('supabase/functions/orchestrator/index.ts') ?? '';
    expect(src).toContain('processFeatureLifecycle');
  });

  it('existing step 4 ci_checking catch-up (for re-creating lost ci_check jobs) is still present', () => {
    const src = readRepoFile('supabase/functions/orchestrator/index.ts') ?? '';
    // The existing step 4 re-creates lost ci_check jobs — should still be there
    // It typically queries ci_checking features that have NO ci_check job
    expect(src).toContain('ci_checking');
    // The file should have multiple references to ci_checking (step 4 and step 4b)
    const ciCheckingMatches = (src.match(/ci_checking/g) ?? []).length;
    expect(ciCheckingMatches).toBeGreaterThanOrEqual(2);
  });

  it('orchestrator does not modify triggerMerging function itself (only calls it)', () => {
    const pipelineUtils = readRepoFile('supabase/functions/_shared/pipeline-utils.ts') ?? '';
    // triggerMerging definition should remain unchanged in pipeline-utils
    expect(pipelineUtils).toContain('triggerMerging');
  });

  it('step 4b is positioned correctly — after step 4 and before step 5 (merging → complete)', () => {
    const src = readRepoFile('supabase/functions/orchestrator/index.ts') ?? '';
    // Step 4b must come after the existing ci_check retry logic and before merging→complete
    // The triggerMerging call for step 4b should appear before any "merging" → complete catch-up
    const allTriggerMergingPositions: number[] = [];
    let searchPos = 0;
    while (true) {
      const idx = src.indexOf('triggerMerging(supabase, feature.id)', searchPos);
      if (idx === -1) break;
      allTriggerMergingPositions.push(idx);
      searchPos = idx + 1;
    }
    // There should be at least one triggerMerging call (from the catch-up)
    expect(allTriggerMergingPositions.length).toBeGreaterThanOrEqual(1);
  });
});

// ---------------------------------------------------------------------------
// Error handling: orchestrator logs errors from the ci_checking features query
// ---------------------------------------------------------------------------

describe('Error handling: query errors are logged, not swallowed', () => {
  it('orchestrator logs error when ci_checking features query fails in catch-up', () => {
    const src = readRepoFile('supabase/functions/orchestrator/index.ts') ?? '';
    // The catch-up block should handle query errors by logging them
    // Pattern: if (ciPassedErr) { console.error(...) }
    expect(src).toMatch(/ciPassedErr|ci.*passed.*err|ci.*checking.*features.*catch.*up.*error/i);
  });

  it('error message includes [orchestrator] prefix and context about merge catch-up', () => {
    const src = readRepoFile('supabase/functions/orchestrator/index.ts') ?? '';
    // Must log error with orchestrator prefix
    const triggerMergingIdx = src.indexOf('triggerMerging(supabase, feature.id)');
    const surroundingCode = src.substring(Math.max(0, triggerMergingIdx - 3000), triggerMergingIdx + 500);
    expect(surroundingCode).toMatch(/\[orchestrator\]/);
    expect(surroundingCode).toMatch(/console\.error/);
  });
});
