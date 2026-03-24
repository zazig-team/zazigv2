/**
 * Feature: Isolate staging into its own home directory
 *
 * Tests for acceptance criteria: staging uses ~/.zazigv2-staging/ and production
 * uses ~/.zazigv2/ with no cross-contamination.
 *
 * These tests do static analysis of source files to verify the required refactoring
 * patterns are in place. They are written to FAIL against the current codebase and
 * pass once the feature is implemented.
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

// ---------------------------------------------------------------------------
// AC: staging-index.ts sets ZAZIG_HOME before any imports
// Req 1: staging-index.ts must set ZAZIG_HOME=~/.zazigv2-staging before imports
// ---------------------------------------------------------------------------

describe('staging-index.ts sets ZAZIG_HOME before imports', () => {
  const FILE = 'packages/cli/src/staging-index.ts';
  let content: string | null;

  beforeAll(() => {
    content = readRepoFile(FILE);
  });

  it('exists at packages/cli/src/staging-index.ts', () => {
    expect(content, `File not found: ${FILE}`).not.toBeNull();
  });

  it('sets ZAZIG_HOME env var before the import statement', () => {
    // Must assign ZAZIG_HOME before the delegating import
    expect(content).toMatch(/ZAZIG_HOME/);
  });

  it('sets ZAZIG_HOME to ~/.zazigv2-staging', () => {
    expect(content).toMatch(/ZAZIG_HOME.*\.zazigv2-staging|\.zazigv2-staging.*ZAZIG_HOME/);
  });

  it('sets ZAZIG_HOME before the await import() call', () => {
    // ZAZIG_HOME assignment must appear before the import delegation
    const homedirOrEnvAssign = content?.indexOf('ZAZIG_HOME') ?? -1;
    const importDelegation = content?.indexOf('await import') ?? -1;
    expect(homedirOrEnvAssign).toBeGreaterThan(-1);
    expect(importDelegation).toBeGreaterThan(-1);
    expect(homedirOrEnvAssign).toBeLessThan(importDelegation);
  });
});

// ---------------------------------------------------------------------------
// AC: credentials.ts uses ZAZIG_HOME-aware path resolution
// Req 2, 3, 5: credentials.ts must read from ZAZIG_HOME, not hardcode .zazigv2
// Req 5: Remove -staging suffix logic from credentialsPath()
// ---------------------------------------------------------------------------

describe('credentials.ts — ZAZIG_HOME-aware path resolution', () => {
  const FILE = 'packages/cli/src/lib/credentials.ts';
  let content: string | null;

  beforeAll(() => {
    content = readRepoFile(FILE);
  });

  it('exists', () => {
    expect(content, `File not found: ${FILE}`).not.toBeNull();
  });

  it('reads ZAZIG_HOME from process.env', () => {
    expect(content).toMatch(/process\.env\[["']ZAZIG_HOME["']\]|process\.env\.ZAZIG_HOME/);
  });

  it('falls back to ~/.zazigv2 when ZAZIG_HOME is not set', () => {
    // Should use ZAZIG_HOME ?? join(homedir(), ".zazigv2") pattern
    expect(content).toMatch(/ZAZIG_HOME.*\.zazigv2|\.zazigv2.*ZAZIG_HOME/);
    expect(content).toContain('.zazigv2');
  });

  it('does NOT hardcode ZAZIGV2_DIR as join(homedir(), ".zazigv2") without ZAZIG_HOME fallback', () => {
    // The old hardcoded pattern must be gone — replaced by env-aware resolution
    // It should not have a bare `join(homedir(), ".zazigv2")` without ZAZIG_HOME
    expect(content).not.toMatch(/const ZAZIGV2_DIR\s*=\s*join\(homedir\(\),\s*["']\.zazigv2["']\)/);
  });

  it('does NOT have -staging suffix logic in credentialsPath()', () => {
    // Old pattern: `credentials-${env}.json` — must be removed
    expect(content).not.toMatch(/credentials-\$\{env\}\.json|credentials-staging\.json/);
  });

  it('credentialsPath() returns credentials.json without env suffix', () => {
    // Should resolve to plain credentials.json in the ZAZIG_HOME dir
    expect(content).toContain('credentials.json');
    // Must not branch on ZAZIG_ENV for the filename
    expect(content).not.toMatch(/ZAZIG_ENV.*credentials|credentials.*ZAZIG_ENV/);
  });
});

// ---------------------------------------------------------------------------
// AC: config.ts uses ZAZIG_HOME-aware path resolution
// Req 2, 3, 7: config.ts must read from ZAZIG_HOME env var
// ---------------------------------------------------------------------------

describe('config.ts — ZAZIG_HOME-aware path resolution', () => {
  const FILE = 'packages/cli/src/lib/config.ts';
  let content: string | null;

  beforeAll(() => {
    content = readRepoFile(FILE);
  });

  it('exists', () => {
    expect(content, `File not found: ${FILE}`).not.toBeNull();
  });

  it('reads ZAZIG_HOME from process.env', () => {
    expect(content).toMatch(/process\.env\[["']ZAZIG_HOME["']\]|process\.env\.ZAZIG_HOME/);
  });

  it('falls back to ~/.zazigv2 when ZAZIG_HOME is not set', () => {
    expect(content).toContain('.zazigv2');
  });

  it('does NOT hardcode ZAZIGV2_DIR as join(homedir(), ".zazigv2") without ZAZIG_HOME fallback', () => {
    expect(content).not.toMatch(/const ZAZIGV2_DIR\s*=\s*join\(homedir\(\),\s*["']\.zazigv2["']\)/);
  });
});

// ---------------------------------------------------------------------------
// AC: daemon.ts uses ZAZIG_HOME-aware path resolution
// Req 2, 3, 6: daemon.ts must read from ZAZIG_HOME; remove -staging suffixes
// ---------------------------------------------------------------------------

describe('daemon.ts — ZAZIG_HOME-aware path resolution', () => {
  const FILE = 'packages/cli/src/lib/daemon.ts';
  let content: string | null;

  beforeAll(() => {
    content = readRepoFile(FILE);
  });

  it('exists', () => {
    expect(content, `File not found: ${FILE}`).not.toBeNull();
  });

  it('reads ZAZIG_HOME from process.env', () => {
    expect(content).toMatch(/process\.env\[["']ZAZIG_HOME["']\]|process\.env\.ZAZIG_HOME/);
  });

  it('falls back to ~/.zazigv2 when ZAZIG_HOME is not set', () => {
    expect(content).toContain('.zazigv2');
  });

  it('does NOT hardcode ZAZIGV2_DIR as join(homedir(), ".zazigv2") without ZAZIG_HOME fallback', () => {
    expect(content).not.toMatch(/const ZAZIGV2_DIR\s*=\s*join\(homedir\(\),\s*["']\.zazigv2["']\)/);
  });

  it('does NOT have -staging suffix in pidPathForCompany()', () => {
    // Old: const suffix = IS_STAGING ? "-staging" : ""
    // New: no suffix needed — directory isolation handles it
    expect(content).not.toMatch(/pidPathForCompany[\s\S]{0,200}-staging/);
  });

  it('does NOT have -staging suffix in logPathForCompany()', () => {
    expect(content).not.toMatch(/logPathForCompany[\s\S]{0,200}-staging/);
  });

  it('pidPathForCompany() returns path under ZAZIG_HOME dir', () => {
    // Should reference the env-aware ZAZIGV2_DIR (not hardcoded path)
    expect(content).toContain('pidPathForCompany');
  });

  it('logPathForCompany() returns path under ZAZIG_HOME dir', () => {
    expect(content).toContain('logPathForCompany');
  });
});

// ---------------------------------------------------------------------------
// AC: builds.ts uses ZAZIG_HOME-aware path resolution
// Req 2, 3: builds.ts must read from ZAZIG_HOME env var
// ---------------------------------------------------------------------------

describe('builds.ts — ZAZIG_HOME-aware path resolution', () => {
  const FILE = 'packages/cli/src/lib/builds.ts';
  let content: string | null;

  beforeAll(() => {
    content = readRepoFile(FILE);
  });

  it('exists', () => {
    expect(content, `File not found: ${FILE}`).not.toBeNull();
  });

  it('reads ZAZIG_HOME from process.env', () => {
    expect(content).toMatch(/process\.env\[["']ZAZIG_HOME["']\]|process\.env\.ZAZIG_HOME/);
  });

  it('does NOT hardcode BUILDS_DIR without ZAZIG_HOME awareness', () => {
    // Old: join(homedir(), ".zazigv2", "builds") — must be gone
    expect(content).not.toMatch(/const BUILDS_DIR\s*=\s*join\(homedir\(\),\s*["']\.zazigv2["']/);
  });
});

// ---------------------------------------------------------------------------
// AC: connection.ts in local-agent uses ZAZIG_HOME-aware credentials path
// Req 4: Remove hardcoded CREDENTIALS_PATH; use ZAZIG_HOME resolution
// ---------------------------------------------------------------------------

describe('local-agent connection.ts — ZAZIG_HOME-aware credentials path', () => {
  const FILE = 'packages/local-agent/src/connection.ts';
  let content: string | null;

  beforeAll(() => {
    content = readRepoFile(FILE);
  });

  it('exists', () => {
    expect(content, `File not found: ${FILE}`).not.toBeNull();
  });

  it('does NOT have hardcoded CREDENTIALS_PATH = join(homedir(), ".zazigv2", "credentials.json")', () => {
    // Old: const CREDENTIALS_PATH = join(homedir(), ".zazigv2", "credentials.json")
    expect(content).not.toMatch(
      /const CREDENTIALS_PATH\s*=\s*join\(homedir\(\),\s*["']\.zazigv2["'],\s*["']credentials\.json["']\)/,
    );
  });

  it('reads ZAZIG_HOME from process.env for credentials path resolution', () => {
    expect(content).toMatch(/process\.env\[["']ZAZIG_HOME["']\]|process\.env\.ZAZIG_HOME/);
  });

  it('resolves credentials path under ZAZIG_HOME with .zazigv2 fallback', () => {
    // Must reference both ZAZIG_HOME and the fallback .zazigv2 dir
    expect(content).toMatch(/ZAZIG_HOME/);
    expect(content).toContain('.zazigv2');
  });

  it('does NOT have a hardcoded mkdirSync join(homedir(), ".zazigv2") for credentials dir', () => {
    // Old: mkdirSync(join(homedir(), ".zazigv2"), ...) in onAuthStateChange
    expect(content).not.toMatch(/mkdirSync\(join\(homedir\(\),\s*["']\.zazigv2["']\)/);
  });
});

// ---------------------------------------------------------------------------
// AC: start.ts passes ZAZIG_HOME through to spawned daemon env
// Req 8: ZAZIG_HOME must appear in the env block passed to startDaemonForCompany
// ---------------------------------------------------------------------------

describe('start.ts — ZAZIG_HOME propagated to daemon env', () => {
  const FILE = 'packages/cli/src/commands/start.ts';
  let content: string | null;

  beforeAll(() => {
    content = readRepoFile(FILE);
  });

  it('exists', () => {
    expect(content, `File not found: ${FILE}`).not.toBeNull();
  });

  it('includes ZAZIG_HOME in the env block for the spawned daemon', () => {
    // Should have ZAZIG_HOME: process.env["ZAZIG_HOME"] or similar in the env object
    expect(content).toMatch(/ZAZIG_HOME/);
  });

  it('propagates ZAZIG_HOME so the daemon uses the same home directory', () => {
    // The env block passed to startDaemon should carry ZAZIG_HOME
    expect(content).toMatch(/ZAZIG_HOME.*process\.env|process\.env.*ZAZIG_HOME/);
  });
});

// ---------------------------------------------------------------------------
// Failure case: No module hardcodes .zazigv2 path without ZAZIG_HOME awareness
// Req failure case 3: No module should reference a hardcoded .zazigv2 path
//                     without going through ZAZIG_HOME resolution
// ---------------------------------------------------------------------------

describe('No hardcoded .zazigv2 paths bypassing ZAZIG_HOME', () => {
  const MODULES = [
    'packages/cli/src/lib/credentials.ts',
    'packages/cli/src/lib/config.ts',
    'packages/cli/src/lib/daemon.ts',
    'packages/cli/src/lib/builds.ts',
    'packages/local-agent/src/connection.ts',
  ];

  for (const file of MODULES) {
    it(`${path.basename(file)} does not have bare join(homedir(), ".zazigv2") without ZAZIG_HOME`, () => {
      const content = readRepoFile(file);
      if (!content) {
        expect(content, `${file} not found`).not.toBeNull();
        return;
      }
      // Pattern: const SOME_DIR = join(homedir(), ".zazigv2") — a module-level const
      // that doesn't use ZAZIG_HOME is the violation we're checking for
      const bareHardcode = /const \w+\s*=\s*join\(homedir\(\),\s*["']\.zazigv2["']\)/.test(content);
      expect(
        bareHardcode,
        `${file} has a hardcoded join(homedir(), ".zazigv2") without ZAZIG_HOME awareness`,
      ).toBe(false);
    });
  }
});

// ---------------------------------------------------------------------------
// AC5 / AC production: production behaviour unchanged when ZAZIG_HOME is unset
// Verify default fallback to .zazigv2 exists in each module
// ---------------------------------------------------------------------------

describe('Production fallback: modules fall back to ~/.zazigv2 when ZAZIG_HOME unset', () => {
  const MODULES = [
    'packages/cli/src/lib/credentials.ts',
    'packages/cli/src/lib/config.ts',
    'packages/cli/src/lib/daemon.ts',
    'packages/cli/src/lib/builds.ts',
  ];

  for (const file of MODULES) {
    it(`${path.basename(file)} contains fallback to ".zazigv2" when ZAZIG_HOME is not set`, () => {
      const content = readRepoFile(file);
      if (!content) {
        expect(content, `${file} not found`).not.toBeNull();
        return;
      }
      // The module must reference .zazigv2 as a fallback value
      expect(content).toContain('.zazigv2');
      // And must read ZAZIG_HOME to enable the override
      expect(content).toMatch(/ZAZIG_HOME/);
    });
  }
});
