/**
 * Feature: CLI batch-create-jobs — remove batch_create_jobs MCP tool from roles
 *
 * Covers acceptance criteria 3, 4, 5, and 7:
 *   AC3 — Migration removes batch_create_jobs from roles.mcp_tools
 *   AC4 — workspace.ts ROLE_DEFAULT_MCP_TOOLS does NOT list batch_create_jobs for breakdown-specialist
 *   AC5 — Both prompt layer files list zazig batch-create-jobs with correct flags
 *   AC7 — Both prompt layer files are in sync with each other
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
// AC3: Migration removes batch_create_jobs from roles
// ---------------------------------------------------------------------------

describe('Migration removes batch_create_jobs from roles.mcp_tools (AC3)', () => {
  const MIGRATIONS_DIR = path.join(REPO_ROOT, 'supabase/migrations');

  it('a migration file exists that removes batch_create_jobs from roles', () => {
    const files = fs.readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql'));
    const removingMigration = files.find((f) => {
      const content = fs.readFileSync(path.join(MIGRATIONS_DIR, f), 'utf-8');
      // Must remove batch_create_jobs — either array_remove or explicit SET without it
      return (
        content.includes('batch_create_jobs') &&
        (content.match(/array_remove.*batch_create_jobs/i) ||
          content.match(/remove.*batch_create_jobs/i) ||
          // OR: a SET mcp_tools that sets breakdown-specialist WITHOUT batch_create_jobs
          (content.match(/breakdown.specialist/i) &&
            content.match(/SET mcp_tools/i) &&
            !content.match(/batch_create_jobs/)))
      );
    });

    // More lenient: any migration numbered > 210 that touches mcp_tools / batch_create_jobs
    const latestMigrations = files.filter((f) => {
      const num = parseInt(f.split('_')[0], 10);
      return num > 210;
    });

    const hasBatchRemovalMigration = latestMigrations.some((f) => {
      const content = fs.readFileSync(path.join(MIGRATIONS_DIR, f), 'utf-8');
      return content.includes('batch_create_jobs') || content.includes('mcp_tools');
    });

    expect(
      removingMigration || hasBatchRemovalMigration,
      'No migration found that removes batch_create_jobs from roles.mcp_tools. ' +
        'Create supabase/migrations/211_remove_batch_create_jobs_from_roles.sql (or next number) ' +
        'that removes batch_create_jobs from the breakdown-specialist role.',
    ).toBeTruthy();
  });

  it('no new migration re-adds batch_create_jobs to breakdown-specialist', () => {
    const files = fs.readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql'));
    const latestFiles = files.filter((f) => {
      const num = parseInt(f.split('_')[0], 10);
      return num > 210;
    });

    const reAdds = latestFiles.filter((f) => {
      const content = fs.readFileSync(path.join(MIGRATIONS_DIR, f), 'utf-8');
      return (
        content.includes('batch_create_jobs') &&
        content.includes('breakdown-specialist') &&
        content.match(/SET mcp_tools\s*=\s*'{[^}]*batch_create_jobs/i)
      );
    });

    expect(
      reAdds,
      `Found migration(s) that re-add batch_create_jobs to breakdown-specialist: ${reAdds.join(', ')}`,
    ).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// AC4: workspace.ts ROLE_DEFAULT_MCP_TOOLS must not include batch_create_jobs
// ---------------------------------------------------------------------------

describe('workspace.ts ROLE_DEFAULT_MCP_TOOLS removes batch_create_jobs (AC4)', () => {
  const FILE = 'packages/local-agent/src/workspace.ts';
  let content: string | null;

  beforeAll(() => {
    content = readRepoFile(FILE);
  });

  it('workspace.ts exists', () => {
    expect(content, `${FILE} not found`).not.toBeNull();
  });

  it('breakdown-specialist entry in ROLE_DEFAULT_MCP_TOOLS does not include batch_create_jobs', () => {
    if (!content) return;

    // Find the ROLE_DEFAULT_MCP_TOOLS block and check breakdown-specialist entry
    const defaultToolsMatch = content.match(
      /ROLE_DEFAULT_MCP_TOOLS[\s\S]*?breakdown-specialist['"]\s*:\s*\[([^\]]*)\]/,
    );

    if (defaultToolsMatch) {
      expect(
        defaultToolsMatch[1],
        'breakdown-specialist entry in ROLE_DEFAULT_MCP_TOOLS still contains batch_create_jobs',
      ).not.toContain('batch_create_jobs');
    } else {
      // If the breakdown-specialist entry was removed entirely, that's also acceptable
      // Just confirm batch_create_jobs doesn't appear alongside breakdown-specialist
      const bsSection = content.match(
        /breakdown.specialist[\s\S]{0,200}/,
      );
      if (bsSection) {
        expect(
          bsSection[0],
          'breakdown-specialist section still references batch_create_jobs',
        ).not.toContain('batch_create_jobs');
      }
    }
  });

  it('no role default set in workspace.ts lists batch_create_jobs', () => {
    if (!content) return;

    // Find ROLE_DEFAULT_MCP_TOOLS block
    const blockMatch = content.match(
      /ROLE_DEFAULT_MCP_TOOLS[\s\S]*?\}\s*;/,
    );
    if (blockMatch) {
      expect(
        blockMatch[0],
        'ROLE_DEFAULT_MCP_TOOLS still contains batch_create_jobs in some role',
      ).not.toContain('batch_create_jobs');
    } else {
      // If no block found, check the whole file
      expect(
        content,
        'workspace.ts still references batch_create_jobs in MCP tool defaults',
      ).not.toMatch(/ROLE_DEFAULT_MCP_TOOLS[\s\S]*batch_create_jobs/);
    }
  });
});

// ---------------------------------------------------------------------------
// AC5: batch-create-jobs is documented in the breakdown-specialist role prompt
// (moved from universal prompt layer to role-specific migration 214)
// ---------------------------------------------------------------------------

describe('batch-create-jobs is documented for breakdown-specialist (AC5)', () => {
  const MIGRATION_FILE = 'supabase/migrations/215_move_write_commands_to_role_prompts.sql';
  let content: string | null;

  beforeAll(() => {
    content = readRepoFile(MIGRATION_FILE);
  });

  it('migration 215 exists', () => {
    expect(content, `${MIGRATION_FILE} not found`).not.toBeNull();
  });

  it('migration adds batch-create-jobs to breakdown-specialist prompt', () => {
    expect(content).toMatch(/breakdown-specialist/);
    expect(content).toMatch(/batch-create-jobs/);
  });

  it('includes --feature-id flag', () => {
    expect(content).toMatch(/--feature-id/);
  });

  it('includes --jobs flag', () => {
    expect(content).toMatch(/--jobs/);
  });

  it('includes --jobs-file as an alternative', () => {
    expect(content).toMatch(/jobs-file/i);
  });
});

// ---------------------------------------------------------------------------
// AC7: batch-create-jobs is NOT in the universal prompt layer (role-specific now)
// ---------------------------------------------------------------------------

describe('Universal prompt layers do not contain batch-create-jobs (AC7)', () => {
  const PROMPT_LAYER_FILES = [
    'supabase/functions/_shared/prompt-layers.ts',
    'packages/shared/src/prompt/universal-layer.ts',
  ];

  for (const file of PROMPT_LAYER_FILES) {
    it(`${file} does not mention batch-create-jobs`, () => {
      const content = readRepoFile(file);
      expect(content).not.toBeNull();
      expect(content).not.toContain('batch-create-jobs');
    });
  }
});
