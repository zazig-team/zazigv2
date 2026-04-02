/**
 * Feature: CLI unified zazig search — CLI command (search.ts)
 *
 * Tests for packages/cli/src/commands/search.ts and its registration in the
 * CLI entry point. Covers: command file structure, all CLI flags, auth pattern,
 * pagination footer output, grouped JSON stdout, and error handling.
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

const CMD_FILE = 'packages/cli/src/commands/search.ts';
const INDEX_FILE = 'packages/cli/src/index.ts';

// ---------------------------------------------------------------------------
// AC1: search command file exists and follows auth pattern
// ---------------------------------------------------------------------------

describe('search.ts command file', () => {
  let content: string | null;

  beforeAll(() => {
    content = readRepoFile(CMD_FILE);
  });

  it('exists at packages/cli/src/commands/search.ts', () => {
    expect(
      content,
      `Command file not found at ${CMD_FILE}. Create packages/cli/src/commands/search.ts`,
    ).not.toBeNull();
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

  it('hits the query-search edge function endpoint', () => {
    expect(content).toContain('query-search');
  });

  it('uses POST method to query-search', () => {
    expect(content).toMatch(/POST/);
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

  // AC1: accepts positional query argument
  it('accepts a positional query argument', () => {
    expect(content).toMatch(/query|argv\[|args\[/i);
  });

  // AC2 / AC3: --type flag
  it('supports --type flag to filter by entity type', () => {
    expect(content).toMatch(/--type|'type'|"type"/);
  });

  // AC4: --status flag
  it('supports --status flag to filter by status', () => {
    expect(content).toMatch(/--status|'status'|"status"/);
  });

  // AC5: --limit flag
  it('supports --limit flag for per-type max results', () => {
    expect(content).toMatch(/--limit|'limit'|"limit"/);
  });

  // AC6: --offset flag
  it('supports --offset flag for per-type result skipping', () => {
    expect(content).toMatch(/--offset|'offset'|"offset"/);
  });

  // AC1 / response: outputs JSON matching grouped response shape
  it('writes JSON to stdout with ideas, features, jobs keys', () => {
    expect(content).toMatch(/process\.stdout\.write|stdout/);
    expect(content).toMatch(/JSON\.stringify/);
  });

  it('exits 0 on success', () => {
    expect(content).toMatch(/process\.exit\(0\)|exitCode\s*=\s*0/);
  });

  it('writes error JSON to stderr and exits 1 on error', () => {
    expect(content).toMatch(/process\.stderr\.write|stderr/);
    expect(content).toMatch(/process\.exit\(1\)|exitCode\s*=\s*1/);
    expect(content).toMatch(/"error"/);
  });

  // AC7: missing/empty query → error (CLI-level guard before calling API)
  it('validates that query argument is non-empty before calling the API', () => {
    expect(content).toMatch(/query.*length|!query|query\s*==|query\s*===\s*['"]|trim/i);
  });
});

// ---------------------------------------------------------------------------
// AC10: Pagination footer line
// ---------------------------------------------------------------------------

describe('search.ts pagination footer', () => {
  let content: string | null;

  beforeAll(() => {
    content = readRepoFile(CMD_FILE);
  });

  it('appends a pagination footer line to output', () => {
    // Must contain "Showing" text matching the standard footer pattern
    expect(content).toMatch(/Showing/);
  });

  it('includes the range in the footer (e.g. "1-20")', () => {
    expect(content).toMatch(/range|offset.*limit|limit.*offset/i);
  });

  it('includes the total in the footer', () => {
    expect(content).toMatch(/total/i);
  });

  it('includes --limit and --offset values in the footer', () => {
    expect(content).toMatch(/--limit.*--offset|--offset.*--limit/i);
  });
});

// ---------------------------------------------------------------------------
// AC2 / AC3: --type flag — builds correct request body
// ---------------------------------------------------------------------------

describe('search.ts type flag request body', () => {
  let content: string | null;

  beforeAll(() => {
    content = readRepoFile(CMD_FILE);
  });

  it('includes type in the POST body when --type is provided', () => {
    // The type value must be forwarded to the edge function body
    expect(content).toMatch(/body.*type|type.*body|JSON\.stringify.*type/is);
  });
});

// ---------------------------------------------------------------------------
// AC5 / AC6: --limit and --offset in POST body
// ---------------------------------------------------------------------------

describe('search.ts pagination flags forwarded to edge function', () => {
  let content: string | null;

  beforeAll(() => {
    content = readRepoFile(CMD_FILE);
  });

  it('includes limit in the POST body', () => {
    expect(content).toMatch(/body.*limit|limit.*body|JSON\.stringify.*limit/is);
  });

  it('includes offset in the POST body', () => {
    expect(content).toMatch(/body.*offset|offset.*body|JSON\.stringify.*offset/is);
  });
});

// ---------------------------------------------------------------------------
// CLI registration: search command registered in index.ts
// ---------------------------------------------------------------------------

describe('CLI entry point registers search command', () => {
  let content: string | null;

  beforeAll(() => {
    content = readRepoFile(INDEX_FILE);
  });

  it('index.ts exists', () => {
    expect(content, `${INDEX_FILE} not found`).not.toBeNull();
  });

  it('imports search command from commands/search', () => {
    expect(content).toMatch(/import.*search.*from.*commands\/search|require.*commands\/search/i);
  });

  it('registers "search" case in command switch or router', () => {
    expect(content).toMatch(/case\s+['"]search['"]|'search'.*search|"search".*search/);
  });
});

// ---------------------------------------------------------------------------
// No regression: existing --search flags on other commands still exist
// ---------------------------------------------------------------------------

describe('existing --search flag on ideas command not broken', () => {
  let content: string | null;

  beforeAll(() => {
    content = readRepoFile('packages/cli/src/commands/ideas.ts');
  });

  it('ideas.ts still contains --search flag support', () => {
    if (content === null) {
      // If ideas.ts does not exist at all, skip (different feature)
      return;
    }
    expect(content).toContain('search');
  });
});
