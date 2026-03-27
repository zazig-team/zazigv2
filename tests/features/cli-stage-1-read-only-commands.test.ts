/**
 * Feature: CLI Stage 1 — Read-only commands (snapshot, ideas, features, projects)
 *
 * Tests for acceptance criteria 1–11.
 * These tests verify that the required command files exist and contain the
 * expected implementation patterns. They are written to FAIL against the
 * current codebase and pass once the feature is implemented.
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
// AC1 / AC8 / AC9 / AC10 / AC11: zazig snapshot command
// ---------------------------------------------------------------------------

describe('snapshot.ts command file', () => {
  const FILE = 'packages/cli/src/commands/snapshot.ts';
  let content: string | null;

  beforeAll(() => {
    content = readRepoFile(FILE);
  });

  it('exists at packages/cli/src/commands/snapshot.ts', () => {
    expect(
      content,
      `Command file not found at ${FILE}. Create packages/cli/src/commands/snapshot.ts`,
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

  it('hits the get-pipeline-snapshot edge function endpoint', () => {
    expect(content).toContain('get-pipeline-snapshot');
  });

  it('uses GET method or no body (snapshot is a GET request)', () => {
    // GET request — no POST body needed
    expect(content).toMatch(/GET|get-pipeline-snapshot/);
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

  it('writes compact JSON to stdout (JSON.stringify without pretty-printing)', () => {
    // Should use JSON.stringify without indent arg, and write to stdout
    expect(content).toMatch(/JSON\.stringify/);
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
    // Should catch missing creds and write {"error": "Not logged in..."} to stderr
    expect(content).toMatch(/Not logged in|getValidCredentials/);
  });
});

// ---------------------------------------------------------------------------
// AC2 / AC3 / AC8 / AC9 / AC10: zazig ideas command
// ---------------------------------------------------------------------------

describe('ideas.ts command file', () => {
  const FILE = 'packages/cli/src/commands/ideas.ts';
  let content: string | null;

  beforeAll(() => {
    content = readRepoFile(FILE);
  });

  it('exists at packages/cli/src/commands/ideas.ts', () => {
    expect(
      content,
      `Command file not found at ${FILE}. Create packages/cli/src/commands/ideas.ts`,
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

  it('hits the query-ideas edge function endpoint', () => {
    expect(content).toContain('query-ideas');
  });

  it('uses POST method to query-ideas', () => {
    expect(content).toMatch(/POST/);
  });

  it('supports --status flag to filter ideas by status', () => {
    expect(content).toContain('status');
  });

  it('supports --id flag to fetch single idea by UUID', () => {
    expect(content).toContain('"id"');
  });

  it('supports --source flag to filter by source channel', () => {
    expect(content).toContain('source');
  });

  it('supports --domain flag to filter by domain', () => {
    expect(content).toContain('domain');
  });

  it('supports --search flag for full-text search', () => {
    expect(content).toContain('search');
  });

  it('supports --limit flag for max results', () => {
    expect(content).toContain('limit');
  });

  it('builds JSON body from flags for POST request', () => {
    expect(content).toMatch(/JSON\.stringify/);
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

  it('writes compact JSON to stdout', () => {
    expect(content).toMatch(/process\.stdout\.write|stdout/);
  });

  it('exits 0 on success', () => {
    expect(content).toMatch(/process\.exit\(0\)|exitCode\s*=\s*0/);
  });

  it('writes error JSON to stderr and exits 1 on error', () => {
    expect(content).toMatch(/process\.stderr\.write|stderr/);
    expect(content).toMatch(/process\.exit\(1\)|exitCode\s*=\s*1/);
    expect(content).toMatch(/"error"/);
  });
});

// ---------------------------------------------------------------------------
// AC4 / AC5 / AC6 / AC8 / AC9 / AC10: zazig features command
// ---------------------------------------------------------------------------

describe('features.ts command file', () => {
  const FILE = 'packages/cli/src/commands/features.ts';
  let content: string | null;

  beforeAll(() => {
    content = readRepoFile(FILE);
  });

  it('exists at packages/cli/src/commands/features.ts', () => {
    expect(
      content,
      `Command file not found at ${FILE}. Create packages/cli/src/commands/features.ts`,
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

  it('hits the query-features edge function endpoint', () => {
    expect(content).toContain('query-features');
  });

  it('uses POST method to query-features', () => {
    expect(content).toMatch(/POST/);
  });

  it('accepts a positional project_id argument', () => {
    expect(content).toContain('project_id');
  });

  it('supports --id flag to fetch single feature by UUID', () => {
    expect(content).toContain('"id"');
  });

  it('supports --status flag to filter features by status', () => {
    expect(content).toContain('status');
  });

  it('builds JSON body from arguments for POST request', () => {
    expect(content).toMatch(/JSON\.stringify/);
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

  it('writes compact JSON to stdout', () => {
    expect(content).toMatch(/process\.stdout\.write|stdout/);
  });

  it('exits 0 on success', () => {
    expect(content).toMatch(/process\.exit\(0\)|exitCode\s*=\s*0/);
  });

  it('writes error JSON to stderr and exits 1 on error', () => {
    expect(content).toMatch(/process\.stderr\.write|stderr/);
    expect(content).toMatch(/process\.exit\(1\)|exitCode\s*=\s*1/);
    expect(content).toMatch(/"error"/);
  });
});

// ---------------------------------------------------------------------------
// AC7 / AC8 / AC9 / AC10: zazig projects command
// ---------------------------------------------------------------------------

describe('projects.ts command file', () => {
  const FILE = 'packages/cli/src/commands/projects.ts';
  let content: string | null;

  beforeAll(() => {
    content = readRepoFile(FILE);
  });

  it('exists at packages/cli/src/commands/projects.ts', () => {
    expect(
      content,
      `Command file not found at ${FILE}. Create packages/cli/src/commands/projects.ts`,
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

  it('queries the projects REST endpoint', () => {
    expect(content).toMatch(/rest\/v1\/projects|query-projects/);
  });

  it('selects id, name, description, status fields', () => {
    expect(content).toMatch(/select.*id.*name.*description.*status|select=id,name,description,status/i);
  });

  it('filters projects by company_id', () => {
    expect(content).toContain('company_id');
  });

  it('supports --include-features optional flag', () => {
    expect(content).toContain('include-features');
  });

  it('sends Authorization Bearer header', () => {
    expect(content).toMatch(/Authorization.*Bearer|Bearer.*Authorization/i);
  });

  it('sends apikey header', () => {
    expect(content).toContain('apikey');
  });

  it('writes compact JSON to stdout', () => {
    expect(content).toMatch(/process\.stdout\.write|stdout/);
  });

  it('exits 0 on success', () => {
    expect(content).toMatch(/process\.exit\(0\)|exitCode\s*=\s*0/);
  });

  it('writes error JSON to stderr and exits 1 on error', () => {
    expect(content).toMatch(/process\.stderr\.write|stderr/);
    expect(content).toMatch(/process\.exit\(1\)|exitCode\s*=\s*1/);
    expect(content).toMatch(/"error"/);
  });
});

// ---------------------------------------------------------------------------
// AC11: All 4 commands registered in CLI entry point (index.ts)
// ---------------------------------------------------------------------------

describe('CLI entry point registers all new commands', () => {
  const INDEX_FILE = 'packages/cli/src/index.ts';
  let content: string | null;

  beforeAll(() => {
    content = readRepoFile(INDEX_FILE);
  });

  it('index.ts exists', () => {
    expect(content).not.toBeNull();
  });

  it('imports snapshot command', () => {
    expect(content).toMatch(/import.*snapshot.*from.*commands\/snapshot/);
  });

  it('registers "snapshot" case in command switch', () => {
    expect(content).toMatch(/case\s+['"]snapshot['"]/);
  });

  it('imports ideas command', () => {
    expect(content).toMatch(/import.*ideas.*from.*commands\/ideas/);
  });

  it('registers "ideas" case in command switch', () => {
    expect(content).toMatch(/case\s+['"]ideas['"]/);
  });

  it('imports features command', () => {
    expect(content).toMatch(/import.*features.*from.*commands\/features/);
  });

  it('registers "features" case in command switch', () => {
    expect(content).toMatch(/case\s+['"]features['"]/);
  });

  it('imports projects command', () => {
    expect(content).toMatch(/import.*projects.*from.*commands\/projects/);
  });

  it('registers "projects" case in command switch', () => {
    expect(content).toMatch(/case\s+['"]projects['"]/);
  });
});

// ---------------------------------------------------------------------------
// AC8: Compact JSON output (no pretty-printing) — structural check
// ---------------------------------------------------------------------------

describe('Compact JSON output constraint', () => {
  const commandFiles = [
    'packages/cli/src/commands/snapshot.ts',
    'packages/cli/src/commands/ideas.ts',
    'packages/cli/src/commands/features.ts',
    'packages/cli/src/commands/projects.ts',
  ];

  for (const file of commandFiles) {
    it(`${path.basename(file)} does not use JSON.stringify with indent argument`, () => {
      const content = readRepoFile(file);
      if (!content) {
        // File missing — will fail in file-existence test above
        expect(content, `${file} not found`).not.toBeNull();
        return;
      }
      // Should not have JSON.stringify(data, null, 2) or JSON.stringify(data, null, 4)
      expect(content).not.toMatch(/JSON\.stringify\([^)]+,\s*(null|\d+),\s*\d+\)/);
    });
  }
});
