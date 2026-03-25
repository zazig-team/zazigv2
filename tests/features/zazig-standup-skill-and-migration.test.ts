/**
 * Feature: standup skill rewrite + snapshot promoted_version migration
 *
 * Tests for acceptance criteria 8–10:
 * 8.  projects/skills/standup.md references `zazig standup --json`
 * 9.  Migration adds promoted_version to completed_features in snapshot
 * 10. No MCP query tools (query_features, query_ideas, query_jobs) in standup skill
 *
 * These tests inspect file content and will FAIL until the feature is built.
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

function listMigrations(): string[] {
  const migrationsDir = path.join(REPO_ROOT, 'supabase/migrations');
  try {
    return fs.readdirSync(migrationsDir).filter((f) => f.endsWith('.sql'));
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// AC8 + AC10: projects/skills/standup.md rewritten to use CLI
// ---------------------------------------------------------------------------

describe('projects/skills/standup.md', () => {
  const FILE = 'projects/skills/standup.md';
  let content: string | null;

  beforeAll(() => {
    content = readRepoFile(FILE);
  });

  it('exists at projects/skills/standup.md', () => {
    expect(content, `Skill file not found at ${FILE}`).not.toBeNull();
  });

  it('references `zazig standup --json` (AC8)', () => {
    // The rewritten skill must call the CLI, not MCP tools
    expect(content).toContain('zazig standup');
    expect(content).toContain('--json');
  });

  it('does NOT reference query_features MCP tool (AC10)', () => {
    expect(content).not.toContain('query_features');
  });

  it('does NOT reference query_ideas MCP tool (AC10)', () => {
    expect(content).not.toContain('query_ideas');
  });

  it('does NOT reference query_jobs MCP tool (AC10)', () => {
    expect(content).not.toContain('query_jobs');
  });

  it('instructs to parse the JSON output from the CLI', () => {
    // The skill must tell Claude to parse JSON, not call MCP tools
    expect(content).toMatch(/[Pp]arse.*[Jj][Ss][Oo][Nn]|[Jj][Ss][Oo][Nn].*[Pp]arse/);
  });

  it('includes output format instructions with standup sections', () => {
    // Skill must describe how to present the standup
    expect(content).toMatch(/[Ss]tandup/);
    expect(content).toMatch(/[Aa]ctive|[Ff]ailed|[Cc]omplete/);
  });

  it('mentions error handling for CLI failure', () => {
    // Spec: "If CLI fails, report error and suggest checking CLI auth"
    expect(content).toMatch(/fail|error|auth/i);
  });

  it('targets under 30 lines output', () => {
    // Spec target: < 30 lines output
    expect(content).toMatch(/30\s*lines?|<\s*30/);
  });

  it('instructs to omit empty sections', () => {
    // Spec: "omit empty ones"
    expect(content).toMatch(/omit|empty/i);
  });

  it('mentions recommendations from the JSON output', () => {
    // Skill should use the recommendations array from the CLI output
    expect(content).toMatch(/recommendation/i);
  });
});

// ---------------------------------------------------------------------------
// AC9: Migration adds promoted_version to snapshot's completed_features
// ---------------------------------------------------------------------------

describe('snapshot promoted_version migration', () => {
  let migrationContent: string | null = null;
  let migrationFile: string | null = null;

  beforeAll(() => {
    const migrations = listMigrations();
    // Find a migration that adds promoted_version to the snapshot function
    for (const file of migrations.sort().reverse()) {
      const content = readRepoFile(`supabase/migrations/${file}`);
      if (content && content.includes('promoted_version') && content.includes('completed_features')) {
        migrationContent = content;
        migrationFile = file;
        break;
      }
    }
  });

  it('a migration file exists that adds promoted_version to completed_features', () => {
    expect(
      migrationContent,
      'No migration found containing both "promoted_version" and "completed_features". ' +
        'Create supabase/migrations/XXX_snapshot_promoted_version.sql',
    ).not.toBeNull();
  });

  it('uses CREATE OR REPLACE FUNCTION (safe to re-run)', () => {
    expect(migrationContent).toMatch(/CREATE\s+OR\s+REPLACE\s+FUNCTION/i);
  });

  it('targets public.refresh_pipeline_snapshot function', () => {
    expect(migrationContent).toMatch(/refresh_pipeline_snapshot/);
  });

  it("adds promoted_version to the completed_features jsonb_build_object", () => {
    // The promoted_version field must be inside the jsonb_build_object for completed features
    expect(migrationContent).toContain('promoted_version');
    expect(migrationContent).toMatch(/jsonb_build_object[\s\S]*?promoted_version/);
  });

  it('keeps completed_features ordered by updated_at DESC', () => {
    expect(migrationContent).toMatch(/ORDER\s+BY.*updated_at\s+DESC/i);
  });

  it('limits completed_features to 10 rows', () => {
    expect(migrationContent).toMatch(/LIMIT\s+10/i);
  });

  it('filters completed features by status = complete', () => {
    expect(migrationContent).toMatch(/status\s*=\s*'complete'/i);
  });

  it('filters completed features by company_id', () => {
    expect(migrationContent).toContain('company_id');
  });
});
