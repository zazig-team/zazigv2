/**
 * Feature: Desktop — production agents inherit staging env vars from parent process
 *
 * When the desktop Electron app runs in a staging context (or when ZAZIG_HOME is
 * set on the parent process), production agents and their supporting binaries must
 * resolve their paths and configuration from ZAZIG_HOME rather than hardcoded
 * ~/.zazigv2 locations.  This ensures that agents spawned by the desktop app
 * correctly inherit the staging env vars (ZAZIG_HOME, ZAZIG_ENV, etc.) from
 * their parent process rather than silently using the wrong home directory.
 *
 * These tests do static analysis of source files.  They are written to FAIL
 * against the current codebase and pass once the feature is implemented.
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
// AC1: start.ts — production agent binary resolved via ZAZIG_HOME, not
//      hardcoded ~/.zazigv2
//
// Current bug: join(homedir(), ".zazigv2", "bin", "zazig-agent") is hardcoded
// Fix: resolve via process.env["ZAZIG_HOME"] ?? join(homedir(), ".zazigv2")
// ---------------------------------------------------------------------------

describe('start.ts — production agent binary resolved via ZAZIG_HOME', () => {
  const FILE = 'packages/cli/src/commands/start.ts';
  let content: string | null;

  beforeAll(() => {
    content = readRepoFile(FILE);
  });

  it('exists', () => {
    expect(content, `File not found: ${FILE}`).not.toBeNull();
  });

  it('does NOT hardcode join(homedir(), ".zazigv2", "bin", "zazig-agent") without ZAZIG_HOME', () => {
    // The old pattern ignores ZAZIG_HOME — must be replaced with ZAZIG_HOME-aware resolution
    const hardcoded = /join\(homedir\(\),\s*["']\.zazigv2["'],\s*["']bin["'],\s*["']zazig-agent["']\)/.test(
      content ?? '',
    );
    expect(
      hardcoded,
      'start.ts hardcodes ~/.zazigv2/bin/zazig-agent instead of using ZAZIG_HOME',
    ).toBe(false);
  });

  it('reads ZAZIG_HOME when resolving the production agent binary path', () => {
    // Must reference ZAZIG_HOME near the zazig-agent binary path
    expect(content).toMatch(/ZAZIG_HOME[\s\S]{0,300}zazig-agent|zazig-agent[\s\S]{0,300}ZAZIG_HOME/);
  });

  it('falls back to ~/.zazigv2 when ZAZIG_HOME is not set for binary resolution', () => {
    // Pattern: (process.env["ZAZIG_HOME"] ?? join(homedir(), ".zazigv2")) or similar
    expect(content).toMatch(/ZAZIG_HOME.*\.zazigv2|\.zazigv2.*ZAZIG_HOME/);
  });
});

// ---------------------------------------------------------------------------
// AC2: start.ts — legacy pinned build path also uses ZAZIG_HOME
//
// Current bug: join(homedir(), ".zazigv2", "builds", "current") is hardcoded
// ---------------------------------------------------------------------------

describe('start.ts — legacy pinned build path uses ZAZIG_HOME', () => {
  const FILE = 'packages/cli/src/commands/start.ts';
  let content: string | null;

  beforeAll(() => {
    content = readRepoFile(FILE);
  });

  it('does NOT hardcode join(homedir(), ".zazigv2", "builds", ...) without ZAZIG_HOME', () => {
    // Old: join(homedir(), ".zazigv2", "builds", "current")
    // The builds directory resolution must go through ZAZIG_HOME-aware helper
    const hardcoded = /join\(homedir\(\),\s*["']\.zazigv2["'],\s*["']builds["']/.test(content ?? '');
    expect(
      hardcoded,
      'start.ts hardcodes ~/.zazigv2/builds path instead of using ZAZIG_HOME',
    ).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// AC3: start.ts — env passed to daemon explicitly includes ZAZIG_ENV
//
// Production agents need to know they are in production (or staging) so they
// can make correct decisions.  ZAZIG_ENV must be explicitly forwarded in the
// env block rather than relying solely on implicit inheritance, which fails
// when the Electron production app is launched outside of a shell.
// ---------------------------------------------------------------------------

describe('start.ts — daemon env explicitly forwards ZAZIG_ENV', () => {
  // The env is constructed in start-env.ts via buildDaemonEnv, which is called from start.ts
  const FILE = 'packages/cli/src/commands/start-env.ts';
  let content: string | null;

  beforeAll(() => {
    content = readRepoFile(FILE);
  });

  it('env block passed to startDaemonForCompany explicitly includes ZAZIG_ENV', () => {
    // Must have ZAZIG_ENV as an explicit key in the env object, not just relying
    // on ...process.env spread which may be absent in packaged Electron apps.
    // Pattern: ZAZIG_ENV: zazigEnv  OR  ZAZIG_ENV: process.env["ZAZIG_ENV"]
    expect(content).toMatch(/ZAZIG_ENV\s*:/);
  });

  it('ZAZIG_ENV is set in the env block near the other ZAZIG_ vars', () => {
    // The env object should carry ZAZIG_ENV alongside ZAZIG_MACHINE_NAME, etc.
    const envBlockMatch = /const env[^=]*=\s*\{([\s\S]{0,800})\}/.exec(content ?? '');
    if (!envBlockMatch) {
      // If pattern doesn't match, the assertion below will fail with a clear message
      expect(envBlockMatch, 'Could not locate env block in start-env.ts').not.toBeNull();
      return;
    }
    const envBlock = envBlockMatch[1];
    expect(envBlock).toMatch(/ZAZIG_ENV/);
  });
});

// ---------------------------------------------------------------------------
// AC4: executor.ts — resolveMcpServerPath() uses ZAZIG_HOME
//
// The MCP server binary path is hardcoded to ~/.zazigv2/bin/agent-mcp-server.
// In staging or custom-home environments this resolves to the wrong binary.
// After the fix it must respect ZAZIG_HOME.
// ---------------------------------------------------------------------------

describe('executor.ts — resolveMcpServerPath uses ZAZIG_HOME', () => {
  const FILE = 'packages/local-agent/src/executor.ts';
  let content: string | null;

  beforeAll(() => {
    content = readRepoFile(FILE);
  });

  it('exists', () => {
    expect(content, `File not found: ${FILE}`).not.toBeNull();
  });

  it('does NOT hardcode join(homedir(), ".zazigv2", "bin", "agent-mcp-server") without ZAZIG_HOME', () => {
    // Old: const binPath = join(homedir(), ".zazigv2", "bin", "agent-mcp-server")
    const hardcoded = /const binPath\s*=\s*join\(homedir\(\),\s*["']\.zazigv2["'],\s*["']bin["'],\s*["']agent-mcp-server["']\)/.test(
      content ?? '',
    );
    expect(
      hardcoded,
      'executor.ts hardcodes ~/.zazigv2/bin/agent-mcp-server instead of using ZAZIG_HOME',
    ).toBe(false);
  });

  it('reads ZAZIG_HOME when resolving the MCP server binary path', () => {
    // Must reference ZAZIG_HOME in resolveMcpServerPath context
    expect(content).toMatch(/ZAZIG_HOME[\s\S]{0,300}agent-mcp-server|agent-mcp-server[\s\S]{0,300}ZAZIG_HOME/);
  });
});

// ---------------------------------------------------------------------------
// AC5: desktop/src/main/cli.ts — runCLI explicitly forwards ZAZIG_HOME and
//      ZAZIG_ENV to spawned CLI subprocesses
//
// When the production Electron app is launched from the macOS Dock it does
// not inherit the user's shell environment.  runCLI must explicitly include
// critical env vars so downstream CLI commands see the correct home directory
// and environment context.
// ---------------------------------------------------------------------------

describe('desktop/cli.ts — runCLI explicitly passes staging env vars to spawned CLI', () => {
  const FILE = 'packages/desktop/src/main/cli.ts';
  let content: string | null;

  beforeAll(() => {
    content = readRepoFile(FILE);
  });

  it('exists', () => {
    expect(content, `File not found: ${FILE}`).not.toBeNull();
  });

  it('spawn call includes an explicit env option', () => {
    // Must not rely on default env inheritance; must pass env explicitly
    // Pattern: spawn(CLI_BIN, commandArgs, { ..., env: ... })
    expect(content).toMatch(/spawn\([^)]*env\s*:/);
  });

  it('passes ZAZIG_HOME from parent process to spawned CLI subprocess', () => {
    expect(content).toMatch(/ZAZIG_HOME/);
  });

  it('passes ZAZIG_ENV from parent process to spawned CLI subprocess', () => {
    expect(content).toMatch(/ZAZIG_ENV/);
  });
});

// ---------------------------------------------------------------------------
// AC6: No module resolves agent-related binary paths under ~/.zazigv2 without
//      going through a ZAZIG_HOME-aware helper
// ---------------------------------------------------------------------------

describe('No hardcoded ~/.zazigv2/bin paths without ZAZIG_HOME awareness', () => {
  const FILES = [
    'packages/cli/src/commands/start.ts',
    'packages/local-agent/src/executor.ts',
  ];

  for (const file of FILES) {
    it(`${path.basename(file)} — no bare join(homedir(), ".zazigv2", "bin", ...) without ZAZIG_HOME`, () => {
      const content = readRepoFile(file);
      if (!content) {
        expect(content, `${file} not found`).not.toBeNull();
        return;
      }
      // Pattern: join(homedir(), ".zazigv2", "bin", — the hardcoded violation
      const bareHardcode = /join\(homedir\(\),\s*["']\.zazigv2["'],\s*["']bin["']/.test(content);
      expect(
        bareHardcode,
        `${file} hardcodes join(homedir(), ".zazigv2", "bin") without ZAZIG_HOME`,
      ).toBe(false);
    });
  }
});
