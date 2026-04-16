/**
 * Feature: cross-tenant job failure -> bug idea ingestion migration.
 *
 * This suite statically inspects migration SQL only; it does not run a live DB.
 */

import { beforeAll, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');

const MIGRATION_FILE = '235_cross_tenant_job_failure_to_idea.sql';
const MIGRATION_PATH = `supabase/migrations/${MIGRATION_FILE}`;
const ZAZIG_DEV_COMPANY_ID = '00000000-0000-0000-0000-000000000001';

function readRepoFile(relPath: string): string | null {
  const fullPath = path.join(REPO_ROOT, relPath);
  try {
    return fs.readFileSync(fullPath, 'utf-8');
  } catch {
    return null;
  }
}

function listMigrationFiles(): string[] {
  const migrationsDir = path.join(REPO_ROOT, 'supabase/migrations');
  try {
    return fs
      .readdirSync(migrationsDir)
      .filter((file) => file.endsWith('.sql'))
      .sort();
  } catch {
    return [];
  }
}

describe('Cross-tenant job failure -> idea migration SQL', () => {
  let migrationFiles: string[] = [];
  let migrationSql: string | null = null;

  beforeAll(() => {
    migrationFiles = listMigrationFiles();
    migrationSql = readRepoFile(MIGRATION_PATH);
  });

  function requireMigrationSql(): string {
    expect(
      migrationFiles,
      `Expected migration file ${MIGRATION_FILE} to exist in supabase/migrations.`,
    ).toContain(MIGRATION_FILE);
    expect(migrationSql, `Expected to read ${MIGRATION_PATH}.`).not.toBeNull();
    return migrationSql!;
  }

  it('1) basic ingest: inserts monitoring bug idea in public.ideas with source_ref = NEW.id::text', () => {
    const sql = requireMigrationSql();
    expect(sql).toMatch(/insert\s+into\s+(public\.)?ideas/i);
    expect(sql).toMatch(
      /insert\s+into\s+(public\.)?ideas[\s\S]*\([\s\S]*company_id[\s\S]*item_type[\s\S]*source[\s\S]*originator[\s\S]*source_ref[\s\S]*\)/i,
    );
    expect(sql).toContain(ZAZIG_DEV_COMPANY_ID);
    expect(sql).toMatch(/item_type[\s\S]*'bug'/i);
    expect(sql).toMatch(/source[\s\S]*'monitoring'/i);
    expect(sql).toMatch(/originator[\s\S]*'job-failure-monitor'/i);
    expect(sql).toMatch(/source_ref[\s\S]*new\.id::text/i);
  });

  it('2) idempotency: uses ON CONFLICT DO NOTHING', () => {
    const sql = requireMigrationSql();
    expect(sql).toMatch(/on\s+conflict\s+do\s+nothing/i);
  });

  it("3) transition-only firing: requires NEW.status = 'failed' and OLD.status IS DISTINCT FROM 'failed'", () => {
    const sql = requireMigrationSql();
    expect(sql).toMatch(/new\.status\s*=\s*'failed'/i);
    expect(sql).toMatch(/old\.status\s+is\s+distinct\s+from\s+'failed'/i);
  });

  it("4) self-observation: insert hardcodes zazig-dev company_id rather than NEW.company_id", () => {
    const sql = requireMigrationSql();
    expect(sql).toMatch(new RegExp(`'${ZAZIG_DEV_COMPANY_ID}'`));
    expect(sql).not.toMatch(
      /insert\s+into\s+(public\.)?ideas[\s\S]*values[\s\S]*new\.company_id/i,
    );
  });

  it('5) ingestion failure isolation: has BEGIN...EXCEPTION WHEN OTHERS and RAISE WARNING', () => {
    const sql = requireMigrationSql();
    expect(sql).toMatch(/begin[\s\S]*exception\s+when\s+others/i);
    expect(sql).toMatch(/raise\s+warning/i);
    expect(sql).not.toMatch(/raise\s+exception/i);
  });

  it("6) no-feature/null safety: COALESCE guards include '<unknown>' and '<none>' fallbacks", () => {
    const sql = requireMigrationSql();
    expect(sql).toMatch(/coalesce\s*\(\s*v_feature_title\s*,\s*'<unknown>'\s*\)/i);
    expect(sql).toMatch(/coalesce\s*\(\s*v_company_name\s*,\s*'<unknown>'\s*\)/i);
    expect(sql).toMatch(/coalesce\s*\(\s*v_commit_sha\s*,\s*'<none>'\s*\)/i);
    expect(sql).toMatch(/coalesce\s*\([^)]*'<unknown>'\s*\)/i);
    expect(sql).toMatch(/coalesce\s*\([^)]*'<none>'\s*\)/i);
  });

  it("7) only 'failed' triggers: includes status != 'failed' guard branch that returns early", () => {
    const sql = requireMigrationSql();
    expect(sql).toMatch(/new\.status\s*<>\s*'failed'/i);
    expect(sql).toMatch(/if[\s\S]*new\.status\s*<>\s*'failed'[\s\S]*return\s+new/i);
  });

  it("8) dedup index: creates ideas_job_failure_source_ref_uniq with monitoring + job-failure-monitor WHERE clause", () => {
    const sql = requireMigrationSql();
    expect(sql).toMatch(
      /create\s+unique\s+index\s+if\s+not\s+exists\s+ideas_job_failure_source_ref_uniq/i,
    );
    expect(sql).toMatch(
      /where[\s\S]*(source\s*=\s*'monitoring'[\s\S]*originator\s*=\s*'job-failure-monitor'|originator\s*=\s*'job-failure-monitor'[\s\S]*source\s*=\s*'monitoring')/i,
    );
  });
});
