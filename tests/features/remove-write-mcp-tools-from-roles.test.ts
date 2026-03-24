/**
 * Feature: Remove write MCP tools — replace with CLI commands in prompt layer
 *
 * Tests for acceptance criteria 1, 2, and 5:
 *   AC1: Migration removes create_feature, update_feature, create_idea, update_idea,
 *        promote_idea from roles.mcp_tools for all roles.
 *   AC2: workspace.ts ROLE_DEFAULT_MCP_TOOLS does NOT include the five removed tools.
 *   AC5: create_decision, create_project_rule, start_expert_session remain as MCP tools.
 *
 * These tests are written to FAIL against the current codebase and pass once
 * the feature is implemented.
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

function listMigrationFiles(): string[] {
  const migrationsDir = path.join(REPO_ROOT, 'supabase', 'migrations');
  try {
    return fs.readdirSync(migrationsDir).filter((f) => f.endsWith('.sql'));
  } catch {
    return [];
  }
}

const REMOVED_TOOLS = [
  'create_feature',
  'update_feature',
  'create_idea',
  'update_idea',
  'promote_idea',
];

const KEPT_TOOLS = [
  'create_decision',
  'create_project_rule',
  'start_expert_session',
];

// ---------------------------------------------------------------------------
// AC1: Migration removes the five write MCP tools from all roles
// ---------------------------------------------------------------------------

describe('Migration: remove write MCP tools from roles', () => {
  let migrationContent: string | null;
  let migrationFile: string | null;

  beforeAll(() => {
    // Find the migration that removes write MCP tools (should be ~200)
    const files = listMigrationFiles();
    // Look for any migration with number >= 200 that removes write mcp tools
    const candidates = files.filter((f) => {
      const num = parseInt(f.split('_')[0], 10);
      return num >= 200;
    });

    for (const candidate of candidates.sort()) {
      const filePath = `supabase/migrations/${candidate}`;
      const content = readRepoFile(filePath);
      if (
        content &&
        REMOVED_TOOLS.some((tool) => content.includes(tool))
      ) {
        migrationContent = content;
        migrationFile = filePath;
        break;
      }
    }
  });

  it('a new migration exists (numbered >= 200) that strips write MCP tools', () => {
    expect(
      migrationFile,
      'No migration found (>= 200) that removes the five write MCP tools. ' +
        'Create supabase/migrations/200_remove_write_mcp_tools_from_roles.sql',
    ).not.toBeNull();
  });

  it('migration removes create_feature from roles.mcp_tools', () => {
    expect(migrationContent).toContain('create_feature');
  });

  it('migration removes update_feature from roles.mcp_tools', () => {
    expect(migrationContent).toContain('update_feature');
  });

  it('migration removes create_idea from roles.mcp_tools', () => {
    expect(migrationContent).toContain('create_idea');
  });

  it('migration removes update_idea from roles.mcp_tools', () => {
    expect(migrationContent).toContain('update_idea');
  });

  it('migration removes promote_idea from roles.mcp_tools', () => {
    expect(migrationContent).toContain('promote_idea');
  });

  it('migration targets the roles table', () => {
    expect(migrationContent).toMatch(/\broles\b/i);
  });

  it('migration uses array_remove to strip tools (non-destructive update)', () => {
    expect(migrationContent).toMatch(/array_remove|UPDATE.*roles.*SET.*mcp_tools/is);
  });

  it('migration does NOT remove create_decision', () => {
    // create_decision should not appear in the removal logic
    // (It can appear in a comment but should not be in array_remove calls)
    const lines = (migrationContent ?? '').split('\n');
    const removalLines = lines.filter(
      (l) => !l.trim().startsWith('--') && l.includes('array_remove'),
    );
    const removalBlock = removalLines.join('\n');
    expect(removalBlock).not.toContain('create_decision');
  });

  it('migration does NOT remove create_project_rule', () => {
    const lines = (migrationContent ?? '').split('\n');
    const removalLines = lines.filter(
      (l) => !l.trim().startsWith('--') && l.includes('array_remove'),
    );
    const removalBlock = removalLines.join('\n');
    expect(removalBlock).not.toContain('create_project_rule');
  });

  it('migration does NOT remove start_expert_session', () => {
    const lines = (migrationContent ?? '').split('\n');
    const removalLines = lines.filter(
      (l) => !l.trim().startsWith('--') && l.includes('array_remove'),
    );
    const removalBlock = removalLines.join('\n');
    expect(removalBlock).not.toContain('start_expert_session');
  });
});

// ---------------------------------------------------------------------------
// AC2: workspace.ts ROLE_DEFAULT_MCP_TOOLS does not include the five tools
// ---------------------------------------------------------------------------

describe('workspace.ts: ROLE_DEFAULT_MCP_TOOLS removes the five write tools', () => {
  const FILE = 'packages/local-agent/src/workspace.ts';
  let content: string | null;

  beforeAll(() => {
    content = readRepoFile(FILE);
  });

  it('file exists', () => {
    expect(content, `${FILE} not found`).not.toBeNull();
  });

  it('ROLE_DEFAULT_MCP_TOOLS constant is defined', () => {
    expect(content).toContain('ROLE_DEFAULT_MCP_TOOLS');
  });

  // Extract just the ROLE_DEFAULT_MCP_TOOLS block for targeted assertions.
  // We look from the const declaration to the closing `}` of the object.
  function extractDefaultToolsBlock(src: string): string {
    const start = src.indexOf('ROLE_DEFAULT_MCP_TOOLS');
    if (start === -1) return '';
    // Find the end of the object literal — first `};` after the const line
    const end = src.indexOf('};', start);
    if (end === -1) return src.slice(start);
    return src.slice(start, end + 2);
  }

  it('cpo role does NOT include create_feature in its default tool list', () => {
    const block = extractDefaultToolsBlock(content ?? '');
    // Find just the cpo line
    const cpoLine = block.split('\n').find((l) => l.includes('"cpo"'));
    expect(
      cpoLine,
      'cpo role line not found in ROLE_DEFAULT_MCP_TOOLS',
    ).toBeDefined();
    expect(cpoLine).not.toContain('create_feature');
  });

  it('cpo role does NOT include update_feature in its default tool list', () => {
    const block = extractDefaultToolsBlock(content ?? '');
    const cpoLine = block.split('\n').find((l) => l.includes('"cpo"'));
    expect(cpoLine).not.toContain('update_feature');
  });

  it('no role includes create_idea in ROLE_DEFAULT_MCP_TOOLS', () => {
    const block = extractDefaultToolsBlock(content ?? '');
    expect(block).not.toContain('create_idea');
  });

  it('no role includes update_idea in ROLE_DEFAULT_MCP_TOOLS', () => {
    const block = extractDefaultToolsBlock(content ?? '');
    expect(block).not.toContain('update_idea');
  });

  it('no role includes promote_idea in ROLE_DEFAULT_MCP_TOOLS', () => {
    const block = extractDefaultToolsBlock(content ?? '');
    expect(block).not.toContain('promote_idea');
  });
});

// ---------------------------------------------------------------------------
// AC5: create_decision, create_project_rule, start_expert_session stay in workspace.ts
// ---------------------------------------------------------------------------

describe('workspace.ts: retained MCP tools are still present', () => {
  const FILE = 'packages/local-agent/src/workspace.ts';
  let content: string | null;

  beforeAll(() => {
    content = readRepoFile(FILE);
  });

  it('create_decision is still in ROLE_DEFAULT_MCP_TOOLS for at least one role', () => {
    // cpo should still have create_decision
    expect(content).toContain('create_decision');
  });

  it('start_expert_session is still in ROLE_DEFAULT_MCP_TOOLS for at least one role', () => {
    expect(content).toContain('start_expert_session');
  });

  it('create_project_rule is still in ROLE_DEFAULT_MCP_TOOLS for at least one role', () => {
    expect(content).toContain('create_project_rule');
  });
});
