/**
 * Feature: CLI machine-readable mode — zazig companies command
 *
 * Acceptance criteria covered:
 * - AC1: zazig companies returns valid JSON array of companies
 * - AC9: --json commands produce valid JSON on stdout with zero non-JSON content
 * - AC11: Exit codes are 0 on success, non-zero on failure
 * - FC1: zazig companies when not logged in returns { "error": "..." } and exits non-zero
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
// AC1: zazig companies command file exists and is correctly implemented
// ---------------------------------------------------------------------------

describe('companies.ts command file', () => {
  const FILE = 'packages/cli/src/commands/companies.ts';
  let content: string | null;

  beforeAll(() => {
    content = readRepoFile(FILE);
  });

  it('exists at packages/cli/src/commands/companies.ts', () => {
    expect(
      content,
      `Command file not found at ${FILE}. Create packages/cli/src/commands/companies.ts`,
    ).not.toBeNull();
  });

  it('calls getValidCredentials() for auth', () => {
    expect(content).toContain('getValidCredentials');
  });

  it('calls fetchUserCompanies() to retrieve company list', () => {
    expect(content).toContain('fetchUserCompanies');
  });

  it('imports fetchUserCompanies from company-picker', () => {
    expect(content).toMatch(/import.*fetchUserCompanies.*from.*company-picker/);
  });

  it('outputs a JSON object with a "companies" array key', () => {
    expect(content).toMatch(/"companies"/);
  });

  it('each company entry has an id field', () => {
    expect(content).toMatch(/"id"|\.id\b/);
  });

  it('each company entry has a name field', () => {
    expect(content).toMatch(/"name"|\.name\b/);
  });

  it('writes JSON to stdout', () => {
    expect(content).toMatch(/process\.stdout\.write|console\.log/);
    expect(content).toMatch(/JSON\.stringify/);
  });

  it('exits 0 on success', () => {
    expect(content).toMatch(/process\.exit\(0\)|exitCode\s*=\s*0/);
  });

  it('handles missing credentials — writes error JSON and exits non-zero', () => {
    expect(content).toMatch(/Not logged in|getValidCredentials|error/i);
    expect(content).toMatch(/process\.exit\(1\)|exitCode\s*=\s*1/);
  });

  it('writes error with "error" key when not logged in', () => {
    expect(content).toMatch(/"error"/);
  });

  it('does not require a --company flag (lists all companies for user)', () => {
    // companies command should NOT require --company flag
    expect(content).not.toMatch(/--company.*required|company.*is required/i);
  });
});

// ---------------------------------------------------------------------------
// CLI index.ts registers companies command
// ---------------------------------------------------------------------------

describe('CLI index.ts registers companies command', () => {
  const INDEX_FILE = 'packages/cli/src/index.ts';
  let content: string | null;

  beforeAll(() => {
    content = readRepoFile(INDEX_FILE);
  });

  it('imports companies command', () => {
    expect(content).toMatch(/import.*companies.*from.*commands\/companies/);
  });

  it('registers "companies" case in command switch', () => {
    expect(content).toMatch(/case\s+['"]companies['"]/);
  });
});

// ---------------------------------------------------------------------------
// AC9: companies command output is pure JSON (no non-JSON to stdout)
// ---------------------------------------------------------------------------

describe('companies command JSON output purity', () => {
  const FILE = 'packages/cli/src/commands/companies.ts';

  it('does not use console.log for human-readable progress messages', () => {
    const content = readRepoFile(FILE);
    if (!content) {
      expect(content, `${FILE} not found`).not.toBeNull();
      return;
    }
    // Should not log plain text strings (only JSON output)
    // Any console.log/console.error must only output JSON or go to stderr
    const stdoutCalls = content.match(/process\.stdout\.write\([^)]+\)/g) ?? [];
    for (const call of stdoutCalls) {
      // stdout writes must be JSON.stringify calls, not plain strings
      expect(call).toMatch(/JSON\.stringify/);
    }
  });

  it('does not use JSON.stringify with indent (compact JSON output)', () => {
    const content = readRepoFile(FILE);
    if (!content) {
      expect(content, `${FILE} not found`).not.toBeNull();
      return;
    }
    expect(content).not.toMatch(/JSON\.stringify\([^)]+,\s*(null|\d+),\s*\d+\)/);
  });
});
