/**
 * Feature: Project Rules — automated learning from CI failures
 *
 * Tests for AC8 (engineer + combiner prompts) and AC9 (fix agent prompt).
 *
 * Verifies that database migrations update role prompts to instruct agents to:
 *   - AC8: read and follow project_rules when present in job context
 *   - AC9: call create_project_rule after fixing a preventable pattern
 *
 * Tests are written to FAIL against the current codebase and pass once
 * the feature is implemented.
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

function readAllMigrations(): Array<{ name: string; content: string }> {
  const migrationsDir = path.join(REPO_ROOT, 'supabase/migrations');
  try {
    return fs
      .readdirSync(migrationsDir)
      .sort()
      .filter((f) => f.endsWith('.sql'))
      .map((f) => ({
        name: f,
        content: fs.readFileSync(path.join(migrationsDir, f), 'utf-8'),
      }));
  } catch {
    return [];
  }
}

/** Returns the concatenated content of ALL migrations — used to find if
 *  a prompt update exists anywhere in migration history. */
function allMigrationsText(): string {
  return readAllMigrations()
    .map((m) => m.content)
    .join('\n');
}

/** Returns the most recent migration (by file name sort) that contains all given strings. */
function findMigrationContaining(...terms: string[]): string | null {
  const migrations = readAllMigrations().reverse(); // newest first
  for (const { content } of migrations) {
    if (terms.every((t) => content.includes(t))) return content;
  }
  return null;
}

// ---------------------------------------------------------------------------
// AC8: Engineer and combiner role prompts instruct agents to follow project_rules
// ---------------------------------------------------------------------------

describe('AC8: Engineer and combiner role prompts include project_rules instruction', () => {
  let allMigrations: string;

  beforeAll(() => {
    allMigrations = allMigrationsText();
  });

  it('some migration references project_rules in the context of a role prompt update', () => {
    expect(allMigrations).toMatch(/project_rules/);
  });

  it('migration updates senior-engineer prompt to mention project_rules', () => {
    const migration = findMigrationContaining('senior-engineer', 'project_rules');
    expect(
      migration,
      'No migration found that updates the senior-engineer role prompt to include project_rules. ' +
        'Expected: UPDATE roles SET prompt = ... WHERE name = \'senior-engineer\' ' +
        'with text mentioning project_rules.',
    ).not.toBeNull();
  });

  it('senior-engineer prompt instructs agent to follow project_rules before starting work', () => {
    const migration = findMigrationContaining('senior-engineer', 'project_rules');
    // Should tell agent to read and follow every rule
    expect(migration).toMatch(/project_rules.*follow|follow.*project_rules/i);
  });

  it('migration updates junior-engineer prompt to mention project_rules', () => {
    const migration = findMigrationContaining('junior-engineer', 'project_rules');
    expect(
      migration,
      'No migration found that updates the junior-engineer role prompt to include project_rules.',
    ).not.toBeNull();
  });

  it('junior-engineer prompt instructs agent to follow project_rules before starting work', () => {
    const migration = findMigrationContaining('junior-engineer', 'project_rules');
    expect(migration).toMatch(/project_rules.*follow|follow.*project_rules/i);
  });

  it('migration updates job-combiner prompt to mention project_rules', () => {
    const migration = findMigrationContaining('job-combiner', 'project_rules');
    expect(
      migration,
      'No migration found that updates the job-combiner role prompt to include project_rules.',
    ).not.toBeNull();
  });

  it('job-combiner prompt instructs agent to follow project_rules before starting work', () => {
    const migration = findMigrationContaining('job-combiner', 'project_rules');
    expect(migration).toMatch(/project_rules.*follow|follow.*project_rules/i);
  });

  it('engineer prompts say to read AND follow EVERY rule (not just be aware of them)', () => {
    const engineerMigration = findMigrationContaining('senior-engineer', 'project_rules');
    // The spec requires: "read and follow every rule before starting work"
    expect(engineerMigration).toMatch(/every rule|all.*rules|each rule/i);
  });
});

// ---------------------------------------------------------------------------
// AC9: Fix agent prompt instructs to create rules for preventable patterns
// ---------------------------------------------------------------------------

describe('AC9: Fix agent prompt instructs to create project rules for preventable patterns', () => {
  let allMigrations: string;

  beforeAll(() => {
    allMigrations = allMigrationsText();
  });

  it('some migration references create_project_rule in a fix-agent/engineer context', () => {
    // The fix agent uses the same role as the failed job (engineer, combiner, etc.)
    // The prompt update should tell the agent to call create_project_rule after fixing
    expect(allMigrations).toMatch(/create_project_rule/);
  });

  it('migration that adds fix-agent instructions references preventable pattern guidance', () => {
    const migration = findMigrationContaining('create_project_rule', 'preventable');
    expect(
      migration,
      'No migration found with both "create_project_rule" and "preventable". ' +
        'Expected a prompt update that tells agents to call create_project_rule when ' +
        'a preventable pattern is identified during a fix.',
    ).not.toBeNull();
  });

  it('fix agent prompt instructs to call create_project_rule with clear actionable rule', () => {
    const migration = findMigrationContaining('create_project_rule', 'preventable');
    expect(migration).toMatch(/create_project_rule/i);
    expect(migration).toMatch(/rule/i);
  });

  it('fix agent prompt specifies to only create rules for patterns general enough to recur', () => {
    const migration = findMigrationContaining('create_project_rule', 'preventable');
    // Should warn against creating rules for one-off bugs
    expect(migration).toMatch(/general|recur|one.off|specific/i);
  });

  it('fix agent prompt specifies the applies_to job types to use (e.g. code, combine)', () => {
    const migration = findMigrationContaining('create_project_rule', 'preventable');
    // Should mention job types like code, combine, test
    expect(migration).toMatch(/code|combine|test/i);
    expect(migration).toMatch(/applies_to/i);
  });

  it('fix agent prompt instructs to consider rule creation AFTER fixing, not before', () => {
    const migration = findMigrationContaining('create_project_rule', 'preventable');
    // Should say "after fixing" or "after the fix"
    expect(migration).toMatch(/after fix|after.*fix|fixing.*consider|consider.*after/i);
  });

  it('fix agent prompt is applied to a role used in fix scenarios (engineer or dedicated fix role)', () => {
    // The fix agent is the same role that failed — typically senior-engineer or junior-engineer
    // The prompt update should be applied to one of these roles
    const migration = findMigrationContaining('create_project_rule', 'preventable');
    expect(migration).toMatch(
      /senior.engineer|junior.engineer|job.combiner|fix/i,
    );
  });
});
