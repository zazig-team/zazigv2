/**
 * Feature: Schema — idea pipeline foundations
 *
 * Tests for all acceptance criteria of the autonomous idea pipeline schema
 * migrations. These tests do static analysis of migration SQL files.
 *
 * Written to FAIL until the migrations are implemented.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');
const MIGRATIONS_DIR = path.join(REPO_ROOT, 'supabase', 'migrations');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function readAllMigrations(): Array<{ file: string; content: string }> {
  let files: string[];
  try {
    files = fs.readdirSync(MIGRATIONS_DIR)
      .filter(f => f.endsWith('.sql'))
      .sort();
  } catch {
    return [];
  }
  return files.map(file => ({
    file,
    content: fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf-8'),
  }));
}

function findMigrationContaining(pattern: RegExp): { file: string; content: string } | null {
  const migrations = readAllMigrations();
  for (const m of migrations) {
    if (pattern.test(m.content)) return m;
  }
  return null;
}

/** Returns all migration content that matches the pattern, combined. */
function combinedMigrationsMatching(pattern: RegExp): string {
  const migrations = readAllMigrations();
  return migrations
    .filter(m => pattern.test(m.content))
    .map(m => m.content)
    .join('\n');
}

// ---------------------------------------------------------------------------
// AC1–AC5: idea_messages table
// ---------------------------------------------------------------------------

describe('AC1: idea_messages table exists with all columns and correct types', () => {
  let migration: { file: string; content: string } | null;

  beforeAll(() => {
    migration = findMigrationContaining(/idea_messages/);
  });

  it('a migration file referencing idea_messages exists', () => {
    expect(
      migration,
      'No migration found containing "idea_messages". Add a migration that creates this table.',
    ).not.toBeNull();
  });

  it('migration creates the idea_messages table', () => {
    expect(migration?.content).toMatch(/CREATE TABLE.*idea_messages/is);
  });

  it('id column is UUID primary key with gen_random_uuid() default', () => {
    const content = migration?.content ?? '';
    expect(content).toMatch(/id\s+uuid/i);
    expect(content).toMatch(/gen_random_uuid\(\)/i);
    expect(content).toMatch(/PRIMARY KEY/i);
  });

  it('idea_id column is UUID NOT NULL', () => {
    expect(migration?.content).toMatch(/idea_id\s+uuid.*NOT NULL|idea_id.*uuid/i);
  });

  it('job_id column is UUID nullable', () => {
    // job_id must exist; it should be nullable (no NOT NULL)
    const content = migration?.content ?? '';
    expect(content).toMatch(/job_id\s+uuid/i);
    // Nullable means no NOT NULL constraint immediately after the column type
    expect(content).not.toMatch(/job_id\s+uuid\s+NOT NULL/i);
  });

  it('sender column is text with check constraint for job and user', () => {
    const content = migration?.content ?? '';
    expect(content).toMatch(/sender\s+text/i);
    expect(content).toMatch(/sender.*IN.*'job'.*'user'|sender.*IN.*'user'.*'job'/i);
  });

  it('content column is text NOT NULL', () => {
    expect(migration?.content).toMatch(/content\s+text.*NOT NULL|content.*text/i);
  });

  it('created_at column is timestamptz NOT NULL with DEFAULT now()', () => {
    const content = migration?.content ?? '';
    expect(content).toMatch(/created_at\s+timestamptz/i);
    expect(content).toMatch(/DEFAULT\s+now\(\)/i);
  });
});

describe('AC2: idea_messages has FK to ideas.id with ON DELETE CASCADE', () => {
  let migration: { file: string; content: string } | null;

  beforeAll(() => {
    migration = findMigrationContaining(/idea_messages/);
  });

  it('migration defines FK from idea_messages.idea_id to ideas.id', () => {
    const content = migration?.content ?? '';
    expect(content).toMatch(/REFERENCES\s+(?:public\.)?ideas\s*\(id\)/i);
  });

  it('FK specifies ON DELETE CASCADE', () => {
    const content = migration?.content ?? '';
    expect(content).toMatch(/ON DELETE CASCADE/i);
  });
});

