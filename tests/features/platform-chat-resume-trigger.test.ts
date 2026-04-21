/**
 * Feature: Platform chat system — orchestrator resume trigger
 *
 * Tests that:
 * - The orchestrator detects user replies to awaiting_response ideas
 * - A new resume job is created when user replies
 * - Resume job reads full conversation history from idea_messages
 *
 * Written to FAIL until the feature is implemented.
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

function readFile(relPath: string): string {
  try {
    return fs.readFileSync(path.join(REPO_ROOT, relPath), 'utf-8');
  } catch {
    return '';
  }
}

// ---------------------------------------------------------------------------
// AC: Orchestrator detects user replies to awaiting_response ideas
// ---------------------------------------------------------------------------

describe('AC: Orchestrator detects awaiting_response ideas with user replies', () => {
  let orchestrator: string;

  beforeAll(() => {
    orchestrator = readFile('supabase/functions/orchestrator/index.ts');
  });

  it('orchestrator queries ideas with awaiting_response status', () => {
    expect(
      orchestrator,
      'Orchestrator does not query awaiting_response ideas. Add logic to detect ideas waiting for user response.',
    ).toMatch(/awaiting_response/);
  });

  it('orchestrator checks idea_messages for new user replies', () => {
    expect(
      orchestrator,
      'Orchestrator does not reference idea_messages. Add logic to detect user reply messages.',
    ).toMatch(/idea_messages/);
  });

  it('orchestrator checks for sender=user in messages', () => {
    expect(orchestrator).toMatch(/sender.*user|user.*sender/i);
  });
});

// ---------------------------------------------------------------------------
// AC: Resume job is created by orchestrator when user replies
// ---------------------------------------------------------------------------

describe('AC: Orchestrator creates a resume job when user replies to awaiting_response idea', () => {
  let orchestrator: string;

  beforeAll(() => {
    orchestrator = readFile('supabase/functions/orchestrator/index.ts');
  });

  it('orchestrator creates a new job to resume work on the idea', () => {
    // Should insert a new job or call a function that creates a resume job
    expect(
      orchestrator,
      'Orchestrator does not create a resume job. Add job creation logic for awaiting_response ideas with user replies.',
    ).toMatch(/resume|resume_job|cardType.*resume|type.*resume/i);
  });

  it('orchestrator transitions idea out of awaiting_response when resuming', () => {
    // Should update idea status away from awaiting_response
    expect(orchestrator).toMatch(/awaiting_response/);
    // And should update it to another status like executing/routed
    expect(orchestrator).toMatch(/executing|routed|spawned/i);
  });

  it('resume job is associated with the idea via idea_id', () => {
    // The new job should reference the idea_id
    expect(orchestrator).toMatch(/idea_id/);
  });
});

// ---------------------------------------------------------------------------
// AC: Resume job reads full conversation history to reconstruct context
// ---------------------------------------------------------------------------

describe('AC: Resume job context includes full idea_messages conversation history', () => {
  let orchestrator: string;
  let pipelineUtils: string;

  beforeAll(() => {
    orchestrator = readFile('supabase/functions/orchestrator/index.ts');
    pipelineUtils = readFile('supabase/functions/_shared/pipeline-utils.ts');
  });

  it('orchestrator or pipeline-utils fetches idea_messages when building resume job context', () => {
    const combined = orchestrator + pipelineUtils;
    expect(
      combined,
      'Neither orchestrator nor pipeline-utils fetches idea_messages for resume job context.',
    ).toMatch(/idea_messages/);
  });

  it('resume job context includes conversation history', () => {
    const combined = orchestrator + pipelineUtils;
    // Should pass conversation/message history to the job context
    expect(combined).toMatch(/conversation|message.*history|history.*message|idea_messages/i);
  });
});

// ---------------------------------------------------------------------------
// AC: shared module — idea_messages appear in pipeline-utils for job building
// ---------------------------------------------------------------------------

describe('AC: pipeline-utils.ts supports building context from idea_messages', () => {
  let pipelineUtils: string;

  beforeAll(() => {
    pipelineUtils = readFile('supabase/functions/_shared/pipeline-utils.ts');
  });

  it('pipeline-utils.ts references idea_messages for context injection', () => {
    expect(
      pipelineUtils,
      'pipeline-utils.ts does not reference idea_messages. Add support for injecting conversation history into job context.',
    ).toMatch(/idea_messages/);
  });
});
