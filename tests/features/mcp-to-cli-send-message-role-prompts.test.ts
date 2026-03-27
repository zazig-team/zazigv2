/**
 * Feature: MCP to CLI — replace send_message with zazig send-message-to-human
 *
 * AC5: test-deployer role prompt references zazig send-message-to-human (not send_message MCP)
 * AC6: tester role prompt references zazig send-message-to-human (not send_message MCP)
 * AC7: monitoring-agent role prompt references zazig send-message-to-human (not send_message MCP)
 *
 * Approach: inspect migration files for each affected role — the feature requires
 * a prompt-update migration that replaces send_message MCP references with the CLI
 * command in test-deployer, tester, and monitoring-agent prompts.
 *
 * Tests FAIL against the current codebase (no such migration exists yet).
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

/**
 * Find the most recent migration that updates a given role's prompt to reference
 * the zazig send-message-to-human CLI command.
 */
function findPromptMigrationForRole(roleName: string): { file: string; content: string } | null {
  const migrations = listMigrations();
  const candidates = migrations
    .filter((f) => {
      const content = readRepoFile(`supabase/migrations/${f}`);
      if (!content) return false;
      return (
        content.includes(roleName) &&
        content.includes('send-message-to-human')
      );
    })
    .sort((a, b) => b.localeCompare(a));

  const candidate = candidates[0];
  if (!candidate) return null;
  const content = readRepoFile(`supabase/migrations/${candidate}`);
  return content ? { file: candidate, content } : null;
}

/**
 * Find all migrations that update a given role's prompt in any way,
 * returning sorted newest-first.
 */
function findAllPromptMigrationsForRole(roleName: string): Array<{ file: string; content: string }> {
  const migrations = listMigrations();
  return migrations
    .filter((f) => {
      const content = readRepoFile(`supabase/migrations/${f}`);
      if (!content) return false;
      return content.includes(roleName) && content.toLowerCase().includes('prompt');
    })
    .sort((a, b) => b.localeCompare(a))
    .map((f) => ({ file: f, content: readRepoFile(`supabase/migrations/${f}`)! }));
}

// ---------------------------------------------------------------------------
// Shared helper for per-role acceptance criteria
// ---------------------------------------------------------------------------

function describeRolePromptTests(roleName: string) {
  describe(`role prompt — ${roleName} references zazig send-message-to-human`, () => {
    let migration: { file: string; content: string } | null = null;

    beforeAll(() => {
      migration = findPromptMigrationForRole(roleName);
    });

    it(`a migration exists that updates ${roleName} prompt to reference zazig send-message-to-human`, () => {
      expect(
        migration,
        `No migration found that updates the ${roleName} role prompt to reference ` +
          '"zazig send-message-to-human". ' +
          `Create a migration that updates the ${roleName} prompt to use the CLI command ` +
          'instead of the send_message MCP tool.',
      ).not.toBeNull();
    });

    it(`migration references "zazig send-message-to-human" in the ${roleName} prompt update`, () => {
      if (!migration) {
        expect(migration, 'No qualifying migration found').not.toBeNull();
        return;
      }
      expect(migration.content).toContain('zazig send-message-to-human');
    });

    it(`migration targets the ${roleName} role (WHERE name = '${roleName}')`, () => {
      if (!migration) {
        expect(migration, 'No qualifying migration found').not.toBeNull();
        return;
      }
      expect(migration.content).toContain(roleName);
    });

    it(`migration updates the roles table prompt column for ${roleName}`, () => {
      if (!migration) {
        expect(migration, 'No qualifying migration found').not.toBeNull();
        return;
      }
      // Should be an UPDATE on roles setting prompt
      expect(migration.content.toLowerCase()).toMatch(/update.*roles|roles.*prompt/s);
    });

    it(`most recent ${roleName} prompt migration does NOT retain bare "send_message" MCP references`, () => {
      if (!migration) {
        expect(migration, 'No qualifying migration found').not.toBeNull();
        return;
      }
      // The prompt update content should not instruct the agent to use the old MCP
      // tool name "send_message" — it should only reference the CLI form.
      // We allow "send_message" to appear ONLY in a removal/replace context (e.g. a comment
      // saying "replaced send_message with zazig send-message-to-human"), not as an instruction.
      // Check: the migration body should not contain 'send_message MCP' or 'use send_message'
      // as an active instruction to the agent.
      expect(migration.content).not.toMatch(/use\s+send_message\b/i);
      expect(migration.content).not.toMatch(/call\s+send_message\b/i);
    });
  });
}

// ---------------------------------------------------------------------------
// AC5: test-deployer
// AC6: tester
// AC7: monitoring-agent
// ---------------------------------------------------------------------------

describeRolePromptTests('test-deployer');
describeRolePromptTests('tester');
describeRolePromptTests('monitoring-agent');

// ---------------------------------------------------------------------------
// Cross-cutting: no role should have send_message as active instruction in
// its most recent prompt migration (ensures full migration coverage)
// ---------------------------------------------------------------------------

describe('cross-cutting — no role prompt migration adds send_message as an MCP instruction', () => {
  it('no migration after the feature removal adds "send_message" as an agent tool instruction', () => {
    // Find the removal migration (the one that strips send_message from mcp_tools).
    const migrations = listMigrations().sort((a, b) => b.localeCompare(a));
    const removalMigration = migrations.find((f) => {
      const content = readRepoFile(`supabase/migrations/${f}`);
      return content?.includes('send_message') && content?.includes('mcp_tools') && content?.includes('roles');
    });

    if (!removalMigration) {
      // The removal migration doesn't exist yet — this test just passes vacuously
      // (we're testing the post-feature state, not current state).
      return;
    }

    // Any migration AFTER the removal should not introduce send_message as a new MCP tool.
    const migrationsAfter = migrations.filter((f) => f > removalMigration);
    for (const f of migrationsAfter) {
      const content = readRepoFile(`supabase/migrations/${f}`);
      if (!content) continue;
      // Should not register send_message as a new MCP tool in any later migration.
      expect(content, `Migration ${f} should not re-add send_message as an MCP tool`).not.toMatch(
        /mcp_tools.*send_message.*INSERT|INSERT.*send_message.*mcp_tools/i,
      );
    }
  });
});

// ---------------------------------------------------------------------------
// Skill file: projects/skills/harden.md should reference zazig CLI, not send_message MCP
// ---------------------------------------------------------------------------

describe('skill file — harden.md uses zazig send-message-to-human (not send_message MCP)', () => {
  let hardenContent: string | null;

  beforeAll(() => {
    hardenContent = readRepoFile('projects/skills/harden.md');
  });

  it('projects/skills/harden.md exists', () => {
    expect(
      hardenContent,
      'projects/skills/harden.md not found — expected skill file to exist',
    ).not.toBeNull();
  });

  it('harden.md does NOT instruct agents to use send_message MCP tool', () => {
    if (!hardenContent) {
      expect(hardenContent, 'harden.md not found').not.toBeNull();
      return;
    }
    // After the feature: any reference to send_message in harden.md should be replaced
    // with zazig send-message-to-human. Check it's not being used as an MCP call.
    expect(hardenContent).not.toMatch(/`send_message`|send_message\s+MCP|call.*send_message/i);
  });

  it('harden.md references zazig send-message-to-human instead', () => {
    if (!hardenContent) {
      expect(hardenContent, 'harden.md not found').not.toBeNull();
      return;
    }
    expect(
      hardenContent,
      'harden.md should reference "zazig send-message-to-human" as the CLI command to use',
    ).toContain('zazig send-message-to-human');
  });
});