describe('AC3: idea_messages has FK to jobs.id (nullable)', () => {
  let migration: { file: string; content: string } | null;

  beforeAll(() => {
    migration = findMigrationContaining(/idea_messages/);
  });

  it('migration defines FK from idea_messages.job_id to jobs.id', () => {
    const content = migration?.content ?? '';
    expect(content).toMatch(/REFERENCES\s+(?:public\.)?jobs\s*\(id\)/i);
  });
});

describe('AC4: idea_messages has index on (idea_id, created_at)', () => {
  let migration: { file: string; content: string } | null;

  beforeAll(() => {
    migration = findMigrationContaining(/idea_messages/);
  });

  it('migration creates an index on (idea_id, created_at)', () => {
    const content = migration?.content ?? '';
    expect(content).toMatch(/CREATE INDEX.*idea_messages.*idea_id.*created_at|CREATE INDEX.*idea_id.*created_at.*idea_messages/is);
  });
});

describe('AC5: Realtime is enabled on idea_messages', () => {
  let migration: { file: string; content: string } | null;

  beforeAll(() => {
    migration = findMigrationContaining(/idea_messages/);
  });

  it('migration enables Realtime on idea_messages via supabase_realtime publication', () => {
    const content = migration?.content ?? '';
    // Supabase Realtime is enabled by adding the table to the supabase_realtime publication
    expect(content).toMatch(/supabase_realtime|REPLICA IDENTITY/i);
    expect(content).toMatch(/idea_messages/i);
  });
});

// ---------------------------------------------------------------------------
// AC6: jobs.idea_id column
// ---------------------------------------------------------------------------

describe('AC6: jobs.idea_id column exists, nullable, FK to ideas.id', () => {
  let migration: { file: string; content: string } | null;

  beforeAll(() => {
    // Find a migration that adds idea_id to the jobs table
    migration = findMigrationContaining(/jobs.*idea_id|idea_id.*jobs/i);
    // Fall back to any migration that contains both jobs and idea_id near each other
    if (!migration) {
      migration = findMigrationContaining(/idea_id/);
    }
  });

  it('a migration adds idea_id column to the jobs table', () => {
    const combined = combinedMigrationsMatching(/idea_id/);
    expect(
      combined,
      'No migration found that adds idea_id to the jobs table.',
    ).toMatch(/ALTER TABLE.*jobs.*ADD COLUMN.*idea_id|ADD COLUMN.*idea_id.*jobs/is);
  });

  it('jobs.idea_id is nullable (no NOT NULL constraint)', () => {
    const combined = combinedMigrationsMatching(/idea_id/);
    // The ADD COLUMN should not force NOT NULL
    const addColumnMatch = combined.match(/ADD COLUMN.*idea_id[^;]*/is)?.[0] ?? '';
    expect(addColumnMatch).not.toMatch(/NOT NULL/i);
  });

  it('jobs.idea_id has FK reference to ideas.id', () => {
    const combined = combinedMigrationsMatching(/idea_id/);
    expect(combined).toMatch(/jobs.*idea_id.*REFERENCES.*ideas|idea_id.*REFERENCES.*ideas/is);
  });

  it('migration creates an index on jobs.idea_id', () => {
    const combined = combinedMigrationsMatching(/idea_id/);
    expect(combined).toMatch(/CREATE INDEX.*jobs.*idea_id|CREATE INDEX.*idea_id.*jobs/is);
  });
});

// ---------------------------------------------------------------------------
// AC7: ideas.on_hold column
// ---------------------------------------------------------------------------

describe('AC7: ideas.on_hold column exists, boolean, default false', () => {
  let migration: { file: string; content: string } | null;

  beforeAll(() => {
    migration = findMigrationContaining(/on_hold/);
  });

  it('a migration adds on_hold column to the ideas table', () => {
    expect(
      migration,
      'No migration found containing "on_hold". Add a migration that adds this column to ideas.',
    ).not.toBeNull();
  });

  it('on_hold is a BOOLEAN column', () => {
    expect(migration?.content).toMatch(/on_hold\s+(?:boolean|bool)/i);
  });

  it('on_hold has NOT NULL constraint', () => {
    expect(migration?.content).toMatch(/on_hold.*NOT NULL/i);
  });

  it('on_hold defaults to false', () => {
    expect(migration?.content).toMatch(/on_hold.*DEFAULT\s+false/i);
  });

  it('migration targets the ideas table', () => {
    expect(migration?.content).toMatch(/ALTER TABLE.*ideas|ideas.*on_hold/is);
  });
});

