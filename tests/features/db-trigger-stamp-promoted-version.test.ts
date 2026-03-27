/**
 * Feature: DB trigger: stamp promoted_version on features when production version registered
 *
 * Tests encode acceptance criteria for:
 * 1. Migration creates AFTER INSERT trigger on agent_versions
 * 2. Trigger updates features (status=complete, promoted_version IS NULL) with new version
 * 3. Features already promoted (promoted_version IS NOT NULL) are untouched (idempotent WHERE)
 * 4. Direct Supabase .update() call for promoted_version is removed from promote.ts
 * 5. promote.ts still registers production version in agent_versions (end-to-end path intact)
 *
 * Written to FAIL against the current codebase — passes once feature is built.
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

function getMigrationFiles(): string[] {
  const dir = path.join(REPO_ROOT, 'supabase/migrations');
  try {
    return fs.readdirSync(dir).sort();
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// AC1+AC2: Migration creates AFTER INSERT trigger on agent_versions
// ---------------------------------------------------------------------------

describe('DB trigger migration — stamp promoted_version on features', () => {
  let triggerMigrationContent: string | null = null;
  let triggerMigrationFile: string | null = null;

  beforeAll(() => {
    const files = getMigrationFiles();
    // Find migration that mentions this trigger
    for (const f of files) {
      const c = readRepoFile(`supabase/migrations/${f}`);
      if (
        c &&
        (c.toLowerCase().includes('stamp_promoted_version') ||
          (c.toLowerCase().includes('agent_versions') &&
            c.toLowerCase().includes('trigger') &&
            c.toLowerCase().includes('promoted_version')))
      ) {
        triggerMigrationFile = `supabase/migrations/${f}`;
        triggerMigrationContent = c;
        break;
      }
    }
  });

  it('a migration file exists that creates the promoted_version trigger', () => {
    expect(
      triggerMigrationContent,
      'No migration found that creates a trigger to stamp promoted_version. ' +
        'Create supabase/migrations/<timestamp>_stamp_promoted_version_trigger.sql',
    ).not.toBeNull();
  });

  it('creates a trigger function that targets the features table UPDATE', () => {
    expect(triggerMigrationContent).toMatch(
      /UPDATE\s+features\s+SET\s+promoted_version/i,
    );
  });

  it('trigger fires AFTER INSERT on agent_versions', () => {
    expect(triggerMigrationContent).toMatch(/AFTER\s+INSERT/i);
    expect(triggerMigrationContent).toMatch(/ON\s+agent_versions/i);
  });

  it("trigger only fires when NEW.env = 'production'", () => {
    expect(triggerMigrationContent).toMatch(/NEW\.env\s*=\s*'production'/i);
  });

  it('trigger WHERE clause requires status = complete', () => {
    expect(triggerMigrationContent).toMatch(/status\s*=\s*'complete'/i);
  });

  it('trigger WHERE clause requires promoted_version IS NULL (idempotency)', () => {
    expect(triggerMigrationContent).toMatch(/promoted_version\s+IS\s+NULL/i);
  });

  it('trigger sets promoted_version to NEW.version', () => {
    expect(triggerMigrationContent).toMatch(/promoted_version\s*=\s*NEW\.version/i);
  });

  it('trigger hardcodes the zazig company UUID in the WHERE clause', () => {
    // agent_versions has no company_id — must restrict to the known zazig company UUID
    expect(triggerMigrationContent).toMatch(
      /00000000-0000-0000-0000-000000000001/,
    );
  });

  it('trigger is created with FOR EACH ROW', () => {
    expect(triggerMigrationContent).toMatch(/FOR\s+EACH\s+ROW/i);
  });
});

// ---------------------------------------------------------------------------
// AC3: Already-promoted features are untouched (WHERE clause is idempotent)
// ---------------------------------------------------------------------------

describe('Trigger idempotency — already-promoted features untouched', () => {
  let triggerContent: string | null = null;

  beforeAll(() => {
    const files = getMigrationFiles();
    for (const f of files) {
      const c = readRepoFile(`supabase/migrations/${f}`);
      if (
        c &&
        c.toLowerCase().includes('agent_versions') &&
        c.toLowerCase().includes('trigger') &&
        c.toLowerCase().includes('promoted_version')
      ) {
        triggerContent = c;
        break;
      }
    }
  });

  it('WHERE clause includes promoted_version IS NULL so already-promoted rows are skipped', () => {
    expect(triggerContent).toMatch(/promoted_version\s+IS\s+NULL/i);
  });

  it('does NOT use UPDATE without a promoted_version IS NULL guard', () => {
    // The UPDATE must be constrained — it cannot update all complete features unconditionally
    const updateMatch = triggerContent?.match(
      /UPDATE\s+features\s+SET\s+promoted_version[\s\S]*?WHERE([\s\S]*?)(END|;|\$\$)/i,
    );
    if (updateMatch) {
      expect(updateMatch[1]).toMatch(/promoted_version\s+IS\s+NULL/i);
    } else {
      // If we can't parse it cleanly, just verify the IS NULL guard exists somewhere
      expect(triggerContent).toMatch(/promoted_version\s+IS\s+NULL/i);
    }
  });
});

// ---------------------------------------------------------------------------
// AC4: Direct Supabase .update() block removed from promote.ts
// ---------------------------------------------------------------------------

describe('promote.ts — direct bulk promoted_version update removed', () => {
  const FILE = 'packages/cli/src/commands/promote.ts';
  let content: string | null;

  beforeAll(() => {
    content = readRepoFile(FILE);
  });

  it('promote.ts exists', () => {
    expect(content, `${FILE} not found`).not.toBeNull();
  });

  it('AC4: does NOT contain a direct .update() on features for promoted_version', () => {
    // The bulk update block that sets promoted_version via Supabase client must be removed
    // Pattern: .from("features").update({ promoted_version: ... })
    expect(content).not.toMatch(
      /\.from\(['"]features['"]\)[\s\S]{0,200}\.update\(\s*\{[\s\S]{0,100}promoted_version/i,
    );
  });

  it('AC4: does NOT contain the "Mark complete, unpromoted features as promoted" comment block', () => {
    expect(content).not.toMatch(
      /Mark complete.*unpromoted features as promoted|mark complete.*features.*promoted/i,
    );
  });

  it('AC4: does NOT contain the SQL equivalent comment for the removed block', () => {
    // The removed block contained a comment: "SQL equivalent: UPDATE features SET promoted_version..."
    expect(content).not.toMatch(
      /SQL equivalent.*UPDATE features SET promoted_version/i,
    );
  });
});

// ---------------------------------------------------------------------------
// AC5: promote.ts still inserts into agent_versions (end-to-end path intact)
// ---------------------------------------------------------------------------

describe('promote.ts — end-to-end production version registration intact', () => {
  const FILE = 'packages/cli/src/commands/promote.ts';
  let content: string | null;

  beforeAll(() => {
    content = readRepoFile(FILE);
  });

  it('promote.ts still calls registerAgentVersion for production env', () => {
    expect(content).toMatch(/registerAgentVersion/);
    expect(content).toMatch(/production/);
  });

  it('promote.ts passes production env to registerAgentVersion', () => {
    // The call should include 'production' as the env argument
    expect(content).toMatch(/registerAgentVersion\s*\([^)]*production[^)]*\)/i);
  });

  it('promote.ts does not call supabase .update on features for promoted_version', () => {
    // Trigger now handles this — the promote command should not do it
    const hasDirectUpdate = /\.from\(['"]features['"]\)[\s\S]{0,300}promoted_version[\s\S]{0,100}\.update\(|\.update\(\s*\{\s*promoted_version/i.test(
      content ?? '',
    );
    expect(hasDirectUpdate).toBe(false);
  });
});
