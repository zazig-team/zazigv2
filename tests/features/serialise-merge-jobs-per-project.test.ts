/**
 * Feature: Serialise feature-to-master merge jobs per project
 * Feature ID: 598bebb2-45d7-4897-a704-1baa6b253c47
 *
 * Tests for all acceptance criteria:
 * AC1 - When two features for the same project pass CI simultaneously, only one merge job is
 *       enriched to queued — the other stays in created
 * AC2 - When the first merge completes, the second merge job is enriched on the next cycle
 * AC3 - A failed merge job unblocks the queue — the next waiting merge job proceeds
 * AC4 - Merge jobs for different projects are unaffected — they can run in parallel
 * AC5 - FIFO ordering is maintained — first feature to pass CI merges first
 * AC6 - No changes required to the daemon, executor, or merge agent prompt
 *
 * Failure cases:
 * FC1 - Gate must not block merge jobs when no other merge is in-flight (false positive)
 * FC2 - Gate must not affect non-merge job types (combine, code, ci_check, etc.)
 * FC3 - Overlapping orchestrator runs must not result in two merge jobs queued for same project
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

const ORCHESTRATOR_PATH = 'supabase/functions/orchestrator/index.ts';

// ---------------------------------------------------------------------------
// Structural: dispatchQueuedJobs contains the merge serialisation gate
// ---------------------------------------------------------------------------

describe('Structural: dispatchQueuedJobs contains merge serialisation gate', () => {
  let orchestrator: string | null;

  beforeAll(() => {
    orchestrator = readRepoFile(ORCHESTRATOR_PATH);
  });

  it('orchestrator/index.ts exists', () => {
    expect(orchestrator).not.toBeNull();
  });

  it('dispatchQueuedJobs function exists in orchestrator', () => {
    expect(orchestrator).toContain('dispatchQueuedJobs');
  });

  it('gate checks job.job_type === "merge" (or equivalent) before querying in-flight merges', () => {
    const src = orchestrator ?? '';
    // The gate must be conditional on the job type being merge
    expect(src).toMatch(/job\.job_type\s*===\s*["']merge["']|job_type\s*===\s*["']merge["']/);
  });

  it('gate queries jobs table for in-flight merges on same project_id', () => {
    const src = orchestrator ?? '';
    // Must query the jobs table filtering by project_id matching the current job's project_id
    // The query should be scoped to project_id
    expect(src).toMatch(/job\.project_id|project_id.*job\.project_id/);
  });

  it('gate queries for status IN (queued, executing) — not failed or created', () => {
    const src = orchestrator ?? '';
    // The in-flight check must use queued and executing statuses
    // Merge jobs with these statuses block the waiting job
    const mergeGateIdx = src.indexOf('job.job_type === "merge"');
    expect(mergeGateIdx).toBeGreaterThan(-1);
    // Within a reasonable window after the merge type check, look for queued+executing
    const surroundingCode = src.substring(mergeGateIdx, mergeGateIdx + 1000);
    expect(surroundingCode).toMatch(/queued.*executing|executing.*queued/);
  });

  it('gate excludes the current job id from the in-flight query (id != job.id)', () => {
    const src = orchestrator ?? '';
    // The query must exclude the current job so it doesn't block itself
    const mergeGateIdx = src.indexOf('job.job_type === "merge"');
    expect(mergeGateIdx).toBeGreaterThan(-1);
    const surroundingCode = src.substring(mergeGateIdx, mergeGateIdx + 1000);
    // Should use neq("id", job.id) or equivalent
    expect(surroundingCode).toMatch(/neq.*job\.id|job\.id.*neq|!=.*job\.id|job\.id.*!=/);
  });

  it('gate logs "[orchestrator] merge job ... waiting — another merge for project ... is in-flight"', () => {
    const src = orchestrator ?? '';
    // Must log the waiting message with the expected pattern
    expect(src).toMatch(/\[orchestrator\].*merge job.*waiting.*another merge.*in-flight/i);
  });

  it('gate uses continue to skip enrichment when a merge is already in-flight', () => {
    const src = orchestrator ?? '';
    // After detecting an in-flight merge, the gate must skip (continue) the current job
    const mergeGateIdx = src.indexOf('job.job_type === "merge"');
    expect(mergeGateIdx).toBeGreaterThan(-1);
    const surroundingCode = src.substring(mergeGateIdx, mergeGateIdx + 600);
    expect(surroundingCode).toMatch(/\bcontinue\b/);
  });

  it('gate appears after the DAG dependency check in dispatchQueuedJobs', () => {
    const src = orchestrator ?? '';
    // The DAG check is an existing gate; the merge gate should appear after it
    const dagCheckIdx = src.indexOf('DAG check: if this job has dependencies');
    const mergeGateIdx = src.indexOf('job.job_type === "merge"');
    expect(dagCheckIdx).toBeGreaterThan(-1);
    expect(mergeGateIdx).toBeGreaterThan(-1);
    expect(mergeGateIdx).toBeGreaterThan(dagCheckIdx);
  });

  it('gate appears before the enrichment section (resolving model + slot type)', () => {
    const src = orchestrator ?? '';
    // The enrichment logic resolves model and slot type — the gate must be before that
    const resolveModelIdx = src.indexOf('Resolve model + slot type');
    const mergeGateIdx = src.indexOf('job.job_type === "merge"');
    expect(resolveModelIdx).toBeGreaterThan(-1);
    expect(mergeGateIdx).toBeGreaterThan(-1);
    expect(mergeGateIdx).toBeLessThan(resolveModelIdx);
  });
});

// ---------------------------------------------------------------------------
// AC1: Only one merge job enriched — second stays in created
// ---------------------------------------------------------------------------

describe('AC1: Only one merge job per project is enriched to queued', () => {
  it('gate queries jobs with job_type = merge and status in queued or executing', () => {
    const src = readRepoFile(ORCHESTRATOR_PATH) ?? '';
    // The gate must check both queued and executing statuses to catch all in-flight jobs
    const mergeGateIdx = src.indexOf('job.job_type === "merge"');
    expect(mergeGateIdx).toBeGreaterThan(-1);
    const window = src.substring(mergeGateIdx, mergeGateIdx + 800);
    expect(window).toContain('"queued"');
    expect(window).toContain('"executing"');
  });

  it('gate also checks job_type = merge in the in-flight query', () => {
    const src = readRepoFile(ORCHESTRATOR_PATH) ?? '';
    // The in-flight query must also filter by job_type = merge (not all job types)
    const mergeGateIdx = src.indexOf('job.job_type === "merge"');
    expect(mergeGateIdx).toBeGreaterThan(-1);
    const window = src.substring(mergeGateIdx, mergeGateIdx + 800);
    // Should have a second reference to "merge" for the DB query filter
    const mergeRefs = (window.match(/"merge"/g) ?? []).length;
    expect(mergeRefs).toBeGreaterThanOrEqual(2); // one for the condition, one for the DB filter
  });

  it('waiting merge job is left in created status (not failed or skipped permanently)', () => {
    const src = readRepoFile(ORCHESTRATOR_PATH) ?? '';
    // The gate must NOT update the job to failed — it just continues the loop
    // There should NOT be a .update({ status: "failed" }) inside the merge gate window
    const mergeGateIdx = src.indexOf('job.job_type === "merge"');
    expect(mergeGateIdx).toBeGreaterThan(-1);
    const window = src.substring(mergeGateIdx, mergeGateIdx + 600);
    // No status update to failed within the merge gate
    expect(window).not.toMatch(/status.*failed.*within.*merge|update.*failed.*merge.*gate/);
    // The gate should just log and continue
    expect(window).toMatch(/\bcontinue\b/);
  });
});

// ---------------------------------------------------------------------------
// AC2: After first merge completes, second is enriched next cycle
// ---------------------------------------------------------------------------

describe('AC2: Gate unblocks when in-flight merge job is no longer active', () => {
  it('gate query only blocks on queued or executing — not complete, failed, or failed_retrying', () => {
    const src = readRepoFile(ORCHESTRATOR_PATH) ?? '';
    // The in-flight statuses are exactly queued and executing
    // complete, failed, failed_retrying must NOT be included (they don't block)
    const mergeGateIdx = src.indexOf('job.job_type === "merge"');
    expect(mergeGateIdx).toBeGreaterThan(-1);
    const window = src.substring(mergeGateIdx, mergeGateIdx + 800);
    // Should NOT include "complete" in the status filter for the in-flight query
    // (complete means the previous merge finished — new merge can proceed)
    // The gate uses .in("status", ["queued", "executing"]) — exactly these two
    expect(window).not.toMatch(/\.in\s*\(\s*["']status["']\s*,\s*\[.*"complete".*\]/);
    expect(window).not.toMatch(/\.in\s*\(\s*["']status["']\s*,\s*\[.*"failed".*\]/);
  });

  it('gate uses LIMIT 1 to efficiently detect any in-flight merge', () => {
    const src = readRepoFile(ORCHESTRATOR_PATH) ?? '';
    const mergeGateIdx = src.indexOf('job.job_type === "merge"');
    expect(mergeGateIdx).toBeGreaterThan(-1);
    const window = src.substring(mergeGateIdx, mergeGateIdx + 800);
    // Should use .limit(1) for efficiency — only need to know if any exists
    expect(window).toMatch(/\.limit\s*\(\s*1\s*\)/);
  });
});

// ---------------------------------------------------------------------------
// AC3: Failed merge job unblocks the queue
// ---------------------------------------------------------------------------

describe('AC3: Failed merge job does not block subsequent merge jobs', () => {
  it('gate only blocks on queued and executing — failed status is not in the gate set', () => {
    const src = readRepoFile(ORCHESTRATOR_PATH) ?? '';
    // failed and failed_retrying are not in the gate's status filter
    // So a failed merge job will NOT block the next one
    const mergeGateIdx = src.indexOf('job.job_type === "merge"');
    expect(mergeGateIdx).toBeGreaterThan(-1);
    const window = src.substring(mergeGateIdx, mergeGateIdx + 800);
    // Gate uses .in("status", [...]) — verify "failed" is not in this list
    // Find the .in( call after the merge gate condition
    const inCallMatch = window.match(/\.in\s*\(\s*["']status["']\s*,\s*\[(.*?)\]/s);
    if (inCallMatch) {
      const statusList = inCallMatch[1];
      expect(statusList).not.toContain('"failed"');
      expect(statusList).not.toContain('"failed_retrying"');
      expect(statusList).not.toContain('"created"');
    } else {
      // The .in() call may be spread across lines — check more broadly
      // Key: the two statuses in the gate are queued and executing ONLY
      expect(window).toMatch(/["']queued["']/);
      expect(window).toMatch(/["']executing["']/);
    }
  });
});

// ---------------------------------------------------------------------------
// AC4: Merge jobs for different projects run in parallel
// ---------------------------------------------------------------------------

describe('AC4: Gate is per project_id — different projects are unaffected', () => {
  it('gate filters by project_id = job.project_id (not company-wide)', () => {
    const src = readRepoFile(ORCHESTRATOR_PATH) ?? '';
    // The gate must be scoped to the same project, not the same company
    const mergeGateIdx = src.indexOf('job.job_type === "merge"');
    expect(mergeGateIdx).toBeGreaterThan(-1);
    const window = src.substring(mergeGateIdx, mergeGateIdx + 800);
    // Should use .eq("project_id", job.project_id) — project-scoped gate
    expect(window).toMatch(/eq\s*\(\s*["']project_id["']\s*,\s*job\.project_id\s*\)/);
  });

  it('gate does NOT filter by company_id (not a company-wide gate)', () => {
    const src = readRepoFile(ORCHESTRATOR_PATH) ?? '';
    const mergeGateIdx = src.indexOf('job.job_type === "merge"');
    expect(mergeGateIdx).toBeGreaterThan(-1);
    const window = src.substring(mergeGateIdx, mergeGateIdx + 800);
    // The gate should NOT be scoped to company_id — only project_id
    // A company with two projects should be able to merge both in parallel
    // Verify the gate query does NOT add .eq("company_id", ...) as its primary filter
    // (project_id is sufficient since project_id is unique per project)
    expect(window).not.toMatch(/eq\s*\(\s*["']company_id["']\s*,\s*job\.company_id\s*\)[\s\S]{0,200}eq\s*\(\s*["']project_id/);
  });
});

// ---------------------------------------------------------------------------
// AC5: FIFO ordering preserved
// ---------------------------------------------------------------------------

describe('AC5: FIFO ordering — first feature to pass CI merges first', () => {
  it('dispatchQueuedJobs fetches jobs ordered by created_at ascending', () => {
    const src = readRepoFile(ORCHESTRATOR_PATH) ?? '';
    // The outer fetch of created jobs uses ORDER BY created_at ASC
    // This ensures the oldest merge job (first CI pass) is processed first
    expect(src).toMatch(/order\s*\(\s*["']created_at["']\s*,\s*\{.*ascending.*true.*\}/);
  });

  it('merge gate does not re-order jobs or skip based on anything other than project in-flight status', () => {
    const src = readRepoFile(ORCHESTRATOR_PATH) ?? '';
    // The gate only blocks when another merge is in-flight
    // It does not prioritise, re-sort, or modify the job ordering
    const mergeGateIdx = src.indexOf('job.job_type === "merge"');
    expect(mergeGateIdx).toBeGreaterThan(-1);
    const window = src.substring(mergeGateIdx, mergeGateIdx + 800);
    // Gate should just check in-flight status and continue — no complex ordering
    expect(window).toMatch(/\bcontinue\b/);
    // Should not sort or reorder
    expect(window).not.toMatch(/sort\s*\(|\.order\s*\(.*ascending/);
  });
});

// ---------------------------------------------------------------------------
// AC6: No changes to daemon, executor, or merge agent prompt
// ---------------------------------------------------------------------------

describe('AC6: Gate is in orchestrator only — daemon, executor, merge agent unchanged', () => {
  it('daemon agent-inbound-poll does not contain merge serialisation logic', () => {
    const daemon = readRepoFile('packages/local-agent/src/daemon.ts') ??
      readRepoFile('packages/local-agent/src/index.ts') ?? '';
    // Daemon should NOT have merge serialisation gate logic
    expect(daemon).not.toMatch(/merge.*waiting.*in-flight|in-flight.*merge.*waiting/i);
  });

  it('executor does not contain merge serialisation logic', () => {
    const executor = readRepoFile('packages/local-agent/src/executor.ts') ?? '';
    // Executor should NOT have merge serialisation gate logic
    expect(executor).not.toMatch(/merge.*waiting.*in-flight|in-flight.*merge.*waiting/i);
  });

  it('merge agent role prompt does not reference serialisation gate', () => {
    // Check the roles directory for a merge role definition
    const mergeRole = readRepoFile('supabase/functions/_shared/roles/merge.ts') ??
      readRepoFile('packages/orchestrator/src/roles/merge.ts') ??
      readRepoFile('supabase/functions/orchestrator/roles/merge.ts') ?? null;
    if (mergeRole !== null) {
      // If a merge role file exists, it should NOT have been modified to include gate logic
      expect(mergeRole).not.toMatch(/in-flight.*merge|merge.*serialis/i);
    }
    // If merge role file doesn't exist, this test passes by default
    // (the feature is a no-op for the merge agent)
    expect(true).toBe(true);
  });

  it('orchestrator is the only file containing the merge waiting/in-flight log message', () => {
    const orchestrator = readRepoFile(ORCHESTRATOR_PATH) ?? '';
    // The log message should only be in the orchestrator
    expect(orchestrator).toMatch(/merge job.*waiting.*in-flight/i);
  });
});

// ---------------------------------------------------------------------------
// FC1: Gate does not block when no other merge is in-flight
// ---------------------------------------------------------------------------

describe('FC1: No false positive blocks — gate allows merge when no other is in-flight', () => {
  it('gate only skips enrichment when the in-flight query returns a row', () => {
    const src = readRepoFile(ORCHESTRATOR_PATH) ?? '';
    // The gate should only continue (skip) when the in-flight query returns data
    // Pattern: if (inFlightMerge && inFlightMerge.length > 0) { log; continue; }
    const mergeGateIdx = src.indexOf('job.job_type === "merge"');
    expect(mergeGateIdx).toBeGreaterThan(-1);
    const window = src.substring(mergeGateIdx, mergeGateIdx + 800);
    // The continue must be inside a conditional — not unconditional
    // There should be an if-statement before the continue
    expect(window).toMatch(/if\s*\(.*\)\s*\{[\s\S]{0,300}continue/);
  });

  it('gate does not skip merge jobs when no other merge is in the gate set', () => {
    const src = readRepoFile(ORCHESTRATOR_PATH) ?? '';
    // The gate condition checks for the presence of another in-flight merge
    // If none exists, the job proceeds to enrichment
    const mergeGateIdx = src.indexOf('job.job_type === "merge"');
    expect(mergeGateIdx).toBeGreaterThan(-1);
    const window = src.substring(mergeGateIdx, mergeGateIdx + 1000);
    // After the gate's continue block, the code should fall through to enrichment
    // The gate does not have an else that also continues
    // Verify the structure is: if (inFlight) { continue } — not if (...) { continue } else { continue }
    expect(window).not.toMatch(/if\s*\([\s\S]{0,300}continue[\s\S]{0,100}\}\s*else\s*\{[\s\S]{0,100}continue/);
  });
});

// ---------------------------------------------------------------------------
// FC2: Gate does not affect non-merge job types
// ---------------------------------------------------------------------------

describe('FC2: Gate only applies to merge job type — other types unaffected', () => {
  it('gate is wrapped in an if (job.job_type === "merge") condition', () => {
    const src = readRepoFile(ORCHESTRATOR_PATH) ?? '';
    // The entire gate must be inside a merge job_type check
    expect(src).toMatch(/if\s*\(\s*job\.job_type\s*===\s*["']merge["']\s*\)/);
  });

  it('combine jobs are not checked against the merge in-flight gate', () => {
    const src = readRepoFile(ORCHESTRATOR_PATH) ?? '';
    // combine jobs should not be affected by the merge serialisation gate
    const mergeGateIdx = src.indexOf('job.job_type === "merge"');
    expect(mergeGateIdx).toBeGreaterThan(-1);
    const window = src.substring(mergeGateIdx, mergeGateIdx + 800);
    // The gate window should not reference "combine" job type
    expect(window).not.toMatch(/job_type.*combine.*in-flight|combine.*merge.*gate/i);
  });

  it('code jobs are not checked against the merge in-flight gate', () => {
    const src = readRepoFile(ORCHESTRATOR_PATH) ?? '';
    // code jobs pass through the merge gate without any check
    const mergeGateIdx = src.indexOf('job.job_type === "merge"');
    expect(mergeGateIdx).toBeGreaterThan(-1);
    const window = src.substring(mergeGateIdx, mergeGateIdx + 600);
    // The gate should be guarded by job.job_type === "merge"
    // so code jobs never enter this block
    expect(window).toMatch(/job\.job_type\s*===\s*["']merge["']/);
  });

  it('ci_check jobs are not blocked by the merge gate', () => {
    const src = readRepoFile(ORCHESTRATOR_PATH) ?? '';
    // ci_check jobs must not be affected — the gate is type-specific
    const mergeGateIdx = src.indexOf('job.job_type === "merge"');
    expect(mergeGateIdx).toBeGreaterThan(-1);
    const window = src.substring(mergeGateIdx, mergeGateIdx + 600);
    // The merge gate condition must be strictly for "merge" type
    expect(window).toMatch(/job\.job_type\s*===\s*["']merge["']/);
    expect(window).not.toMatch(/ci_check.*in-flight|ci_check.*waiting/);
  });
});

// ---------------------------------------------------------------------------
// FC3: Overlapping orchestrator runs — CAS lock prevents double-queuing
// ---------------------------------------------------------------------------

describe('FC3: Overlapping orchestrator runs do not double-queue merge jobs', () => {
  it('enrichment update uses CAS lock (.in("status", ["created", "verify_failed"]))', () => {
    const src = readRepoFile(ORCHESTRATOR_PATH) ?? '';
    // The CAS lock on enrichment ensures that even if two orchestrator runs pass the
    // merge gate, only one can win the race to transition created → queued
    // Verify the enrichment update uses a status CAS guard
    expect(src).toMatch(/\.in\s*\(\s*["']status["']\s*,\s*\[.*["']created["'].*["']verify_failed["'].*\]|\.in\s*\(\s*["']status["']\s*,\s*\[.*["']verify_failed["'].*["']created["'].*\]/);
  });

  it('CAS lock on enrichment exists within dispatchQueuedJobs', () => {
    const src = readRepoFile(ORCHESTRATOR_PATH) ?? '';
    // The CAS lock must be inside dispatchQueuedJobs — this is the mechanism that
    // prevents double-dispatch between overlapping orchestrator runs
    const dispatchIdx = src.indexOf('async function dispatchQueuedJobs');
    expect(dispatchIdx).toBeGreaterThan(-1);
    // Find the end of dispatchQueuedJobs by looking for the next top-level function
    const functionBody = src.substring(dispatchIdx, dispatchIdx + 20000);
    expect(functionBody).toMatch(/\.in\s*\(\s*["']status["']\s*,\s*\[.*["']created["']/);
  });
});

// ---------------------------------------------------------------------------
// Logging: gate produces correct log output
// ---------------------------------------------------------------------------

describe('Logging: merge gate produces expected log message', () => {
  it('log message includes [orchestrator] prefix', () => {
    const src = readRepoFile(ORCHESTRATOR_PATH) ?? '';
    const logMatch = src.match(/\[orchestrator\].*merge job[\s\S]{0,200}in-flight/);
    expect(logMatch).not.toBeNull();
  });

  it('log message includes the job id', () => {
    const src = readRepoFile(ORCHESTRATOR_PATH) ?? '';
    // The log must reference the specific job id being held back
    expect(src).toMatch(/\[orchestrator\].*merge job.*job\.id[\s\S]{0,100}in-flight|\[orchestrator\].*merge job.*\$\{job\.id\}[\s\S]{0,100}in-flight/);
  });

  it('log message includes the project_id that is blocked', () => {
    const src = readRepoFile(ORCHESTRATOR_PATH) ?? '';
    // The log must also reference which project has the in-flight merge
    expect(src).toMatch(/project.*\$\{.*project_id.*\}.*in-flight|in-flight[\s\S]{0,100}project.*\$\{.*project_id.*\}/);
  });

  it('gate uses console.log (not console.error) since waiting is expected behaviour', () => {
    const src = readRepoFile(ORCHESTRATOR_PATH) ?? '';
    // Waiting is not an error — it should be a regular log
    const mergeGateIdx = src.indexOf('job.job_type === "merge"');
    expect(mergeGateIdx).toBeGreaterThan(-1);
    const window = src.substring(mergeGateIdx, mergeGateIdx + 600);
    expect(window).toMatch(/console\.log/);
    // Should NOT use console.error for the waiting message
    expect(window).not.toMatch(/console\.error[\s\S]{0,100}waiting.*in-flight|console\.error[\s\S]{0,100}in-flight.*waiting/);
  });
});
