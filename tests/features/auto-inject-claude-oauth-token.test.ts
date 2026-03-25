/**
 * Feature: Claude Code uses its own OAuth flow — no ANTHROPIC_API_KEY injection
 *
 * Previously the daemon read an OAuth token from the macOS Keychain and injected
 * it as ANTHROPIC_API_KEY into agent sessions. This caused sessions to fail when
 * the short-lived token expired mid-session, because Claude Code couldn't
 * self-refresh a static env var.
 *
 * Now Claude Code uses its own Keychain-based OAuth flow with built-in auto-refresh.
 * The daemon must NOT set ANTHROPIC_API_KEY.
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
// start.ts must NOT inject ANTHROPIC_API_KEY
// ---------------------------------------------------------------------------

describe('start.ts — does not inject ANTHROPIC_API_KEY', () => {
  const FILE = 'packages/cli/src/commands/start.ts';
  let content: string | null;

  beforeAll(() => {
    content = readRepoFile(FILE);
  });

  it('exists at packages/cli/src/commands/start.ts', () => {
    expect(content, `File not found: ${FILE}`).not.toBeNull();
  });

  it('does not read Claude token from Keychain', () => {
    expect(content).not.toMatch(/readClaudeTokenFromKeychain/);
  });

  it('does not set ANTHROPIC_API_KEY in the daemon env', () => {
    expect(content).not.toMatch(/ANTHROPIC_API_KEY:\s*claudeToken/);
  });

  it('still calls startDaemonForCompany (no regression)', () => {
    expect(content).toMatch(/startDaemonForCompany/);
  });
});

// ---------------------------------------------------------------------------
// executor.ts must not reference ANTHROPIC_API_KEY in functional code
// ---------------------------------------------------------------------------

describe('executor.ts — no ANTHROPIC_API_KEY in functional code', () => {
  const FILE = 'packages/local-agent/src/executor.ts';
  let content: string | null;

  beforeAll(() => {
    content = readRepoFile(FILE);
  });

  it('does not set or read ANTHROPIC_API_KEY in process.env', () => {
    expect(content).not.toMatch(/process\.env\[["']ANTHROPIC_API_KEY["']\]/);
  });

  it('does not log ANTHROPIC_API_KEY value to job log files', () => {
    expect(content).not.toMatch(/jobLog\(.*ANTHROPIC_API_KEY/);
  });
});
