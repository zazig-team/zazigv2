/**
 * Feature: CI-Gated Pipeline — PR gates
 * Feature ID: 2e64e77e-d9fe-452d-ab72-017bb4189660
 *
 * Tests that the pipeline uses GitHub PR status checks ("PR gates") to gate
 * the merge step instead of dispatching a separate ci_check agent job:
 *
 * AC1 - After PR creation, the orchestrator polls GitHub for required status checks
 * AC2 - Merge is only triggered once all required CI checks on the PR have passed
 * AC3 - The ci_check agent job type is removed from the pipeline
 * AC4 - A PR gate poller / checker function exists in the orchestrator or pipeline-utils
 * AC5 - The combining_and_pr → ci_checking → merging flow is replaced with
 *        combining_and_pr → merging (gated by PR CI passing)
 * AC6 - PR gate check uses the GitHub checks API or gh CLI
 *
 * These tests are written to FAIL against the current codebase and pass once
 * the PR gates feature is implemented.
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
// AC3: ci_check agent job type removed
// ---------------------------------------------------------------------------

describe('AC3: ci_check agent job type is removed from the pipeline', () => {
  let pipelineUtils: string | null;
  beforeAll(() => { pipelineUtils = readRepoFile('supabase/functions/_shared/pipeline-utils.ts'); });

  it('pipeline-utils.ts exists', () => {
    expect(pipelineUtils).not.toBeNull();
  });

  it('triggerCICheck function is removed from pipeline-utils', () => {
    // The ci_check agent job is replaced by a PR gate poller
    expect(pipelineUtils).not.toContain('triggerCICheck');
  });

  it('does NOT insert ci_check job type into jobs table', () => {
    expect(pipelineUtils).not.toMatch(/job_type.*ci_check|ci_check.*job_type/);
  });

  it('does NOT transition feature to ci_checking status', () => {
    // ci_checking status is removed because the new flow uses PR gates
    expect(pipelineUtils).not.toMatch(/status.*ci_checking|ci_checking.*status/);
  });
});

describe('AC3: ci_check agent job type removed from orchestrator', () => {
  let orchestrator: string | null;
  beforeAll(() => { orchestrator = readRepoFile('supabase/functions/orchestrator/index.ts'); });

  it('orchestrator does NOT dispatch ci_check jobs', () => {
    // ci_check is no longer an agent job — replaced by PR gate polling
    expect(orchestrator).not.toMatch(/job_type.*ci_check|ci_check.*job_type/);
  });

  it('orchestrator does NOT have ci_checking catch-up step', () => {
    // The ci_checking catch-up step is removed because ci_checking status is gone
    expect(orchestrator).not.toContain('"ci_checking"');
  });

  it('orchestrator does NOT import triggerCICheck', () => {
    expect(orchestrator).not.toContain('triggerCICheck');
  });
});

// ---------------------------------------------------------------------------
// AC4: PR gate poller / checker exists
// ---------------------------------------------------------------------------

describe('AC4: PR gate checker function exists', () => {
  let pipelineUtils: string | null;
  let orchestrator: string | null;
  beforeAll(() => {
    pipelineUtils = readRepoFile('supabase/functions/_shared/pipeline-utils.ts');
    orchestrator = readRepoFile('supabase/functions/orchestrator/index.ts');
  });

  it('pipeline-utils or orchestrator contains a PR gate check function', () => {
    const combined = (pipelineUtils ?? '') + (orchestrator ?? '');
    // Should have a function for checking PR CI gate status
    expect(combined).toMatch(/prGate|checkPR|pollPR|pr.*gate|gate.*pr|checkCIStatus|pr.*ci.*pass|ci.*pass.*pr/i);
  });

  it('PR gate check queries GitHub checks or status API', () => {
    const combined = (pipelineUtils ?? '') + (orchestrator ?? '');
    // Must use gh CLI or GitHub checks/statuses API
    expect(combined).toMatch(/gh api|\/checks|\/statuses|check.*run|github.*status/i);
  });

  it('PR gate check handles all checks passing conclusion', () => {
    const combined = (pipelineUtils ?? '') + (orchestrator ?? '');
    // Must check for "success" or "passed" conclusion
    expect(combined).toMatch(/conclusion.*success|success.*conclusion|all.*pass|checks.*pass/i);
  });
});

// ---------------------------------------------------------------------------
// AC5: Pipeline flow: combining_and_pr → merging (no ci_checking step)
// ---------------------------------------------------------------------------

describe('AC5: combining_and_pr transitions directly to merging via PR gates', () => {
  let pipelineUtils: string | null;
  beforeAll(() => { pipelineUtils = readRepoFile('supabase/functions/_shared/pipeline-utils.ts'); });

  it('triggerMerging can be called directly from combining_and_pr state', () => {
    // The pipeline should allow combining_and_pr → merging transition via PR gates
    expect(pipelineUtils).toMatch(/combining_and_pr/);
    // triggerMerging must still exist (it was not removed, just called differently)
    expect(pipelineUtils).toContain('triggerMerging');
  });

  it('triggerMerging CAS check includes combining_and_pr as valid source status', () => {
    const src = pipelineUtils ?? '';
    // The CAS update for merging should accept combining_and_pr as source
    // (since we removed ci_checking, the merge can happen from combining_and_pr directly)
    const triggerMergingIdx = src.indexOf('triggerMerging');
    expect(triggerMergingIdx).toBeGreaterThan(-1);
    const surroundingCode = src.substring(triggerMergingIdx, triggerMergingIdx + 2000);
    expect(surroundingCode).toContain('combining_and_pr');
  });
});

// ---------------------------------------------------------------------------
// AC6: GitHub checks API usage
// ---------------------------------------------------------------------------

describe('AC6: PR gate polling uses GitHub checks API or gh CLI', () => {
  let orchestrator: string | null;
  let pipelineUtils: string | null;
  beforeAll(() => {
    orchestrator = readRepoFile('supabase/functions/orchestrator/index.ts');
    pipelineUtils = readRepoFile('supabase/functions/_shared/pipeline-utils.ts');
  });

  it('orchestrator or pipeline-utils references GitHub checks endpoint', () => {
    const combined = (orchestrator ?? '') + (pipelineUtils ?? '');
    // Must reference GitHub's checks API to gate merge on CI
    expect(combined).toMatch(/\/checks\/runs|\/commits\/.*\/check-runs|pr.*check|check.*api/i);
  });
});

// ---------------------------------------------------------------------------
// Local agent: ci_check card type removed from executor
// ---------------------------------------------------------------------------

describe('Local agent executor: ci_check card type removed', () => {
  let executor: string | null;
  beforeAll(() => { executor = readRepoFile('packages/local-agent/src/executor.ts'); });

  it('executor does NOT accept ci_check as a valid card type', () => {
    // ci_check is no longer dispatched as an agent job
    expect(executor).not.toMatch(/"ci_check"/);
  });
});

// ---------------------------------------------------------------------------
// Shared messages: CI check job message type removed
// ---------------------------------------------------------------------------

describe('Shared messages: CICheckJob type removed', () => {
  let messages: string | null;
  beforeAll(() => { messages = readRepoFile('supabase/functions/_shared/messages.ts'); });

  it('does NOT export a CI check job type or include ci_check in card types', () => {
    expect(messages).not.toMatch(/"ci_check"/);
  });
});
