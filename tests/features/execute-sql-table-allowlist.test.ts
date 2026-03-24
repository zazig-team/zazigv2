/**
 * Feature: Fix execute_sql table allowlist — expand to include pipeline-operational tables
 *
 * Tests for ACs 1–5 and 8:
 *   1. expert_sessions allowed
 *   2. ideas allowed
 *   3. roles allowed
 *   4. projects allowed
 *   5. slack_installations still blocked
 *   8. existing tables (jobs, features, agent_events) still allowed
 *
 * Written to FAIL against the current codebase (expert_sessions, ideas, roles,
 * projects, pipeline_snapshots are missing from TABLE_ALLOWLIST).
 */

import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');

const EXECUTE_SQL_PATH = 'supabase/functions/execute-sql/index.ts';

function readRepoFile(relPath: string): string | null {
  try {
    return fs.readFileSync(path.join(REPO_ROOT, relPath), 'utf-8');
  } catch {
    return null;
  }
}

/**
 * Parse the TABLE_ALLOWLIST array literal from execute-sql/index.ts.
 * Handles both single-line and multi-line array syntax.
 */
function parseAllowlist(content: string): string[] | null {
  const match = content.match(/const TABLE_ALLOWLIST\s*=\s*\[([\s\S]*?)\]/);
  if (!match) return null;
  return [...match[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
}

// ---------------------------------------------------------------------------
// AC1–AC4: newly required tables must be present
// ---------------------------------------------------------------------------

describe('execute_sql TABLE_ALLOWLIST — newly required pipeline-operational tables', () => {
  let content: string | null;
  let allowlist: string[] | null;

  beforeAll(() => {
    content = readRepoFile(EXECUTE_SQL_PATH);
    if (content) allowlist = parseAllowlist(content);
  });

  it('execute-sql/index.ts exists', () => {
    expect(content, `File not found: ${EXECUTE_SQL_PATH}`).not.toBeNull();
  });

  it('TABLE_ALLOWLIST can be parsed from the source', () => {
    expect(
      allowlist,
      'Could not parse TABLE_ALLOWLIST array from execute-sql/index.ts. ' +
        'Expected: const TABLE_ALLOWLIST = [...];',
    ).not.toBeNull();
  });

  it('AC1: TABLE_ALLOWLIST includes expert_sessions', () => {
    expect(
      allowlist,
      'expert_sessions must be added to TABLE_ALLOWLIST — hotfix expert needs to query session status',
    ).toContain('expert_sessions');
  });

  it('AC2: TABLE_ALLOWLIST includes ideas', () => {
    expect(
      allowlist,
      'ideas must be added to TABLE_ALLOWLIST — agents need to search/filter ideas',
    ).toContain('ideas');
  });

  it('AC3: TABLE_ALLOWLIST includes roles', () => {
    expect(
      allowlist,
      'roles must be added to TABLE_ALLOWLIST — agents need to check role configuration',
    ).toContain('roles');
  });

  it('AC4: TABLE_ALLOWLIST includes projects', () => {
    expect(
      allowlist,
      'projects must be added to TABLE_ALLOWLIST — agents need to look up project metadata',
    ).toContain('projects');
  });

  it('TABLE_ALLOWLIST includes pipeline_snapshots', () => {
    expect(
      allowlist,
      'pipeline_snapshots must be added to TABLE_ALLOWLIST — agents need to read cached pipeline state',
    ).toContain('pipeline_snapshots');
  });
});

// ---------------------------------------------------------------------------
// AC5: security-sensitive tables must remain blocked
// ---------------------------------------------------------------------------

describe('execute_sql TABLE_ALLOWLIST — auth/credential tables must stay blocked', () => {
  let content: string | null;
  let allowlist: string[] | null;

  beforeAll(() => {
    content = readRepoFile(EXECUTE_SQL_PATH);
    if (content) allowlist = parseAllowlist(content);
  });

  it('AC5: TABLE_ALLOWLIST does NOT include slack_installations', () => {
    expect(allowlist).not.toBeNull();
    expect(
      allowlist,
      'slack_installations must NOT be in TABLE_ALLOWLIST — it contains OAuth credentials',
    ).not.toContain('slack_installations');
  });

  it('TABLE_ALLOWLIST does NOT include secrets', () => {
    expect(allowlist).not.toBeNull();
    expect(
      allowlist,
      'secrets must NOT be in TABLE_ALLOWLIST — security-sensitive table',
    ).not.toContain('secrets');
  });
});

// ---------------------------------------------------------------------------
// AC8: existing tables must remain allowed (no regression)
// ---------------------------------------------------------------------------

describe('execute_sql TABLE_ALLOWLIST — existing tables remain allowed (AC8)', () => {
  let content: string | null;
  let allowlist: string[] | null;

  beforeAll(() => {
    content = readRepoFile(EXECUTE_SQL_PATH);
    if (content) allowlist = parseAllowlist(content);
  });

  for (const table of ['jobs', 'features', 'agent_events', 'machines', 'capabilities', 'capability_lanes']) {
    it(`TABLE_ALLOWLIST still includes ${table}`, () => {
      expect(allowlist).not.toBeNull();
      expect(allowlist, `${table} must remain in TABLE_ALLOWLIST — existing usage must not break`).toContain(table);
    });
  }
});

// ---------------------------------------------------------------------------
// Structural: allowlist check logic is present in the handler
// ---------------------------------------------------------------------------

describe('execute_sql — allowlist enforcement logic', () => {
  let content: string | null;

  beforeAll(() => {
    content = readRepoFile(EXECUTE_SQL_PATH);
  });

  it('source contains disallowed-table error response', () => {
    expect(content).toMatch(/disallowed table/i);
  });

  it('source filters extracted table names against TABLE_ALLOWLIST', () => {
    expect(content).toMatch(/TABLE_ALLOWLIST\.includes/);
  });
});
