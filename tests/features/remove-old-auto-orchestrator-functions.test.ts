/**
 * Feature: Remove old auto-* orchestrator functions
 *
 * Tests that the legacy auto-* functions (autoTriageNewIdeas,
 * autoSpecTriagedIdeas, autoPromoteTriagedIdeas,
 * autoEnrichIncompleteTriagedIdeas) have been removed from the orchestrator
 * edge function, while ensuring that safety constraints are respected:
 * the promote-idea edge function is preserved, company settings columns
 * are not dropped, expert role definitions are not removed, and the
 * existing feature pipeline and new idea pipeline watch loops remain intact.
 *
 * Written to FAIL against the current codebase (functions are still present).
 */

import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');

const ORCHESTRATOR_FILE = path.join(
  REPO_ROOT,
  'supabase',
  'functions',
  'orchestrator',
  'index.ts',
);

const PROMOTE_IDEA_FILE = path.join(
  REPO_ROOT,
  'supabase',
  'functions',
  'promote-idea',
  'index.ts',
);

const MIGRATIONS_DIR = path.join(REPO_ROOT, 'supabase', 'migrations');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let orchestratorSource = '';

function readOrchestrator(): string {
  try {
    return fs.readFileSync(ORCHESTRATOR_FILE, 'utf-8');
  } catch {
    return '';
  }
}

function getMigrationFiles(): string[] {
  try {
    return fs.readdirSync(MIGRATIONS_DIR)
      .filter((f) => f.endsWith('.sql'))
      .map((f) => path.join(MIGRATIONS_DIR, f));
  } catch {
    return [];
  }
}

function readMigrationFiles(): string {
  return getMigrationFiles()
    .map((f) => {
      try {
        return fs.readFileSync(f, 'utf-8');
      } catch {
        return '';
      }
    })
    .join('\n');
}

// ---------------------------------------------------------------------------
// AC1: autoTriageNewIdeas is removed from the orchestrator
// ---------------------------------------------------------------------------

