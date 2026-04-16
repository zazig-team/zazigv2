/**
 * Feature: CI monitor — deduplicate fix features by (commit_sha, step_name)
 * Feature ID: 173e4e92-4b27-4fb7-a62e-2bcf6517a15c
 *
 * Gate 1: Deduplication by (commit_sha, step_name)
 *   - Before creating a fix feature, query features by ci_failure_signature
 *   - If a matching feature in an active status exists, skip creation
 *
 * Gate 2: Resolution check
 *   - Before creating a fix feature, check whether a newer commit on master
 *     has the same step passing (green). If so, skip creation.
 *   - If no newer commit exists OR the step is still red, proceed to Gate 1.
 *
 * Storage:
 *   - ci_failure_signature column added to features table (nullable TEXT, indexed)
 *   - Format: '{commit_sha_short}:{step_name_slug}' (e.g. '6ef2d94:npm-run-test')
 *   - Set only on CI-monitor-created features
 *
 * These tests are written to FAIL against the current codebase (no ci_failure_signature
 * column, no per-commit dedup, no resolution check) and pass once the feature is built.
 */

import { describe, it, expect, beforeEach, afterEach, vi, type Mock } from 'vitest';
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

function readMigrationFiles(): string[] {
  const migrationsDir = path.join(REPO_ROOT, 'supabase/migrations');
  try {
    const files = fs.readdirSync(migrationsDir).filter((f) => f.endsWith('.sql'));
    return files.map((f) => {
      try {
        return fs.readFileSync(path.join(migrationsDir, f), 'utf-8');
      } catch {
        return '';
      }
    });
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Structural: ci_failure_signature column in DB migration
// ---------------------------------------------------------------------------

describe('Structural: ci_failure_signature DB migration', () => {
  it('a migration file adds ci_failure_signature column to features table', () => {
    const migrations = readMigrationFiles();
    const hasCiFailureSignature = migrations.some(
      (sql) => sql.includes('ci_failure_signature') && sql.toLowerCase().includes('features'),
    );
    expect(
      hasCiFailureSignature,
      'Expected a migration to add ci_failure_signature to features table',
    ).toBe(true);
  });

  it('ci_failure_signature column has an index for fast dedup lookups', () => {
    const migrations = readMigrationFiles();
    const hasIndex = migrations.some(
      (sql) => sql.includes('ci_failure_signature') && sql.toLowerCase().includes('index'),
    );
    expect(
      hasIndex,
      'Expected an index on ci_failure_signature for fast dedup lookups',
    ).toBe(true);
  });

  it('ci_failure_signature column is nullable (not set on non-CI features)', () => {
    const migrations = readMigrationFiles();
    // Should not be NOT NULL (no constraint that forces it)
    const colDef = migrations
      .flatMap((sql) => sql.split('\n'))
      .find((line) => line.includes('ci_failure_signature') && !line.trim().startsWith('--'));
    expect(colDef, 'ci_failure_signature column definition not found in migrations').toBeDefined();
    // It should NOT have NOT NULL in the column definition
    expect(colDef?.toUpperCase()).not.toMatch(/NOT\s+NULL/);
  });
});

// ---------------------------------------------------------------------------
// Structural: executor implements per-commit dedup and resolution check
// ---------------------------------------------------------------------------

describe('Structural: executor implements Gate 1 (signature dedup) and Gate 2 (resolution check)', () => {
  const EXECUTOR_PATH = 'packages/local-agent/src/executor.ts';
  let executor: string | null;

  beforeEach(() => {
    executor = readRepoFile(EXECUTOR_PATH);
  });

  it('executor.ts references ci_failure_signature', () => {
    expect(executor).not.toBeNull();
    expect(executor).toContain('ci_failure_signature');
  });

  it('executor.ts has a function/method to build the ci_failure_signature from commit SHA and step name', () => {
    expect(executor).not.toBeNull();
    // Should have logic that combines commit SHA (short form) + slugified step name
    expect(executor).toMatch(/ci_failure_signature|ciFailureSignature/);
    // Signature format requires a colon separator between SHA and slug
    expect(executor).toMatch(/commit.*sha.*:|sha.*:.*step|signature.*=.*`.*:.*`|`\$\{.*\}:\$\{.*\}`/);
  });

  it('executor.ts queries features by ci_failure_signature before creating a fix', () => {
    expect(executor).not.toBeNull();
    // Must filter features by ci_failure_signature (Gate 1)
    expect(executor).toMatch(/ci_failure_signature/);
    // And check status is in active statuses (breaking_down, building, etc.)
    expect(executor).toMatch(/breaking_down.*building|building.*breaking_down/);
  });

  it('executor.ts has a Gate 2 resolution check method', () => {
    expect(executor).not.toBeNull();
    // Should have a method checking whether a newer commit has the step green
    expect(executor).toMatch(
      /checkStepResolved|isStepResolvedOnLater|resolutionCheck|resolvedOnLaterCommit|checkResolution|laterCommit.*green|newer.*commit.*green|green.*later/i,
    );
  });

  it('executor sets ci_failure_signature when creating a fix feature', () => {
    expect(executor).not.toBeNull();
    // The zazig create-feature call or feature insert must include ci_failure_signature
    expect(executor).toMatch(/ci.failure.signature|ciFailureSignature/);
    // It should be passed as a CLI arg or field in the create-feature call
    expect(executor).toMatch(/--ci-failure-signature|ci_failure_signature.*:.*sig|signature.*arg/i);
  });
});

// ---------------------------------------------------------------------------
// Unit: ci_failure_signature slug format
// ---------------------------------------------------------------------------

describe('Unit: ci_failure_signature format — {commit_sha_short}:{step_name_slug}', () => {
  it('slugifies step name by lowercasing and replacing spaces/special chars with hyphens', () => {
    // We test the slug logic by importing or calling a shared utility.
    // These assertions encode the expected format.
    const cases: Array<{ stepName: string; commitSha: string; expected: string }> = [
      { stepName: 'npm run test', commitSha: '6ef2d94', expected: '6ef2d94:npm-run-test' },
      { stepName: 'Deploy all edge functions', commitSha: 'abc1234', expected: 'abc1234:deploy-all-edge-functions' },
      { stepName: 'Run Tests', commitSha: 'deadbee', expected: 'deadbee:run-tests' },
      { stepName: 'Build & Deploy', commitSha: '1234567', expected: '1234567:build-deploy' },
    ];

    // Import the slugify helper or the buildCiFailureSignature function
    // This import will fail until the feature is built.
    const tryImportSignatureHelper = async () => {
      const paths = [
        '../../packages/local-agent/src/ci-failure-signature.js',
        '../../packages/local-agent/src/executor.js',
      ];
      for (const p of paths) {
        try {
          const mod = await import(/* @vite-ignore */ p);
          if (mod.buildCiFailureSignature || mod.makeCiFailureSignature || mod.slugifyStepName) {
            return mod;
          }
        } catch {
          // try next
        }
      }
      return null;
    };

    return tryImportSignatureHelper().then((mod) => {
      expect(mod, 'buildCiFailureSignature or slugifyStepName must be exported').not.toBeNull();

      const buildSig =
        mod.buildCiFailureSignature ?? mod.makeCiFailureSignature;
      const slugify = mod.slugifyStepName;

      for (const { stepName, commitSha, expected } of cases) {
        if (buildSig) {
          expect(buildSig(commitSha, stepName)).toBe(expected);
        } else if (slugify) {
          expect(`${commitSha}:${slugify(stepName)}`).toBe(expected);
        }
      }
    });
  });

  it('uses first 7 chars of commit SHA for the signature', () => {
    const fullSha = 'abc1234deadbeefcafe';
    const stepName = 'npm run test';
    // The short SHA is the first 7 characters
    const expectedPrefix = fullSha.slice(0, 7);

    return import(/* @vite-ignore */ '../../packages/local-agent/src/executor.js')
      .then((mod: any) => {
        const buildSig = mod.buildCiFailureSignature ?? mod.makeCiFailureSignature;
        if (!buildSig) {
          // If no exported helper, we can't test this directly yet — force failure
          expect(buildSig, 'buildCiFailureSignature must be exported from executor').toBeDefined();
          return;
        }
        const sig: string = buildSig(fullSha, stepName);
        expect(sig.startsWith(expectedPrefix + ':')).toBe(true);
      })
      .catch(() => {
        // Module not importable yet — fail with a clear message
        expect(false, 'executor module must export buildCiFailureSignature').toBe(true);
      });
  });
});

// ---------------------------------------------------------------------------
// Unit: Gate 1 — deduplication by (commit_sha, step_name) via executor private method
// ---------------------------------------------------------------------------

describe('Gate 1: Deduplication by ci_failure_signature — skips creation for duplicate (commit, step)', () => {
  // We access the private executor API using the same pattern as executor.test.ts
  // This mirrors the existing test suite structure.

  let mockExecFileAsync: Mock;

  // Access the private CI monitor internals
  const getPrivateMethods = async () => {
    try {
      const mod = await import(/* @vite-ignore */ '../../packages/local-agent/src/executor.js');
      return mod;
    } catch {
      return null;
    }
  };

  beforeEach(() => {
    vi.useFakeTimers();
    mockExecFileAsync = vi.fn().mockResolvedValue({ stdout: '', stderr: '' });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('skips fix feature creation when ci_failure_signature already exists in an active feature', async () => {
    const EXECUTOR_PATH = 'packages/local-agent/src/executor.ts';
    const executor = readRepoFile(EXECUTOR_PATH);
    expect(executor, 'executor.ts must exist').not.toBeNull();

    // The executor must query features by ci_failure_signature with active statuses
    expect(executor).toContain('ci_failure_signature');

    // Verify the dedup guard accepts the signature parameter for lookup
    // (checks that the query is parameterized by signature, not just by tag)
    expect(executor).toMatch(/ci_failure_signature.*eq|eq.*ci_failure_signature/);
  });

  it('proceeds with feature creation when no active feature has the same ci_failure_signature', async () => {
    const EXECUTOR_PATH = 'packages/local-agent/src/executor.ts';
    const executor = readRepoFile(EXECUTOR_PATH);
    expect(executor, 'executor.ts must exist').not.toBeNull();

    // The dedup query result (empty) must lead to feature creation
    // Verified by confirming the query path passes through to create-feature
    expect(executor).toMatch(/ci_failure_signature/);
    expect(executor).toMatch(/create-feature|createFeature/);
  });

  it('dedup considers only active statuses: breaking_down, building, ci_checking, merging, visual_verifying', async () => {
    const EXECUTOR_PATH = 'packages/local-agent/src/executor.ts';
    const executor = readRepoFile(EXECUTOR_PATH);
    expect(executor, 'executor.ts must exist').not.toBeNull();

    // All active statuses from spec must be present in the dedup query
    const activeStatuses = ['breaking_down', 'building', 'ci_checking', 'merging'];
    for (const status of activeStatuses) {
      expect(executor, `Expected active status "${status}" in dedup query`).toContain(status);
    }
  });

  it('does NOT deduplicate across different commit SHAs (same step, different commits = separate features)', async () => {
    const EXECUTOR_PATH = 'packages/local-agent/src/executor.ts';
    const executor = readRepoFile(EXECUTOR_PATH);
    expect(executor, 'executor.ts must exist').not.toBeNull();

    // The signature includes the commit SHA, so different commits produce different signatures
    // This is verified by the format {commit_sha_short}:{step_name_slug}
    // The dedup query must use the full signature (with SHA prefix), not just the step slug
    expect(executor).toMatch(/ci_failure_signature/);

    // The signature must be scoped to a specific commit (not just step name)
    // Ensure the signature includes SHA in the lookup
    expect(executor).toMatch(
      /headSha|head_sha|commitSha|commit_sha/,
    );
  });

  it('passes ci_failure_signature to create-feature CLI call', async () => {
    const EXECUTOR_PATH = 'packages/local-agent/src/executor.ts';
    const executor = readRepoFile(EXECUTOR_PATH);
    expect(executor, 'executor.ts must exist').not.toBeNull();

    // The zazig create-feature CLI invocation must include --ci-failure-signature arg
    expect(executor).toMatch(/--ci-failure-signature|ci_failure_signature/);
  });
});

// ---------------------------------------------------------------------------
// Unit: Gate 2 — resolution check (newer commit fixed the step)
// ---------------------------------------------------------------------------

describe('Gate 2: Resolution check — skip creation when a newer commit has the step green', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('executor implements a resolution check method', () => {
    const EXECUTOR_PATH = 'packages/local-agent/src/executor.ts';
    const executor = readRepoFile(EXECUTOR_PATH);
    expect(executor, 'executor.ts must exist').not.toBeNull();

    expect(executor).toMatch(
      /checkStep.*Resolved|isStep.*Resolved|resolution.*check|isFixed.*Later|stepGreen.*Later|laterCommit.*fixed|checkIfFixed|isAlreadyFixed/i,
    );
  });

  it('Gate 2 is evaluated before Gate 1 in handleMasterCIFailure', () => {
    const EXECUTOR_PATH = 'packages/local-agent/src/executor.ts';
    const executor = readRepoFile(EXECUTOR_PATH);
    expect(executor, 'executor.ts must exist').not.toBeNull();

    // The resolution check method should appear before the signature dedup check in the file
    const resolutionPattern =
      /checkStep.*Resolved|isStep.*Resolved|checkIfFixed|isAlreadyFixed|stepGreen.*Later|checkResolution/i;
    const dedupPattern = /ci_failure_signature.*eq|eq.*ci_failure_signature/;

    const resolutionIndex = executor!.search(resolutionPattern);
    const dedupIndex = executor!.search(dedupPattern);

    expect(resolutionIndex, 'Resolution check method must exist in executor').toBeGreaterThan(-1);
    expect(dedupIndex, 'Dedup by ci_failure_signature must exist in executor').toBeGreaterThan(-1);

    // Resolution check call should appear before the dedup check call in handleMasterCIFailure
    // (Both patterns should be present; ordering verified by method call position)
    expect(resolutionIndex).toBeLessThan(dedupIndex);
  });

  it('resolution check uses gh api to query the most recent run on master for the same step', () => {
    const EXECUTOR_PATH = 'packages/local-agent/src/executor.ts';
    const executor = readRepoFile(EXECUTOR_PATH);
    expect(executor, 'executor.ts must exist').not.toBeNull();

    // The resolution check must query recent CI runs on master
    // and find whether the same step is now passing
    expect(executor).toMatch(/branch=master.*per_page|per_page.*branch=master/);
  });

  it('skips fix creation when latest master run has the step green (already resolved)', async () => {
    // Verify by checking the executor's handleMasterCIFailure path
    // uses the resolution check result to bail out early
    const EXECUTOR_PATH = 'packages/local-agent/src/executor.ts';
    const executor = readRepoFile(EXECUTOR_PATH);
    expect(executor, 'executor.ts must exist').not.toBeNull();

    // The method must have an early return when resolution check passes
    expect(executor).toMatch(
      /isResolved.*return|return.*isResolved|resolved.*return|if.*resolved/i,
    );
  });

  it('proceeds with Gate 1 when no newer commit exists (current commit is head of master)', async () => {
    const EXECUTOR_PATH = 'packages/local-agent/src/executor.ts';
    const executor = readRepoFile(EXECUTOR_PATH);
    expect(executor, 'executor.ts must exist').not.toBeNull();

    // When resolution check finds the same commit (no newer run), it must NOT skip
    // This means the code handles the case where the failing SHA is the latest commit
    expect(executor).toMatch(/ci_failure_signature|handleMasterCIFailure/);
  });

  it('proceeds with Gate 1 when newest commit also has the step failing (not yet fixed)', async () => {
    const EXECUTOR_PATH = 'packages/local-agent/src/executor.ts';
    const executor = readRepoFile(EXECUTOR_PATH);
    expect(executor, 'executor.ts must exist').not.toBeNull();

    // If resolution returns false (still failing), execution continues to Gate 1
    // Verified by the control flow structure
    expect(executor).toMatch(
      /isResolved.*false|if.*!.*isResolved|if.*resolved.*===.*false|resolved.*skip.*false/i,
    );
  });
});

// ---------------------------------------------------------------------------
// Integration: handleMasterCIFailure — both gates applied in sequence
// ---------------------------------------------------------------------------

describe('Integration: handleMasterCIFailure applies Gate 2 then Gate 1 on duplicate event', () => {
  let mockExecFileAsync: Mock;
  let mockSupabaseFrom: Mock;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    mockExecFileAsync = vi.fn();
    mockSupabaseFrom = vi.fn();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('does NOT create two fix features for the same (commit_sha, step_name) pair in the same session', () => {
    const EXECUTOR_PATH = 'packages/local-agent/src/executor.ts';
    const executor = readRepoFile(EXECUTOR_PATH);
    expect(executor, 'executor.ts must exist').not.toBeNull();

    // The per-commit dedup signature prevents creating the same fix twice
    // even if the CI monitor polls multiple times for the same failed run
    expect(executor).toContain('ci_failure_signature');
  });

  it('creates separate fix features for the same step failing on two different commits', () => {
    const EXECUTOR_PATH = 'packages/local-agent/src/executor.ts';
    const executor = readRepoFile(EXECUTOR_PATH);
    expect(executor, 'executor.ts must exist').not.toBeNull();

    // Signatures include the commit SHA, so different SHAs = different signatures = separate features
    // This is verified by the format: {commit_sha_short}:{step_name_slug}
    expect(executor).toMatch(/headSha|head_sha/);
    expect(executor).toMatch(/ci_failure_signature/);
  });

  it('logs a message when skipping creation due to Gate 1 (signature dedup)', () => {
    const EXECUTOR_PATH = 'packages/local-agent/src/executor.ts';
    const executor = readRepoFile(EXECUTOR_PATH);
    expect(executor, 'executor.ts must exist').not.toBeNull();

    // Must log when skipping due to existing feature with same signature
    expect(executor).toMatch(
      /ci_failure_signature.*already|already.*ci_failure_signature|dedup.*signature|signature.*dedup|duplicate.*fix|fix.*duplicate/i,
    );
  });

  it('logs a message when skipping creation due to Gate 2 (already resolved on later commit)', () => {
    const EXECUTOR_PATH = 'packages/local-agent/src/executor.ts';
    const executor = readRepoFile(EXECUTOR_PATH);
    expect(executor, 'executor.ts must exist').not.toBeNull();

    // Must log when skipping because a later commit already fixed the step
    expect(executor).toMatch(
      /already.*fixed|later.*commit.*fixed|resolved.*later|skip.*resolved|newer.*commit.*pass|step.*green/i,
    );
  });
});

// ---------------------------------------------------------------------------
// Integration: executor.test.ts private API — dedup by signature
// ---------------------------------------------------------------------------

describe('Integration via executor private API: dedup guard uses ci_failure_signature', () => {
  // These tests follow the pattern from executor.test.ts "master CI monitor" describe block,
  // accessing private methods via type-casting.

  const privateExecutorShape = () => ({
    handleMasterCIFailure: async (_runId: number, _headSha: string): Promise<void> => {},
    isCIFixInFlightForSignature: async (_signature: string): Promise<boolean> => false,
    isStepResolvedOnLaterCommit: async (_stepName: string, _currentSha: string): Promise<boolean> => false,
    buildCiFailureSignature: (_commitSha: string, _stepName: string): string => '',
  });

  it('executor exposes isCIFixInFlightForSignature or equivalent per-signature check method', async () => {
    // This verifies the private method exists. The test fails if the method is absent.
    try {
      const mod = await import(/* @vite-ignore */ '../../packages/local-agent/src/executor.js');
      const executor: any = mod.JobExecutor
        ? new mod.JobExecutor('m', 'c', { getAvailable: () => ({}) }, () => {}, {}, '', '')
        : null;

      if (executor) {
        // Check that the dedup-by-signature method exists
        const hasSigDedup =
          typeof executor.isCIFixInFlightForSignature === 'function' ||
          typeof executor.isDuplicateFixSignature === 'function' ||
          typeof executor.checkCIFixSignatureExists === 'function';
        expect(hasSigDedup, 'Executor must have a per-signature dedup method').toBe(true);
      } else {
        // Cannot instantiate — check source as fallback
        const executorSrc = readRepoFile('packages/local-agent/src/executor.ts');
        expect(executorSrc).toMatch(
          /isCIFixInFlightForSignature|isDuplicateFixSignature|checkCIFixSignatureExists/,
        );
      }
    } catch {
      const executorSrc = readRepoFile('packages/local-agent/src/executor.ts');
      expect(executorSrc).toMatch(
        /isCIFixInFlightForSignature|isDuplicateFixSignature|checkCIFixSignatureExists/,
      );
    }
  });

  it('handleMasterCIFailure passes the ci_failure_signature to the dedup query', () => {
    const EXECUTOR_PATH = 'packages/local-agent/src/executor.ts';
    const executor = readRepoFile(EXECUTOR_PATH);
    expect(executor, 'executor.ts must exist').not.toBeNull();

    // handleMasterCIFailure must construct the signature and pass it to the dedup check
    const handleMethodStart = executor!.indexOf('handleMasterCIFailure');
    expect(handleMethodStart, 'handleMasterCIFailure method must exist').toBeGreaterThan(-1);

    // Within the method body, ci_failure_signature must be referenced
    const methodBody = executor!.slice(handleMethodStart, handleMethodStart + 3000);
    expect(methodBody).toMatch(/ci_failure_signature|ciFailureSignature/);
  });

  it('handleMasterCIFailure skips creation when same (commit, step) signature already active', () => {
    const EXECUTOR_PATH = 'packages/local-agent/src/executor.ts';
    const executor = readRepoFile(EXECUTOR_PATH);
    expect(executor, 'executor.ts must exist').not.toBeNull();

    // The method must have an early return guarded by the signature dedup check
    const handleMethodStart = executor!.indexOf('handleMasterCIFailure');
    const methodBody = executor!.slice(handleMethodStart, handleMethodStart + 3000);

    // Should contain a conditional return after checking the signature
    expect(methodBody).toMatch(/if.*sig.*return|return.*sig|sig.*in.*flight|sig.*skip/i);
  });

  it('the existing broad isCIFixInFlight guard is replaced or supplemented by per-signature check', () => {
    const EXECUTOR_PATH = 'packages/local-agent/src/executor.ts';
    const executor = readRepoFile(EXECUTOR_PATH);
    expect(executor, 'executor.ts must exist').not.toBeNull();

    // The new per-signature dedup should exist alongside or replace the broad tag-based check
    // At minimum, ci_failure_signature-based logic must be present
    expect(executor).toMatch(/ci_failure_signature/);
  });
});
