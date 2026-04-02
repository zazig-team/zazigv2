/**
 * Feature: Expert Session Liveness: tmux as Source of Truth
 * Tests for: Orchestrator — uses 'run' instead of 'running' in active status set
 *
 * AC1: No expert session in the DB ever has status completed or running after migration
 * (Orchestrator must not consider 'running' as active; it must use 'run')
 *
 * Static analysis of supabase/functions/orchestrator/index.ts
 * Written to FAIL against the current codebase; passes once the feature is built.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');
const ORCHESTRATOR = 'supabase/functions/orchestrator/index.ts';

function readRepoFile(relPath: string): string | null {
  const fullPath = path.join(REPO_ROOT, relPath);
  try {
    return fs.readFileSync(fullPath, 'utf-8');
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Orchestrator: ACTIVE_SPEC_SESSION_STATUSES uses 'run', not 'running'
// ---------------------------------------------------------------------------

describe('Orchestrator: ACTIVE_SPEC_SESSION_STATUSES updated to use run', () => {
  let content: string | null;

  beforeAll(() => {
    content = readRepoFile(ORCHESTRATOR);
  });

  it('supabase/functions/orchestrator/index.ts exists', () => {
    expect(content, `File not found: ${ORCHESTRATOR}`).not.toBeNull();
  });

  it('ACTIVE_SPEC_SESSION_STATUSES constant is defined', () => {
    expect(content).toMatch(/ACTIVE_SPEC_SESSION_STATUSES/);
  });

  it("ACTIVE_SPEC_SESSION_STATUSES includes 'run'", () => {
    // The constant must include the new 'run' status
    const match = content?.match(/ACTIVE_SPEC_SESSION_STATUSES[\s\S]{0,300}/)?.[0] ?? '';
    expect(match).toMatch(/'run'|"run"|`run`/);
  });

  it("ACTIVE_SPEC_SESSION_STATUSES does NOT include 'running'", () => {
    // 'running' must be removed from the active status list
    const match = content?.match(/ACTIVE_SPEC_SESSION_STATUSES[\s\S]{0,300}/)?.[0] ?? '';
    expect(match).not.toMatch(/'running'|"running"|`running`/);
  });
});

// ---------------------------------------------------------------------------
// Orchestrator: stale references to executing and active removed
// ---------------------------------------------------------------------------

describe('Orchestrator: stale status references cleaned up', () => {
  let content: string | null;

  beforeAll(() => {
    content = readRepoFile(ORCHESTRATOR);
  });

  it("does not use 'executing' as an expert session status value", () => {
    // 'executing' was a stale status that should be removed
    expect(content).not.toMatch(/status\s*[:=,]\s*['"`]executing['"`]/);
  });

  it("does not use 'active' as an expert session status value", () => {
    // 'active' was another stale status reference
    expect(content).not.toMatch(/status\s*[:=,]\s*['"`]active['"`]/);
  });
});

// ---------------------------------------------------------------------------
// Orchestrator: expert session status filtering uses new run-based values
// ---------------------------------------------------------------------------

describe('Orchestrator: expert session queries use run-based status set', () => {
  let content: string | null;

  beforeAll(() => {
    content = readRepoFile(ORCHESTRATOR);
  });

  it("orchestrator queries for expert sessions include 'run' in the filter", () => {
    // Any filter or query on expert session status must include 'run'
    expect(content).toMatch(/'run'|"run"|`run`/);
  });

  it("orchestrator does NOT filter expert sessions by 'running' status", () => {
    // Any expert session status filter must NOT include 'running'
    // Scan for status array literals that contain 'running' near expert context
    const expertSection = content?.match(/expert[\s\S]{0,2000}/i)?.[0] ?? '';
    expect(expertSection).not.toMatch(/'running'|"running"|`running`/);
  });
});
