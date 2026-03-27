/**
 * Feature: DB trigger stamps features.promoted_version from production agent_versions inserts.
 *
 * Acceptance criteria covered:
 * 1. `zazig promote` still registers a production row in agent_versions.
 * 2. Trigger updates complete + unpromoted features to NEW.version.
 * 3. Already-promoted features remain untouched (promoted_version IS NULL guard).
 * 4. Direct Supabase bulk-update block is removed from promote.ts.
 * 5. Promote flow still proceeds to release + final success output.
 *
 * This test is intentionally written to fail until the feature is implemented.
 */

import { beforeAll, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');
const ZAZIG_COMPANY_ID = '00000000-0000-0000-0000-000000000001';

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

function findPromotedVersionTriggerMigration(): { file: string; content: string } | null {
  for (const file of listMigrationFiles()) {
    const relPath = `supabase/migrations/${file}`;
    const content = readRepoFile(relPath);
    if (!content) continue;

    const looksLikeTarget =
      /agent_versions/i.test(content) &&
      /promoted_version/i.test(content) &&
      /create\s+trigger/i.test(content);

    if (looksLikeTarget) {
      return { file: relPath, content };
    }
  }
  return null;
}

describe('DB trigger migration: stamp promoted_version on production version insert', () => {
  let migration: { file: string; content: string } | null = null;

  beforeAll(() => {
    migration = findPromotedVersionTriggerMigration();
  });

  function requireMigrationContent(): string {
    expect(
      migration,
      'No migration found for the agent_versions -> features promoted_version trigger.',
    ).not.toBeNull();
    return migration!.content;
  }

  it('creates a migration containing an AFTER INSERT trigger on agent_versions', () => {
    const migrationContent = requireMigrationContent();
    expect(migrationContent).toMatch(
      /create\s+trigger[\s\S]*after\s+insert[\s\S]*on\s+(public\.)?agent_versions/i,
    );
  });

  it("only runs the update path when NEW.env = 'production'", () => {
    const migrationContent = requireMigrationContent();
    expect(migrationContent).toMatch(/new\.env\s*=\s*'production'/i);
  });

  it('updates features.promoted_version to NEW.version', () => {
    const migrationContent = requireMigrationContent();
    expect(migrationContent).toMatch(
      /update\s+features[\s\S]*set[\s\S]*promoted_version\s*=\s*new\.version/i,
    );
  });

  it("limits updates to complete features with promoted_version IS NULL (idempotent + untouched already-promoted)", () => {
    const migrationContent = requireMigrationContent();
    expect(migrationContent).toMatch(/where[\s\S]*status\s*=\s*'complete'/i);
    expect(migrationContent).toMatch(/promoted_version\s+is\s+null/i);
  });

  it('hardcodes the zazig company UUID in the trigger WHERE clause', () => {
    const migrationContent = requireMigrationContent();
    expect(migrationContent).toMatch(
      new RegExp(`company_id\\s*=\\s*'${ZAZIG_COMPANY_ID}'`, 'i'),
    );
  });
});

describe('CLI promote cleanup: remove direct features update and keep promote flow', () => {
  const FILE = 'packages/cli/src/commands/promote.ts';
  let content: string | null = null;

  beforeAll(() => {
    content = readRepoFile(FILE);
  });

  it('still registers production version in agent_versions during promote', () => {
    expect(content, `${FILE} not found`).not.toBeNull();
    expect(content).toMatch(
      /registerAgentVersion\(\s*supabase\s*,\s*['"]production['"]\s*,\s*newVersion\s*,\s*commitSha\s*\)/,
    );
  });

  it('removes the direct Supabase bulk update that stamps features.promoted_version', () => {
    expect(content).not.toMatch(
      /\.from\(\s*['"]features['"]\s*\)[\s\S]*?\.update\(\s*\{\s*promoted_version\s*:\s*newVersion\s*\}/,
    );
  });

  it('removes promoted_version bulk-update warning/error log lines tied to that direct call', () => {
    expect(content).not.toMatch(/Warning:\s*could not update promoted_version on features/i);
    expect(content).not.toMatch(/Failed to update promoted features/i);
  });

  it('continues to release creation and final success output after version registration', () => {
    const registerIdx = content?.indexOf('registerAgentVersion') ?? -1;
    const releaseIdx = content?.indexOf('Creating GitHub Release') ?? -1;
    const finalSuccessIdx = content?.indexOf('Promoted to production v') ?? -1;

    expect(registerIdx).toBeGreaterThan(-1);
    expect(releaseIdx).toBeGreaterThan(registerIdx);
    expect(finalSuccessIdx).toBeGreaterThan(releaseIdx);
  });
});
