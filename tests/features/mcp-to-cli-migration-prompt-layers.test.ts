/**
 * Feature: MCP to CLI migration — prompt layer updates
 *
 * Covers:
 *   - UNIVERSAL_PROMPT_LAYER (prompt-layers.ts) contains zazig create-project-rule CLI docs
 *   - UNIVERSAL_PROMPT_LAYER does NOT contain create_project_rule MCP tool reference
 *   - UNIVERSAL_PROMPT_LAYER does NOT contain start-expert-session CLI docs (CPO-only)
 *   - UNIVERSAL_PROMPT_LAYER does NOT contain request_feature_fix MCP tool reference
 *   - CPO role migration adds zazig start-expert-session CLI docs
 *   - CPO migration does NOT register start_expert_session as an MCP tool
 *   - No migration or prompt file registers request_feature_fix in any role
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

const PROMPT_LAYERS_FILE = 'supabase/functions/_shared/prompt-layers.ts';

// ---------------------------------------------------------------------------
// Universal prompt layer contains create-project-rule CLI docs
// ---------------------------------------------------------------------------

describe('UNIVERSAL_PROMPT_LAYER contains zazig create-project-rule CLI docs', () => {
  let content: string | null;

  beforeAll(() => {
    content = readRepoFile(PROMPT_LAYERS_FILE);
  });

  it('prompt-layers.ts exists', () => {
    expect(content, `${PROMPT_LAYERS_FILE} not found`).not.toBeNull();
  });

  it('contains "zazig create-project-rule" command reference', () => {
    expect(
      content,
      'UNIVERSAL_PROMPT_LAYER must document "zazig create-project-rule" so every role can use it',
    ).toContain('create-project-rule');
  });

  it('documents --rule-text flag for create-project-rule', () => {
    expect(content).toMatch(/rule.?text/i);
  });

  it('documents --applies-to flag for create-project-rule', () => {
    expect(content).toMatch(/applies.?to/i);
  });
});

// ---------------------------------------------------------------------------
// Universal prompt layer does NOT contain removed MCP tool references
// ---------------------------------------------------------------------------

describe('UNIVERSAL_PROMPT_LAYER does not contain removed MCP tool references', () => {
  let content: string | null;

  beforeAll(() => {
    content = readRepoFile(PROMPT_LAYERS_FILE);
  });

  it('does not reference create_project_rule as an MCP tool', () => {
    // The MCP tool name uses underscores; CLI uses hyphens.
    // After migration, only the CLI form (create-project-rule) should appear.
    // If create_project_rule (underscore) still appears in the prompt layer,
    // it's treating it as an MCP tool rather than a CLI command.
    if (!content) return;
    // Allow 'create-project-rule' (CLI) but reject 'create_project_rule' (MCP tool)
    const withoutCliForm = content.replace(/create-project-rule/g, '');
    expect(withoutCliForm).not.toContain('create_project_rule');
  });

  it('does not reference request_feature_fix', () => {
    expect(content).not.toContain('request_feature_fix');
  });

  it('does not contain start-expert-session CLI docs (CPO-only, not universal)', () => {
    // start-expert-session is CPO-only — it must NOT appear in the universal layer
    expect(content).not.toContain('start-expert-session');
  });

  it('does not reference start_expert_session MCP tool', () => {
    expect(content).not.toContain('start_expert_session');
  });
});

// ---------------------------------------------------------------------------
// CPO role migration adds start-expert-session CLI docs
// ---------------------------------------------------------------------------

describe('CPO role receives zazig start-expert-session CLI documentation', () => {
  let cpoCLIMigrationFile: string | null = null;
  let cpoCLIMigrationContent: string | null = null;

  beforeAll(() => {
    const migrations = listMigrations();
    // Find a migration numbered > 215 that adds start-expert-session CLI docs to the CPO role
    const candidates = migrations.filter((f) => {
      const num = parseInt(f.split('_')[0], 10);
      if (num <= 215) return false;
      const content = readRepoFile(`supabase/migrations/${f}`);
      if (!content) return false;
      const lower = content.toLowerCase();
      return lower.includes('start-expert-session') && lower.includes('cpo');
    }).sort((a, b) => b.localeCompare(a));

    const candidate = candidates[0] ?? null;
    if (candidate) {
      cpoCLIMigrationFile = candidate;
      cpoCLIMigrationContent = readRepoFile(`supabase/migrations/${candidate}`);
    }
  });

  it('a migration exists (numbered > 215) that adds start-expert-session CLI docs to CPO', () => {
    expect(
      cpoCLIMigrationFile,
      'No migration found (numbered > 215) that adds "start-expert-session" CLI docs to the CPO role. ' +
        'Create or update a CPO migration that documents the zazig start-expert-session command.',
    ).not.toBeNull();
  });

  it('CPO migration documents zazig start-expert-session command', () => {
    if (!cpoCLIMigrationContent) {
      expect(cpoCLIMigrationFile, 'No qualifying CPO migration found').not.toBeNull();
      return;
    }
    expect(cpoCLIMigrationContent).toContain('start-expert-session');
  });

  it('CPO migration documents --role-name flag', () => {
    if (!cpoCLIMigrationContent) {
      expect(cpoCLIMigrationFile, 'No qualifying CPO migration found').not.toBeNull();
      return;
    }
    expect(cpoCLIMigrationContent).toMatch(/role.?name/i);
  });

  it('CPO migration documents --brief flag', () => {
    if (!cpoCLIMigrationContent) {
      expect(cpoCLIMigrationFile, 'No qualifying CPO migration found').not.toBeNull();
      return;
    }
    expect(cpoCLIMigrationContent).toMatch(/brief/i);
  });

  it('CPO migration does not re-add start_expert_session MCP tool to CPO mcp_tools', () => {
    if (!cpoCLIMigrationContent) {
      expect(cpoCLIMigrationFile, 'No qualifying CPO migration found').not.toBeNull();
      return;
    }
    // MCP tool additions look like array_append with tool name
    expect(cpoCLIMigrationContent).not.toMatch(
      /array_append.*start_expert_session|start_expert_session.*array_append/i,
    );
    // Also must not add it via direct SET with tool name
    expect(cpoCLIMigrationContent).not.toMatch(
      /SET mcp_tools\s*=\s*'{[^}]*start_expert_session/i,
    );
  });
});

// ---------------------------------------------------------------------------
// No prompt layer or migration re-adds request_feature_fix to any role
// ---------------------------------------------------------------------------

describe('request_feature_fix is not added to any role in new migrations', () => {
  it('no migration > 215 adds request_feature_fix to a role mcp_tools', () => {
    const migrations = listMigrations();
    const badMigrations = migrations.filter((f) => {
      const num = parseInt(f.split('_')[0], 10);
      if (num <= 215) return false;
      const content = readRepoFile(`supabase/migrations/${f}`);
      if (!content) return false;
      // Check for array_append adding request_feature_fix
      return content.match(/array_append.*request_feature_fix|request_feature_fix.*array_append/i);
    });

    expect(
      badMigrations,
      `Found migration(s) that re-add request_feature_fix to a role: ${badMigrations.join(', ')}`,
    ).toHaveLength(0);
  });
});
