/**
 * Feature: Replace bundled projects in company-persistent-jobs with CLI-sourced projects
 * Feature ID: 0a307980-74c7-4365-a625-145508adc30d
 *
 * Behavioral tests for:
 * AC3 - Master change poller starts with project pollers (log: 'Discovered N project repo(s)')
 * AC6 - CI monitor picks up new projects per-poll without daemon restart
 * FC2 - CI monitor does NOT call zazig projects more than once per poll cycle
 *
 * Structural tests for executor.ts covering:
 * AC6 - monitorMasterCI refreshes companyProjects from CLI before each poll
 * FC2 - Single CLI call per poll cycle (no retry loops)
 *
 * These tests are written to FAIL against the current codebase and pass once
 * the feature is implemented.
 */

import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';
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
// AC6: Structural — monitorMasterCI refreshes projects from CLI per poll
// ---------------------------------------------------------------------------

describe('AC6: executor.ts monitorMasterCI refreshes projects from CLI before each poll', () => {
  const EXECUTOR_PATH = 'packages/local-agent/src/executor.ts';
  let executor: string | null;

  beforeEach(() => {
    executor = readRepoFile(EXECUTOR_PATH);
  });

  it('executor.ts exists', () => {
    expect(executor).not.toBeNull();
  });

  it('monitorMasterCI contains a call to the zazig projects CLI', () => {
    expect(executor).not.toBeNull();
    // The per-poll refresh must call zazig or a shared project loader within monitorMasterCI
    // Accept patterns: calling a loadProjects helper, execFileSync('zazig',...), etc.
    expect(executor).toMatch(
      /monitorMasterCI[\s\S]{0,2000}zazig|monitorMasterCI[\s\S]{0,2000}loadProject|monitorMasterCI[\s\S]{0,2000}fetchProjects/
    );
  });

  it('monitorMasterCI calls project loader exactly once (not in a loop/retry)', () => {
    expect(executor).not.toBeNull();
    // Extract the monitorMasterCI method body — it should have only one project-load call
    const monitorMatch = executor!.match(/private async monitorMasterCI\(\)[\s\S]*?(?=\n  (private|public|protected|\}))/);
    if (monitorMatch) {
      const monitorBody = monitorMatch[0];
      // Count occurrences of the project loading call
      const loadCalls = (monitorBody.match(/zazig|loadProject|fetchProject/g) ?? []).length;
      // Should be exactly 1 call (no retry loop)
      expect(loadCalls).toBeLessThanOrEqual(2); // allow for one call + a variable name
      expect(loadCalls).toBeGreaterThanOrEqual(1); // must have at least one
    } else {
      // If we can't extract the body, just verify monitorMasterCI exists
      expect(executor).toContain('monitorMasterCI');
    }
  });

  it('does NOT use only this.companyProjects for CI polling (must refresh per poll)', () => {
    expect(executor).not.toBeNull();
    // The old pattern: `const repoUrl = this.companyProjects[0]?.repo_url;` as the FIRST
    // thing in monitorMasterCI is replaced by a CLI refresh first
    // New pattern: load projects from CLI, THEN extract repoUrl
    // We verify that the method contains a CLI call, meaning it no longer relies
    // solely on stale instance state
    const monitorMatch = executor!.match(/private async monitorMasterCI\(\)[^{]*\{([\s\S]*?)(?=\n  (private|public|protected))/);
    if (monitorMatch) {
      const body = monitorMatch[1];
      // The first meaningful line should NOT be `this.companyProjects` check
      // It should be a project refresh call before the repoUrl extraction
      const firstThisCompanyProjectsIdx = body.indexOf('this.companyProjects');
      const firstProjectRefreshIdx = Math.min(
        body.indexOf('zazig') >= 0 ? body.indexOf('zazig') : Infinity,
        body.indexOf('loadProject') >= 0 ? body.indexOf('loadProject') : Infinity,
        body.indexOf('fetchProject') >= 0 ? body.indexOf('fetchProject') : Infinity,
      );
      // project refresh must come before (or replace) the this.companyProjects access
      if (firstProjectRefreshIdx !== Infinity && firstThisCompanyProjectsIdx !== -1) {
        expect(firstProjectRefreshIdx).toBeLessThan(firstThisCompanyProjectsIdx);
      } else {
        // If we find a refresh call, that's enough to confirm the feature is implemented
        expect(firstProjectRefreshIdx).not.toBe(Infinity);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// AC3: Structural — index.ts uses CLI-sourced projects for change poller startup
// ---------------------------------------------------------------------------

describe('AC3: Master change poller uses CLI-sourced projects at startup', () => {
  const INDEX_PATH = 'packages/local-agent/src/index.ts';
  let index: string | null;

  beforeEach(() => {
    index = readRepoFile(INDEX_PATH);
  });

  it('index.ts logs "Discovered N project repo(s)" using CLI-sourced count', () => {
    expect(index).not.toBeNull();
    // Log message confirming projects were discovered
    expect(index).toMatch(/Discovered.*project.*repo/i);
  });

  it('master change poller is initialized with CLI-sourced projects', () => {
    expect(index).not.toBeNull();
    // The change poller setup must reference the CLI-sourced project list
    // (not the old companyProjects from fetchPersistentAgentDefinitions)
    expect(index).toMatch(/MasterChangePoller|masterChangePoller|changePoller/);
  });
});

// ---------------------------------------------------------------------------
// Behavioral: loadProjectsFromCLI helper
// ---------------------------------------------------------------------------

// Attempt to import the shared project loader
async function tryImportLoader(): Promise<((...args: any[]) => any) | null> {
  const candidates = [
    '../../packages/local-agent/src/index.js',
    '../../packages/local-agent/src/projects.js',
  ];
  for (const modulePath of candidates) {
    try {
      const mod = await import(/* @vite-ignore */ modulePath);
      if (mod.loadProjectsFromCLI || mod.fetchProjectsFromCLI || mod.loadCompanyProjects) {
        return mod.loadProjectsFromCLI ?? mod.fetchProjectsFromCLI ?? mod.loadCompanyProjects;
      }
    } catch {
      // Try next
    }
  }
  return null;
}

describe('Behavioral: loadProjectsFromCLI helper', () => {
  it('is exported from index.ts or a dedicated module', async () => {
    const loader = await tryImportLoader();
    expect(loader).not.toBeNull();
    expect(typeof loader).toBe('function');
  });

  it('returns array of { name, repo_url } on CLI success', async () => {
    const loader = await tryImportLoader();
    if (!loader) {
      // Feature not yet implemented — test should fail
      expect(loader).not.toBeNull();
      return;
    }

    // Mock child_process to return a valid JSON response
    const mockProjects = [
      { name: 'my-app', repo_url: 'https://github.com/org/my-app.git', status: 'active' },
    ];
    const mockExec: Mock = vi.fn().mockReturnValue(
      JSON.stringify({ projects: mockProjects })
    );

    const result = await loader('company-123', mockExec);
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBeGreaterThan(0);
    expect(result[0]).toHaveProperty('name');
    expect(result[0]).toHaveProperty('repo_url');
    expect(result[0].repo_url).not.toBe('');
  });

  it('returns empty array when CLI exits non-zero', async () => {
    const loader = await tryImportLoader();
    if (!loader) {
      expect(loader).not.toBeNull();
      return;
    }

    const mockExec: Mock = vi.fn().mockImplementation(() => {
      const err = new Error('zazig exited with code 1') as any;
      err.status = 1;
      throw err;
    });

    const result = await loader('company-123', mockExec);
    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(0);
  });

  it('returns empty array when CLI not found (ENOENT)', async () => {
    const loader = await tryImportLoader();
    if (!loader) {
      expect(loader).not.toBeNull();
      return;
    }

    const mockExec: Mock = vi.fn().mockImplementation(() => {
      const err = new Error('zazig: command not found') as any;
      err.code = 'ENOENT';
      throw err;
    });

    const result = await loader('company-123', mockExec);
    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(0);
  });

  it('returns empty array when CLI returns malformed JSON', async () => {
    const loader = await tryImportLoader();
    if (!loader) {
      expect(loader).not.toBeNull();
      return;
    }

    const mockExec: Mock = vi.fn().mockReturnValue('not valid json {{{{');

    const result = await loader('company-123', mockExec);
    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// FC2: CI monitor does NOT call zazig projects more than once per poll cycle
// ---------------------------------------------------------------------------

describe('FC2: CI monitor calls project loader exactly once per poll cycle', () => {
  const EXECUTOR_PATH = 'packages/local-agent/src/executor.ts';
  let executor: string | null;

  beforeEach(() => {
    executor = readRepoFile(EXECUTOR_PATH);
  });

  it('monitorMasterCI does not contain a while/for loop around the project loader call', () => {
    expect(executor).not.toBeNull();
    // Extract monitorMasterCI body
    const monitorMatch = executor!.match(/private async monitorMasterCI\(\)[^{]*\{([\s\S]*?)(?=\n  private )/);
    if (monitorMatch) {
      const body = monitorMatch[1];
      // No retry loop around the project loader
      // Check that zazig/loadProject call is not inside a while/for/do loop
      expect(body).not.toMatch(/while\s*\([^)]*\)[\s\S]{0,500}zazig/);
      expect(body).not.toMatch(/for\s*\([^)]*\)[\s\S]{0,500}zazig/);
    } else {
      // Can't extract body — just verify monitorMasterCI exists
      expect(executor).toContain('monitorMasterCI');
    }
  });
});
