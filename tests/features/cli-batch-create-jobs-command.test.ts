/**
 * Feature: CLI batch-create-jobs command (replaces MCP tool)
 *
 * Covers acceptance criteria 1, 2, and 6:
 *   AC1 — zazig batch-create-jobs --company <id> --feature-id <id> --jobs '[...]' creates jobs
 *   AC2 — --jobs-file <path> works as an alternative for large payloads
 *   AC6 — The batch-create-jobs edge function still exists (CLI calls it)
 *
 * Tests are written to FAIL until the feature is implemented.
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

function repoPathExists(relPath: string): boolean {
  return fs.existsSync(path.join(REPO_ROOT, relPath));
}

// ---------------------------------------------------------------------------
// AC1 / AC2: batch-create-jobs.ts command file
// ---------------------------------------------------------------------------

describe('batch-create-jobs.ts command file', () => {
  const FILE = 'packages/cli/src/commands/batch-create-jobs.ts';
  let content: string | null;

  beforeAll(() => {
    content = readRepoFile(FILE);
  });

  it('exists at packages/cli/src/commands/batch-create-jobs.ts', () => {
    expect(
      content,
      `Command file not found at ${FILE}. Create packages/cli/src/commands/batch-create-jobs.ts`,
    ).not.toBeNull();
  });

  it('requires --company flag', () => {
    expect(content).toContain('company');
  });

  it('requires --feature-id flag', () => {
    expect(content).toMatch(/feature.?id|featureId|feature_id/);
  });

  it('requires --jobs flag for inline JSON', () => {
    expect(content).toMatch(/--jobs[^-]|parseStringFlag.*jobs/);
  });

  it('supports --jobs-file flag as alternative for large payloads (AC2)', () => {
    expect(content).toMatch(/jobs.?file|jobsFile/i);
  });

  it('calls getValidCredentials() for auth', () => {
    expect(content).toContain('getValidCredentials');
  });

  it('calls loadConfig() for supabase URL', () => {
    expect(content).toContain('loadConfig');
  });

  it('uses DEFAULT_SUPABASE_ANON_KEY from constants', () => {
    expect(content).toContain('DEFAULT_SUPABASE_ANON_KEY');
  });

  it('hits the batch-create-jobs edge function endpoint', () => {
    expect(content).toContain('batch-create-jobs');
  });

  it('uses POST method', () => {
    expect(content).toContain('POST');
  });

  it('sends feature_id in the request body', () => {
    expect(content).toMatch(/feature_id/);
  });

  it('sends jobs array in the request body', () => {
    expect(content).toMatch(/\bjobs\b/);
  });

  it('parses --jobs value as JSON', () => {
    expect(content).toMatch(/JSON\.parse/);
  });

  it('sends Authorization Bearer header', () => {
    expect(content).toMatch(/Authorization.*Bearer|Bearer.*Authorization/i);
  });

  it('sends apikey header', () => {
    expect(content).toContain('apikey');
  });

  it('sends x-company-id header', () => {
    expect(content).toContain('x-company-id');
  });

  it('writes response JSON to stdout', () => {
    expect(content).toMatch(/process\.stdout\.write|stdout/);
  });

  it('exits 0 on success', () => {
    expect(content).toMatch(/process\.exit\(0\)|exitCode\s*=\s*0/);
  });

  it('writes error JSON to stderr and exits 1 on HTTP error', () => {
    expect(content).toMatch(/process\.stderr\.write|stderr/);
    expect(content).toMatch(/process\.exit\(1\)|exitCode\s*=\s*1/);
    expect(content).toMatch(/"error"/);
  });

  it('handles missing credentials by writing error to stderr', () => {
    expect(content).toMatch(/Not logged in|getValidCredentials/);
  });

  it('reads --jobs-file from disk when provided (AC2)', () => {
    // Should read file contents when --jobs-file is given
    expect(content).toMatch(/readFileSync|readFile|fs\./);
  });
});

// ---------------------------------------------------------------------------
// CLI entry point: batch-create-jobs registered
// ---------------------------------------------------------------------------

describe('CLI index.ts registers batch-create-jobs command', () => {
  const INDEX_FILE = 'packages/cli/src/index.ts';
  let content: string | null;

  beforeAll(() => {
    content = readRepoFile(INDEX_FILE);
  });

  it('index.ts exists', () => {
    expect(content).not.toBeNull();
  });

  it('imports batchCreateJobs from commands/batch-create-jobs', () => {
    expect(content).toMatch(/import.*from.*commands\/batch-create-jobs/);
  });

  it('registers "batch-create-jobs" case in command switch', () => {
    expect(content).toMatch(/case\s+['"]batch-create-jobs['"]/);
  });
});

// ---------------------------------------------------------------------------
// AC6: batch-create-jobs edge function still exists
// ---------------------------------------------------------------------------

describe('batch-create-jobs edge function is preserved (AC6)', () => {
  it('supabase/functions/batch-create-jobs/ directory still exists', () => {
    const exists = repoPathExists('supabase/functions/batch-create-jobs');
    expect(
      exists,
      'supabase/functions/batch-create-jobs/ was deleted — must remain (CLI calls it)',
    ).toBe(true);
  });

  it('edge function has an index.ts entry point', () => {
    const exists =
      repoPathExists('supabase/functions/batch-create-jobs/index.ts') ||
      repoPathExists('supabase/functions/batch-create-jobs/index.js');
    expect(
      exists,
      'batch-create-jobs/index.ts not found — edge function must remain intact',
    ).toBe(true);
  });
});
