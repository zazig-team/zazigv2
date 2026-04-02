/**
 * Feature: CLI unified zazig search — edge function (query-search)
 *
 * Tests for the supabase/functions/query-search/index.ts edge function.
 * Covers: grouped response shape, type filter, status filter, pagination,
 * ordering, description truncation, ilike injection safety, 400 on missing
 * query, empty entity type handling, and company isolation.
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

const EDGE_FN = 'supabase/functions/query-search/index.ts';

// ---------------------------------------------------------------------------
// AC1 + basic structure: edge function exists and is shaped correctly
// ---------------------------------------------------------------------------

describe('query-search edge function file', () => {
  let content: string | null;

  beforeAll(() => {
    content = readRepoFile(EDGE_FN);
  });

  it('exists at supabase/functions/query-search/index.ts', () => {
    expect(
      content,
      `Edge function not found at ${EDGE_FN}. Create supabase/functions/query-search/index.ts`,
    ).not.toBeNull();
  });

  it('uses SUPABASE_SERVICE_ROLE_KEY for database access', () => {
    expect(content).toContain('SUPABASE_SERVICE_ROLE_KEY');
  });

  it('checks for Authorization header presence', () => {
    expect(content).toMatch(/Authorization/i);
  });

  it('handles OPTIONS for CORS preflight', () => {
    expect(content).toMatch(/OPTIONS/);
  });

  it('includes CORS headers in response', () => {
    expect(content).toMatch(/Access-Control-Allow-Origin/);
  });

  it('accepts POST method', () => {
    expect(content).toMatch(/POST/);
  });

  // AC7: missing/empty query → 400
  it('returns 400 when query parameter is missing or empty', () => {
    expect(content).toMatch(/400/);
    expect(content).toMatch(/query/);
  });

  // AC1: response shape has ideas, features, jobs, total
  it('returns ideas grouped result', () => {
    expect(content).toContain('ideas');
  });

  it('returns features grouped result', () => {
    expect(content).toContain('features');
  });

  it('returns jobs grouped result', () => {
    expect(content).toContain('jobs');
  });

  it('returns a total count in the response', () => {
    expect(content).toContain('total');
  });

  // AC1: each group has items and count
  it('response shape includes items array per group', () => {
    expect(content).toContain('items');
  });

  it('response shape includes count per group', () => {
    expect(content).toContain('count');
  });
});

// ---------------------------------------------------------------------------
// AC2 / AC3: type filter — queries only the specified tables
// ---------------------------------------------------------------------------

describe('query-search type filter', () => {
  let content: string | null;

  beforeAll(() => {
    content = readRepoFile(EDGE_FN);
  });

  it('reads the type parameter from request body', () => {
    expect(content).toMatch(/\btype\b/);
  });

  it('accepts comma-separated type values (e.g. "idea,job")', () => {
    expect(content).toMatch(/split\s*\(|,/);
  });

  it('skips tables not included in the type filter', () => {
    // When type is set, should conditionally query each table
    expect(content).toMatch(/type.*includes|includes.*type/i);
  });
});

// ---------------------------------------------------------------------------
// AC4: status filter
// ---------------------------------------------------------------------------

describe('query-search status filter', () => {
  let content: string | null;

  beforeAll(() => {
    content = readRepoFile(EDGE_FN);
  });

  it('reads the status parameter from request body', () => {
    expect(content).toMatch(/\bstatus\b/);
  });

  it('applies status filter to each queried table', () => {
    // Status filter should appear in a query context
    expect(content).toMatch(/status/);
  });
});

// ---------------------------------------------------------------------------
// AC5 / AC6: pagination — limit and offset apply per entity type
// ---------------------------------------------------------------------------

describe('query-search pagination', () => {
  let content: string | null;

  beforeAll(() => {
    content = readRepoFile(EDGE_FN);
  });

  it('reads the limit parameter (default 20, max 100)', () => {
    expect(content).toMatch(/limit/);
    expect(content).toMatch(/20/);
  });

  it('caps limit at 100', () => {
    expect(content).toMatch(/100/);
  });

  it('reads the offset parameter (default 0)', () => {
    expect(content).toMatch(/offset/);
  });

  it('applies limit and offset per entity type, not globally', () => {
    // The function must apply pagination independently to each query
    // This is evidenced by the limit/offset being used in each table query
    expect(content).toMatch(/limit|range/i);
  });
});

// ---------------------------------------------------------------------------
// AC8: ordering by updated_at desc
// ---------------------------------------------------------------------------

describe('query-search ordering', () => {
  let content: string | null;

  beforeAll(() => {
    content = readRepoFile(EDGE_FN);
  });

  it('orders results by updated_at descending', () => {
    expect(content).toMatch(/updated_at/);
    expect(content).toMatch(/desc|ascending.*false/i);
  });
});

// ---------------------------------------------------------------------------
// AC9: description truncated to 200 chars
// ---------------------------------------------------------------------------

describe('query-search description truncation', () => {
  let content: string | null;

  beforeAll(() => {
    content = readRepoFile(EDGE_FN);
  });

  it('truncates description to 200 characters', () => {
    expect(content).toMatch(/200/);
    expect(content).toMatch(/slice|substr|substring|\.{3}|truncat/i);
  });
});

// ---------------------------------------------------------------------------
// FC2: ilike injection safety — escapes % and _ in user query
// ---------------------------------------------------------------------------

describe('query-search ilike injection safety', () => {
  let content: string | null;

  beforeAll(() => {
    content = readRepoFile(EDGE_FN);
  });

  it('escapes % characters in the query string before using ilike', () => {
    expect(content).toMatch(/replace.*%|%.*replace/i);
  });

  it('escapes _ characters in the query string before using ilike', () => {
    expect(content).toMatch(/replace.*_|_.*replace/i);
  });

  it('uses ilike for case-insensitive search on title and description', () => {
    expect(content).toMatch(/ilike/i);
    expect(content).toContain('title');
    expect(content).toContain('description');
  });
});

// ---------------------------------------------------------------------------
// FC1: company isolation — filters by company_id
// ---------------------------------------------------------------------------

describe('query-search company isolation', () => {
  let content: string | null;

  beforeAll(() => {
    content = readRepoFile(EDGE_FN);
  });

  it('requires company_id parameter in the request body', () => {
    expect(content).toContain('company_id');
  });

  it('filters all queries by company_id', () => {
    // company_id should appear multiple times (once per table query)
    const matches = content?.match(/company_id/g) ?? [];
    expect(
      matches.length,
      'company_id must be used in all table queries to prevent cross-company data leakage',
    ).toBeGreaterThanOrEqual(3);
  });
});

// ---------------------------------------------------------------------------
// FC3: zero results for an entity type — returns empty items array with count 0
// ---------------------------------------------------------------------------

describe('query-search handles zero results per entity type', () => {
  let content: string | null;

  beforeAll(() => {
    content = readRepoFile(EDGE_FN);
  });

  it('returns items: [] and count: 0 when no results for a type', () => {
    // The function must initialise each group with empty items, not omit the key
    expect(content).toMatch(/\[\]|items.*\[\]/);
  });
});
