/**
 * Feature: Cross-tenant job failure → bug idea in zazig-dev
 * Feature ID: 1f627dc8-aa5a-4b6c-b7ef-3ab1c7440b82
 *
 * Acceptance criteria covered:
 * 1. Basic ingest: trigger fires on status → 'failed', inserts idea in zazig-dev inbox.
 * 2. Idempotency: re-update same job to 'failed' → ON CONFLICT DO NOTHING, no duplicate.
 * 3. Transition-only: trigger only fires on transition INTO 'failed' (not within 'failed').
 * 4. Self-observation: zazig-dev jobs also produce ideas (no company filter bypass).
 * 5. Ingestion failure isolation: EXCEPTION block prevents trigger from blocking status update.
 * 6. No feature present: NULL feature_id or missing feature → '<unknown>' in raw_text, not an error.
 * 7. Non-failed statuses don't trigger: failed_retrying, complete, cancelled → no ideas.
 * 8. Bug item_type: idea lands at status='new' with item_type='bug', leaving triage to normal flow.
 *
 * These tests inspect migration SQL and source code. They are written to FAIL until the
 * migration for this feature is added to supabase/migrations/.
 */

import { beforeAll, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');

const ZAZIG_DEV_COMPANY_ID = '00000000-0000-0000-0000-000000000001';
const ZAZIGV2_PROJECT_ID = '3c405cbc-dbb0-44c5-a27d-de48fb573b13';

function readRepoFile(relPath: string): string | null {
  const fullPath = path.join(REPO_ROOT, relPath);
  try {
    return fs.readFileSync(fullPath, 'utf-8');
  } catch {
    return null;
  }
}

function listMigrationFiles(): string[] {
  const migrationsDir = path.join(REPO_ROOT, 'supabase/migrations');
  try {
    return fs
      .readdirSync(migrationsDir)
      .filter((file) => file.endsWith('.sql'))
      .sort();
  } catch {
    return [];
  }
}

function findJobFailureTriggerMigration(): { file: string; content: string } | null {
  for (const file of listMigrationFiles()) {
    const relPath = `supabase/migrations/${file}`;
    const content = readRepoFile(relPath);
    if (!content) continue;

    const looksLikeTarget =
      /notify_job_failure_to_zazig/i.test(content) ||
      (/job.*failure.*monitor/i.test(content) &&
        /create\s+(or\s+replace\s+)?function/i.test(content));

    if (looksLikeTarget) {
      return { file: relPath, content };
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Migration: trigger function
// ---------------------------------------------------------------------------

describe('Migration: jobs_failure_to_zazig trigger function', () => {
  let migration: { file: string; content: string } | null = null;

  beforeAll(() => {
    migration = findJobFailureTriggerMigration();
  });

  function requireContent(): string {
    expect(
      migration,
      'No migration file found containing notify_job_failure_to_zazig. ' +
        'The migration for cross-tenant job-failure → bug idea has not been added yet.',
    ).not.toBeNull();
    return migration!.content;
  }

  // AC1 + AC4: Trigger fires for any company's failed job (including zazig-dev).
  it('creates a trigger on public.jobs that fires AFTER UPDATE OF status', () => {
    const sql = requireContent();
    expect(sql).toMatch(
      /create\s+trigger\s+\w+\s+after\s+update\s+of\s+status\s+on\s+(public\.)?jobs/i,
    );
  });

  it('executes the trigger FOR EACH ROW', () => {
    const sql = requireContent();
    expect(sql).toMatch(/for\s+each\s+row/i);
  });

  it('calls notify_job_failure_to_zazig as the trigger function', () => {
    const sql = requireContent();
    expect(sql).toMatch(/execute\s+(procedure|function)\s+notify_job_failure_to_zazig\s*\(\s*\)/i);
  });

  // AC3: Only fires on transition INTO 'failed', not when already 'failed'.
  it("guards against non-transition: skips if NEW.status <> 'failed'", () => {
    const sql = requireContent();
    expect(sql).toMatch(/new\.status\s*<>\s*'failed'/i);
  });

  it("guards against re-fire within 'failed': checks OLD.status IS NOT DISTINCT FROM 'failed'", () => {
    const sql = requireContent();
    expect(sql).toMatch(/old\.status\s+is\s+not\s+distinct\s+from\s+'failed'/i);
  });

  // AC1: Inserts into public.ideas scoped to zazig-dev.
  it('inserts into public.ideas', () => {
    const sql = requireContent();
    expect(sql).toMatch(/insert\s+into\s+(public\.)?ideas/i);
  });

  it(`sets company_id to the zazig-dev UUID ${ZAZIG_DEV_COMPANY_ID}`, () => {
    const sql = requireContent();
    expect(sql).toContain(ZAZIG_DEV_COMPANY_ID);
  });

  it(`sets project_id to the zazigv2 project UUID ${ZAZIGV2_PROJECT_ID}`, () => {
    const sql = requireContent();
    expect(sql).toContain(ZAZIGV2_PROJECT_ID);
  });

  it("sets item_type = 'bug'", () => {
    const sql = requireContent();
    expect(sql).toMatch(/item_type[\s\S]*'bug'/i);
  });

  it("sets source = 'monitoring'", () => {
    const sql = requireContent();
    expect(sql).toMatch(/'monitoring'/i);
  });

  it("sets originator = 'job-failure-monitor'", () => {
    const sql = requireContent();
    expect(sql).toMatch(/'job-failure-monitor'/i);
  });

  it('sets source_ref to the failing job UUID (NEW.id)', () => {
    const sql = requireContent();
    // source_ref should be assigned from NEW.id (possibly cast to text)
    expect(sql).toMatch(/source_ref[\s\S]*new\.id/i);
  });

  it("sets status = 'new'", () => {
    const sql = requireContent();
    expect(sql).toMatch(/'new'/i);
  });

  // AC1: raw_text contains structured snippet with company, role, model, feature, commit, error_analysis.
  it('builds raw_text using format() including company name/id, role, model, feature, commit, error_analysis', () => {
    const sql = requireContent();
    // format() call with Company, Role, Model, Feature, Commit, error_analysis
    expect(sql).toMatch(/v_company_name|company_name/i);
    expect(sql).toMatch(/new\.role/i);
    expect(sql).toMatch(/new\.model/i);
    expect(sql).toMatch(/v_feature_title|feature_title/i);
    expect(sql).toMatch(/v_commit_sha|commit_sha/i);
    expect(sql).toMatch(/error_analysis/i);
  });

  it('truncates error_analysis to 2000 characters to cap raw_text size', () => {
    const sql = requireContent();
    expect(sql).toMatch(/left\s*\(\s*new\.error_analysis[\s\S]*2000\s*\)/i);
  });

  // AC6: COALESCE fallbacks for NULL joins so missing feature/company doesn't error.
  it('uses COALESCE for all nullable fields to handle missing feature/company gracefully', () => {
    const sql = requireContent();
    const coalesceCount = (sql.match(/coalesce/gi) || []).length;
    // Should have at least 4 COALESCE calls (company_name, role, model, feature_title, commit_sha, etc.)
    expect(coalesceCount).toBeGreaterThanOrEqual(4);
  });

  it("uses '<unknown>' as the fallback for missing company/feature/role/model", () => {
    const sql = requireContent();
    expect(sql).toMatch(/'<unknown>'/i);
  });

  // AC2: Idempotency — ON CONFLICT DO NOTHING.
  it('uses ON CONFLICT DO NOTHING for deduplication', () => {
    const sql = requireContent();
    expect(sql).toMatch(/on\s+conflict\s+do\s+nothing/i);
  });

  // AC5: Exception isolation — EXCEPTION block wraps the INSERT so trigger failure can't block the job update.
  it('wraps the insert in a BEGIN...EXCEPTION block', () => {
    const sql = requireContent();
    expect(sql).toMatch(/begin[\s\S]*exception\s+when\s+others/i);
  });

  it('raises a WARNING (not an ERROR) on ingestion failure', () => {
    const sql = requireContent();
    expect(sql).toMatch(/raise\s+warning/i);
  });

  it('returns NEW so the triggering UPDATE is never blocked', () => {
    const sql = requireContent();
    expect(sql).toMatch(/return\s+new/i);
  });
});

// ---------------------------------------------------------------------------
// Migration: partial unique index for dedup
// ---------------------------------------------------------------------------

describe('Migration: partial unique index on ideas for job-failure-monitor dedup', () => {
  let migration: { file: string; content: string } | null = null;

  beforeAll(() => {
    migration = findJobFailureTriggerMigration();
  });

  function requireContent(): string {
    expect(
      migration,
      'No migration file found. The cross-tenant job-failure migration has not been added yet.',
    ).not.toBeNull();
    return migration!.content;
  }

  // AC2: The partial unique index that backs ON CONFLICT DO NOTHING.
  it('creates a unique index on ideas(source_ref) for job-failure-monitor rows', () => {
    const sql = requireContent();
    expect(sql).toMatch(
      /create\s+unique\s+index[\s\S]*on\s+(public\.)?ideas\s*\(\s*source_ref\s*\)/i,
    );
  });

  it("scopes the index to source = 'monitoring' AND originator = 'job-failure-monitor'", () => {
    const sql = requireContent();
    expect(sql).toMatch(
      /where[\s\S]*source\s*=\s*'monitoring'[\s\S]*originator\s*=\s*'job-failure-monitor'/i,
    );
  });

  it('uses IF NOT EXISTS on the index to make the migration re-runnable', () => {
    const sql = requireContent();
    expect(sql).toMatch(/if\s+not\s+exists/i);
  });
});

// ---------------------------------------------------------------------------
// Acceptance criteria: non-failed statuses must not trigger
// (AC7: failed_retrying, complete, cancelled → no idea)
// ---------------------------------------------------------------------------

describe('Trigger logic: only "failed" status transition creates an idea', () => {
  let migration: { file: string; content: string } | null = null;

  beforeAll(() => {
    migration = findJobFailureTriggerMigration();
  });

  function requireContent(): string {
    expect(migration, 'Migration not found').not.toBeNull();
    return migration!.content;
  }

  it("early-returns when NEW.status <> 'failed' (covers complete, cancelled, failed_retrying)", () => {
    const sql = requireContent();
    // The guard at the top of the function body
    expect(sql).toMatch(/if\s+new\.status\s*<>\s*'failed'[\s\S]*return\s+new/i);
  });

  it("does not INSERT when OLD.status is already 'failed' (no within-failed re-firing)", () => {
    const sql = requireContent();
    // The combined guard: NEW.status <> 'failed' OR OLD.status IS NOT DISTINCT FROM 'failed'
    expect(sql).toMatch(
      /new\.status\s*<>\s*'failed'\s+or\s+old\.status\s+is\s+not\s+distinct\s+from\s+'failed'/i,
    );
  });
});

// ---------------------------------------------------------------------------
// Acceptance criteria: self-observation (AC4)
// The trigger must NOT filter out zazig-dev company jobs.
// ---------------------------------------------------------------------------

describe('Self-observation: zazig-dev jobs are captured, not excluded', () => {
  let migration: { file: string; content: string } | null = null;

  beforeAll(() => {
    migration = findJobFailureTriggerMigration();
  });

  function requireContent(): string {
    expect(migration, 'Migration not found').not.toBeNull();
    return migration!.content;
  }

  it('does not filter by company_id in the trigger guard (all tenants observed, including zazig-dev)', () => {
    const sql = requireContent();
    // There must be NO conditional that skips zazig-dev company_id in the trigger guard.
    // Specifically: no "IF NEW.company_id = '00000000-...' THEN RETURN NEW" exclusion.
    const exclusionPattern = new RegExp(
      `if\\s+new\\.company_id\\s*(=|<>)\\s*'${ZAZIG_DEV_COMPANY_ID}'[\\s\\S]*?return\\s+new`,
      'i',
    );
    expect(sql).not.toMatch(exclusionPattern);
  });

  it('includes NEW.company_id in the raw_text so self-failures are identifiable', () => {
    const sql = requireContent();
    expect(sql).toMatch(/new\.company_id/i);
  });
});

// ---------------------------------------------------------------------------
// Acceptance criteria: bug item_type flows to normal triage (AC8)
// ---------------------------------------------------------------------------

describe("Triage flow: idea lands at status='new' with item_type='bug'", () => {
  let migration: { file: string; content: string } | null = null;

  beforeAll(() => {
    migration = findJobFailureTriggerMigration();
  });

  function requireContent(): string {
    expect(migration, 'Migration not found').not.toBeNull();
    return migration!.content;
  }

  it("inserts with status = 'new' so the idea enters normal triage without auto-promotion", () => {
    const sql = requireContent();
    expect(sql).toMatch(/status[\s\S]*'new'/i);
  });

  it("inserts with item_type = 'bug' so per-type automation rules can apply", () => {
    const sql = requireContent();
    expect(sql).toMatch(/item_type[\s\S]*'bug'/i);
  });

  it("does NOT auto-promote the idea to a feature (no insert into features table)", () => {
    const sql = requireContent();
    // The trigger body must not INSERT into features
    expect(sql).not.toMatch(/insert\s+into\s+(public\.)?features/i);
  });
});
