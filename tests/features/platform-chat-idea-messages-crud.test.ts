/**
 * Feature: Platform chat system — idea_messages CRUD edge function
 *
 * Tests that the idea_messages edge function exists and supports
 * POST (insert) and GET (list) operations, with correct RLS policy SQL.
 *
 * Written to FAIL until the feature is implemented.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');
const FUNCTIONS_DIR = path.join(REPO_ROOT, 'supabase', 'functions');
const MIGRATIONS_DIR = path.join(REPO_ROOT, 'supabase', 'migrations');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function readFunctionFile(fnName: string, filename = 'index.ts'): string {
  const filePath = path.join(FUNCTIONS_DIR, fnName, filename);
  try {
    return fs.readFileSync(filePath, 'utf-8');
  } catch {
    return '';
  }
}

function ideaMessagesFunctionExists(): boolean {
  return fs.existsSync(path.join(FUNCTIONS_DIR, 'idea-messages'));
}

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
  for (const m of readAllMigrations()) {
    if (pattern.test(m.content)) return m;
  }
  return null;
}

// ---------------------------------------------------------------------------
// AC: idea_messages CRUD edge function exists
// ---------------------------------------------------------------------------

describe('AC: idea_messages CRUD edge function exists', () => {
  it('idea-messages function directory exists', () => {
    expect(
      ideaMessagesFunctionExists(),
      'supabase/functions/idea-messages/ directory not found. Create the edge function.',
    ).toBe(true);
  });

  it('idea-messages/index.ts file exists', () => {
    const content = readFunctionFile('idea-messages');
    expect(
      content,
      'supabase/functions/idea-messages/index.ts is empty or missing.',
    ).not.toBe('');
  });
});

// ---------------------------------------------------------------------------
// AC: POST handler — insert a message
// ---------------------------------------------------------------------------

describe('AC: POST /idea-messages inserts a message', () => {
  let content: string;

  beforeAll(() => {
    content = readFunctionFile('idea-messages');
  });

  it('handles POST method', () => {
    expect(content).toMatch(/POST/i);
  });

  it('inserts into idea_messages table', () => {
    expect(content).toMatch(/idea_messages/);
  });

  it('accepts idea_id parameter', () => {
    expect(content).toMatch(/idea_id/);
  });

  it('accepts sender parameter', () => {
    expect(content).toMatch(/sender/);
  });

  it('accepts content parameter', () => {
    expect(content).toMatch(/content/);
  });

  it('accepts job_id parameter (nullable)', () => {
    expect(content).toMatch(/job_id/);
  });
});

// ---------------------------------------------------------------------------
// AC: GET handler — list messages for an idea
// ---------------------------------------------------------------------------

describe('AC: GET /idea-messages?idea_id=X lists messages ordered by created_at', () => {
  let content: string;

  beforeAll(() => {
    content = readFunctionFile('idea-messages');
  });

  it('handles GET method', () => {
    expect(content).toMatch(/GET/i);
  });

  it('filters by idea_id query param', () => {
    expect(content).toMatch(/idea_id/);
  });

  it('orders results by created_at ascending', () => {
    expect(content).toMatch(/created_at.*asc|order.*created_at/i);
  });
});

// ---------------------------------------------------------------------------
// AC: RLS policies correctly scope read/write access by company
// ---------------------------------------------------------------------------

describe('AC: RLS policies on idea_messages scope access by company', () => {
  let migration: { file: string; content: string } | null;

  beforeAll(() => {
    migration = findMigrationContaining(/idea_messages.*RLS|ENABLE ROW LEVEL SECURITY.*idea_messages|ALTER TABLE.*idea_messages.*ENABLE/i);
    if (!migration) {
      // Also search for RLS policy definitions
      migration = findMigrationContaining(/CREATE POLICY.*idea_messages/i);
    }
  });

  it('a migration enables RLS on idea_messages', () => {
    expect(
      migration,
      'No migration found that enables RLS on idea_messages. Add RLS policies.',
    ).not.toBeNull();
  });

  it('RLS policy allows users to read messages for ideas in their company', () => {
    const combined = readAllMigrations()
      .filter(m => /idea_messages/i.test(m.content))
      .map(m => m.content)
      .join('\n');
    expect(combined).toMatch(/CREATE POLICY.*idea_messages/i);
  });

  it('RLS policy allows jobs to insert messages for ideas they are working on', () => {
    const combined = readAllMigrations()
      .filter(m => /idea_messages/i.test(m.content))
      .map(m => m.content)
      .join('\n');
    // Should have an INSERT policy
    expect(combined).toMatch(/INSERT.*idea_messages|idea_messages.*INSERT/is);
  });

  it('RLS policy allows users to insert messages for ideas in their company', () => {
    const combined = readAllMigrations()
      .filter(m => /idea_messages/i.test(m.content))
      .map(m => m.content)
      .join('\n');
    // Multiple insert policies or a combined one covering users
    expect(combined).toMatch(/company_id|company/i);
  });
});

// ---------------------------------------------------------------------------
// AC: Realtime events fire on idea_messages inserts
// ---------------------------------------------------------------------------

describe('AC: Realtime is enabled on idea_messages table', () => {
  it('a migration adds idea_messages to the supabase_realtime publication', () => {
    const migration = findMigrationContaining(/supabase_realtime.*idea_messages|idea_messages.*supabase_realtime|ALTER PUBLICATION.*idea_messages/i);
    expect(
      migration,
      'No migration found that enables Realtime on idea_messages. Add the table to supabase_realtime publication.',
    ).not.toBeNull();
  });

  it('idea_messages has REPLICA IDENTITY FULL for accurate Realtime payloads', () => {
    const combined = readAllMigrations()
      .filter(m => /idea_messages/i.test(m.content))
      .map(m => m.content)
      .join('\n');
    // REPLICA IDENTITY FULL or DEFAULT is set so Realtime sends full row data
    expect(combined).toMatch(/REPLICA IDENTITY/i);
  });
});
