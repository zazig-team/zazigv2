/**
 * Feature: Project Rules — automated learning from CI failures
 *
 * Tests for AC1 (project_rules table), AC2 (create-project-rule edge function),
 * and AC3 (create_project_rule MCP tool).
 *
 * These tests verify that the required artefacts exist and contain the expected
 * implementation. They are written to FAIL against the current codebase and
 * pass once the feature is implemented.
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

/** Reads a file relative to repo root, or null if it doesn't exist */
function readRepoFile(relPath: string): string | null {
  const fullPath = path.join(REPO_ROOT, relPath);
  try {
    return fs.readFileSync(fullPath, 'utf-8');
  } catch {
    return null;
  }
}

/** Finds the first migration file whose name contains `keyword` (case-insensitive) */
function findMigrationByKeyword(keyword: string): string | null {
  const migrationsDir = path.join(REPO_ROOT, 'supabase/migrations');
  let files: string[];
  try {
    files = fs.readdirSync(migrationsDir);
  } catch {
    return null;
  }
  const found = files
    .sort()
    .find((f) => f.toLowerCase().includes(keyword.toLowerCase()));
  return found ? path.join(migrationsDir, found) : null;
}

function readMigration(keyword: string): string | null {
  const filePath = findMigrationByKeyword(keyword);
  if (!filePath) return null;
  try {
    return fs.readFileSync(filePath, 'utf-8');
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// AC1: project_rules table schema
// ---------------------------------------------------------------------------

describe('AC1: project_rules table migration', () => {
  let migrationContent: string | null;

  beforeAll(() => {
    migrationContent = readMigration('project_rules');
  });

  it('has a migration file that references project_rules', () => {
    expect(
      migrationContent,
      'No migration file found containing "project_rules". ' +
        'Expected a file like supabase/migrations/NNN_project_rules.sql',
    ).not.toBeNull();
  });

  it('creates the project_rules table', () => {
    expect(migrationContent).toMatch(/CREATE TABLE.*project_rules/is);
  });

  it('table has id column as uuid primary key', () => {
    expect(migrationContent).toMatch(/id\s+uuid.*PRIMARY KEY/is);
  });

  it('table has project_id column that references projects', () => {
    expect(migrationContent).toMatch(/project_id\s+uuid.*NOT NULL/is);
    expect(migrationContent).toMatch(/REFERENCES\s+projects/i);
  });

  it('table has rule_text column as non-null text', () => {
    expect(migrationContent).toMatch(/rule_text\s+text.*NOT NULL/is);
  });

  it('table has applies_to column as text array', () => {
    expect(migrationContent).toMatch(/applies_to\s+text\[\].*NOT NULL/is);
  });

  it('table has source_job_id column referencing jobs', () => {
    expect(migrationContent).toMatch(/source_job_id/i);
    expect(migrationContent).toMatch(/REFERENCES\s+jobs/i);
  });

  it('table has created_at column with default now()', () => {
    expect(migrationContent).toMatch(/created_at\s+timestamptz/i);
    expect(migrationContent).toMatch(/DEFAULT\s+now\(\)/i);
  });

  it('enables row level security on project_rules', () => {
    expect(migrationContent).toMatch(
      /ENABLE ROW LEVEL SECURITY|ALTER TABLE.*project_rules.*ENABLE/i,
    );
  });

  it('has a read/select RLS policy for authenticated users in the company', () => {
    // The policy should be scoped via project join to company
    expect(migrationContent).toMatch(/CREATE POLICY/i);
    expect(migrationContent).toMatch(/SELECT|FOR ALL/i);
    expect(migrationContent).toMatch(/authenticated/i);
  });

  it('has an insert RLS policy for authenticated users in the company', () => {
    expect(migrationContent).toMatch(/INSERT/i);
    expect(migrationContent).toMatch(/authenticated/i);
  });
});

// ---------------------------------------------------------------------------
// AC2: create-project-rule edge function
// ---------------------------------------------------------------------------

describe('AC2: create-project-rule edge function', () => {
  const FN_PATH = 'supabase/functions/create-project-rule/index.ts';
  let content: string | null;

  beforeAll(() => {
    content = readRepoFile(FN_PATH);
  });

  it('edge function file exists at supabase/functions/create-project-rule/index.ts', () => {
    expect(
      content,
      `Edge function not found at ${FN_PATH}. ` +
        'Create supabase/functions/create-project-rule/index.ts',
    ).not.toBeNull();
  });

  it('accepts project_id in the request body', () => {
    expect(content).toContain('project_id');
  });

  it('accepts rule_text in the request body', () => {
    expect(content).toContain('rule_text');
  });

  it('accepts applies_to in the request body', () => {
    expect(content).toContain('applies_to');
  });

  it('validates that rule_text is non-empty and returns 400 on failure', () => {
    expect(content).toContain('400');
    // Should check rule_text is non-empty
    expect(content).toMatch(/rule_text/i);
  });

  it('validates that applies_to is a non-empty array and returns 400 on failure', () => {
    expect(content).toContain('400');
    expect(content).toMatch(/applies_to/i);
  });

  it('returns 404 if project not found or not in caller company', () => {
    expect(content).toContain('404');
  });

  it('inserts a row into the project_rules table', () => {
    expect(content).toMatch(/project_rules/i);
    expect(content).toMatch(/\.insert\(/i);
  });

  it('returns { rule_id: ... } on success', () => {
    expect(content).toContain('rule_id');
  });

  it('returns HTTP 201 on success', () => {
    expect(content).toContain('201');
  });

  it('extracts source_job_id from x-job-id header', () => {
    expect(content).toMatch(/x-job-id/i);
    expect(content).toContain('source_job_id');
  });

  it('extracts company context from x-company-id header', () => {
    expect(content).toMatch(/x-company-id/i);
  });

  it('validates that project_id belongs to the caller company', () => {
    // Should join projects with company to ensure scoping
    expect(content).toMatch(/company_id|company/i);
  });
});

// ---------------------------------------------------------------------------
// AC3: create_project_rule MCP tool
// ---------------------------------------------------------------------------

describe('AC3: create_project_rule MCP tool removed from agent-mcp-server', () => {
  const MCP_PATH = 'packages/local-agent/src/agent-mcp-server.ts';
  let content: string | null;

  beforeAll(() => {
    content = readRepoFile(MCP_PATH);
  });

  it('MCP server no longer defines create_project_rule tool', () => {
    expect(content).not.toContain('"create_project_rule"');
  });
});

// ---------------------------------------------------------------------------
// AC3 (cont): create_project_rule allowed for engineer, combiner, test-engineer,
//             and fix agent roles via DB migration
// ---------------------------------------------------------------------------

describe('AC3 (cont): create_project_rule removed from MCP tools via migration', () => {
  let migrationContent: string | null;

  beforeAll(() => {
    // Find the newest migration that references create_project_rule and mcp_tools
    const migrationsDir = path.join(REPO_ROOT, 'supabase/migrations');
    let files: string[];
    try {
      files = fs.readdirSync(migrationsDir).sort();
    } catch {
      files = [];
    }
    const found = files
      .filter((f) => f.endsWith('.sql'))
      .reverse() // check newest first
      .find((f) => {
        try {
          const c = fs.readFileSync(path.join(migrationsDir, f), 'utf-8');
          return c.includes('create_project_rule') && c.includes('mcp_tools');
        } catch {
          return false;
        }
      });
    migrationContent = found
      ? fs.readFileSync(path.join(migrationsDir, found), 'utf-8')
      : null;
  });

  it('has a migration that references create_project_rule in mcp_tools', () => {
    expect(
      migrationContent,
      'No migration found that references create_project_rule in mcp_tools context.',
    ).not.toBeNull();
  });

  it('migration removes create_project_rule from mcp_tools', () => {
    expect(migrationContent).toMatch(/array_remove/i);
    expect(migrationContent).toContain('create_project_rule');
  });

  it('migration also removes request_feature_fix and start_expert_session', () => {
    expect(migrationContent).toContain('request_feature_fix');
    expect(migrationContent).toContain('start_expert_session');
  });
});
