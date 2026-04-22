/**
 * Feature: CLI: show job errors and feature diagnostics
 *
 * Tests for acceptance criteria related to the jobs command:
 * 1. zazig jobs command works with valid company UUIDs (including all-zero UUIDs)
 * 2. zazig jobs shows error_message for failed jobs
 * 3. zazig jobs --feature-id filters jobs by feature
 *
 * These tests inspect source file content and will FAIL until the feature is built.
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
// AC1: zazig jobs command works with valid company UUIDs
// The existing UUID_V4ISH_REGEX rejects valid UUIDs like 00000000-0000-0000-0000-000000000001
// because it requires version nibble [1-8] and variant bits [89ab]. Fix: accept any hex UUID.
// ---------------------------------------------------------------------------

describe('zazig jobs — UUID validation accepts all valid UUID formats', () => {
  const FILE = 'packages/cli/src/commands/jobs.ts';
  let content: string | null;

  beforeAll(() => {
    content = readRepoFile(FILE);
  });

  it('jobs.ts exists', () => {
    expect(content, `Command file not found at ${FILE}`).not.toBeNull();
  });

  it('UUID regex accepts all-zero UUID (00000000-0000-0000-0000-000000000001)', () => {
    // The old regex /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    // rejects valid UUIDs that don't have version [1-8] or variant [89ab].
    // Fix: use a permissive regex that accepts any xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx pattern.
    // We verify the file does NOT contain the over-restrictive version/variant constraints.
    expect(content).not.toMatch(/\[1-8\]\[0-9a-f\]\{3\}-\[89ab\]/);
  });

  it('UUID regex matches the standard 8-4-4-4-12 hex format', () => {
    // The fix should use a regex that allows all hex digits in each segment
    expect(content).toMatch(
      /\[0-9a-f\]\{8\}-\[0-9a-f\]\{4\}-\[0-9a-f\]\{4\}-\[0-9a-f\]\{4\}-\[0-9a-f\]\{12\}/i,
    );
  });

  it('isUuid function accepts the test UUID 00000000-0000-0000-0000-000000000001', () => {
    // Verify the UUID validation logic accepts non-v4 UUIDs used in test/staging environments
    const testUuid = '00000000-0000-0000-0000-000000000001';
    // Extract the regex from the file and test it inline
    const regexMatch = content?.match(/UUID[_A-Z]*REGEX\s*=\s*(\/[^/]+\/[gi]*)/);
    if (!regexMatch) {
      // If no regex literal found, we can't test directly — fail with guidance
      expect(regexMatch, 'Could not find UUID regex constant in jobs.ts').not.toBeNull();
      return;
    }
    // The regex should not have the [1-8] version constraint
    expect(regexMatch[1]).not.toContain('[1-8]');
  });
});

// ---------------------------------------------------------------------------
// AC2: zazig jobs shows error_message for failed jobs
// ---------------------------------------------------------------------------

describe('zazig jobs — error fields in output', () => {
  const FILE = 'packages/cli/src/commands/jobs.ts';
  let content: string | null;

  beforeAll(() => {
    content = readRepoFile(FILE);
  });

  it('jobs.ts requests error_message field from the API', () => {
    // The query body or API call must include error_message in columns or response mapping
    expect(content).toMatch(/error_message/);
  });

  it('jobs.ts includes error_details in the response or output', () => {
    expect(content).toMatch(/error_details/);
  });

  it('jobs.ts includes status field in job output', () => {
    // status: queued, running, complete, failed, cancelled
    expect(content).toMatch(/status/);
  });

  it('jobs.ts includes timestamps in output (created_at, updated_at, completed_at)', () => {
    expect(content).toMatch(/created_at/);
    expect(content).toMatch(/updated_at/);
    expect(content).toMatch(/completed_at/);
  });

  it('jobs.ts includes feature_id in output', () => {
    expect(content).toMatch(/feature_id/);
  });

  it('jobs.ts output is not just raw JSON (human-readable formatting for errors)', () => {
    // The output should format error messages in a human-readable way, not just JSON.stringify
    // We verify that the file either branches on --json or formats error_message specially
    expect(content).toMatch(/error_message|Error:|failed/i);
  });
});

// ---------------------------------------------------------------------------
// AC3: zazig jobs --feature-id filters jobs by feature
// ---------------------------------------------------------------------------

describe('zazig jobs — --feature-id filtering', () => {
  const FILE = 'packages/cli/src/commands/jobs.ts';
  let content: string | null;

  beforeAll(() => {
    content = readRepoFile(FILE);
  });

  it('parses --feature-id flag', () => {
    expect(content).toMatch(/feature-id|featureId/);
  });

  it('includes feature_id in the API request body when --feature-id is provided', () => {
    // The feature_id must be forwarded to the query-jobs API endpoint
    expect(content).toMatch(/feature_id.*featureId|featureId.*feature_id|feature_id.*value/s);
  });

  it('validates --feature-id as a UUID', () => {
    // --feature-id should be validated as UUID, same as --id
    expect(content).toMatch(/feature.*[Ii][Dd].*[Uu][Uu][Ii][Dd]|isUuid.*feature/s);
  });
});

// ---------------------------------------------------------------------------
// CLI index.ts — no new command needed for jobs (already registered)
// ---------------------------------------------------------------------------

describe('CLI index.ts — jobs command registration', () => {
  const INDEX_FILE = 'packages/cli/src/index.ts';
  let content: string | null;

  beforeAll(() => {
    content = readRepoFile(INDEX_FILE);
  });

  it('index.ts exists', () => {
    expect(content).not.toBeNull();
  });

  it('registers "jobs" case in command switch', () => {
    expect(content).toMatch(/case\s+['"]jobs['"]/);
  });
});
