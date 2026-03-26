/**
 * Feature: MCP to CLI migration — remove request_feature_fix, start_expert_session,
 * create_project_rule from MCP server and roles.mcp_tools
 *
 * Covers:
 *   - agent-mcp-server.ts does NOT register request_feature_fix
 *   - agent-mcp-server.ts does NOT register start_expert_session
 *   - agent-mcp-server.ts does NOT register create_project_rule
 *   - A migration exists that removes all 3 tools from roles.mcp_tools
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

function listMigrations(): string[] {
  const dir = path.join(REPO_ROOT, 'supabase/migrations');
  try {
    return fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
  } catch {
    return [];
  }
}

const MCP_SERVER_FILE = 'packages/local-agent/src/agent-mcp-server.ts';

// ---------------------------------------------------------------------------
// MCP server no longer registers request_feature_fix
// ---------------------------------------------------------------------------

describe('agent-mcp-server.ts does not register request_feature_fix', () => {
  let content: string | null;

  beforeAll(() => {
    content = readRepoFile(MCP_SERVER_FILE);
  });

  it('agent-mcp-server.ts exists', () => {
    expect(content, `${MCP_SERVER_FILE} not found`).not.toBeNull();
  });

  it('does not call server.tool("request_feature_fix", ...)', () => {
    expect(content).not.toMatch(/server\.tool\s*\(\s*["']request_feature_fix["']/);
  });

  it('does not define a guardedHandler for request_feature_fix', () => {
    expect(content).not.toMatch(/guardedHandler\s*\(\s*["']request_feature_fix["']/);
  });
});

// ---------------------------------------------------------------------------
// MCP server no longer registers start_expert_session
// ---------------------------------------------------------------------------

describe('agent-mcp-server.ts does not register start_expert_session', () => {
  let content: string | null;

  beforeAll(() => {
    content = readRepoFile(MCP_SERVER_FILE);
  });

  it('does not call server.tool("start_expert_session", ...)', () => {
    expect(content).not.toMatch(/server\.tool\s*\(\s*["']start_expert_session["']/);
  });

  it('does not define a guardedHandler for start_expert_session', () => {
    expect(content).not.toMatch(/guardedHandler\s*\(\s*["']start_expert_session["']/);
  });
});

// ---------------------------------------------------------------------------
// MCP server no longer registers create_project_rule
// ---------------------------------------------------------------------------

describe('agent-mcp-server.ts does not register create_project_rule', () => {
  let content: string | null;

  beforeAll(() => {
    content = readRepoFile(MCP_SERVER_FILE);
  });

  it('does not call server.tool("create_project_rule", ...)', () => {
    expect(content).not.toMatch(/server\.tool\s*\(\s*["']create_project_rule["']/);
  });

  it('does not define a guardedHandler for create_project_rule', () => {
    expect(content).not.toMatch(/guardedHandler\s*\(\s*["']create_project_rule["']/);
  });
});

// ---------------------------------------------------------------------------
// Migration removes all 3 tools from roles.mcp_tools (batch 3)
// ---------------------------------------------------------------------------

describe('migration removes request_feature_fix, start_expert_session, create_project_rule from roles (batch 3)', () => {
  const REMOVED_TOOLS = ['request_feature_fix', 'start_expert_session', 'create_project_rule'];
  let migrationFile: string | null = null;
  let migrationContent: string | null = null;

  beforeAll(() => {
    const migrations = listMigrations();
    // Find the most recent migration that touches all 3 tools (or at least mcp_tools
    // referencing removal of the trio). It must be newer than migration 215.
    const candidates = migrations.filter((f) => {
      const num = parseInt(f.split('_')[0], 10);
      if (num <= 215) return false;
      const content = readRepoFile(`supabase/migrations/${f}`);
      if (!content) return false;
      const lower = content.toLowerCase();
      return (
        lower.includes('mcp_tools') &&
        lower.includes('roles') &&
        REMOVED_TOOLS.some((tool) => lower.includes(tool))
      );
    }).sort((a, b) => b.localeCompare(a));

    const candidate = candidates[0] ?? null;
    if (candidate) {
      migrationFile = candidate;
      migrationContent = readRepoFile(`supabase/migrations/${candidate}`);
    }
  });

  it('a migration file exists (numbered > 215) that removes the 3 tools from roles', () => {
    expect(
      migrationFile,
      'No migration found (numbered > 215) that removes request_feature_fix, ' +
        'start_expert_session, create_project_rule from roles.mcp_tools. ' +
        'Create supabase/migrations/216_remove_mcp_tools_batch3.sql (or next number).',
    ).not.toBeNull();
  });

  for (const tool of REMOVED_TOOLS) {
    it(`migration references "${tool}"`, () => {
      if (!migrationContent) {
        expect(migrationFile, 'No qualifying migration found').not.toBeNull();
        return;
      }
      expect(
        migrationContent,
        `Migration must reference "${tool}" to remove it from roles.mcp_tools`,
      ).toContain(tool);
    });
  }

  it('migration targets the roles table', () => {
    if (!migrationContent) {
      expect(migrationFile, 'No qualifying migration found').not.toBeNull();
      return;
    }
    expect(migrationContent.toLowerCase()).toMatch(/\broles\b/);
  });

  it('migration uses targeted removal (array_remove or similar), not a wholesale NULL/empty reset', () => {
    if (!migrationContent) {
      expect(migrationFile, 'No qualifying migration found').not.toBeNull();
      return;
    }
    expect(migrationContent).not.toMatch(/mcp_tools\s*=\s*NULL/i);
    expect(migrationContent).not.toMatch(/mcp_tools\s*=\s*'{}'/i);
  });
});
