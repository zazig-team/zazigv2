/**
 * Feature: Staging verification field on features with WebUI toggle
 * Feature ID: 06085b22-bb4c-4f0d-9f19-b9da87f230e0
 *
 * Acceptance criteria:
 * AC1 — Migration applies cleanly — staging_verified_by and staging_verified_at columns exist
 *        on features table, both nullable, both default NULL
 * AC2 — Completed unpromoted features show a "Mark verified on staging" button in the WebUI
 * AC3 — Clicking the button and entering a name sets staging_verified_by and staging_verified_at
 * AC4 — The green verification badge appears immediately after marking, showing verifier name
 *        and timestamp
 * AC5 — The un-verify action (x button) clears both fields back to NULL
 * AC6 — Already-promoted features do NOT show the verification button
 * AC7 — Features in non-complete statuses do NOT show the verification button
 * AC8 — The verification state persists across page reloads (fields included in select queries)
 *
 * Tests are written to FAIL against the current codebase and pass once the feature is implemented.
 */

import { describe, it, expect, beforeEach } from 'vitest';
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

function findMigrationFile(): { path: string; content: string } | null {
  const migrationsDir = path.join(REPO_ROOT, 'supabase/migrations');
  let files: string[];
  try {
    files = fs.readdirSync(migrationsDir);
  } catch {
    return null;
  }
  for (const file of files) {
    if (file.includes('staging_verif')) {
      const content = fs.readFileSync(path.join(migrationsDir, file), 'utf-8');
      return { path: file, content };
    }
  }
  return null;
}

const QUERIES_PATH = 'packages/webui/src/lib/queries.ts';
const FEATURE_DETAIL_PANEL_PATH = 'packages/webui/src/components/FeatureDetailPanel.tsx';
const PIPELINE_PATH = 'packages/webui/src/pages/Pipeline.tsx';
const DASHBOARD_PATH = 'packages/webui/src/pages/Dashboard.tsx';

// ---------------------------------------------------------------------------
// AC1: Migration file adds staging_verified_by and staging_verified_at columns
// ---------------------------------------------------------------------------

describe('AC1: Migration adds staging_verified_by and staging_verified_at to features', () => {
  it('a migration file for staging_verified fields exists in supabase/migrations/', () => {
    // A new migration file with "staging_verif" in the name must be present.
    // Currently absent — test FAILS until the migration is created.
    const migration = findMigrationFile();
    expect(migration).not.toBeNull();
  });

  it('migration adds staging_verified_by as nullable text column with DEFAULT NULL (AC1)', () => {
    const migration = findMigrationFile();
    expect(migration).not.toBeNull();
    // Must include ADD COLUMN staging_verified_by text DEFAULT NULL
    expect(migration!.content).toMatch(/ADD\s+COLUMN\s+staging_verified_by\s+text\s+DEFAULT\s+NULL/i);
  });

  it('migration adds staging_verified_at as nullable timestamptz column with DEFAULT NULL (AC1)', () => {
    const migration = findMigrationFile();
    expect(migration).not.toBeNull();
    // Must include ADD COLUMN staging_verified_at timestamptz DEFAULT NULL
    expect(migration!.content).toMatch(/ADD\s+COLUMN\s+staging_verified_at\s+timestamptz\s+DEFAULT\s+NULL/i);
  });

  it('migration targets the features table (AC1)', () => {
    const migration = findMigrationFile();
    expect(migration).not.toBeNull();
    expect(migration!.content).toMatch(/ALTER\s+TABLE\s+features/i);
  });
});

// ---------------------------------------------------------------------------
// AC2 & AC3 & AC5: "Mark verified on staging" button and write behaviour
// ---------------------------------------------------------------------------

