/**
 * Feature: Expert Session Liveness: tmux as Source of Truth
 * Tests for: DB migration — rename running/completed to run, update CHECK constraint
 *
 * AC1: No expert session in the DB ever has status completed or running after migration
 * AC5: Starting a new expert session transitions through requested, claimed, starting, run and stops
 * AC7: The DB row retains status run permanently after the session ends -- no status update on exit
 *
 * Static analysis of supabase/migrations/ — looks for the migration that renames
 * running/completed rows to run and tightens the CHECK constraint.
 * Written to FAIL against the current codebase; passes once the feature is built.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');
const MIGRATIONS_DIR = path.join(REPO_ROOT, 'supabase/migrations');

function readRepoFile(relPath: string): string | null {
  const fullPath = path.join(REPO_ROOT, relPath);
  try {
    return fs.readFileSync(fullPath, 'utf-8');
  } catch {
    return null;
  }
}

function getAllMigrationContents(): string {
  try {
    const files = fs.readdirSync(MIGRATIONS_DIR).filter(f => f.endsWith('.sql'));
    return files.map(f => fs.readFileSync(path.join(MIGRATIONS_DIR, f), 'utf-8')).join('\n');
  } catch {
    return '';
  }
}

function getLatestMigration(): { name: string; content: string } | null {
  try {
    const files = fs.readdirSync(MIGRATIONS_DIR)
      .filter(f => f.endsWith('.sql'))
      .sort();
    if (files.length === 0) return null;
    const latest = files[files.length - 1];
    const content = fs.readFileSync(path.join(MIGRATIONS_DIR, latest), 'utf-8');
    return { name: latest, content };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// A migration must rename running → run and completed → run
// ---------------------------------------------------------------------------

describe('DB migration: rename running and completed rows to run', () => {
  let allMigrations: string;

  beforeAll(() => {
    allMigrations = getAllMigrationContents();
  });

  it('a migration renames running expert_sessions to run', () => {
    // Must UPDATE expert_sessions SET status = 'run' WHERE status = 'running'
    expect(allMigrations).toMatch(
      /UPDATE\s+expert_sessions\s+SET\s+status\s*=\s*'run'\s+WHERE\s+status\s*=\s*'running'/i
    );
  });

  it('a migration renames completed expert_sessions to run', () => {
    // Must UPDATE expert_sessions SET status = 'run' WHERE status = 'completed'
    expect(allMigrations).toMatch(
      /UPDATE\s+expert_sessions\s+SET\s+status\s*=\s*'run'\s+WHERE\s+status\s*=\s*'completed'/i
    );
  });
});

// ---------------------------------------------------------------------------
// CHECK constraint must be updated to allow only the new valid statuses
// ---------------------------------------------------------------------------

describe('DB migration: CHECK constraint updated for new status values', () => {
  let allMigrations: string;

  beforeAll(() => {
    allMigrations = getAllMigrationContents();
  });

  it('migration adds or replaces expert_sessions status CHECK constraint', () => {
    // Must add a constraint referencing the new allowed values
    expect(allMigrations).toMatch(/CHECK\s*\(/i);
  });

  it('new CHECK constraint includes run as a valid status', () => {
    // The constraint must allow 'run'
    expect(allMigrations).toMatch(/'run'/);
  });

  it('new CHECK constraint does NOT include running as a valid status', () => {
    // After migration, 'running' must no longer be in the constraint
    // The constraint block must not list 'running'
    // We look for a constraint that includes 'run' but not 'running' next to it
    const constraintMatch = allMigrations.match(/CHECK\s*\([^)]+\)/gi) || [];
    const newConstraints = constraintMatch.filter(c => c.includes("'run'"));
    expect(newConstraints.length).toBeGreaterThan(0);
    // None of the new run-containing constraints should have 'running'
    const hasRunning = newConstraints.some(c => c.includes("'running'"));
    expect(hasRunning).toBe(false);
  });

  it('new CHECK constraint does NOT include completed as a valid status', () => {
    const constraintMatch = allMigrations.match(/CHECK\s*\([^)]+\)/gi) || [];
    const newConstraints = constraintMatch.filter(c => c.includes("'run'"));
    const hasCompleted = newConstraints.some(c => c.includes("'completed'"));
    expect(hasCompleted).toBe(false);
  });

  it('CHECK constraint includes requested, claimed, starting, failed, cancelled', () => {
    // The full set of valid statuses must appear in some constraint
    expect(allMigrations).toMatch(/'requested'/);
    expect(allMigrations).toMatch(/'claimed'/);
    expect(allMigrations).toMatch(/'starting'/);
    expect(allMigrations).toMatch(/'failed'/);
    expect(allMigrations).toMatch(/'cancelled'/);
  });
});

// ---------------------------------------------------------------------------
// expert_sessions table must exist (structural check)
// ---------------------------------------------------------------------------

describe('DB: expert_sessions table exists in migrations', () => {
  let allMigrations: string;

  beforeAll(() => {
    allMigrations = getAllMigrationContents();
  });

  it('expert_sessions table is referenced in migrations', () => {
    expect(allMigrations).toMatch(/expert_sessions/);
  });

  it('expert_sessions has a status column', () => {
    expect(allMigrations).toMatch(/expert_sessions[\s\S]{0,500}status/);
  });
});
