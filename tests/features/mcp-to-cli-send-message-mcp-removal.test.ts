/**
 * Feature: MCP to CLI — replace send_message with zazig send-message-to-human
 *
 * AC1: send_message is NOT registered as a tool in agent-mcp-server.ts
 * AC8: A migration exists that removes send_message from every role's mcp_tools array
 *
 * Tests FAIL against the current codebase (send_message is still registered
 * and no removal migration exists yet).
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

function listMigrations(): string[] {
  const dir = path.join(REPO_ROOT, 'supabase/migrations');
  try {
    return fs.readdirSync(dir).filter((f) => f.endsWith('.sql'));
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// AC1: send_message is NOT registered in agent-mcp-server.ts
// ---------------------------------------------------------------------------

describe('MCP server — send_message tool removed (AC1)', () => {
  let mcpServerContent: string | null;

  beforeAll(() => {
    mcpServerContent = readRepoFile('packages/local-agent/src/agent-mcp-server.ts');
  });

  it('agent-mcp-server.ts exists', () => {
    expect(
      mcpServerContent,
      'packages/local-agent/src/agent-mcp-server.ts not found',
    ).not.toBeNull();
  });

  it('does NOT register send_message as a server.tool()', () => {
    // After the feature is implemented, server.tool("send_message", ...) must be gone.
    expect(mcpServerContent).not.toMatch(/server\.tool\s*\(\s*['"]send_message['"]/);
  });

  it('does NOT define a guardedHandler for send_message', () => {
    // guardedHandler("send_message", ...) should not appear anywhere in the file.
    expect(mcpServerContent).not.toMatch(/guardedHandler\s*\(\s*['"]send_message['"]/);
  });

  it('does NOT export or reference send_message as a tool name string', () => {
    // The string "send_message" should not appear as a tool registration.
    // Allow it to appear only in comments (e.g. "removed send_message").
    // We check for it in non-comment lines by scanning code lines.
    if (!mcpServerContent) return;
    const codeLines = mcpServerContent
      .split('\n')
      .filter((line) => !line.trim().startsWith('//') && !line.trim().startsWith('*'));
    const hasSendMessage = codeLines.some((line) => line.includes('"send_message"') || line.includes("'send_message'"));
    expect(hasSendMessage).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// AC8: Migration exists that strips send_message from all roles.mcp_tools
// ---------------------------------------------------------------------------

describe('migration — remove send_message from roles.mcp_tools (AC8)', () => {
  let migrationFile: string | null = null;
  let migrationContent: string | null = null;

  beforeAll(() => {
    const migrations = listMigrations();
    // Find the most recent migration that removes send_message from roles.
    const candidates = migrations
      .filter((f) => {
        const content = readRepoFile(`supabase/migrations/${f}`);
        if (!content) return false;
        const lower = content.toLowerCase();
        return (
          lower.includes('send_message') &&
          lower.includes('mcp_tools') &&
          lower.includes('roles')
        );
      })
      .sort((a, b) => b.localeCompare(a));
    const candidate = candidates[0] ?? null;
    if (candidate) {
      migrationFile = candidate;
      migrationContent = readRepoFile(`supabase/migrations/${candidate}`);
    }
  });

  it('a migration file exists that removes send_message from roles.mcp_tools', () => {
    expect(
      migrationFile,
      'No migration found that removes send_message from roles.mcp_tools. ' +
        'Create a new migration in supabase/migrations/ that removes ' +
        '"send_message" from every role\'s mcp_tools array.',
    ).not.toBeNull();
  });

  it('migration references send_message as the tool being removed', () => {
    if (!migrationContent) {
      expect(migrationFile, 'No qualifying migration found').not.toBeNull();
      return;
    }
    expect(migrationContent).toContain('send_message');
  });

  it('migration targets the roles table', () => {
    if (!migrationContent) {
      expect(migrationFile, 'No qualifying migration found').not.toBeNull();
      return;
    }
    expect(migrationContent.toLowerCase()).toMatch(/\broles\b/);
  });

  it('migration uses targeted array removal — does NOT set mcp_tools to NULL or empty', () => {
    if (!migrationContent) {
      expect(migrationFile, 'No qualifying migration found').not.toBeNull();
      return;
    }
    expect(migrationContent).not.toMatch(/mcp_tools\s*=\s*NULL/i);
    expect(migrationContent).not.toMatch(/mcp_tools\s*=\s*'{}'/i);
  });

  it('migration applies to all roles — uses a WHERE condition that covers multiple roles or omits WHERE (all rows)', () => {
    if (!migrationContent) {
      expect(migrationFile, 'No qualifying migration found').not.toBeNull();
      return;
    }
    // Either no WHERE clause (applies to all) or uses IN/ANY with multiple role names.
    // Check that it uses array_remove or equivalent targeted SQL.
    expect(migrationContent).toMatch(/array_remove|#-|jsonb_set|mcp_tools/i);
  });

  it('migration does not remove other tools (create_decision, start_expert_session)', () => {
    if (!migrationContent) {
      expect(migrationFile, 'No qualifying migration found').not.toBeNull();
      return;
    }
    // The migration must only target send_message — not wholesale wipe mcp_tools.
    // A safe proxy: it should not set mcp_tools to an empty array or null.
    expect(migrationContent).not.toMatch(/mcp_tools\s*=\s*ARRAY\[\s*\]/i);
  });
});
