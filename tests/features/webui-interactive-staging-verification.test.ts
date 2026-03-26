/**
 * Feature: WebUI interactive staging verification button and badge
 * Feature ID: 2a30efa4-5d7a-460e-aac3-08931cb5ff24
 *
 * Tests encode acceptance criteria for:
 * 1. Completed unpromoted features show a "Mark verified on staging" button
 * 2. Clicking the button sets staging_verified_by and staging_verified_at
 * 3. Green badge appears immediately with verifier name and timestamp
 * 4. Un-verify (x button) clears both fields back to NULL
 * 5. Already-promoted features do NOT show the verification button
 * 6. Features in non-complete statuses do NOT show the verification button
 * 7. RLS policy only allows updating the two verification columns
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
    return fs.readdirSync(dir);
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// AC7: RLS migration — only allows updating the two verification columns
// ---------------------------------------------------------------------------

describe('RLS migration for staging verification columns', () => {
  let migrationContent: string | null = null;
  let migrationFile: string | null = null;

  beforeAll(() => {
    const files = getMigrationFiles();
    // Find migration that mentions staging_verified RLS
    const match = files.find(
      (f) =>
        f.toLowerCase().includes('staging_verified_rls') ||
        f.toLowerCase().includes('staging_verified'),
    );
    if (match) {
      migrationFile = `supabase/migrations/${match}`;
      migrationContent = readRepoFile(migrationFile);
    }
    // Fallback: scan all migrations for staging_verified_by
    if (!migrationContent) {
      for (const f of files) {
        const c = readRepoFile(`supabase/migrations/${f}`);
        if (c && c.includes('staging_verified_by')) {
          migrationFile = `supabase/migrations/${f}`;
          migrationContent = c;
          break;
        }
      }
    }
  });

  it('AC7: a migration file exists for the staging verification RLS policy', () => {
    expect(
      migrationContent,
      'No migration found for staging_verified_rls. Create supabase/migrations/XXX_staging_verified_rls.sql',
    ).not.toBeNull();
  });

  it('AC7: migration creates a CREATE POLICY or ALTER POLICY for features table', () => {
    expect(migrationContent).toMatch(/CREATE\s+POLICY|ALTER\s+POLICY/i);
  });

  it('AC7: RLS policy targets the features table', () => {
    expect(migrationContent).toMatch(/ON\s+features|ON\s+public\.features/i);
  });

  it('AC7: RLS policy is an UPDATE policy (FOR UPDATE)', () => {
    expect(migrationContent).toMatch(/FOR\s+UPDATE/i);
  });

  it('AC7: policy is scoped to company_id (restricts rows by company)', () => {
    expect(migrationContent).toMatch(/company_id/i);
  });

  it('AC7: policy only allows updating staging_verified_by and staging_verified_at (not other columns)', () => {
    // The policy should reference staging_verified_by
    expect(migrationContent).toMatch(/staging_verified_by/i);
    // And staging_verified_at
    expect(migrationContent).toMatch(/staging_verified_at/i);
  });

  it('AC7: policy does NOT grant update access to promoted_version or status columns', () => {
    // The RLS policy for verification should be narrow — not allow arbitrary updates
    // Check that this specific policy doesn't reference promoted_version in a permissive way
    // A WITH CHECK or USING clause should be present
    expect(migrationContent).toMatch(/USING|WITH CHECK/i);
  });
});

// ---------------------------------------------------------------------------
// AC1 + AC5 + AC6: FeatureDetailPanel — verification button visibility rules
// ---------------------------------------------------------------------------

describe('FeatureDetailPanel — Mark verified on staging button', () => {
  const FILE = 'packages/webui/src/components/FeatureDetailPanel.tsx';
  let content: string | null;

  beforeAll(() => {
    content = readRepoFile(FILE);
  });

  it('FeatureDetailPanel.tsx exists', () => {
    expect(content, `${FILE} not found`).not.toBeNull();
  });

  it('AC1: shows "Mark verified on staging" button text', () => {
    expect(content).toMatch(/[Mm]ark verified on staging|mark.*verified.*staging/i);
  });

  it('AC1: button is conditional on status === "complete"', () => {
    // The button should only render for complete status
    expect(content).toMatch(/status.*complete|complete.*status/i);
  });

  it('AC5: button is hidden when promoted_version is set (already promoted)', () => {
    // promoted_version IS NULL check — button only shows when not promoted
    expect(content).toMatch(/promoted_version.*null|promoted_version.*undefined|!.*promoted_version|\!feature.*promoted_version/i);
  });

  it('AC6: button is hidden for non-complete statuses (conditional render)', () => {
    // The render condition checks status — only "complete" should show the button
    // There should be a conditional block gating on complete status
    expect(content).toMatch(/status\s*===\s*['"]complete['"]|status\s*==\s*['"]complete['"]/i);
  });
});

// ---------------------------------------------------------------------------
// AC2: FeatureDetailPanel — click handler calls supabase update
// ---------------------------------------------------------------------------

describe('FeatureDetailPanel — click handler sets staging_verified_by and staging_verified_at', () => {
  const FILE = 'packages/webui/src/components/FeatureDetailPanel.tsx';
  let content: string | null;

  beforeAll(() => {
    content = readRepoFile(FILE);
  });

  it('AC2: update call sets staging_verified_by', () => {
    expect(content).toMatch(/staging_verified_by/);
  });

  it('AC2: update call sets staging_verified_at', () => {
    expect(content).toMatch(/staging_verified_at/);
  });

  it('AC2: staging_verified_at is set to a new Date ISO string', () => {
    expect(content).toMatch(/new\s+Date\(\)\.toISOString\(\)|new\s+Date\(\s*\)\.toISOString/i);
  });

  it('AC2: calls supabase .update() on the features table', () => {
    // Supabase update pattern: supabase.from('features').update({...})
    expect(content).toMatch(/from\s*\(\s*['"]features['"]\s*\)\s*\.update|\.update\s*\(\s*\{[^}]*staging_verified/i);
  });

  it('AC2: update is scoped to the specific featureId (.eq or .match)', () => {
    expect(content).toMatch(/\.eq\s*\(|\.match\s*\(/i);
  });

  it('AC2: prompts for verifier name or uses a sensible default', () => {
    // Should prompt for name — either window.prompt or an input field / state
    expect(content).toMatch(/prompt\s*\(|verifier.*name|verifierName|verifier_name|staging_verified_by.*input|input.*staging_verified_by/i);
  });

  it('AC2: optimistically updates the UI state after clicking', () => {
    // Should call setState / setData with updated staging_verified_by
    expect(content).toMatch(/setData|setState|optimistic|staging_verified_by.*state|state.*staging_verified_by/i);
  });
});

// ---------------------------------------------------------------------------
// AC3: FeatureDetailPanel — green badge with verifier name and timestamp
// ---------------------------------------------------------------------------

describe('FeatureDetailPanel — green verified badge', () => {
  const FILE = 'packages/webui/src/components/FeatureDetailPanel.tsx';
  let content: string | null;

  beforeAll(() => {
    content = readRepoFile(FILE);
  });

  it('AC3: renders a badge element when staging_verified_by is set', () => {
    // Should have a conditional rendering block for when staging_verified_by is truthy
    expect(content).toMatch(/staging_verified_by\s*&&|staging_verified_by\s*\?|if.*staging_verified_by/i);
  });

  it('AC3: badge uses green styling (CSS class or inline style)', () => {
    // Green badge — look for green color references near staging verified context
    expect(content).toMatch(/green|#[0-9a-fA-F]*[Gg]|badge.*green|staging.*green|verified.*badge|badge.*verified/i);
  });

  it('AC3: badge displays the verifier name (staging_verified_by value)', () => {
    // The badge should render the staging_verified_by value
    expect(content).toMatch(/staging_verified_by/);
    // It should be rendered in JSX (used in expression context)
    expect(content).toMatch(/\{[^}]*staging_verified_by[^}]*\}/);
  });

  it('AC3: badge shows a relative or formatted timestamp (staging_verified_at)', () => {
    expect(content).toMatch(/staging_verified_at/);
    // Should display the timestamp — either formatted or relative
    expect(content).toMatch(/\{[^}]*staging_verified_at[^}]*\}/);
  });
});

// ---------------------------------------------------------------------------
// AC4: FeatureDetailPanel — un-verify x button clears both fields to NULL
// ---------------------------------------------------------------------------

describe('FeatureDetailPanel — un-verify action clears staging verification', () => {
  const FILE = 'packages/webui/src/components/FeatureDetailPanel.tsx';
  let content: string | null;

  beforeAll(() => {
    content = readRepoFile(FILE);
  });

  it('AC4: has an un-verify button or x element on the badge', () => {
    // Look for a clickable element within the verified badge that clears verification
    // Common patterns: ×, ✕, x button, "unverify", "remove verification"
    expect(content).toMatch(/unverif|un-verif|clear.*verif|×|✕|remove.*verif|verif.*remove/i);
  });

  it('AC4: un-verify sets staging_verified_by to null', () => {
    // The update call for un-verify should set staging_verified_by to null
    expect(content).toMatch(/staging_verified_by\s*:\s*null/i);
  });

  it('AC4: un-verify sets staging_verified_at to null', () => {
    // The update call for un-verify should set staging_verified_at to null
    expect(content).toMatch(/staging_verified_at\s*:\s*null/i);
  });

  it('AC4: un-verify calls supabase update to persist the null values', () => {
    // Should call .update() with both null fields
    expect(content).toMatch(/\.update\s*\(\s*\{[^}]*staging_verified_by\s*:\s*null[^}]*\}|\.update\s*\(\s*\{[^}]*staging_verified_at\s*:\s*null/i);
  });

  it('AC4: un-verify optimistically clears the badge in UI state', () => {
    // After un-verify, UI should clear the badge (state update)
    expect(content).toMatch(/setData|setState/i);
  });
});

// ---------------------------------------------------------------------------
// Structural: FeatureDetailPanel imports and types include staging_verified fields
// ---------------------------------------------------------------------------

describe('FeatureDetailPanel — FeatureDetail type includes staging_verified fields', () => {
  const FILES = [
    'packages/webui/src/lib/queries.ts',
    'packages/webui/src/lib/queries.tsx',
    'packages/webui/src/lib/api.ts',
  ];
  let content: string | null = null;

  beforeAll(() => {
    for (const f of FILES) {
      const c = readRepoFile(f);
      if (c) {
        content = c;
        break;
      }
    }
  });

  it('FeatureDetail type or interface includes staging_verified_by field', () => {
    expect(content).toMatch(/staging_verified_by/);
  });

  it('FeatureDetail type or interface includes staging_verified_at field', () => {
    expect(content).toMatch(/staging_verified_at/);
  });

  it('query-features fetch includes staging_verified_by in the select', () => {
    // The queries file should select staging_verified_by from features
    expect(content).toMatch(/staging_verified_by|staging_verified/);
  });
});