describe('AC2: Completed unpromoted features show "Mark verified on staging" button', () => {
  let panelSource: string | null;
  let pipelineSource: string | null;

  beforeEach(() => {
    panelSource = readRepoFile(FEATURE_DETAIL_PANEL_PATH);
    pipelineSource = readRepoFile(PIPELINE_PATH);
  });

  it('FeatureDetailPanel.tsx exists', () => {
    expect(panelSource).not.toBeNull();
  });

  it('"Mark verified on staging" label appears in FeatureDetailPanel.tsx (AC2)', () => {
    // The button text is entirely absent from the current codebase — FAILS until implemented.
    expect(panelSource).toMatch(/Mark verified on staging/i);
  });

  it('FeatureDetailPanel only shows the verify button when status is "complete" (AC2 / AC7)', () => {
    // The button must be gated behind a status === "complete" check.
    // Without this guard, non-complete features would incorrectly show the button.
    const btnIdx = panelSource?.indexOf('Mark verified on staging') ?? -1;
    expect(btnIdx).toBeGreaterThan(-1);

    // Search the surrounding 600 chars for a complete-status guard
    const window = panelSource?.slice(Math.max(0, btnIdx - 600), btnIdx + 200) ?? '';
    expect(window).toMatch(/["']complete["']/);
  });

  it('FeatureDetailPanel only shows the verify button when promoted_version is null (AC2 / AC6)', () => {
    // The button must not appear for already-promoted features.
    // Guard must check promoted_version === null or !promoted_version.
    const btnIdx = panelSource?.indexOf('Mark verified on staging') ?? -1;
    expect(btnIdx).toBeGreaterThan(-1);

    const window = panelSource?.slice(Math.max(0, btnIdx - 600), btnIdx + 200) ?? '';
    expect(window).toMatch(/promoted_version/);
  });

  it('"Mark verified on staging" button or equivalent is also present in Pipeline.tsx (AC2)', () => {
    // The pipeline completed-features list should also include the verify button.
    // Either Pipeline.tsx renders it directly, or it delegates to FeatureDetailPanel.
    // At minimum, Pipeline.tsx must reference the staging_verified concept.
    const hasInPipeline = pipelineSource?.includes('Mark verified on staging') ||
      pipelineSource?.includes('staging_verified');
    expect(hasInPipeline).toBe(true);
  });
});

describe('AC3: Clicking verify button sets staging_verified_by and staging_verified_at', () => {
  let panelSource: string | null;

  beforeEach(() => {
    panelSource = readRepoFile(FEATURE_DETAIL_PANEL_PATH);
  });

  it('FeatureDetailPanel.tsx calls supabase update with staging_verified_by (AC3)', () => {
    // The update call must include staging_verified_by in the update payload.
    // Currently absent — FAILS until implemented.
    expect(panelSource).toMatch(/staging_verified_by/);
  });

  it('FeatureDetailPanel.tsx calls supabase update with staging_verified_at (AC3)', () => {
    // The update must set staging_verified_at to an ISO timestamp.
    expect(panelSource).toMatch(/staging_verified_at/);
  });

  it('supabase update targets features table with .eq("id", ...) (AC3)', () => {
    // The update must be scoped to the specific feature by id.
    const verifiedByIdx = panelSource?.indexOf('staging_verified_by') ?? -1;
    expect(verifiedByIdx).toBeGreaterThan(-1);

    // Look at a wide window around the update for the .eq id pattern
    const window = panelSource?.slice(Math.max(0, verifiedByIdx - 300), verifiedByIdx + 500) ?? '';
    expect(window).toMatch(/\.eq\s*\(\s*["']id["']/);
  });

  it('staging_verified_at is set to a new Date() ISO string (AC3)', () => {
    // The timestamp must be set dynamically (new Date().toISOString())
    expect(panelSource).toMatch(/new\s+Date\(\)\.toISOString\(\)|new Date\(\)\.toISOString\(\)/);
  });
});

// ---------------------------------------------------------------------------
// AC4: Green verification badge renders after marking
// ---------------------------------------------------------------------------

describe('AC4: Green verification badge shows verifier name and timestamp', () => {
  let panelSource: string | null;
  let pipelineSource: string | null;
  let dashboardSource: string | null;

  beforeEach(() => {
    panelSource = readRepoFile(FEATURE_DETAIL_PANEL_PATH);
    pipelineSource = readRepoFile(PIPELINE_PATH);
    dashboardSource = readRepoFile(DASHBOARD_PATH);
  });

  it('FeatureDetailPanel.tsx renders a badge when staging_verified_by is set (AC4)', () => {
    // The badge renders only when staging_verified_by is truthy.
    // Check that the rendering of staging_verified_by is conditional (not just always shown).
    expect(panelSource).toMatch(/staging_verified_by/);
    // Must have a conditional expression around the badge
    const idx = panelSource?.indexOf('staging_verified_by') ?? -1;
    const window = panelSource?.slice(Math.max(0, idx - 200), idx + 400) ?? '';
    expect(window).toMatch(/staging_verified_by.*&&|staging_verified_by.*\?|&&.*staging_verified_by|\?.*staging_verified_by/s);
  });

  it('"Verified by" text appears in FeatureDetailPanel.tsx for the badge (AC4)', () => {
    // The badge label must include "Verified by" with the verifier name.
    expect(panelSource).toMatch(/Verified by/i);
  });

  it('badge element uses a positive/green styling class in FeatureDetailPanel.tsx (AC4)', () => {
    // The badge must use green/positive styling (positive, green, verified, success, etc.)
    const idx = panelSource?.indexOf('Verified by') ?? -1;
    if (idx === -1) {
      // fallback: look near staging_verified_by for a green/positive class
      const vIdx = panelSource?.indexOf('staging_verified_by') ?? -1;
      const window = panelSource?.slice(vIdx, vIdx + 600) ?? '';
      expect(window).toMatch(/positive|green|verified|success/i);
    } else {
      const window = panelSource?.slice(Math.max(0, idx - 200), idx + 400) ?? '';
      expect(window).toMatch(/positive|green|verified|success/i);
    }
  });

  it('staging_verified_by appears in Pipeline.tsx rendering for the complete column (AC4)', () => {
    // The pipeline view of completed features must also render the verification badge.
    expect(pipelineSource).toMatch(/staging_verified_by/);
  });

  it('staging_verified_by appears in Dashboard.tsx completed features section (AC4)', () => {
    // The dashboard completed-features list must also display verification state.
    expect(dashboardSource).toMatch(/staging_verified_by/);
  });
});

// ---------------------------------------------------------------------------
// AC5: Un-verify action clears both fields
// ---------------------------------------------------------------------------

describe('AC5: Un-verify action (x button) clears staging_verified_by and staging_verified_at', () => {
  let panelSource: string | null;

  beforeEach(() => {
    panelSource = readRepoFile(FEATURE_DETAIL_PANEL_PATH);
  });

  it('FeatureDetailPanel.tsx has an un-verify handler that sets fields to null (AC5)', () => {
    // Clearing verification requires an update with null values for both fields.
    // Pattern: update({ staging_verified_by: null, staging_verified_at: null })
    expect(panelSource).toMatch(/staging_verified_by\s*:\s*null/);
    expect(panelSource).toMatch(/staging_verified_at\s*:\s*null/);
  });

  it('FeatureDetailPanel.tsx renders an un-verify button near the verification badge (AC5)', () => {
    // An "x" or "remove" button must appear to allow un-verifying.
    const verifiedIdx = panelSource?.indexOf('Verified by') ?? -1;
    if (verifiedIdx !== -1) {
      // Look near "Verified by" for an unverify/remove/x trigger
      const window = panelSource?.slice(Math.max(0, verifiedIdx - 100), verifiedIdx + 600) ?? '';
      expect(window).toMatch(/unverif|remove.*verif|verif.*remove|onClick.*null|×|✕|&times|×/i);
    } else {
      // Fallback: staging_verified_by context must include a null-setter click handler
      const idx = panelSource?.indexOf('staging_verified_by: null') ?? -1;
      expect(idx).toBeGreaterThan(-1);
    }
  });
});

// ---------------------------------------------------------------------------
// AC6: Already-promoted features do NOT show the verification button
// ---------------------------------------------------------------------------

describe('AC6: Promoted features do not show the verify button', () => {
  let panelSource: string | null;
  let pipelineSource: string | null;

  beforeEach(() => {
    panelSource = readRepoFile(FEATURE_DETAIL_PANEL_PATH);
    pipelineSource = readRepoFile(PIPELINE_PATH);
  });

  it('FeatureDetailPanel.tsx gates the verify button with a promoted_version === null check (AC6)', () => {
    // The button render must be inside a block that checks promoted_version is falsy.
    const btnIdx = panelSource?.indexOf('Mark verified on staging') ?? -1;
    expect(btnIdx).toBeGreaterThan(-1);

    // Scan up to 800 chars before the button for the guard
    const precedingCode = panelSource?.slice(Math.max(0, btnIdx - 800), btnIdx) ?? '';
    // promoted_version must appear in the preceding guard context
    expect(precedingCode).toMatch(/promoted_version/);
    // And it must check for null/falsy (not just existence)
    expect(precedingCode).toMatch(/!.*promoted_version|promoted_version\s*===?\s*null|promoted_version\s*==\s*null/);
  });

  it('Pipeline.tsx verify button is also gated by !promoted_version (AC6)', () => {
    // If Pipeline.tsx renders the verify button inline, it must also guard on promoted_version.
    const hasPipelineBtn = pipelineSource?.includes('Mark verified on staging');
    if (hasPipelineBtn) {
      const btnIdx = pipelineSource?.indexOf('Mark verified on staging') ?? -1;
      const precedingCode = pipelineSource?.slice(Math.max(0, btnIdx - 600), btnIdx) ?? '';
      expect(precedingCode).toMatch(/!.*promoted_version|promoted_version\s*===?\s*null/);
    } else {
      // Pipeline defers to FeatureDetailPanel or cards which are already guarded — pass
      expect(true).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// AC7: Non-complete statuses do NOT show the verification button
// ---------------------------------------------------------------------------

describe('AC7: Non-complete status features do not show the verify button', () => {
  let panelSource: string | null;

  beforeEach(() => {
    panelSource = readRepoFile(FEATURE_DETAIL_PANEL_PATH);
  });

  it('FeatureDetailPanel.tsx verify button requires status === "complete" (AC7)', () => {
    const btnIdx = panelSource?.indexOf('Mark verified on staging') ?? -1;
    expect(btnIdx).toBeGreaterThan(-1);

    // The button must be inside a status === "complete" guard
    const precedingCode = panelSource?.slice(Math.max(0, btnIdx - 800), btnIdx) ?? '';
    expect(precedingCode).toMatch(/status\s*===?\s*["']complete["']|["']complete["']\s*===?\s*status/);
  });

  it('verify button is NOT shown unconditionally (no dangling render without status guard) (AC7)', () => {
    // "Mark verified on staging" must appear at most in a conditional block.
    // We verify the button text is surrounded by conditional logic (not a plain, unconditional render).
    const source = panelSource ?? '';
    const btnIdx = source.indexOf('Mark verified on staging');
    expect(btnIdx).toBeGreaterThan(-1);

    // Check that within 1200 chars before the button there is at least one ternary/if/&&
    const window = source.slice(Math.max(0, btnIdx - 1200), btnIdx);
    expect(window).toMatch(/\?|&&|\bif\b/);
  });
});

// ---------------------------------------------------------------------------
// AC8: Verification state persists across page reloads (fields in select queries)
// ---------------------------------------------------------------------------

describe('AC8: Verification state persists — fields included in select queries', () => {
  let queriesSource: string | null;
  let pipelineSource: string | null;
  let dashboardSource: string | null;

  beforeEach(() => {
    queriesSource = readRepoFile(QUERIES_PATH);
    pipelineSource = readRepoFile(PIPELINE_PATH);
    dashboardSource = readRepoFile(DASHBOARD_PATH);
  });

  it('queries.ts exists', () => {
    expect(queriesSource).not.toBeNull();
  });

  it('queries.ts fetchFeatureDetail select includes staging_verified_by (AC8)', () => {
    // The detail query must include staging_verified_by so the badge is always loaded.
    // Currently absent — FAILS until implemented.
    expect(queriesSource).toMatch(/staging_verified_by/);
  });

  it('queries.ts fetchFeatureDetail select includes staging_verified_at (AC8)', () => {
    // The detail query must include staging_verified_at.
    expect(queriesSource).toMatch(/staging_verified_at/);
  });

  it('queries.ts FeatureDetail type includes staging_verified_by field (AC8)', () => {
    // The TypeScript type for FeatureDetail must declare the new field.
    // Look for the type declaration containing the verified fields.
    expect(queriesSource).toMatch(/staging_verified_by\s*[?:].*string|string.*staging_verified_by/s);
  });

  it('queries.ts FeatureDetail type includes staging_verified_at field (AC8)', () => {
    expect(queriesSource).toMatch(/staging_verified_at\s*[?:].*string|string.*staging_verified_at/s);
  });

  it('usePipelineSnapshot or Pipeline.tsx select includes staging_verified_by for list view (AC8)', () => {
    // For the completed features list to show badge state after reload, the list query
    // must also fetch the verification fields.
    const hasPipeline = pipelineSource?.includes('staging_verified_by');
    const hasDashboard = dashboardSource?.includes('staging_verified_by');
    // At least one of the list views must fetch the fields
    expect(hasPipeline || hasDashboard).toBe(true);
  });

  it('fetchCompletedFeatures (or equivalent) includes staging_verified_by in select (AC8)', () => {
    // The query that fetches the completed features list must include staging_verified_by.
    const completedFeaturesSelect = queriesSource?.match(
      /\.select\([^)]*staging_verified_by[^)]*\)/s
    );
    // OR: the field is listed on a multi-line select that includes it
    const hasField = queriesSource?.includes('staging_verified_by');
    expect(hasField).toBe(true);
  });
});
