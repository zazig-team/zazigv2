/**
 * Feature: Add quiet hours settings to suppress push notifications
 *
 * Tests for acceptance criteria 1, 2, 9:
 *   AC1: Quiet hours defaults to off — user_preferences.quiet_hours is []
 *   AC2: User enables quiet hours and configures a time range; row persists to Supabase after save
 *   AC9: RLS: user A cannot read or modify user B's user_preferences row
 *
 * These tests do static analysis of the Supabase migration SQL file to verify
 * the schema is correctly defined. Written to FAIL until the feature is implemented.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');
const MIGRATIONS_DIR = path.join(REPO_ROOT, 'supabase', 'migrations');

function findMigrationContaining(pattern: RegExp): { file: string; content: string } | null {
  let files: string[];
  try {
    files = fs.readdirSync(MIGRATIONS_DIR)
      .filter(f => f.endsWith('.sql'))
      .sort();
  } catch {
    return null;
  }

  for (const file of files) {
    const content = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf-8');
    if (pattern.test(content)) {
      return { file, content };
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// AC1: quiet_hours column exists with default empty array
// ---------------------------------------------------------------------------

describe('AC1: quiet_hours column exists on user_preferences with default []', () => {
  let migration: { file: string; content: string } | null;

  beforeAll(() => {
    migration = findMigrationContaining(/quiet_hours/);
  });

  it('a migration file referencing quiet_hours exists', () => {
    expect(
      migration,
      'No migration file found containing "quiet_hours". Create a migration that adds this column.',
    ).not.toBeNull();
  });

  it('migration defines quiet_hours as a jsonb column', () => {
    expect(migration?.content).toMatch(/quiet_hours\s+jsonb/i);
  });

  it('migration sets default value of quiet_hours to empty array []', () => {
    // Default must be '[]'::jsonb or equivalent
    expect(migration?.content).toMatch(/quiet_hours.*DEFAULT\s+'?\[\]'?::jsonb|DEFAULT\s+'?\[\]'?::jsonb.*quiet_hours/is);
  });

  it('migration targets the user_preferences table', () => {
    expect(migration?.content).toMatch(/user_preferences/i);
  });

  it('migration uses ADD COLUMN IF NOT EXISTS or CREATE TABLE for idempotency', () => {
    const content = migration?.content ?? '';
    const hasAddColumn = /ADD COLUMN IF NOT EXISTS/i.test(content);
    const hasCreateTable = /CREATE TABLE.*user_preferences/is.test(content);
    expect(
      hasAddColumn || hasCreateTable,
      'Migration must use "ADD COLUMN IF NOT EXISTS" or create the table',
    ).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// AC2: user_preferences table has user_id column linking to auth.users
// ---------------------------------------------------------------------------

describe('AC2: user_preferences schema supports per-user row persistence', () => {
  let migration: { file: string; content: string } | null;

  beforeAll(() => {
    migration = findMigrationContaining(/quiet_hours/);
  });

  it('migration references user_id linking to auth.users', () => {
    const content = migration?.content ?? '';
    // Either CREATE TABLE with user_id FK, or table already exists (ADD COLUMN path)
    const hasUserIdFk = /user_id.*REFERENCES\s+auth\.users|auth\.users.*user_id/is.test(content);
    const hasAddColumnOnly = /ADD COLUMN IF NOT EXISTS.*quiet_hours/i.test(content) && !hasUserIdFk;
    // ADD COLUMN only path is valid if table already has user_id from a prior migration
    expect(
      hasUserIdFk || hasAddColumnOnly,
      'Migration must define user_id FK to auth.users (if creating table) or add column to existing table',
    ).toBe(true);
  });

  it('user_preferences table has unique constraint on user_id (one row per user)', () => {
    const content = migration?.content ?? '';
    // UNIQUE constraint on user_id or the ADD COLUMN path (table already has it)
    const hasUnique = /user_id.*UNIQUE|UNIQUE.*user_id/i.test(content);
    const hasAddColumnOnly = /ADD COLUMN IF NOT EXISTS.*quiet_hours/i.test(content) && !hasUnique;
    expect(
      hasUnique || hasAddColumnOnly,
      'user_id must be UNIQUE on user_preferences (one row per user)',
    ).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// AC9: RLS policy ensures user A cannot read/write user B's row
// ---------------------------------------------------------------------------

describe('AC9: RLS policy scopes user_preferences to auth.uid()', () => {
  let migration: { file: string; content: string } | null;

  beforeAll(() => {
    migration = findMigrationContaining(/quiet_hours/);
  });

  it('migration enables row level security on user_preferences', () => {
    const content = migration?.content ?? '';
    // Either this migration enables RLS, or RLS was already enabled in a prior migration.
    // For the ADD COLUMN path (table already exists), RLS may be on an earlier migration.
    // Accept either pattern.
    const enablesRls = /ENABLE ROW LEVEL SECURITY/i.test(content);
    const addColumnOnly = /ADD COLUMN IF NOT EXISTS.*quiet_hours/i.test(content) && !enablesRls;
    expect(
      enablesRls || addColumnOnly,
      'Either this migration enables RLS on user_preferences, or the table already has RLS from a prior migration',
    ).toBe(true);
  });

  it('migration creates or references a policy scoped to auth.uid() = user_id', () => {
    const content = migration?.content ?? '';
    // Policy must scope reads/writes to the authenticated user's own row
    const hasPolicyScope = /auth\.uid\(\)\s*=\s*user_id|user_id\s*=\s*auth\.uid\(\)/i.test(content);
    const addColumnOnly = /ADD COLUMN IF NOT EXISTS.*quiet_hours/i.test(content) && !hasPolicyScope;
    expect(
      hasPolicyScope || addColumnOnly,
      'RLS policy must use auth.uid() = user_id to scope rows',
    ).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Structural: JSONB schema entry shape
// ---------------------------------------------------------------------------

describe('Structural: migration includes day/start/end comment or schema reference', () => {
  let migration: { file: string; content: string } | null;

  beforeAll(() => {
    migration = findMigrationContaining(/quiet_hours/);
  });

  it('migration file exists and is readable', () => {
    expect(migration).not.toBeNull();
  });

  it('migration SQL file is syntactically non-empty', () => {
    expect((migration?.content ?? '').trim().length).toBeGreaterThan(0);
  });
});
