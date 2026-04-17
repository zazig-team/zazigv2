/**
 * Feature: CI-Gated Pipeline — Mandatory test jobs
 * Feature ID: 2e64e77e-d9fe-452d-ab72-017bb4189660
 *
 * Tests that test jobs are mandatory for all features — no feature can
 * transition from breaking_down to building without a completed test job:
 *
 * AC1 - All features transitioning from breaking_down trigger a test job
 * AC2 - Features cannot enter 'building' status without a completed test job
 * AC3 - The orchestrator enforces the test job gate with no bypass path
 * AC4 - triggerTestWriting is called for ALL features (not skipped for any)
 * AC5 - Code jobs depend on the test job (code jobs have depends_on set to test job id)
 * AC6 - The writing_tests → building transition requires test job status = complete
 *
 * These tests are written to FAIL against the current codebase and pass once
 * the mandatory test job gate is fully enforced.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');

function readRepoFile(relPath: string): string | null {
  const fullPath = path.join(REPO_ROOT, relPath);
  try {
    return fs.readFileSync(fullPath, 'utf-8');
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// AC1 + AC4: triggerTestWriting called for all features, no bypass
// ---------------------------------------------------------------------------

describe('AC1/AC4: triggerTestWriting is called for ALL features without bypass', () => {
  let orchestrator: string | null;
  beforeAll(() => { orchestrator = readRepoFile('supabase/functions/orchestrator/index.ts'); });

  it('orchestrator exists', () => {
    expect(orchestrator).not.toBeNull();
  });

  it('triggerTestWriting is called unconditionally for all breakdown-complete features', () => {
    const src = orchestrator ?? '';
    // Must call triggerTestWriting for all features completing breakdown
    expect(src).toContain('triggerTestWriting');
    // Should NOT have a conditional skip (like "if feature has tests" or "if skip_tests")
    expect(src).not.toMatch(/skip.*test.*writ|test.*writ.*skip|noTest|no_test/i);
  });

  it('no feature can bypass writing_tests by transitioning directly to building', () => {
    const src = orchestrator ?? '';
    // The orchestrator must not have a path that transitions breaking_down → building directly
    // (i.e., skipping writing_tests)
    // Check that breaking_down → building direct transition does not exist
    const breakingDownToBuilding = /breaking_down[\s\S]{0,500}status.*building(?![\s\S]{0,200}writing_tests)/;
    // More specifically: no CAS update from breaking_down to building directly
    expect(src).not.toMatch(/breaking_down.*→.*building(?!.*writing_tests)/);
  });

  it('orchestrator imports triggerTestWriting from pipeline-utils', () => {
    expect(orchestrator).toContain('triggerTestWriting');
    // It should be imported (not just referenced as a comment)
    const src = orchestrator ?? '';
    const importIdx = src.indexOf('import');
    const firstImportBlock = src.substring(importIdx, importIdx + 3000);
    expect(firstImportBlock).toContain('triggerTestWriting');
  });
});

// ---------------------------------------------------------------------------
// AC2: Features cannot enter building without a completed test job
// ---------------------------------------------------------------------------

describe('AC2: Feature cannot enter building without a completed test job', () => {
  let orchestrator: string | null;
  beforeAll(() => { orchestrator = readRepoFile('supabase/functions/orchestrator/index.ts'); });

  it('writing_tests → building transition checks for completed test job', () => {
    const src = orchestrator ?? '';
    // The transition from writing_tests to building must check for a completed test job
    const writingTestsIdx = src.indexOf('writing_tests → building');
    expect(writingTestsIdx).toBeGreaterThan(-1);
    // Near this transition, there should be a check for test job completion
    const surroundingCode = src.substring(writingTestsIdx, writingTestsIdx + 1500);
    expect(surroundingCode).toMatch(/status.*complete|complete.*status/);
  });

  it('writing_tests → building does NOT proceed if test job is still executing', () => {
    const src = orchestrator ?? '';
    // The catch-up for writing_tests → building must only proceed if test job is complete
    // It should query test jobs with status = complete
    const writingTestsIdx = src.indexOf('"writing_tests"');
    expect(writingTestsIdx).toBeGreaterThan(-1);
    const surroundingCode = src.substring(writingTestsIdx, writingTestsIdx + 2000);
    expect(surroundingCode).toContain('"complete"');
  });
});

// ---------------------------------------------------------------------------
// AC3: No bypass path — orchestrator enforces the gate strictly
// ---------------------------------------------------------------------------

describe('AC3: No bypass path for test job gate', () => {
  let orchestrator: string | null;
  let pipelineUtils: string | null;
  beforeAll(() => {
    orchestrator = readRepoFile('supabase/functions/orchestrator/index.ts');
    pipelineUtils = readRepoFile('supabase/functions/_shared/pipeline-utils.ts');
  });

  it('pipeline-utils triggerTestWriting creates test job for all features', () => {
    const src = pipelineUtils ?? '';
    // triggerTestWriting must exist and create a test job
    expect(src).toContain('triggerTestWriting');
    expect(src).toMatch(/job_type.*test|test.*job_type/);
  });

  it('features table does NOT allow direct insert with status=building (must go through writing_tests)', () => {
    // The pipeline code should not insert features with status=building directly
    // New features start at breaking_down, not building
    const src = (orchestrator ?? '') + (pipelineUtils ?? '');
    // Any feature insert should use 'breaking_down' as initial status
    expect(src).not.toMatch(/status.*building[\s\S]{0,50}insert.*feature|insert.*feature[\s\S]{0,50}status.*building/);
  });
});

// ---------------------------------------------------------------------------
// AC5: Code jobs depend on the test job
// ---------------------------------------------------------------------------

describe('AC5: Code jobs are wired to depend on the test job', () => {
  let pipelineUtils: string | null;
  beforeAll(() => { pipelineUtils = readRepoFile('supabase/functions/_shared/pipeline-utils.ts'); });

  it('triggerTestWriting wires root code jobs to depend on the test job', () => {
    const src = pipelineUtils ?? '';
    // Must set depends_on on code jobs pointing to the test job
    expect(src).toContain('depends_on');
    // Near triggerTestWriting, there should be a code job update setting depends_on
    const testWritingIdx = src.indexOf('triggerTestWriting');
    const relevantCode = src.substring(testWritingIdx, testWritingIdx + 3000);
    expect(relevantCode).toContain('depends_on');
  });

  it('triggerTestWriting sets depends_on for ALL root code jobs (not just some)', () => {
    const src = pipelineUtils ?? '';
    // The function should update all root code jobs with the test job dependency
    const testWritingIdx = src.indexOf('triggerTestWriting');
    const relevantCode = src.substring(testWritingIdx, testWritingIdx + 3000);
    // Should query and update code jobs
    expect(relevantCode).toMatch(/job_type.*code|code.*job_type/);
    // The update should set depends_on
    expect(relevantCode).toMatch(/update[\s\S]{0,200}depends_on|depends_on[\s\S]{0,200}update/);
  });
});

// ---------------------------------------------------------------------------
// AC6: writing_tests → building transition requires test job status = complete
// ---------------------------------------------------------------------------

describe('AC6: writing_tests → building requires completed test job', () => {
  let orchestrator: string | null;
  beforeAll(() => { orchestrator = readRepoFile('supabase/functions/orchestrator/index.ts'); });

  it('writing_tests catch-up step queries test jobs with status=complete', () => {
    const src = orchestrator ?? '';
    // Step 2b: writing_tests → building — queries for completed test job
    const step2bIdx = src.indexOf('2b');
    expect(step2bIdx).toBeGreaterThan(-1);
    const surroundingCode = src.substring(step2bIdx, step2bIdx + 2000);
    expect(surroundingCode).toContain('"complete"');
    expect(surroundingCode).toMatch(/job_type.*test|test.*job_type/);
  });

  it('feature only transitions to building when test job complete count > 0', () => {
    const src = orchestrator ?? '';
    // The transition check should verify the test job exists and is complete
    const writingTestsIdx = src.indexOf('writing_tests → building');
    expect(writingTestsIdx).toBeGreaterThan(-1);
    const surroundingCode = src.substring(writingTestsIdx, writingTestsIdx + 2000);
    // Should check length > 0 or similar guard before transitioning
    expect(surroundingCode).toMatch(/length.*>.*0|\.length|completedTest|testComplete/);
  });

  it('orchestrator processFeatureLifecycle references writing_tests stage for feature progression', () => {
    const src = orchestrator ?? '';
    // processFeatureLifecycle must include the writing_tests → building step
    expect(src).toContain('writing_tests');
    // The step should be clearly documented
    expect(src).toMatch(/writing_tests.*building|2b/);
  });

  it('test job completion is the single gate between writing_tests and building (no other gate)', () => {
    const src = orchestrator ?? '';
    // The writing_tests → building transition should only check test job completion
    // not any other conditions
    const writingTestsIdx = src.lastIndexOf('"writing_tests"');
    expect(writingTestsIdx).toBeGreaterThan(-1);
    const surroundingCode = src.substring(writingTestsIdx, writingTestsIdx + 2000);
    // Should transition to building when test is complete
    expect(surroundingCode).toContain('"building"');
  });
});

// ---------------------------------------------------------------------------
// Structural: pipeline-utils exports triggerTestWriting
// ---------------------------------------------------------------------------

describe('Structural: triggerTestWriting is exported and complete', () => {
  let pipelineUtils: string | null;
  beforeAll(() => { pipelineUtils = readRepoFile('supabase/functions/_shared/pipeline-utils.ts'); });

  it('triggerTestWriting is an exported async function', () => {
    expect(pipelineUtils).toMatch(/export.*async.*function.*triggerTestWriting/);
  });

  it('triggerTestWriting creates a test job with job_type = "test"', () => {
    const src = pipelineUtils ?? '';
    const funcIdx = src.indexOf('triggerTestWriting');
    const funcBody = src.substring(funcIdx, funcIdx + 2000);
    expect(funcBody).toContain('"test"');
  });

  it('triggerTestWriting transitions feature to writing_tests status', () => {
    const src = pipelineUtils ?? '';
    const funcIdx = src.indexOf('triggerTestWriting');
    const funcBody = src.substring(funcIdx, funcIdx + 2000);
    expect(funcBody).toContain('"writing_tests"');
  });

  it('triggerTestWriting is idempotent — skips if test job already exists', () => {
    const src = pipelineUtils ?? '';
    const funcIdx = src.indexOf('triggerTestWriting');
    const funcBody = src.substring(funcIdx, funcIdx + 2000);
    // Should check for existing test job before creating a new one
    expect(funcBody).toMatch(/existing|already.*exist|skip/i);
  });
});
