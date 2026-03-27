/**
 * Feature: Project Rules — automated learning from CI failures
 *
 * Tests for AC4 (code job injection), AC5 (combine job injection),
 * AC6 (cross-project isolation), AC7 (omit empty project_rules),
 * and AC10 (rule available for next job after creation).
 *
 * These tests verify that the orchestrator / pipeline-utils query project rules
 * and inject them into job context at dispatch time.
 *
 * Tests are written to FAIL against the current codebase and pass once
 * the feature is implemented.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function readRepoFile(relPath: string): string | null {
  const fullPath = path.join(REPO_ROOT, relPath);
  try {
    return fs.readFileSync(fullPath, 'utf-8');
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// AC4 & AC5: Orchestrator rule injection at job dispatch
// ---------------------------------------------------------------------------

describe('AC4/AC5: Orchestrator queries project_rules and injects into job context', () => {
  const PIPELINE_UTILS_PATH = 'supabase/functions/_shared/pipeline-utils.ts';
  const ORCHESTRATOR_PATH = 'supabase/functions/orchestrator/index.ts';

  let pipelineUtils: string | null;
  let orchestrator: string | null;

  beforeAll(() => {
    pipelineUtils = readRepoFile(PIPELINE_UTILS_PATH);
    orchestrator = readRepoFile(ORCHESTRATOR_PATH);
  });

  it('pipeline-utils or orchestrator queries project_rules table', () => {
    const combinedSource = (pipelineUtils ?? '') + (orchestrator ?? '');
    expect(combinedSource).toMatch(/project_rules/);
  });

  it('rule query filters by project_id', () => {
    const combinedSource = (pipelineUtils ?? '') + (orchestrator ?? '');
    // Should query: WHERE project_id = ... AND <job_type> = ANY(applies_to)
    expect(combinedSource).toMatch(/project_rules/);
    expect(combinedSource).toMatch(/project_id/);
  });

  it('rule query filters applies_to by job type', () => {
    const combinedSource = (pipelineUtils ?? '') + (orchestrator ?? '');
    // Should check applies_to contains the job_type
    expect(combinedSource).toMatch(/applies_to/);
    expect(combinedSource).toMatch(/ANY\(|\.contains\(|@>/i);
  });

  it('triggerTestWriting injects project_rules into the test job context', () => {
    // The test job context JSON should include project_rules when rules match
    expect(pipelineUtils).toMatch(/triggerTestWriting/i);
    // After implementation: context should include project_rules field
    expect(pipelineUtils).toMatch(/project_rules/);
  });

  it('triggerCombining injects project_rules into the combine job context', () => {
    // The combine job context JSON should include project_rules when rules match
    expect(pipelineUtils).toMatch(/triggerCombining/i);
    expect(pipelineUtils).toMatch(/project_rules/);
  });

  it('code job dispatch injects project_rules into the code job context', () => {
    // When code jobs are dispatched, project_rules should be injected
    const combinedSource = (pipelineUtils ?? '') + (orchestrator ?? '');
    expect(combinedSource).toMatch(/project_rules/);
    // Should specifically inject for code job type
    expect(combinedSource).toMatch(/code.*project_rules|project_rules.*code/is);
  });

  it('injected project_rules is a string array in the context JSON', () => {
    const combinedSource = (pipelineUtils ?? '') + (orchestrator ?? '');
    // Should append project_rules array to context — look for the pattern
    expect(combinedSource).toMatch(/project_rules.*\[|"project_rules"/);
  });
});

// ---------------------------------------------------------------------------
// AC6: Rules from other projects are NOT injected
// ---------------------------------------------------------------------------

describe('AC6: Rules are scoped to the job project_id — no cross-project leakage', () => {
  const PIPELINE_UTILS_PATH = 'supabase/functions/_shared/pipeline-utils.ts';
  const ORCHESTRATOR_PATH = 'supabase/functions/orchestrator/index.ts';

  let pipelineUtils: string | null;
  let orchestrator: string | null;

  beforeAll(() => {
    pipelineUtils = readRepoFile(PIPELINE_UTILS_PATH);
    orchestrator = readRepoFile(ORCHESTRATOR_PATH);
  });

  it('project_rules query uses project_id equality filter (not in-filter or no filter)', () => {
    const combinedSource = (pipelineUtils ?? '') + (orchestrator ?? '');
    // The WHERE clause must scope to a single project_id, not allow multiple
    // Pattern: .eq("project_id", ...) or WHERE project_id = $1
    expect(combinedSource).toMatch(
      /\.eq\(["']project_id["']|project_id\s*=|\$1.*project_id|project_id.*\$1/i,
    );
  });

  it('project_id used for rule lookup matches the job project_id, not company_id', () => {
    const combinedSource = (pipelineUtils ?? '') + (orchestrator ?? '');
    // The variable used to query rules should be project_id, not company_id
    // This ensures rules are truly project-scoped
    expect(combinedSource).toMatch(/project_rules/);
    // Verify no accidental company-wide query
    expect(combinedSource).not.toMatch(
      /FROM project_rules WHERE company_id/i,
    );
  });
});

// ---------------------------------------------------------------------------
// AC7: No project_rules field when no rules match
// ---------------------------------------------------------------------------

describe('AC7: project_rules field is omitted from context when no rules match', () => {
  const PIPELINE_UTILS_PATH = 'supabase/functions/_shared/pipeline-utils.ts';
  const ORCHESTRATOR_PATH = 'supabase/functions/orchestrator/index.ts';

  let pipelineUtils: string | null;
  let orchestrator: string | null;

  beforeAll(() => {
    pipelineUtils = readRepoFile(PIPELINE_UTILS_PATH);
    orchestrator = readRepoFile(ORCHESTRATOR_PATH);
  });

  it('implementation guards against injecting an empty project_rules array', () => {
    const combinedSource = (pipelineUtils ?? '') + (orchestrator ?? '');
    // Should have a length check or conditional to avoid injecting empty array
    // Patterns: rules.length > 0, if (rules), rules && rules.length
    expect(combinedSource).toMatch(
      /project_rules.*length|length.*project_rules|rules\.length|rules &&|if\s*\(rules\)/i,
    );
  });

  it('implementation uses spread or conditional assignment for project_rules in context', () => {
    const combinedSource = (pipelineUtils ?? '') + (orchestrator ?? '');
    // Should conditionally include project_rules only when non-empty
    // Patterns like: ...(rules.length > 0 ? { project_rules: rules } : {})
    //           or:  if (rules.length) context.project_rules = rules
    expect(combinedSource).toMatch(
      /project_rules.*rules|rules.*project_rules/i,
    );
  });
});

// ---------------------------------------------------------------------------
// AC10: Rule created during a job is available for the next job
// ---------------------------------------------------------------------------

describe('AC10: Rule created via create_project_rule is available for subsequent jobs', () => {
  it('create-project-rule edge function inserts into project_rules immediately (no caching delay)', () => {
    const fnPath = path.join(
      REPO_ROOT,
      'supabase/functions/create-project-rule/index.ts',
    );
    let content: string | null = null;
    try {
      content = fs.readFileSync(fnPath, 'utf-8');
    } catch {
      // Will be caught by the assertion below
    }
    expect(content).not.toBeNull();
    // Direct insert — no deferred write, no queue
    expect(content).toMatch(/\.insert\(/i);
    // Should NOT use any async queue or batch pattern
    expect(content).not.toMatch(/queue|batch|defer|setTimeout/i);
  });

  it('orchestrator queries project_rules on every job dispatch (no stale cache)', () => {
    const pipelineUtils = readRepoFile(
      'supabase/functions/_shared/pipeline-utils.ts',
    );
    const orchestrator = readRepoFile(
      'supabase/functions/orchestrator/index.ts',
    );
    const combinedSource = (pipelineUtils ?? '') + (orchestrator ?? '');
    // Should query DB directly each time — no in-memory cache of rules
    expect(combinedSource).toMatch(/project_rules/);
    // No module-level cache variable for rules
    expect(combinedSource).not.toMatch(
      /const\s+cachedRules|let\s+rulesCache|projectRulesCache/i,
    );
  });

  it('end-to-end: rule inserted by create-project-rule would be returned by orchestrator query for same project', () => {
    // This test validates the data model: the same project_id is used for both
    // insert (by create-project-rule) and lookup (by orchestrator at dispatch)
    const fnPath = path.join(
      REPO_ROOT,
      'supabase/functions/create-project-rule/index.ts',
    );
    const pipelineUtils = readRepoFile(
      'supabase/functions/_shared/pipeline-utils.ts',
    );
    const orchestrator = readRepoFile(
      'supabase/functions/orchestrator/index.ts',
    );

    let edgeFn: string | null = null;
    try {
      edgeFn = fs.readFileSync(fnPath, 'utf-8');
    } catch {
      // Will fail on assertion
    }

    expect(edgeFn).not.toBeNull();
    const combinedOrchestrator = (pipelineUtils ?? '') + (orchestrator ?? '');

    // Edge function inserts with project_id
    expect(edgeFn).toContain('project_id');
    // Orchestrator queries with project_id
    expect(combinedOrchestrator).toMatch(/project_rules/);
    expect(combinedOrchestrator).toMatch(/project_id/);
  });
});
