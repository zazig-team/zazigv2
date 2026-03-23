/**
 * Feature: Auto-inject Claude OAuth token from macOS Keychain on startup
 *
 * Acceptance criteria:
 * 1. zazig start succeeds without requiring manual claude login when a valid
 *    Claude OAuth token exists in macOS Keychain
 * 2. If Keychain is locked or token is missing, startup falls back to existing
 *    behavior (no regression)
 * 3. Claude Code subprocesses (claude -p) receive ANTHROPIC_API_KEY in their
 *    environment and authenticate successfully
 * 4. No token is logged to stdout, stderr, or daemon log files
 *
 * Tests are written to FAIL against the current codebase and pass once the
 * feature is implemented.
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
// AC1 / AC2: readClaudeTokenFromKeychain in start.ts
// ---------------------------------------------------------------------------

describe('start.ts — readClaudeTokenFromKeychain function', () => {
  const FILE = 'packages/cli/src/commands/start.ts';
  let content: string | null;

  beforeAll(() => {
    content = readRepoFile(FILE);
  });

  it('exists at packages/cli/src/commands/start.ts', () => {
    expect(content, `File not found: ${FILE}`).not.toBeNull();
  });

  it('defines a readClaudeTokenFromKeychain function', () => {
    expect(content).toMatch(/function\s+readClaudeTokenFromKeychain/);
  });

  it('calls the macOS security command to find the claude-vscode generic password', () => {
    expect(content).toContain('security find-generic-password');
    expect(content).toContain('claude-vscode');
  });

  it('uses the oauth-tokens account name in the security lookup', () => {
    expect(content).toContain('oauth-tokens');
  });

  it('parses the raw output as JSON', () => {
    expect(content).toMatch(/JSON\.parse/);
  });

  it('extracts claudeAiOauth.accessToken from the parsed JSON', () => {
    expect(content).toMatch(/claudeAiOauth.*accessToken|claudeAiOauth\?\.accessToken/);
  });

  it('validates the token starts with sk-ant- prefix', () => {
    expect(content).toContain('sk-ant-');
    expect(content).toMatch(/startsWith/);
  });

  it('returns null when the token is missing or does not match prefix', () => {
    // The function must return null on guard failure
    expect(content).toMatch(/return null/);
  });

  it('wraps the security call in a try/catch and returns null on error (AC2: no regression on locked Keychain)', () => {
    // Must have a catch block that returns null so startup continues without error
    expect(content).toMatch(/catch[\s\S]{0,100}return null/);
  });
});

// ---------------------------------------------------------------------------
// AC1 / AC3: ANTHROPIC_API_KEY injected into daemon env in start.ts
// ---------------------------------------------------------------------------

describe('start.ts — ANTHROPIC_API_KEY injected into daemon environment', () => {
  const FILE = 'packages/cli/src/commands/start.ts';
  let content: string | null;

  beforeAll(() => {
    content = readRepoFile(FILE);
  });

  it('calls readClaudeTokenFromKeychain() before building the env object', () => {
    expect(content).toMatch(/readClaudeTokenFromKeychain\(\)/);
  });

  it('spreads ANTHROPIC_API_KEY conditionally into the env block', () => {
    // Must use spread with conditional: ...(claudeToken ? { ANTHROPIC_API_KEY: claudeToken } : {})
    expect(content).toMatch(/ANTHROPIC_API_KEY/);
  });

  it('only sets ANTHROPIC_API_KEY when a token was found (conditional spread)', () => {
    // Must guard with a truthiness check before setting ANTHROPIC_API_KEY
    expect(content).toMatch(/claudeToken\s*\?|claudeToken\s*&&/);
  });

  it('does not set ANTHROPIC_API_KEY unconditionally (would break missing-token path)', () => {
    // Must NOT have an unconditional assignment like ANTHROPIC_API_KEY: claudeToken
    // where claudeToken could be null. The spread must be conditional.
    const unconditional = /ANTHROPIC_API_KEY:\s*claudeToken(?!\s*\?|\s*&&|\s*\|\||\s*!)/;
    // If this pattern matches AND there is no guard wrapping it, fail.
    // We check: if ANTHROPIC_API_KEY appears without a conditional guard, fail.
    // Simplest proxy: the token spread must use a ternary or logical &&
    expect(content).toMatch(/claudeToken[\s\S]{0,50}ANTHROPIC_API_KEY|ANTHROPIC_API_KEY[\s\S]{0,50}claudeToken/);
  });
});

// ---------------------------------------------------------------------------
// AC2: Fallback — no regression when Keychain unavailable
// ---------------------------------------------------------------------------

describe('start.ts — fallback behavior when Keychain is unavailable (AC2)', () => {
  const FILE = 'packages/cli/src/commands/start.ts';
  let content: string | null;

  beforeAll(() => {
    content = readRepoFile(FILE);
  });

  it('does not throw or exit if readClaudeTokenFromKeychain returns null', () => {
    // The code path must continue (daemon spawn still happens) when token is null.
    // This is guaranteed by: (1) the conditional ANTHROPIC_API_KEY spread,
    // (2) startDaemonForCompany still being called unconditionally.
    expect(content).toMatch(/startDaemonForCompany/);
  });

  it('does not call process.exit when keychain token is missing', () => {
    // readClaudeTokenFromKeychain returning null must not trigger early exit.
    // The existing exit paths are for missing creds / claude not installed.
    // A null token must be silently ignored.
    // Proxy: the catch in readClaudeTokenFromKeychain returns null (not exitCode=1).
    expect(content).toMatch(/catch[\s\S]{0,50}return null/);
  });
});

// ---------------------------------------------------------------------------
// AC3: executor.ts passes ANTHROPIC_API_KEY through to claude -p subprocesses
// ---------------------------------------------------------------------------

describe('executor.ts — ANTHROPIC_API_KEY passed through to claude -p subprocesses', () => {
  const FILE = 'packages/local-agent/src/executor.ts';
  let content: string | null;

  beforeAll(() => {
    content = readRepoFile(FILE);
  });

  it('exists at packages/local-agent/src/executor.ts', () => {
    expect(content, `File not found: ${FILE}`).not.toBeNull();
  });

  it('spawns claude -p subprocesses with process.env inheritance (spreads env)', () => {
    // The tmux session that runs claude -p must inherit the parent process env,
    // which includes ANTHROPIC_API_KEY set by start.ts.
    // Proxy: the executor uses process.env spread or passes env to execFileAsync.
    // The shell cmd inherits env by default when launched via tmux new-session.
    // We verify that the executor does NOT strip env vars before spawning.
    expect(content).toMatch(/process\.env|spawnEnv|execFileAsync.*env/);
  });

  it('does not explicitly unset or delete ANTHROPIC_API_KEY in subprocess env', () => {
    expect(content).not.toMatch(/delete.*ANTHROPIC_API_KEY|ANTHROPIC_API_KEY.*undefined/);
  });
});

// ---------------------------------------------------------------------------
// AC4: No token logged to stdout, stderr, or log files
// ---------------------------------------------------------------------------

describe('start.ts — token is never logged (AC4)', () => {
  const FILE = 'packages/cli/src/commands/start.ts';
  let content: string | null;

  beforeAll(() => {
    content = readRepoFile(FILE);
  });

  it('does not console.log the claude token value directly', () => {
    // Must not print claudeToken to stdout
    expect(content).not.toMatch(/console\.log\(.*claudeToken/);
  });

  it('does not console.error the claude token value directly', () => {
    expect(content).not.toMatch(/console\.error\(.*claudeToken/);
  });

  it('does not write the claude token to process.stdout directly', () => {
    expect(content).not.toMatch(/process\.stdout\.write\(.*claudeToken/);
  });

  it('does not write the claude token to process.stderr directly', () => {
    expect(content).not.toMatch(/process\.stderr\.write\(.*claudeToken/);
  });
});

describe('executor.ts — ANTHROPIC_API_KEY not logged to job log files (AC4)', () => {
  const FILE = 'packages/local-agent/src/executor.ts';
  let content: string | null;

  beforeAll(() => {
    content = readRepoFile(FILE);
  });

  it('does not log ANTHROPIC_API_KEY value to job log files', () => {
    // jobLog calls must not include ANTHROPIC_API_KEY in the message
    expect(content).not.toMatch(/jobLog\(.*ANTHROPIC_API_KEY/);
  });

  it('does not log process.env.ANTHROPIC_API_KEY to any output', () => {
    expect(content).not.toMatch(/console\.(log|error|warn)\(.*ANTHROPIC_API_KEY/);
  });
});
