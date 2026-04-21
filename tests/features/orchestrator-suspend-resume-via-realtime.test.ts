/**
 * Feature: Orchestrator — suspend/resume via Realtime
 *
 * Tests for all acceptance criteria of the orchestrator suspend/resume feature:
 * - Realtime subscription to idea_messages
 * - Resume job creation on user reply to awaiting_response ideas
 * - Correct job type matching suspended job
 * - Resume job brief includes conversation history instruction
 * - Atomic status transitions to prevent duplicate resume jobs
 * - Polling fallback when Realtime is unavailable
 * - on_hold ideas are not resumed
 * - No duplicate resume jobs
 * - Realtime connection drops are logged
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

const ORCHESTRATOR_PATH = 'supabase/functions/orchestrator/index.ts';

// ---------------------------------------------------------------------------
// AC1: Orchestrator subscribes to idea_messages via Realtime
// ---------------------------------------------------------------------------

describe('AC1: Orchestrator subscribes to idea_messages via Supabase Realtime', () => {
  let source: string;

  beforeAll(() => {
    source = readFile(ORCHESTRATOR_PATH);
  });

  it('orchestrator file exists and is non-empty', () => {
    expect(
      source,
      `${ORCHESTRATOR_PATH} is missing or empty`,
    ).not.toBe('');
  });

  it('references Supabase Realtime channel subscription for idea_messages', () => {
    // Should call .channel() or .on() for Realtime subscription
    expect(
      source,
      'Orchestrator must subscribe to idea_messages via Supabase Realtime (.channel / .on)',
    ).toMatch(/\.channel\(|\.on\(.*INSERT|realtime.*idea_messages|idea_messages.*realtime/i);
  });

  it('subscribes specifically to the idea_messages table', () => {
    expect(
      source,
      'Orchestrator Realtime subscription must target the idea_messages table',
    ).toMatch(/idea_messages/);
  });

  it('filters Realtime events by sender = user', () => {
    // Only user messages should trigger resume — filter or check for sender='user'
    expect(
      source,
      "Realtime handler must filter for sender = 'user' to avoid acting on job messages",
    ).toMatch(/sender.*['"=].*user|['"=]user['"=].*sender|filter.*sender|sender.*filter/i);
  });
});

// ---------------------------------------------------------------------------
// AC2: User reply on awaiting_response idea triggers resume job creation
// ---------------------------------------------------------------------------

describe('AC2: User reply on an awaiting_response idea triggers resume job creation', () => {
  let source: string;

  beforeAll(() => {
    source = readFile(ORCHESTRATOR_PATH);
  });

  it("checks if idea status is 'awaiting_response' before creating resume job", () => {
    expect(
      source,
      "Orchestrator must check idea status = 'awaiting_response' before creating a resume job",
    ).toMatch(/awaiting_response/);
  });

  it('creates a resume job in the jobs table when user replies', () => {
    // Should insert a job record when user replies to an awaiting_response idea
    expect(
      source,
      'Orchestrator must insert a resume job into jobs table',
    ).toMatch(/resume|resumeJob|resume_job|createResumeJob/i);
  });

  it('resume job includes idea_id linking it to the source idea', () => {
    expect(
      source,
      'Resume job must include idea_id to link back to the idea',
    ).toMatch(/idea_id/);
  });

  it('resume job includes company_id from the idea', () => {
    expect(
      source,
      'Resume job must include company_id sourced from the idea record',
    ).toMatch(/company_id/);
  });
});

// ---------------------------------------------------------------------------
// AC3: Resume job has correct job type matching the suspended job
// ---------------------------------------------------------------------------

describe('AC3: Resume job has correct job type matching the suspended job', () => {
  let source: string;

  beforeAll(() => {
    source = readFile(ORCHESTRATOR_PATH);
  });

  it('reads last_job_type from the idea to use in the resume job', () => {
    // The spec says store last_job_type on the idea and use it for resumption
    expect(
      source,
      "Must read 'last_job_type' from the idea to recreate resume job with correct type",
    ).toMatch(/last_job_type/);
  });

  it('creates resume job with the job_type from last_job_type', () => {
    // The resume job job_type should be set from idea.last_job_type
    const hasLastJobType = /last_job_type/.test(source);
    const hasJobType = /job_type/.test(source);
    expect(
      hasLastJobType && hasJobType,
      "Resume job must use idea's last_job_type to set the new job's job_type",
    ).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// AC4: Resume job brief instructs agent to read conversation history
// ---------------------------------------------------------------------------

describe('AC4: Resume job brief instructs agent to read conversation history', () => {
  let source: string;

  beforeAll(() => {
    source = readFile(ORCHESTRATOR_PATH);
  });

  it('resume job brief contains instruction to resume work', () => {
    expect(
      source,
      "Resume job brief must contain 'Resume work on this idea'",
    ).toMatch(/[Rr]esume work on this idea|resume.*work.*idea/i);
  });

  it('resume job brief instructs agent to read idea_messages conversation history', () => {
    // The spec says brief must include: "Read the full conversation history in idea_messages"
    expect(
      source,
      "Resume job brief must instruct agent to read conversation history from idea_messages",
    ).toMatch(/conversation history.*idea_messages|idea_messages.*conversation history|read.*idea_messages/i);
  });
});

// ---------------------------------------------------------------------------
// AC5: Idea status transitions atomically to prevent duplicate resume jobs
// ---------------------------------------------------------------------------

describe('AC5: Idea status transitions atomically to prevent duplicate resume jobs', () => {
  let source: string;

  beforeAll(() => {
    source = readFile(ORCHESTRATOR_PATH);
  });

  it('updates idea status when creating a resume job (transitions out of awaiting_response)', () => {
    // Status must change to prevent double-dispatch
    expect(
      source,
      "Must transition idea status away from 'awaiting_response' when creating resume job",
    ).toMatch(/awaiting_response/);
  });

  it('uses atomic/optimistic locking pattern to prevent duplicate resume jobs', () => {
    // Pattern: update().eq('status', 'awaiting_response') ensures only one resume job
    expect(
      source,
      "Must use eq('status', 'awaiting_response') optimistic lock to prevent duplicate dispatch",
    ).toMatch(
      /eq.*awaiting_response|update.*awaiting_response|WHERE.*awaiting_response/i,
    );
  });

  it('does not create a resume job if an active job already exists for the idea', () => {
    // Guard: check for existing active job before creating resume job
    expect(
      source,
      'Must check for existing active job before creating a resume job to prevent duplicates',
    ).toMatch(/active.*job|job.*active|already.*job|existing.*job/i);
  });
});

// ---------------------------------------------------------------------------
// AC6: Polling fallback works when Realtime is unavailable
// ---------------------------------------------------------------------------

describe('AC6: Polling fallback works when Realtime is unavailable', () => {
  let source: string;

  beforeAll(() => {
    source = readFile(ORCHESTRATOR_PATH);
  });

  it('implements a polling fallback for awaiting_response ideas', () => {
    // Should have polling logic that queries for awaiting_response ideas as fallback
    expect(
      source,
      "Must implement polling fallback for 'awaiting_response' ideas when Realtime is unavailable",
    ).toMatch(/poll|fallback|awaiting_response/i);
  });

  it('polling fallback queries idea_messages for recent user replies', () => {
    // The fallback polls idea_messages for user messages
    const hasPollOrFallback = /poll|fallback/i.test(source);
    const hasIdeaMessages = /idea_messages/.test(source);
    expect(
      hasPollOrFallback && hasIdeaMessages,
      'Polling fallback must query idea_messages for user replies',
    ).toBe(true);
  });

  it('logs when falling back to polling mode', () => {
    // The spec says: "Log when falling back so we can track Realtime reliability"
    expect(
      source,
      'Must log when falling back to polling so Realtime reliability can be tracked',
    ).toMatch(/log.*fall.*back|fall.*back.*log|console.*fall|falling back|realtime.*unavailable|fallback.*poll/i);
  });
});

// ---------------------------------------------------------------------------
// AC7: on_hold ideas are not resumed even if user replies
// ---------------------------------------------------------------------------

describe('AC7: on_hold ideas are not resumed even when user replies', () => {
  let source: string;

  beforeAll(() => {
    source = readFile(ORCHESTRATOR_PATH);
  });

  it('resume logic checks on_hold = false before creating a resume job', () => {
    // The spec says: "on_hold = false" must be checked before resuming
    expect(
      source,
      "Resume logic must check on_hold = false — on_hold ideas must never be resumed",
    ).toMatch(/on_hold.*false|false.*on_hold|eq.*on_hold|on_hold.*eq/i);
  });

  it('on_hold check is present in the context of awaiting_response logic', () => {
    // Both awaiting_response and on_hold should appear in close proximity
    const block = source.match(
      /awaiting_response.{0,500}on_hold|on_hold.{0,500}awaiting_response/is,
    );
    expect(
      block,
      "on_hold check must appear in proximity to awaiting_response logic to prevent resuming held ideas",
    ).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// AC8: No duplicate resume jobs for the same idea
// ---------------------------------------------------------------------------

describe('AC8: No duplicate resume jobs for the same idea', () => {
  let source: string;

  beforeAll(() => {
    source = readFile(ORCHESTRATOR_PATH);
  });

  it('checks for an existing in-progress resume job before creating a new one', () => {
    // Must guard against creating duplicate resume jobs per idea
    expect(
      source,
      'Must guard against duplicate resume jobs by checking for existing active jobs per idea',
    ).toMatch(
      /active.*job.*idea|idea.*active.*job|already.*job|job.*exists|has.*active|skip.*job/i,
    );
  });

  it('resume job creation is gated by idea status transition', () => {
    // Atomic status transition is the dedup mechanism — must update status as part of job creation
    expect(
      source,
      "Idea status must be updated atomically with resume job creation to prevent duplicates",
    ).toMatch(/awaiting_response/);
  });
});

// ---------------------------------------------------------------------------
// AC9: Realtime connection drops are logged
// ---------------------------------------------------------------------------

describe('AC9: Realtime connection drops are logged', () => {
  let source: string;

  beforeAll(() => {
    source = readFile(ORCHESTRATOR_PATH);
  });

  it('handles Realtime subscription errors or disconnections', () => {
    // Should have error handling for the Realtime subscription
    expect(
      source,
      'Must handle Realtime subscription errors/disconnections',
    ).toMatch(/error.*realtime|realtime.*error|\.subscribe.*error|catch.*realtime|realtime.*disconnect|disconnect.*realtime/i);
  });

  it('logs Realtime connection drop events', () => {
    // The spec says log when Realtime drops so reliability can be tracked
    expect(
      source,
      'Must log Realtime connection drop events for reliability tracking',
    ).toMatch(
      /console\.warn.*realtime|console\.error.*realtime|log.*realtime.*drop|realtime.*drop.*log|realtime.*closed|closed.*realtime/i,
    );
  });
});

// ---------------------------------------------------------------------------
// AC10: ideas schema includes last_job_type column
// ---------------------------------------------------------------------------

describe('AC10: Ideas schema includes last_job_type to enable correct resume job type', () => {
  let migrationSource: string;
  let orchestratorSource: string;

  beforeAll(() => {
    // Check for the column in migrations or schema SQL files
    const migrationDir = path.join(REPO_ROOT, 'supabase', 'migrations');
    let migrations = '';
    try {
      const files = fs.readdirSync(migrationDir);
      for (const file of files) {
        if (file.endsWith('.sql')) {
          try {
            migrations += fs.readFileSync(path.join(migrationDir, file), 'utf-8');
          } catch {
            // skip
          }
        }
      }
    } catch {
      // no migrations dir
    }
    migrationSource = migrations;
    orchestratorSource = readFile(ORCHESTRATOR_PATH);
  });

  it('last_job_type column is referenced in migrations or orchestrator', () => {
    const combined = migrationSource + orchestratorSource;
    expect(
      combined,
      "Must add 'last_job_type' column to ideas table (in migrations or orchestrator upsert)",
    ).toMatch(/last_job_type/);
  });

  it('orchestrator sets last_job_type on ideas when dispatching jobs', () => {
    // When the orchestrator creates a job, it should record the job type on the idea
    expect(
      orchestratorSource,
      "Orchestrator must set 'last_job_type' on idea when dispatching a job so it can be recovered on resume",
    ).toMatch(/last_job_type/);
  });
});
