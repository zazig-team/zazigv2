/**
 * Feature: MCP to CLI migration — new CLI commands for start-expert-session and create-project-rule
 *
 * Covers:
 *   - packages/cli/src/commands/start-expert-session.ts exists with correct flags
 *   - packages/cli/src/commands/create-project-rule.ts exists with correct flags
 *   - Both commands call their respective edge functions via fetch (not MCP)
 *   - packages/cli/src/index.ts registers both new commands
 *
 * Tests are written to FAIL until the feature is implemented.
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
// start-expert-session CLI command
// ---------------------------------------------------------------------------

describe('packages/cli/src/commands/start-expert-session.ts', () => {
  const FILE = 'packages/cli/src/commands/start-expert-session.ts';
  let content: string | null;

  beforeAll(() => {
    content = readRepoFile(FILE);
  });

  it('file exists', () => {
    expect(content, `${FILE} not found — create it as part of the migration`).not.toBeNull();
  });

  it('supports --company flag (required, uuid)', () => {
    expect(content).toMatch(/company/);
  });

  it('supports --role-name flag (required)', () => {
    expect(content).toMatch(/role.?name|role_name/i);
  });

  it('supports --brief flag (required)', () => {
    expect(content).toMatch(/brief/);
  });

  it('supports --machine-name flag (required, default "auto")', () => {
    expect(content).toMatch(/machine.?name|machine_name/i);
  });

  it('supports --project-id flag (required)', () => {
    expect(content).toMatch(/project.?id|project_id/i);
  });

  it('supports --headless flag (boolean)', () => {
    expect(content).toMatch(/headless/);
  });

  it('supports --batch-id flag (optional)', () => {
    expect(content).toMatch(/batch.?id|batch_id/i);
  });

  it('prints usage when --help is passed', () => {
    expect(content).toMatch(/--help|-h/);
    expect(content).toMatch(/printHelp|Usage:|usage:/i);
  });

  it('POSTs to the start-expert-session edge function', () => {
    expect(content).toContain('functions/v1/start-expert-session');
  });

  it('uses fetch() — not an MCP client', () => {
    expect(content).toContain('fetch(');
    expect(content).not.toMatch(/import.*mcp|mcpClient|zazig-messaging/i);
  });

  it('sends Authorization Bearer header', () => {
    expect(content).toMatch(/Authorization.*Bearer|Bearer.*accessToken/i);
  });

  it('sends apikey header', () => {
    expect(content).toContain('apikey');
  });

  it('uses POST method', () => {
    expect(content).toMatch(/method:\s*['"]POST['"]/);
  });

  it('exits 0 on success', () => {
    expect(content).toMatch(/process\.exit\(0\)|exitCode\s*=\s*0/);
  });

  it('writes error to stderr and exits 1 on failure', () => {
    expect(content).toMatch(/process\.stderr\.write|stderr/);
    expect(content).toMatch(/process\.exit\(1\)|exitCode\s*=\s*1/);
  });
});

// ---------------------------------------------------------------------------
// create-project-rule CLI command
// ---------------------------------------------------------------------------

describe('packages/cli/src/commands/create-project-rule.ts', () => {
  const FILE = 'packages/cli/src/commands/create-project-rule.ts';
  let content: string | null;

  beforeAll(() => {
    content = readRepoFile(FILE);
  });

  it('file exists', () => {
    expect(content, `${FILE} not found — create it as part of the migration`).not.toBeNull();
  });

  it('supports --company flag (required, uuid)', () => {
    expect(content).toMatch(/company/);
  });

  it('supports --project-id flag (required)', () => {
    expect(content).toMatch(/project.?id|project_id/i);
  });

  it('supports --rule-text flag (required)', () => {
    expect(content).toMatch(/rule.?text|rule_text/i);
  });

  it('supports --applies-to flag (required, comma-separated)', () => {
    expect(content).toMatch(/applies.?to|applies_to/i);
  });

  it('prints usage when --help is passed', () => {
    expect(content).toMatch(/--help|-h/);
    expect(content).toMatch(/printHelp|Usage:|usage:/i);
  });

  it('POSTs to the create-project-rule edge function', () => {
    expect(content).toContain('functions/v1/create-project-rule');
  });

  it('uses fetch() — not an MCP client', () => {
    expect(content).toContain('fetch(');
    expect(content).not.toMatch(/import.*mcp|mcpClient|zazig-messaging/i);
  });

  it('sends Authorization Bearer header', () => {
    expect(content).toMatch(/Authorization.*Bearer|Bearer.*accessToken/i);
  });

  it('sends apikey header', () => {
    expect(content).toContain('apikey');
  });

  it('uses POST method', () => {
    expect(content).toMatch(/method:\s*['"]POST['"]/);
  });

  it('exits 0 on success', () => {
    expect(content).toMatch(/process\.exit\(0\)|exitCode\s*=\s*0/);
  });

  it('writes error to stderr and exits 1 on failure', () => {
    expect(content).toMatch(/process\.stderr\.write|stderr/);
    expect(content).toMatch(/process\.exit\(1\)|exitCode\s*=\s*1/);
  });
});

// ---------------------------------------------------------------------------
// CLI index.ts registers both new commands
// ---------------------------------------------------------------------------

describe('packages/cli/src/index.ts registers new commands', () => {
  let content: string | null;

  beforeAll(() => {
    content = readRepoFile('packages/cli/src/index.ts');
  });

  it('index.ts exists', () => {
    expect(content, 'packages/cli/src/index.ts not found').not.toBeNull();
  });

  it('registers "start-expert-session" case in command dispatch', () => {
    expect(content).toMatch(/case\s+['"]start-expert-session['"]/);
  });

  it('registers "create-project-rule" case in command dispatch', () => {
    expect(content).toMatch(/case\s+['"]create-project-rule['"]/);
  });

  it('imports startExpertSession from start-expert-session.js', () => {
    expect(content).toMatch(/from.*start-expert-session/);
  });

  it('imports createProjectRule from create-project-rule.js', () => {
    expect(content).toMatch(/from.*create-project-rule/);
  });
});