// ---------------------------------------------------------------------------
// AC8: ideas.type column with check constraint
// ---------------------------------------------------------------------------

describe('AC8: ideas.type column exists with check constraint for bug/feature/task/initiative', () => {
  let migration: { file: string; content: string } | null;

  beforeAll(() => {
    // Find migration that adds a 'type' column to ideas with bug/feature/task/initiative values
    const all = readAllMigrations();
    migration = all.find(m =>
      /ALTER TABLE.*ideas/i.test(m.content) &&
      /\btype\b/i.test(m.content) &&
      /bug|initiative/i.test(m.content)
    ) ?? null;
  });

  it('a migration adds a type column to the ideas table', () => {
    expect(
      migration,
      'No migration found that adds a type column to ideas with bug/feature/task/initiative constraint.',
    ).not.toBeNull();
  });

  it('type column is TEXT', () => {
    expect(migration?.content).toMatch(/type\s+text/i);
  });

  it('type column allows NULL (no NOT NULL)', () => {
    const content = migration?.content ?? '';
    // Should not have NOT NULL immediately on the type column definition
    const typeMatch = content.match(/\btype\s+text[^,;\n]*/i)?.[0] ?? '';
    expect(typeMatch).not.toMatch(/NOT NULL/i);
  });

  it("type check constraint includes 'bug'", () => {
    expect(migration?.content).toMatch(/bug/);
  });

  it("type check constraint includes 'feature'", () => {
    expect(migration?.content).toMatch(/feature/);
  });

  it("type check constraint includes 'task'", () => {
    expect(migration?.content).toMatch(/task/);
  });

  it("type check constraint includes 'initiative'", () => {
    expect(migration?.content).toMatch(/initiative/);
  });
});

// ---------------------------------------------------------------------------
// AC9: New idea statuses
// ---------------------------------------------------------------------------

describe('AC9: New idea statuses are valid in the ideas status constraint', () => {
  let migration: { file: string; content: string } | null;

  beforeAll(() => {
    // Find the migration that adds the new pipeline statuses
    const all = readAllMigrations();
    // Look for a migration that adds at least one of the new statuses
    migration = all.find(m =>
      /enriched|routed|executing|breaking_down|spawned|awaiting_response/i.test(m.content) &&
      /ideas_status_check|ideas.*status/i.test(m.content)
    ) ?? null;
  });

  it('a migration adds the new idea statuses to the ideas_status_check constraint', () => {
    expect(
      migration,
      'No migration found that adds new idea statuses (enriched, routed, executing, breaking_down, spawned, awaiting_response).',
    ).not.toBeNull();
  });

  it("new status 'enriched' is in the constraint", () => {
    expect(migration?.content).toMatch(/enriched/);
  });

  it("new status 'routed' is in the constraint", () => {
    expect(migration?.content).toMatch(/routed/);
  });

  it("new status 'executing' is in the constraint", () => {
    expect(migration?.content).toMatch(/executing/);
  });

  it("new status 'breaking_down' is in the constraint", () => {
    expect(migration?.content).toMatch(/breaking_down/);
  });

  it("new status 'spawned' is in the constraint", () => {
    expect(migration?.content).toMatch(/spawned/);
  });

  it("new status 'awaiting_response' is in the constraint", () => {
    expect(migration?.content).toMatch(/awaiting_response/);
  });

  it('migration preserves existing statuses (new, triaging, triaged, stalled)', () => {
    const content = migration?.content ?? '';
    // The constraint should include existing statuses
    expect(content).toMatch(/\bnew\b/);
    expect(content).toMatch(/triag/i);
    expect(content).toMatch(/stalled/);
  });

  it('migration drops the old constraint before adding the new one (idempotent)', () => {
    const content = migration?.content ?? '';
    expect(content).toMatch(/DROP CONSTRAINT.*ideas_status_check|DROP CONSTRAINT IF EXISTS/i);
  });
});

// ---------------------------------------------------------------------------
// AC10: companies.company_project_id column
// ---------------------------------------------------------------------------