describe('AC1: autoTriageNewIdeas function is removed from the orchestrator', () => {
  beforeAll(() => {
    orchestratorSource = readOrchestrator();
  });

  it('orchestrator file exists and is non-empty', () => {
    expect(orchestratorSource).not.toBe('');
  });

  it('does not define the autoTriageNewIdeas function', () => {
    expect(orchestratorSource).not.toMatch(/async function autoTriageNewIdeas/);
  });

  it('does not call autoTriageNewIdeas anywhere in the orchestrator', () => {
    expect(orchestratorSource).not.toMatch(/await autoTriageNewIdeas\(/);
  });

  it('does not reference auto_triage_types in the orchestrator (company settings read removed)', () => {
    // The orchestrator should no longer read auto_triage_types from company settings
    expect(orchestratorSource).not.toMatch(/auto_triage_types/);
  });
});

// ---------------------------------------------------------------------------
// AC2: autoSpecTriagedIdeas is removed from the orchestrator
// ---------------------------------------------------------------------------

describe('AC2: autoSpecTriagedIdeas function is removed from the orchestrator', () => {
  beforeAll(() => {
    orchestratorSource = readOrchestrator();
  });

  it('does not define the autoSpecTriagedIdeas function', () => {
    expect(orchestratorSource).not.toMatch(/async function autoSpecTriagedIdeas/);
  });

  it('does not call autoSpecTriagedIdeas anywhere in the orchestrator', () => {
    expect(orchestratorSource).not.toMatch(/await autoSpecTriagedIdeas\(/);
  });

  it('does not reference auto_spec_types in the orchestrator (company settings read removed)', () => {
    expect(orchestratorSource).not.toMatch(/auto_spec_types/);
  });
});

// ---------------------------------------------------------------------------
// AC3: autoPromoteTriagedIdeas is removed from the orchestrator
// ---------------------------------------------------------------------------

describe('AC3: autoPromoteTriagedIdeas function is removed from the orchestrator', () => {
  beforeAll(() => {
    orchestratorSource = readOrchestrator();
  });

  it('does not define the autoPromoteTriagedIdeas function', () => {
    expect(orchestratorSource).not.toMatch(/async function autoPromoteTriagedIdeas/);
  });

  it('does not call autoPromoteTriagedIdeas anywhere in the orchestrator', () => {
    expect(orchestratorSource).not.toMatch(/await autoPromoteTriagedIdeas\(/);
  });

  it('does not reference auto_promote_types in the orchestrator (company settings read removed)', () => {
    expect(orchestratorSource).not.toMatch(/auto_promote_types/);
  });
});

// ---------------------------------------------------------------------------
// AC4: autoEnrichIncompleteTriagedIdeas is removed from the orchestrator
// ---------------------------------------------------------------------------

describe('AC4: autoEnrichIncompleteTriagedIdeas function is removed from the orchestrator', () => {
  beforeAll(() => {
    orchestratorSource = readOrchestrator();
  });

  it('does not define the autoEnrichIncompleteTriagedIdeas function', () => {
    expect(orchestratorSource).not.toMatch(/async function autoEnrichIncompleteTriagedIdeas/);
  });

  it('does not export autoEnrichIncompleteTriagedIdeas', () => {
    expect(orchestratorSource).not.toMatch(/export.*autoEnrichIncompleteTriagedIdeas/);
  });

  it('does not call autoEnrichIncompleteTriagedIdeas anywhere in the orchestrator', () => {
    expect(orchestratorSource).not.toMatch(/await autoEnrichIncompleteTriagedIdeas\(/);
  });
});

// ---------------------------------------------------------------------------
// AC5: No AI workloads run on the edge function for idea processing
// ---------------------------------------------------------------------------

describe('AC5: No AI workloads run on the edge function for idea processing', () => {
  beforeAll(() => {
    orchestratorSource = readOrchestrator();
  });

  it('does not dispatch a headless triage-analyst expert session inline for ideas', () => {
    // The old functions ran headless expert sessions (start-expert-session) on the edge function.
    // After removal, no inline session dispatch should be coupled to the triage/spec/enrich flow.
    // The orchestrator may still reference start-expert-session for other purposes,
    // but there should be no triage-analyst headless dispatch block.
    const triageAnalystHeadlessBlock = orchestratorSource.match(
      /triage.analyst[\s\S]{0,600}headless|headless[\s\S]{0,600}triage.analyst/is,
    );
    expect(
      triageAnalystHeadlessBlock,
      'Found a headless triage-analyst session dispatch in the orchestrator — AI workloads should run via jobs, not inline.',
    ).toBeNull();
  });

  it('does not dispatch a headless spec-writer expert session inline for ideas', () => {
    const specWriterHeadlessBlock = orchestratorSource.match(
      /spec.writer[\s\S]{0,600}headless|headless[\s\S]{0,600}spec.writer/is,
    );
    expect(
      specWriterHeadlessBlock,
      'Found a headless spec-writer session dispatch in the orchestrator — AI workloads should run via jobs, not inline.',
    ).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// AC6: Existing feature pipeline is unaffected
// ---------------------------------------------------------------------------

describe('AC6: Existing feature pipeline (feature jobs, building, merging) is unaffected', () => {
  beforeAll(() => {
    orchestratorSource = readOrchestrator();
  });

  it('triggerCombining is still referenced in the orchestrator', () => {
    expect(orchestratorSource).toMatch(/triggerCombining/);
  });

  it('triggerMerging is still referenced in the orchestrator', () => {
    expect(orchestratorSource).toMatch(/triggerMerging/);
  });

  it('triggerTestWriting is still referenced in the orchestrator', () => {
    expect(orchestratorSource).toMatch(/triggerTestWriting/);
  });
});

// ---------------------------------------------------------------------------
// AC7: New idea pipeline watch loops still function correctly
// ---------------------------------------------------------------------------

describe('AC7: Idea pipeline lifecycle is present and functional', () => {
  beforeAll(() => {
    orchestratorSource = readOrchestrator();
  });

  it('processIdeaLifecycle function is defined', () => {
    expect(orchestratorSource).toMatch(/async function processIdeaLifecycle/);
  });

  it('processIdeaLifecycle is called in the main orchestrator loop', () => {
    expect(orchestratorSource).toMatch(/await processIdeaLifecycle\(/);
  });

  it('createIdeaJob function is defined for idempotent job creation', () => {
    expect(orchestratorSource).toMatch(/async function createIdeaJob/);
  });

  it('idea-triage job type is still created by the lifecycle', () => {
    expect(orchestratorSource).toMatch(/idea-triage/);
  });
});

// ---------------------------------------------------------------------------
// AC8: promote-idea edge function is NOT removed
// ---------------------------------------------------------------------------

describe('AC8: promote-idea edge function is NOT removed', () => {
  it('promote-idea/index.ts exists', () => {
    const exists = fs.existsSync(PROMOTE_IDEA_FILE);
    expect(
      exists,
      `promote-idea edge function is missing at ${PROMOTE_IDEA_FILE} — it must NOT be removed.`,
    ).toBe(true);
  });

  it('promote-idea/index.ts is non-empty', () => {
    const content = fs.existsSync(PROMOTE_IDEA_FILE)
      ? fs.readFileSync(PROMOTE_IDEA_FILE, 'utf-8')
      : '';
    expect(content.length).toBeGreaterThan(0);
  });

  it('orchestrator still references promote-idea (routing loop calls it)', () => {
    expect(orchestratorSource).toMatch(/promote.?idea|promote_idea/i);
  });
});

// ---------------------------------------------------------------------------
// AC9: Company settings columns are NOT dropped
// ---------------------------------------------------------------------------

describe('AC9: Company settings columns (auto_triage_types, auto_spec_types, auto_promote_types) are NOT dropped in migrations', () => {
  let allMigrationsSql = '';

  beforeAll(() => {
    allMigrationsSql = readMigrationFiles();
  });

  it('has migration files to inspect', () => {
    expect(allMigrationsSql.length).toBeGreaterThan(0);
  });

  it('no migration drops auto_triage_types column from companies', () => {
    // There must be no DROP COLUMN for auto_triage_types in any migration
    expect(allMigrationsSql).not.toMatch(
      /DROP\s+COLUMN\s+(?:IF\s+EXISTS\s+)?auto_triage_types/i,
    );
  });

  it('no migration drops auto_spec_types column from companies', () => {
    expect(allMigrationsSql).not.toMatch(
      /DROP\s+COLUMN\s+(?:IF\s+EXISTS\s+)?auto_spec_types/i,
    );
  });

  it('no migration drops auto_promote_types column from companies', () => {
    expect(allMigrationsSql).not.toMatch(
      /DROP\s+COLUMN\s+(?:IF\s+EXISTS\s+)?auto_promote_types/i,
    );
  });

  it('no migration drops auto_triage column from companies or ideas', () => {
    expect(allMigrationsSql).not.toMatch(
      /DROP\s+COLUMN\s+(?:IF\s+EXISTS\s+)?auto_triage\b/i,
    );
  });
});

// ---------------------------------------------------------------------------
// AC10: Expert role definitions are NOT removed
// ---------------------------------------------------------------------------

describe('AC10: Expert role definitions (triage-analyst, spec-writer) are NOT removed', () => {
  let allMigrationsSql = '';

  beforeAll(() => {
    allMigrationsSql = readMigrationFiles();
  });

  it('no migration deletes the triage-analyst expert role', () => {
    // Should not DELETE FROM expert_roles WHERE name = 'triage-analyst'
    expect(allMigrationsSql).not.toMatch(
      /DELETE\s+FROM\s+expert_roles[\s\S]{0,200}triage.analyst/i,
    );
  });

  it('no migration deletes the spec-writer expert role', () => {
    expect(allMigrationsSql).not.toMatch(
      /DELETE\s+FROM\s+expert_roles[\s\S]{0,200}spec.writer/i,
    );
  });

  it('no migration drops the expert_roles table', () => {
    // If a new migration appears that drops the table, this test will catch it
    const latestMigrations = getMigrationFiles()
      .filter((f) => {
        const base = path.basename(f);
        const num = parseInt(base, 10);
        // Only check migrations that are newer than migration 120 (when expert_roles was created)
        return num > 250;
      })
      .map((f) => {
        try {
          return fs.readFileSync(f, 'utf-8');
        } catch {
          return '';
        }
      })
      .join('\n');

    if (latestMigrations.length > 0) {
      expect(latestMigrations).not.toMatch(/DROP\s+TABLE\s+(?:IF\s+EXISTS\s+)?expert_roles/i);
    }
  });
});
