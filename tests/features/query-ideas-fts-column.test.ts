/**
 * Feature: Fix query_ideas full-text search — add fts generated column to ideas table
 *
 * Tests for ACs 6–7:
 *   6. query_ideas with search parameter returns results without HTTP 500
 *   7. query_ideas with a search that matches nothing returns empty array, not an error
 *
 * Root cause: query-ideas/index.ts calls .textSearch("fts", ...) but no `fts` column
 * exists on the ideas table. PostgREST returns HTTP 500 because the column is absent.
 *
 * Fix: A migration must add a GENERATED ALWAYS AS tsvector column named `fts`.
 *
 * Tests verifying the migration existence will FAIL against the current codebase.
 * Tests verifying the edge function code will PASS (the .textSearch call is already there).
 */

import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');

function readRepoFile(relPath: string): string | null {
  try {
    return fs.readFileSync(path.join(REPO_ROOT, relPath), 'utf-8');
  } catch {
    return null;
  }
}

/**
 * Find the migration file that adds the `fts` generated column to the `ideas` table.
 * A qualifying migration must reference all three: `fts`, `ideas`, and `GENERATED`.
 */
function findFtsMigration(): { filename: string; content: string } | null {
  const migrationsDir = path.join(REPO_ROOT, 'supabase/migrations');
  let files: string[];
  try {
    files = fs.readdirSync(migrationsDir).sort();
  } catch {
    return null;
  }
  for (const f of files) {
    if (!f.endsWith('.sql')) continue;
    try {
      const content = fs.readFileSync(path.join(migrationsDir, f), 'utf-8');
      const lower = content.toLowerCase();
      if (lower.includes('fts') && lower.includes('ideas') && lower.includes('generated')) {
        return { filename: f, content };
      }
    } catch {
      // skip unreadable files
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// AC6–AC7: migration must add the fts generated column
// ---------------------------------------------------------------------------

describe('query_ideas fts — migration adds generated tsvector column to ideas', () => {
  let migration: { filename: string; content: string } | null;

  beforeAll(() => {
    migration = findFtsMigration();
  });

  it('has a migration that adds the fts generated column to ideas table', () => {
    expect(
      migration,
      'No migration found that adds a GENERATED fts column to the ideas table. ' +
        'Expected a migration containing: ' +
        'ALTER TABLE public.ideas ADD COLUMN IF NOT EXISTS fts tsvector GENERATED ALWAYS AS (...) STORED',
    ).not.toBeNull();
  });

  it('migration targets the ideas table', () => {
    expect(migration?.content).toMatch(/ALTER TABLE.*ideas/i);
  });

  it('migration adds a column named fts of type tsvector', () => {
    expect(migration?.content).toMatch(/fts\s+tsvector/i);
  });

  it('migration uses GENERATED ALWAYS AS syntax (stored generated column)', () => {
    expect(migration?.content).toMatch(/GENERATED ALWAYS AS/i);
  });

  it('migration expression calls to_tsvector', () => {
    expect(migration?.content).toMatch(/to_tsvector/i);
  });

  it('migration expression includes title in the tsvector expression', () => {
    expect(migration?.content).toContain('title');
  });

  it('migration expression includes description in the tsvector expression', () => {
    expect(migration?.content).toContain('description');
  });

  it('migration uses english text search configuration', () => {
    expect(migration?.content).toMatch(/english/i);
  });

  it('migration uses IF NOT EXISTS for idempotency', () => {
    expect(migration?.content).toMatch(/IF NOT EXISTS/i);
  });

  it('migration uses STORED (not VIRTUAL) so the column is queryable via PostgREST', () => {
    expect(migration?.content).toMatch(/STORED/i);
  });

  it('migration uses COALESCE to handle null title/description safely', () => {
    expect(migration?.content).toMatch(/COALESCE/i);
  });
});

// ---------------------------------------------------------------------------
// query-ideas edge function: uses textSearch on the fts column
// ---------------------------------------------------------------------------

describe('query_ideas fts — edge function uses textSearch on fts column', () => {
  const FN_PATH = 'supabase/functions/query-ideas/index.ts';
  let content: string | null;

  beforeAll(() => {
    content = readRepoFile(FN_PATH);
  });

  it('query-ideas/index.ts exists', () => {
    expect(content, `File not found: ${FN_PATH}`).not.toBeNull();
  });

  it('calls .textSearch("fts", ...) for full-text search', () => {
    expect(content).toContain('.textSearch("fts"');
  });

  it('uses english text search config in textSearch call', () => {
    // config: "english" tells PostgREST to use the english search configuration
    expect(content).toMatch(/config.*english/i);
  });

  it('search is conditional — only applied when search parameter is provided', () => {
    // Must be wrapped in an if-block so non-search queries are not affected
    expect(content).toMatch(/if\s*\(\s*search\s*\)/);
  });

  it('returns ideas array in the response body', () => {
    expect(content).toContain('ideas:');
  });

  it('returns HTTP 500 error response when a query fails', () => {
    // The fix ensures 500 only occurs on real DB errors, not missing-column errors
    // Verify the error handling path exists
    expect(content).toContain('500');
  });
});