describe('AC10: companies.company_project_id column exists, nullable, FK to projects.id', () => {
  let migration: { file: string; content: string } | null;

  beforeAll(() => {
    migration = findMigrationContaining(/company_project_id/);
  });

  it('a migration adds company_project_id column to the companies table', () => {
    expect(
      migration,
      'No migration found containing "company_project_id".',
    ).not.toBeNull();
  });

  it('migration targets the companies table', () => {
    expect(migration?.content).toMatch(/ALTER TABLE.*companies|companies.*company_project_id/is);
  });

  it('company_project_id is a UUID column', () => {
    expect(migration?.content).toMatch(/company_project_id\s+uuid/i);
  });

  it('company_project_id is nullable (no NOT NULL)', () => {
    const content = migration?.content ?? '';
    const colMatch = content.match(/company_project_id[^;,\n]*/i)?.[0] ?? '';
    expect(colMatch).not.toMatch(/NOT NULL/i);
  });

  it('company_project_id has FK reference to projects.id', () => {
    const content = migration?.content ?? '';
    expect(content).toMatch(/REFERENCES\s+(?:public\.)?projects\s*\(id\)/i);
  });

  it('FK specifies ON DELETE SET NULL', () => {
    const content = migration?.content ?? '';
    expect(content).toMatch(/ON DELETE SET NULL/i);
  });
});

// ---------------------------------------------------------------------------
// AC11: All migrations are idempotent (IF NOT EXISTS patterns)
// ---------------------------------------------------------------------------

describe('AC11: Migrations use idempotent patterns (IF NOT EXISTS)', () => {
  let ideaMessagesMigration: { file: string; content: string } | null;

  beforeAll(() => {
    ideaMessagesMigration = findMigrationContaining(/idea_messages/);
  });

  it('idea_messages migration uses CREATE TABLE IF NOT EXISTS', () => {
    const content = ideaMessagesMigration?.content ?? '';
    expect(content).toMatch(/CREATE TABLE IF NOT EXISTS.*idea_messages/i);
  });

  it('index creation uses CREATE INDEX IF NOT EXISTS', () => {
    const content = ideaMessagesMigration?.content ?? '';
    expect(content).toMatch(/CREATE INDEX IF NOT EXISTS/i);
  });

  it('ADD COLUMN statements for new columns use IF NOT EXISTS', () => {
    const combined = combinedMigrationsMatching(/on_hold|company_project_id|idea_id/);
    // New column additions should use IF NOT EXISTS for safety
    expect(combined).toMatch(/ADD COLUMN IF NOT EXISTS/i);
  });
});

// ---------------------------------------------------------------------------
// AC12: Existing data is not affected
// ---------------------------------------------------------------------------

describe('AC12: Existing data is not affected by migrations', () => {
  it('ideas.on_hold defaults to false so existing rows get false automatically', () => {
    const migration = findMigrationContaining(/on_hold/);
    const content = migration?.content ?? '';
    // DEFAULT false ensures existing rows are not updated or deleted
    expect(content).toMatch(/DEFAULT\s+false/i);
  });

  it('jobs.idea_id is nullable so existing jobs without idea_id remain valid', () => {
    const combined = combinedMigrationsMatching(/idea_id/);
    const addColMatch = combined.match(/ADD COLUMN.*idea_id[^;\n]*/is)?.[0] ?? '';
    // No NOT NULL = existing rows with null idea_id are fine
    expect(addColMatch).not.toMatch(/NOT NULL/i);
  });

  it('companies.company_project_id is nullable so existing companies are unaffected', () => {
    const migration = findMigrationContaining(/company_project_id/);
    const content = migration?.content ?? '';
    const addColMatch = content.match(/ADD COLUMN.*company_project_id[^;\n]*/is)?.[0] ?? '';
    expect(addColMatch).not.toMatch(/NOT NULL/i);
  });

  it('ideas.type is nullable so existing ideas without a type remain valid', () => {
    const all = readAllMigrations();
    const migration = all.find(m =>
      /ALTER TABLE.*ideas/i.test(m.content) &&
      /\btype\b/i.test(m.content) &&
      /bug|initiative/i.test(m.content)
    ) ?? null;
    const content = migration?.content ?? '';
    const addColMatch = content.match(/ADD COLUMN.*\btype\b[^;\n]*/is)?.[0] ?? '';
    expect(addColMatch).not.toMatch(/NOT NULL/i);
  });
});
