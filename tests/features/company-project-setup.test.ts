/**
 * Feature: Company project setup
 *
 * Tests that a default company project is set up for zazig-dev:
 * - A GitHub repo exists for the company project (with folder structure)
 * - A project record is inserted in the projects table
 * - companies.company_project_id is set for zazig-dev (00000000-0000-0000-0000-000000000001)
 * - The project can be queried via companies.company_project_id
 *
 * These tests do static analysis of SQL migration files.
 * Written to FAIL until the feature is implemented.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');
const MIGRATIONS_DIR = path.join(REPO_ROOT, 'supabase', 'migrations');

const ZAZIG_DEV_COMPANY_ID = '00000000-0000-0000-0000-000000000001';

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

function combinedMigrationsMatching(pattern: RegExp): string {
  const migrations = readAllMigrations();
  return migrations
    .filter(m => pattern.test(m.content))
    .map(m => m.content)
    .join('\n');
}

// ---------------------------------------------------------------------------
// AC1: A project record exists in the projects table for zazig-dev
// ---------------------------------------------------------------------------

describe('AC1: A project record is inserted into the projects table for zazig-dev', () => {
  let migration: { file: string; content: string } | null;

  beforeAll(() => {
    // Look for a migration that INSERTs into projects for zazig-dev company
    const all = readAllMigrations();
    migration = all.find(m =>
      /INSERT\s+INTO\s+(?:public\.)?projects/i.test(m.content) &&
      new RegExp(ZAZIG_DEV_COMPANY_ID, 'i').test(m.content)
    ) ?? null;
  });

  it('a migration inserts a project record for zazig-dev', () => {
    expect(
      migration,
      `No migration found that INSERTs into projects for company_id ${ZAZIG_DEV_COMPANY_ID}. ` +
      'Add a migration that creates the company project record.',
    ).not.toBeNull();
  });

  it('the project record has status active', () => {
    const content = migration?.content ?? '';
    expect(content).toMatch(/active/i);
  });

  it('the project record has a repo_url pointing to a GitHub repo', () => {
    const content = migration?.content ?? '';
    expect(content).toMatch(/https:\/\/github\.com\//i);
  });

  it("the project name is 'company' or 'zazig-company'", () => {
    const content = migration?.content ?? '';
    expect(content).toMatch(/zazig-company|'company'/i);
  });
});

// ---------------------------------------------------------------------------
// AC2: companies.company_project_id is set for zazig-dev
// ---------------------------------------------------------------------------

describe('AC2: companies.company_project_id is set for zazig-dev', () => {
  let migration: { file: string; content: string } | null;

  beforeAll(() => {
    // Look for a migration that UPDATEs companies setting company_project_id for zazig-dev
    const all = readAllMigrations();
    migration = all.find(m =>
      /UPDATE\s+(?:public\.)?companies/i.test(m.content) &&
      /company_project_id/i.test(m.content) &&
      new RegExp(ZAZIG_DEV_COMPANY_ID, 'i').test(m.content)
    ) ?? null;
  });

  it('a migration updates zazig-dev company to set company_project_id', () => {
    expect(
      migration,
      `No migration found that sets company_project_id on companies WHERE id = ${ZAZIG_DEV_COMPANY_ID}. ` +
      'Add a migration that sets company_project_id on the zazig-dev company record.',
    ).not.toBeNull();
  });

  it('the update targets zazig-dev by its company ID', () => {
    const content = migration?.content ?? '';
    expect(content).toMatch(new RegExp(ZAZIG_DEV_COMPANY_ID, 'i'));
  });

  it('the update sets company_project_id to a non-null value (a subquery or UUID)', () => {
    const content = migration?.content ?? '';
    // Should reference either a subquery to get the project id or a literal UUID
    expect(content).toMatch(
      /company_project_id\s*=\s*\(SELECT|company_project_id\s*=\s*'[0-9a-f-]{36}'/i,
    );
  });
});

// ---------------------------------------------------------------------------
// AC3: The project can be queried via companies.company_project_id
// ---------------------------------------------------------------------------

describe('AC3: The company_project_id can be used to look up the project repo_url', () => {
  it('migration inserts a project AND updates company_project_id in the same or adjacent migrations', () => {
    const combined = combinedMigrationsMatching(
      /INSERT\s+INTO\s+(?:public\.)?projects|UPDATE\s+(?:public\.)?companies.*company_project_id/i,
    );
    // Both the INSERT into projects and the UPDATE to companies must be present
    expect(combined).toMatch(/INSERT\s+INTO\s+(?:public\.)?projects/i);
    expect(combined).toMatch(/UPDATE\s+(?:public\.)?companies/i);
    expect(combined).toMatch(/company_project_id/i);
  });

  it('the project INSERT uses a SELECT subquery or ON CONFLICT to be idempotent', () => {
    const combined = combinedMigrationsMatching(
      /INSERT\s+INTO\s+(?:public\.)?projects/i,
    );
    // Good migration practice: ON CONFLICT DO NOTHING or DO UPDATE to avoid duplicates
    expect(combined).toMatch(/ON CONFLICT|DO NOTHING|DO UPDATE|IF NOT EXISTS/i);
  });
});

// ---------------------------------------------------------------------------
// AC4: GitHub repo URL references zazig-team org
// ---------------------------------------------------------------------------

describe('AC4: The project repo_url points to the zazig-team GitHub org', () => {
  it('migration contains a GitHub URL under the zazig-team org', () => {
    const combined = combinedMigrationsMatching(
      /INSERT\s+INTO\s+(?:public\.)?projects/i,
    );
    // The repo should be under zazig-team org
    expect(
      combined,
      'Expected a project record with a zazig-team GitHub URL (e.g. https://github.com/zazig-team/company).',
    ).toMatch(/https:\/\/github\.com\/zazig-team\//i);
  });
});

// ---------------------------------------------------------------------------
// AC5: Repo has basic folder structure (sales/, marketing/, research/, docs/)
// ---------------------------------------------------------------------------

describe('AC5: Repo folder structure is documented or initialized in the setup migration', () => {
  it('migration or setup script references the expected folder structure directories', () => {
    // The folder structure (sales/, marketing/, research/, docs/) should be referenced
    // in a migration comment, seed script, or setup file
    const combined = combinedMigrationsMatching(/zazig-team.*company|company.*zazig-team|company_project/i);
    const hasStructureReference = (
      /sales/i.test(combined) &&
      /marketing/i.test(combined) &&
      /research/i.test(combined) &&
      /docs/i.test(combined)
    );

    // Also check for a setup script in the repo
    const setupScriptPaths = [
      path.join(REPO_ROOT, 'scripts', 'setup-company-repo.sh'),
      path.join(REPO_ROOT, 'scripts', 'setup-company-project.sh'),
      path.join(REPO_ROOT, 'scripts', 'init-company-repo.sh'),
    ];
    const hasSetupScript = setupScriptPaths.some(p => {
      try {
        const content = fs.readFileSync(p, 'utf-8');
        return /sales/i.test(content) && /marketing/i.test(content) && /research/i.test(content);
      } catch {
        return false;
      }
    });

    expect(
      hasStructureReference || hasSetupScript,
      'Expected either a migration referencing the folder structure (sales/, marketing/, research/, docs/) ' +
      'or a setup script in scripts/ that initializes the repo structure.',
    ).toBe(true);
  });
});
