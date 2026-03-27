/**
 * Feature: Replace bundled projects in company-persistent-jobs with CLI-sourced projects
 * Feature ID: 0a307980-74c7-4365-a625-145508adc30d
 *
 * Structural tests (static source-code checks) covering:
 * AC4 - Edge function response no longer contains projects in each job object
 * AC5 - CLAUDE.md prompt sections still present in prompt_stack_minus_skills
 * AC1/AC2 - Daemon uses CLI to load projects (not edge function response)
 * AC5 (dead code) - fetchPersistentAgentDefinitions returns { jobs } only
 * FC1 - Daemon does not crash if zazig CLI fails (graceful fallback)
 *
 * These tests are written to FAIL against the current codebase and pass once
 * the feature is implemented.
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

// ---------------------------------------------------------------------------
// AC4: Edge function must NOT include `projects` in the per-job return object
// ---------------------------------------------------------------------------

describe('AC4: Edge function does not bundle projects into each job object', () => {
  const EDGE_FN_PATH = 'supabase/functions/company-persistent-jobs/index.ts';
  let edgeFn: string | null;

  beforeEach(() => {
    edgeFn = readRepoFile(EDGE_FN_PATH);
  });

  it('edge function file exists', () => {
    expect(edgeFn).not.toBeNull();
  });

  it('does not include projects in the per-job return object', () => {
    expect(edgeFn).not.toBeNull();
    // The return object inside the map() must not contain `projects:`
    // The DB query variable is `projects` — we check the return shape lacks it
    expect(edgeFn).not.toMatch(/return\s*\{[^}]*\bprojects\s*:/);
  });

  it('does not pass raw projects array directly into job return object', () => {
    expect(edgeFn).not.toBeNull();
    // This pattern is the old line 186: `projects: projects ?? []`
    expect(edgeFn).not.toMatch(/projects\s*:\s*projects/);
  });
});

// ---------------------------------------------------------------------------
// AC5: CLAUDE.md prompt sections still present (projects DB query kept)
// ---------------------------------------------------------------------------

describe('AC5: Edge function still builds CLAUDE.md prompt sections from DB', () => {
  const EDGE_FN_PATH = 'supabase/functions/company-persistent-jobs/index.ts';
  let edgeFn: string | null;

  beforeEach(() => {
    edgeFn = readRepoFile(EDGE_FN_PATH);
  });

  it('still queries projects from the database', () => {
    expect(edgeFn).not.toBeNull();
    // The DB query for building prompts must still be present
    expect(edgeFn).toMatch(/\.from\s*\(\s*["']projects["']\s*\)/);
  });

  it('still builds projectLines for the prompt', () => {
    expect(edgeFn).not.toBeNull();
    expect(edgeFn).toContain('projectLines');
  });

  it('still builds repoLines for the prompt', () => {
    expect(edgeFn).not.toBeNull();
    expect(edgeFn).toContain('repoLines');
  });

  it('still includes prompt sections in prompt_stack_minus_skills', () => {
    expect(edgeFn).not.toBeNull();
    expect(edgeFn).toContain('prompt_stack_minus_skills');
    // Prompt builder must still reference projectLines or repoLines when constructing parts
    expect(edgeFn).toMatch(/projectLines|repoLines/);
  });
});

// ---------------------------------------------------------------------------
// Dead code removal: fetchPersistentAgentDefinitions returns { jobs } only
// ---------------------------------------------------------------------------

describe('Dead code: fetchPersistentAgentDefinitions no longer extracts companyProjects', () => {
  const INDEX_PATH = 'packages/local-agent/src/index.ts';
  let index: string | null;

  beforeEach(() => {
    index = readRepoFile(INDEX_PATH);
  });

  it('index.ts exists', () => {
    expect(index).not.toBeNull();
  });

  it('fetchPersistentAgentDefinitions return type is { jobs } only (no companyProjects)', () => {
    expect(index).not.toBeNull();
    // Old return type included companyProjects
    expect(index).not.toMatch(/Promise<\s*\{[^}]*companyProjects/);
  });

  it('does not parse company_projects / companyProjects / projects from edge function body', () => {
    expect(index).not.toBeNull();
    // The multi-alias extraction block for projects is gone
    expect(index).not.toMatch(/body\[["']company_projects["']\]/);
    expect(index).not.toMatch(/body\[["']companyProjects["']\]/);
  });

  it('fetchPersistentAgentDefinitions does not push to a companyProjects array', () => {
    expect(index).not.toBeNull();
    // The loop that built companyProjects from the edge function response is gone
    expect(index).not.toMatch(/companyProjects\.push/);
  });

  it('fetchPersistentAgentDefinitions return statement yields only jobs', () => {
    expect(index).not.toBeNull();
    // The old return had companyProjects in the tuple — must be gone
    // The function should return { jobs } or just jobs array
    expect(index).not.toMatch(/return\s*\{\s*jobs[^}]*companyProjects/);
  });
});

// ---------------------------------------------------------------------------
// AC1/AC2: Daemon loads projects from zazig CLI, not from edge function
// ---------------------------------------------------------------------------

describe('AC1/AC2: Daemon sources projects from zazig CLI', () => {
  const INDEX_PATH = 'packages/local-agent/src/index.ts';
  let index: string | null;

  beforeEach(() => {
    index = readRepoFile(INDEX_PATH);
  });

  it('calls zazig projects CLI with --company flag', () => {
    expect(index).not.toBeNull();
    // Must invoke the zazig binary with "projects" subcommand and --company
    expect(index).toMatch(/zazig.*projects|projects.*zazig/);
    expect(index).toMatch(/--company/);
  });

  it('uses execFileSync or spawnSync to call the CLI (not exec)', () => {
    expect(index).not.toBeNull();
    // Synchronous exec is preferred for startup blocking; async also acceptable
    expect(index).toMatch(/execFileSync|spawnSync|execSync|execFile|spawn/);
  });

  it('parses the CLI JSON output for projects', () => {
    expect(index).not.toBeNull();
    // Must parse JSON from CLI stdout
    expect(index).toMatch(/JSON\.parse/);
  });

  it('logs "Discovered N project repo(s)" on startup', () => {
    expect(index).not.toBeNull();
    expect(index).toMatch(/Discovered.*project.*repo/);
  });

  it('does not destructure companyProjects from fetchPersistentAgentDefinitions', () => {
    expect(index).not.toBeNull();
    // Old: const { jobs, companyProjects } = await fetchPersistentAgentDefinitions(...)
    expect(index).not.toMatch(/const\s*\{\s*jobs\s*,\s*companyProjects\s*\}/);
    expect(index).not.toMatch(/const\s*\{\s*companyProjects\s*,\s*jobs\s*\}/);
  });
});

// ---------------------------------------------------------------------------
// FC1: Error handling — daemon must NOT crash if zazig CLI fails
// ---------------------------------------------------------------------------

describe('FC1: CLI failure handling — warn and continue with empty projects', () => {
  const INDEX_PATH = 'packages/local-agent/src/index.ts';
  let index: string | null;

  beforeEach(() => {
    index = readRepoFile(INDEX_PATH);
  });

  it('wraps zazig CLI call in a try/catch', () => {
    expect(index).not.toBeNull();
    // Must catch errors from the CLI invocation
    expect(index).toMatch(/try[\s\S]{0,200}zazig|zazig[\s\S]{0,200}catch/);
  });

  it('logs a warning when CLI fails (does not throw)', () => {
    expect(index).not.toBeNull();
    // On error: log warning with the error message
    expect(index).toMatch(/console\.warn[\s\S]{0,100}zazig|warn.*zazig.*project|warn.*project.*cli/i);
  });

  it('returns or falls back to empty projects array on CLI failure', () => {
    expect(index).not.toBeNull();
    // Fallback to [] when CLI fails
    expect(index).toMatch(/\[\s*\]/);
  });
});
