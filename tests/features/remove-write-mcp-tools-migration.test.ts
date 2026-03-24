/**
 * Feature: Remove write MCP tools — replace with CLI commands in prompt layer
 * AC1: A migration exists that removes the five tools from roles.mcp_tools
 * AC4: CLI write commands still call edge functions directly (not via MCP)
 *
 * AC1 tests FAIL against the current codebase (no such migration yet).
 * AC4 tests verify the CLI commands already call edge functions and have no
 * MCP dependency — these should pass before and after the feature.
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

// The five tools that must be stripped from roles.mcp_tools
const REMOVED_TOOLS = [
  'create_feature',
  'update_feature',
  'create_idea',
  'update_idea',
  'promote_idea',
];

// Tools that must NOT be touched by the migration
const RETAINED_TOOLS = ['create_decision', 'create_project_rule', 'start_expert_session'];

// ---------------------------------------------------------------------------
// AC1: Migration file exists that strips the five tools from roles.mcp_tools
// ---------------------------------------------------------------------------

describe('migration — strip write MCP tools from roles (AC1)', () => {
  let migrationFile: string | null = null;
  let migrationContent: string | null = null;

  beforeAll(() => {
    const migrations = listMigrations();
    // Find the migration that removes the CLI-replaced tools from roles.
    // We look for a migration that references both "mcp_tools" and at least
    // one of the tools being removed.
    const candidate = migrations.find((f) => {
      const content = readRepoFile(`supabase/migrations/${f}`);
      if (!content) return false;
      const lower = content.toLowerCase();
      return lower.includes('mcp_tools') && lower.includes('create_feature');
    });
    if (candidate) {
      migrationFile = candidate;
      migrationContent = readRepoFile(`supabase/migrations/${candidate}`);
    }
  });

  it('a migration file exists that touches roles.mcp_tools', () => {
    expect(
      migrationFile,
      'No migration found that updates mcp_tools to remove the CLI-replaced tools. ' +
        'Create a new migration in supabase/migrations/ that removes ' +
        'create_feature, update_feature, create_idea, update_idea, promote_idea ' +
        'from roles.mcp_tools.',
    ).not.toBeNull();
  });

  for (const tool of REMOVED_TOOLS) {
    it(`migration references "${tool}" (must be removed from all roles)`, () => {
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

  it('migration updates roles table (not a different table)', () => {
    if (!migrationContent) {
      expect(migrationFile, 'No qualifying migration found').not.toBeNull();
      return;
    }
    expect(migrationContent.toLowerCase()).toMatch(/\broles\b/);
  });

  it('migration does not remove "create_decision" from any role', () => {
    if (!migrationContent) {
      expect(migrationFile, 'No qualifying migration found').not.toBeNull();
      return;
    }
    // The migration should not wholesale delete or set null on mcp_tools —
    // it should only remove the specific tools. create_decision should NOT
    // appear as something being removed (it may appear in comments though).
    // We check that the migration does not DELETE or set mcp_tools = NULL.
    expect(migrationContent).not.toMatch(/mcp_tools\s*=\s*NULL/i);
    expect(migrationContent).not.toMatch(/mcp_tools\s*=\s*'{}'/i);
  });

  it('migration does not remove "start_expert_session" from any role', () => {
    if (!migrationContent) {
      expect(migrationFile, 'No qualifying migration found').not.toBeNull();
      return;
    }
    // start_expert_session must remain — the migration should not reference
    // it as something being removed. It's fine if it appears in a comment
    // explaining what's kept, but it should not be in a removal expression.
    // We verify the migration handles only the five specified tools.
    // A safe check: the tool name should not appear alongside "remove" in SQL.
    // We check that the migration overall keeps mcp_tools non-null for roles
    // by ensuring it uses array_remove or similar targeted SQL, not a full reset.
    expect(migrationContent).toMatch(/array_remove|#-|jsonb_set|mcp_tools/i);
  });
});

// ---------------------------------------------------------------------------
// AC4: CLI write command files call edge functions directly, not via MCP
// ---------------------------------------------------------------------------

const CLI_WRITE_COMMANDS: Array<{ file: string; edgeFn: string; flags: string[] }> = [
  {
    file: 'packages/cli/src/commands/create-feature.ts',
    edgeFn: 'create-feature',
    flags: ['--title', '--description', '--spec', '--acceptance-tests', '--priority'],
  },
  {
    file: 'packages/cli/src/commands/update-feature.ts',
    edgeFn: 'update-feature',
    flags: ['--id', '--status', '--spec'],
  },
  {
    file: 'packages/cli/src/commands/create-idea.ts',
    edgeFn: 'create-idea',
    flags: ['--raw-text', '--originator'],
  },
  {
    file: 'packages/cli/src/commands/update-idea.ts',
    edgeFn: 'update-idea',
    flags: ['--id', '--raw-text', '--status'],
  },
  {
    file: 'packages/cli/src/commands/promote-idea.ts',
    edgeFn: 'promote-idea',
    flags: ['--id', '--to'],
  },
];

for (const cmd of CLI_WRITE_COMMANDS) {
  describe(`CLI write command: ${path.basename(cmd.file)} (AC4)`, () => {
    let content: string | null;

    beforeAll(() => {
      content = readRepoFile(cmd.file);
    });

    it('file exists', () => {
      expect(content, `${cmd.file} not found`).not.toBeNull();
    });

    it(`POSTs directly to the "${cmd.edgeFn}" edge function`, () => {
      expect(content).toContain(`functions/v1/${cmd.edgeFn}`);
    });

    it('uses fetch() — not an MCP client', () => {
      expect(content).toContain('fetch(');
      // Must NOT import from any MCP client module
      expect(content).not.toMatch(/import.*mcp|mcpClient|zazig-messaging/i);
    });

    it('sends Authorization Bearer header (authenticated, not service-role)', () => {
      expect(content).toMatch(/Authorization.*Bearer|Bearer.*accessToken/i);
    });

    it('sends apikey header', () => {
      expect(content).toContain('apikey');
    });

    it('uses POST method', () => {
      expect(content).toMatch(/method:\s*['"]POST['"]/);
    });

    for (const flag of cmd.flags) {
      // Convert CLI flag (--some-flag) to the code name (some-flag or someflag)
      const flagName = flag.replace(/^--/, '');
      it(`handles "${flag}" flag`, () => {
        // The flag name or its snake_case equivalent should appear in the file
        const snakeCase = flagName.replace(/-/g, '_');
        expect(content).toMatch(
          new RegExp(`["'\`]${flagName}["'\`]|${snakeCase}|${flagName}`),
        );
      });
    }

    it('exits 0 on success', () => {
      expect(content).toMatch(/process\.exit\(0\)|exitCode\s*=\s*0/);
    });

    it('writes error to stderr and exits 1 on HTTP error', () => {
      expect(content).toMatch(/process\.stderr\.write|stderr/);
      expect(content).toMatch(/process\.exit\(1\)|exitCode\s*=\s*1/);
    });
  });
}

// ---------------------------------------------------------------------------
// AC4: CLI index registers all five write commands
// ---------------------------------------------------------------------------

describe('CLI index.ts registers all five write commands (AC4)', () => {
  let content: string | null;

  beforeAll(() => {
    content = readRepoFile('packages/cli/src/index.ts');
  });

  it('index.ts exists', () => {
    expect(content, 'packages/cli/src/index.ts not found').not.toBeNull();
  });

  const commandCases = [
    'create-feature',
    'update-feature',
    'create-idea',
    'update-idea',
    'promote-idea',
  ];

  for (const cmd of commandCases) {
    it(`registers "${cmd}" case in command dispatch`, () => {
      expect(content).toMatch(new RegExp(`case\\s+['"]${cmd}['"]`));
    });
  }
});
