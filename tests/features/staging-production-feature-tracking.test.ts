/**
 * Feature: Staging/Production feature tracking with promoted_version
 *
 * Tests encode acceptance criteria for:
 * 1. Database migration (promoted_version column, deployments table drop)
 * 2. promote CLI command updating promoted_version
 * 3. query-features edge function including promoted_version in FEATURE_SELECT
 * 4. WebUI Dashboard showing "Shipped to Staging" and "Shipped to Production"
 * 5. pipeline snapshot including promoted_version in completed_features
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
    return fs.readdirSync(dir).map((f) => f);
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// AC6 + constraint: Migration adds promoted_version and drops deployments table
// ---------------------------------------------------------------------------

describe('Database migration for promoted_version', () => {
  let migrationContent: string | null = null;
  let migrationFile: string | null = null;

  beforeAll(() => {
    const files = getMigrationFiles();
    // Find migration that mentions promoted_version
    const match = files.find(
      (f) => f.toLowerCase().includes('promoted_version') || f.toLowerCase().includes('staging') || f.toLowerCase().includes('production'),
    );
    if (match) {
      migrationFile = `supabase/migrations/${match}`;
      migrationContent = readRepoFile(migrationFile);
    }
    // Fallback: search all migrations for promoted_version
    if (!migrationContent) {
      for (const f of files) {
        const c = readRepoFile(`supabase/migrations/${f}`);
        if (c && c.includes('promoted_version')) {
          migrationFile = `supabase/migrations/${f}`;
          migrationContent = c;
          break;
        }
      }
    }
  });

  it('a migration file exists that adds promoted_version to features', () => {
    expect(
      migrationContent,
      'No migration found that adds promoted_version column. Create supabase/migrations/099_*.sql',
    ).not.toBeNull();
  });

  it('adds promoted_version TEXT nullable column to features table', () => {
    expect(migrationContent).toMatch(/promoted_version\s+TEXT|ADD\s+COLUMN\s+promoted_version/i);
  });

  it('drops the deployments table (AC6: deployments table no longer exists)', () => {
    expect(migrationContent).toMatch(/DROP\s+TABLE\s+IF\s+EXISTS.*deployments|DROP\s+TABLE.*IF\s+EXISTS.*deployments/i);
  });

  it('uses IF EXISTS when dropping deployments (handles case where table does not exist)', () => {
    expect(migrationContent).toMatch(/DROP\s+TABLE\s+IF\s+EXISTS/i);
  });
});

// ---------------------------------------------------------------------------
// AC1 + AC2 + failure cases: promote.ts relies on DB trigger after insert
// ---------------------------------------------------------------------------

describe('promote.ts CLI command — promoted_version stamping path', () => {
  const FILE = 'packages/cli/src/commands/promote.ts';
  let content: string | null;

  beforeAll(() => {
    content = readRepoFile(FILE);
  });

  it('promote.ts exists', () => {
    expect(content, `${FILE} not found`).not.toBeNull();
  });

  it('AC1: registers production version in agent_versions after production push', () => {
    expect(content).toMatch(/registerAgentVersion\(\s*supabase\s*,\s*['"]production['"]\s*,\s*newVersion\s*,\s*commitSha\s*\)/);
  });

  it('AC1: documents trigger-based promoted_version stamping', () => {
    expect(content).toMatch(/promoted_version is now stamped automatically by the DB trigger/i);
  });

  it('AC1: does not perform direct features bulk update in promote.ts', () => {
    expect(content).not.toMatch(
      /\.from\(\s*['"]features['"]\s*\)[\s\S]*?\.update\(\s*\{\s*promoted_version\s*:\s*newVersion\s*\}/,
    );
  });

  it('failure case 1: no warning log for direct promoted_version update failures', () => {
    expect(content).not.toMatch(/Warning:\s*could not update promoted_version on features/i);
  });

  it('keeps version registration in the same promote flow path', () => {
    // Both operations use supabase client — verify supabase is used for both
    const agentVersionsInsertIdx = content?.indexOf('agent_versions') ?? -1;
    const promotedVersionTriggerNoteIdx = content?.indexOf('promoted_version is now stamped automatically by the DB trigger') ?? -1;
    expect(agentVersionsInsertIdx).toBeGreaterThan(-1);
    expect(promotedVersionTriggerNoteIdx).toBeGreaterThan(-1);
  });
});

// ---------------------------------------------------------------------------
// AC5: query-features edge function includes promoted_version in FEATURE_SELECT
// ---------------------------------------------------------------------------

describe('query-features edge function — promoted_version in FEATURE_SELECT', () => {
  const FILE = 'supabase/functions/query-features/index.ts';
  let content: string | null;

  beforeAll(() => {
    content = readRepoFile(FILE);
  });

  it('query-features/index.ts exists', () => {
    expect(content, `${FILE} not found`).not.toBeNull();
  });

  it('AC5: FEATURE_SELECT constant includes promoted_version', () => {
    expect(content).toMatch(/FEATURE_SELECT/);
    // Find the FEATURE_SELECT value and verify it contains promoted_version
    const selectMatch = content?.match(/FEATURE_SELECT\s*=\s*[`'"]([\s\S]*?)[`'"]/);
    if (selectMatch) {
      expect(selectMatch[1]).toContain('promoted_version');
    } else {
      // Fallback: just check the file has promoted_version near FEATURE_SELECT
      expect(content).toMatch(/promoted_version/);
    }
  });
});

// ---------------------------------------------------------------------------
// Pipeline snapshot edge function — promoted_version in completed_features
// ---------------------------------------------------------------------------

describe('get-pipeline-snapshot edge function — promoted_version in completed_features', () => {
  const FILES = [
    'supabase/functions/get-pipeline-snapshot/index.ts',
    'supabase/functions/pipeline-snapshot/index.ts',
  ];
  let content: string | null = null;
  let foundFile: string | null = null;

  beforeAll(() => {
    for (const f of FILES) {
      const c = readRepoFile(f);
      if (c) {
        content = c;
        foundFile = f;
        break;
      }
    }
  });

  it('pipeline snapshot edge function exists', () => {
    expect(content, `Pipeline snapshot edge function not found at ${FILES.join(' or ')}`).not.toBeNull();
  });

  it('includes promoted_version in feature select/query for completed_features', () => {
    expect(content).toMatch(/promoted_version/);
  });
});

// ---------------------------------------------------------------------------
// AC3: WebUI Dashboard — "Shipped to Staging" column
// ---------------------------------------------------------------------------

describe('WebUI Dashboard — Shipped to Staging column', () => {
  const FILE = 'packages/webui/src/pages/Dashboard.tsx';
  let content: string | null;

  beforeAll(() => {
    content = readRepoFile(FILE);
  });

  it('Dashboard.tsx exists', () => {
    expect(content, `${FILE} not found`).not.toBeNull();
  });

  it('AC3: renames Complete column to "Shipped to Staging"', () => {
    expect(content).toMatch(/Shipped to Staging/i);
  });

  it('AC3: Shipped to Staging filters by status=complete AND promoted_version IS NULL', () => {
    // Should filter for features where promoted_version is null/undefined
    expect(content).toMatch(/promoted_version.*null|promoted_version.*undefined|!.*promoted_version|promoted_version\s*===\s*(null|undefined)/i);
  });

  it('AC3: does NOT show "Complete" as column header (renamed)', () => {
    // The column header should no longer be just "Complete"
    // Note: "complete" may still appear as a status value string — check for heading/label context
    // This is a soft check — the "Shipped to Staging" test above is the primary assertion
    expect(content).not.toMatch(/>\s*Complete\s*</);
  });
});

// ---------------------------------------------------------------------------
// AC4: WebUI Dashboard — "Shipped to Production" section
// ---------------------------------------------------------------------------

describe('WebUI Dashboard — Shipped to Production section', () => {
  const FILE = 'packages/webui/src/pages/Dashboard.tsx';
  let content: string | null;

  beforeAll(() => {
    content = readRepoFile(FILE);
  });

  it('AC4: shows "Shipped to Production" section', () => {
    expect(content).toMatch(/Shipped to Production/i);
  });

  it('AC4: Shipped to Production filters features where promoted_version IS NOT NULL', () => {
    // Features with a non-null promoted_version go here
    expect(content).toMatch(/promoted_version/);
    // The filter should check for presence of promoted_version
    expect(content).toMatch(/promoted_version.*&&|promoted_version.*!==.*null|promoted_version.*!==.*undefined|\?\?.*promoted_version|promoted_version.*truthy/i);
  });

  it('AC4: Shipped to Production section is collapsible (collapsed by default)', () => {
    // Should have some toggle/collapsed state for this section
    expect(content).toMatch(/collapsed|showProduction|isExpanded|toggle|useState.*false/i);
  });

  it('AC4: feature cards in production section display version as badge', () => {
    // The version badge — should render promoted_version value
    expect(content).toMatch(/promoted_version/);
    // Should render a badge element with the version
    expect(content).toMatch(/badge|Badge|version-badge|promoted_version/i);
  });
});

// ---------------------------------------------------------------------------
// AC5: zazig features CLI output includes promoted_version field
// ---------------------------------------------------------------------------

describe('zazig features CLI — promoted_version in output', () => {
  const FILE = 'packages/cli/src/commands/features.ts';
  let content: string | null;

  beforeAll(() => {
    content = readRepoFile(FILE);
  });

  it('features.ts exists', () => {
    expect(content, `${FILE} not found`).not.toBeNull();
  });

  it('AC5: features command hits query-features endpoint which now includes promoted_version', () => {
    // The CLI queries query-features; the edge function now includes promoted_version
    // The CLI itself just passes through whatever the edge function returns
    // Verify it hits query-features
    expect(content).toContain('query-features');
  });
});

// ---------------------------------------------------------------------------
// Failure case 3: Features in Staging do not disappear until promoted
// ---------------------------------------------------------------------------

describe('Staging/Production transition — features move only after promote', () => {
  const DASHBOARD_FILE = 'packages/webui/src/pages/Dashboard.tsx';
  let dashboardContent: string | null;

  beforeAll(() => {
    dashboardContent = readRepoFile(DASHBOARD_FILE);
  });

  it('Shipped to Staging filter uses IS NULL check (features stay until promoted)', () => {
    // Features only leave staging when promoted_version is set
    // The staging column filter must require promoted_version to be null/falsy
    expect(dashboardContent).toMatch(/promoted_version.*null|promoted_version.*undefined|!promoted_version|\!.*\.promoted_version/i);
  });

  it('Shipped to Production filter uses IS NOT NULL check (only promoted features)', () => {
    // The production section only shows features where promoted_version is set
    expect(dashboardContent).toMatch(/promoted_version.*&&|\.promoted_version\s*!==\s*null|\.promoted_version\s*!==\s*undefined/i);
  });
});
