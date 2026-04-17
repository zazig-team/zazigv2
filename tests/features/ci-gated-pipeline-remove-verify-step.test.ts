/**
 * Feature: CI-Gated Pipeline — Remove verify step
 * Feature ID: 2e64e77e-d9fe-452d-ab72-017bb4189660
 *
 * Tests that the "verify" pipeline step has been fully removed:
 * - No verify job type dispatched
 * - No verify_failed status in job dispatch queries
 * - No verify_context column references in dispatch
 * - handleVerifyResult removed from agent-event handlers
 * - dispatchVerifyJobToMachine removed from orchestrator
 * - VerifyJob type no longer imported or used in orchestrator
 * - "verify" removed from NON_IMPLEMENTATION_TYPES in pipeline-utils
 *
 * These tests are written to FAIL against the current codebase and pass once
 * the verify step has been removed.
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
// Orchestrator: verify step removed
// ---------------------------------------------------------------------------

describe('Orchestrator: dispatchVerifyJobToMachine is removed', () => {
  let orchestrator: string | null;
  beforeAll(() => { orchestrator = readRepoFile('supabase/functions/orchestrator/index.ts'); });

  it('orchestrator/index.ts exists', () => {
    expect(orchestrator).not.toBeNull();
  });

  it('does NOT contain dispatchVerifyJobToMachine function', () => {
    expect(orchestrator).not.toContain('dispatchVerifyJobToMachine');
  });

  it('does NOT import VerifyJob from shared messages', () => {
    expect(orchestrator).not.toMatch(/VerifyJob/);
  });

  it('does NOT reference verify_job event', () => {
    expect(orchestrator).not.toContain('verify_job');
  });

  it('does NOT select verify_context column in job dispatch query', () => {
    // The dispatchQueuedJobs select should not include verify_context
    expect(orchestrator).not.toContain('verify_context');
  });

  it('does NOT include verify_failed in the job status query filter', () => {
    // The dispatch query filters by status; verify_failed should be gone
    expect(orchestrator).not.toContain('verify_failed');
  });
});

// ---------------------------------------------------------------------------
// Orchestrator: no verify retry logic
// ---------------------------------------------------------------------------

describe('Orchestrator: verify-failed retry logic removed', () => {
  let orchestrator: string | null;
  beforeAll(() => { orchestrator = readRepoFile('supabase/functions/orchestrator/index.ts'); });

  it('does NOT reference verify_failure in context injection', () => {
    expect(orchestrator).not.toContain('verify_failure');
  });

  it('does NOT check job.status === "verify_failed" for context reinjection', () => {
    expect(orchestrator).not.toMatch(/status.*verify_failed|verify_failed.*status/);
  });

  it('does NOT contain verify_context in job row type definition', () => {
    // The JobRow interface or type should not include verify_context
    expect(orchestrator).not.toMatch(/verify_context\s*:/);
  });
});

// ---------------------------------------------------------------------------
// Agent-event: handleVerifyResult removed
// ---------------------------------------------------------------------------

describe('Agent-event: handleVerifyResult is removed', () => {
  let handlers: string | null;
  beforeAll(() => { handlers = readRepoFile('supabase/functions/agent-event/handlers.ts'); });

  it('agent-event/handlers.ts exists', () => {
    expect(handlers).not.toBeNull();
  });

  it('does NOT export handleVerifyResult', () => {
    expect(handlers).not.toContain('handleVerifyResult');
  });

  it('does NOT set job status to verify_failed', () => {
    expect(handlers).not.toContain('verify_failed');
  });

  it('does NOT write verify_context to jobs table', () => {
    expect(handlers).not.toContain('verify_context');
  });
});

describe('Agent-event index: verify_job event handler removed', () => {
  let agentEventIndex: string | null;
  beforeAll(() => { agentEventIndex = readRepoFile('supabase/functions/agent-event/index.ts'); });

  it('agent-event/index.ts exists', () => {
    expect(agentEventIndex).not.toBeNull();
  });

  it('does NOT route verify job events', () => {
    expect(agentEventIndex).not.toContain('verify');
  });
});

// ---------------------------------------------------------------------------
// Pipeline utils: "verify" removed from job type sets
// ---------------------------------------------------------------------------

describe('Pipeline-utils: verify job type removed', () => {
  let pipelineUtils: string | null;
  beforeAll(() => { pipelineUtils = readRepoFile('supabase/functions/_shared/pipeline-utils.ts'); });

  it('pipeline-utils.ts exists', () => {
    expect(pipelineUtils).not.toBeNull();
  });

  it('NON_IMPLEMENTATION_TYPES set does NOT include "verify"', () => {
    // Should not have "verify" as a non-implementation type
    expect(pipelineUtils).not.toMatch(/"verify"/);
  });
});

// ---------------------------------------------------------------------------
// Shared messages: VerifyJob type removed
// ---------------------------------------------------------------------------

describe('Shared messages: VerifyJob type removed', () => {
  let messages: string | null;
  beforeAll(() => { messages = readRepoFile('supabase/functions/_shared/messages.ts'); });

  it('_shared/messages.ts exists', () => {
    expect(messages).not.toBeNull();
  });

  it('does NOT export VerifyJob type', () => {
    expect(messages).not.toContain('VerifyJob');
  });

  it('does NOT include "verify" in card/job type union', () => {
    // The cardType union in messages.ts should not include verify
    expect(messages).not.toMatch(/"verify"/);
  });
});

// ---------------------------------------------------------------------------
// Local agent executor: verify card type removed
// ---------------------------------------------------------------------------

describe('Local agent executor: verify card type removed', () => {
  let executor: string | null;
  beforeAll(() => { executor = readRepoFile('packages/local-agent/src/executor.ts'); });

  it('executor.ts exists', () => {
    expect(executor).not.toBeNull();
  });

  it('does NOT include "verify" in valid card types list', () => {
    expect(executor).not.toMatch(/"verify"/);
  });
});
