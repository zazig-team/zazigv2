/**
 * Feature: Remove write MCP tools — replace with CLI commands in prompt layer
 * AC2: workspace.ts ROLE_DEFAULT_MCP_TOOLS does not list the five removed tools
 * AC5: create_decision, create_project_rule, start_expert_session remain in workspace.ts
 *
 * These tests read workspace.ts source and assert the hardcoded fallback tool
 * lists have been updated. They FAIL against the current codebase (cpo still
 * has create_feature and update_feature) and pass once the feature is built.
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

const WORKSPACE_FILE = 'packages/local-agent/src/workspace.ts';

// The five tools that must be removed from all role defaults
const REMOVED_TOOLS = [
  'create_feature',
  'update_feature',
  'create_idea',
  'update_idea',
  'promote_idea',
];

// Tools that must remain (no CLI equivalent yet)
const RETAINED_MCP_TOOLS = [
  'create_decision',
  'create_project_rule',
  'start_expert_session',
];

describe('workspace.ts ROLE_DEFAULT_MCP_TOOLS — removed tools', () => {
  let content: string | null;

  beforeAll(() => {
    content = readRepoFile(WORKSPACE_FILE);
  });

  it('workspace.ts exists', () => {
    expect(content, `${WORKSPACE_FILE} not found`).not.toBeNull();
  });

  it('contains ROLE_DEFAULT_MCP_TOOLS constant', () => {
    expect(content).toContain('ROLE_DEFAULT_MCP_TOOLS');
  });

  for (const tool of REMOVED_TOOLS) {
    it(`ROLE_DEFAULT_MCP_TOOLS does not include "${tool}" in any role's default set`, () => {
      // Extract the ROLE_DEFAULT_MCP_TOOLS block to avoid false positives from
      // comments or other parts of the file. We look for the tool name appearing
      // as a quoted string inside the constant definition.
      const start = content!.indexOf('const ROLE_DEFAULT_MCP_TOOLS');
      const end = content!.indexOf('};', start) + 2;
      const block = content!.slice(start, end);
      expect(block, `"${tool}" must not appear in ROLE_DEFAULT_MCP_TOOLS`).not.toContain(
        `"${tool}"`,
      );
    });
  }
});

describe('workspace.ts ROLE_DEFAULT_MCP_TOOLS — retained tools', () => {
  let content: string | null;

  beforeAll(() => {
    content = readRepoFile(WORKSPACE_FILE);
  });

  it('workspace.ts exists', () => {
    expect(content, `${WORKSPACE_FILE} not found`).not.toBeNull();
  });

  it('retains "create_decision" in cpo role defaults', () => {
    const start = content!.indexOf('const ROLE_DEFAULT_MCP_TOOLS');
    const end = content!.indexOf('};', start) + 2;
    const block = content!.slice(start, end);
    expect(block).toContain('"create_decision"');
  });

  it('retains "start_expert_session" in cpo role defaults', () => {
    const start = content!.indexOf('const ROLE_DEFAULT_MCP_TOOLS');
    const end = content!.indexOf('};', start) + 2;
    const block = content!.slice(start, end);
    expect(block).toContain('"start_expert_session"');
  });

  it('retains "create_project_rule" in at least one role default', () => {
    const start = content!.indexOf('const ROLE_DEFAULT_MCP_TOOLS');
    const end = content!.indexOf('};', start) + 2;
    const block = content!.slice(start, end);
    expect(block).toContain('"create_project_rule"');
  });


});

describe('workspace.ts generateAllowedTools — removed tools absent from output', () => {
  let content: string | null;

  beforeAll(() => {
    content = readRepoFile(WORKSPACE_FILE);
  });

  it('workspace.ts exists', () => {
    expect(content, `${WORKSPACE_FILE} not found`).not.toBeNull();
  });

  // The generateAllowedTools function builds tool names as
  // `mcp__zazig-messaging__${name}`. If none of the five tools appear in
  // ROLE_DEFAULT_MCP_TOOLS, they cannot appear in the generated output.
  for (const tool of REMOVED_TOOLS) {
    it(`generateAllowedTools output cannot include "mcp__zazig-messaging__${tool}"`, () => {
      // The tool name in ROLE_DEFAULT_MCP_TOOLS determines what ends up in the
      // generated CLAUDE.md. Check the constant block doesn't have the tool.
      const start = content!.indexOf('const ROLE_DEFAULT_MCP_TOOLS');
      const end = content!.indexOf('};', start) + 2;
      const block = content!.slice(start, end);
      expect(block).not.toContain(`"${tool}"`);
    });
  }
});
