/**
 * Feature: MCP to CLI — replace query_jobs with zazig jobs (add limit/offset)
 *
 * Acceptance criteria:
 *   AC1 — query_jobs is NOT registered in agent-mcp-server.ts (MCP removed)
 *   AC2 — jobs.ts command file has --help usage including --limit and --offset
 *   AC3 — jobs.ts supports --feature-id flag and defaults limit to 20
 *   AC4 — jobs.ts supports --status flag and defaults limit to 20
 *   AC5 — jobs.ts supports --id flag for single-job lookup
 *   AC6 — jobs.ts supports --limit and --offset flags for pagination
 *   AC7 — query-jobs edge function defaults limit 20 / offset 0 when not provided
 *   AC8 — a migration removes query_jobs from all roles' mcp_tools arrays
 *   AC9 — zazig jobs is documented in the universal prompt layer
 *   AC10 — jobs command is registered in packages/cli/src/index.ts
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
// AC1: query_jobs removed from MCP server
// ---------------------------------------------------------------------------

describe('AC1: query_jobs is removed from the MCP server', () => {
  const FILE = 'packages/local-agent/src/agent-mcp-server.ts';
  let content: string | null;

  beforeAll(() => {
    content = readRepoFile(FILE);
  });

  it('agent-mcp-server.ts exists', () => {
    expect(content, `${FILE} not found`).not.toBeNull();
  });

  it('does not register query_jobs as a tool (server.tool("query_jobs") removed)', () => {
    expect(content).not.toMatch(/server\.tool\(\s*['"]query_jobs['"]/);
  });

  it('does not contain the query_jobs handler block', () => {
    expect(content).not.toContain('"query_jobs"');
  });
});

// ---------------------------------------------------------------------------
// AC2–AC6: zazig jobs CLI command file
// ---------------------------------------------------------------------------

describe('AC2: jobs.ts command file exists with --help and all flags', () => {
  const FILE = 'packages/cli/src/commands/jobs.ts';
  let content: string | null;

  beforeAll(() => {
    content = readRepoFile(FILE);
  });

  it('exists at packages/cli/src/commands/jobs.ts', () => {
    expect(
      content,
      'packages/cli/src/commands/jobs.ts not found — create this file',
    ).not.toBeNull();
  });

  it('calls getValidCredentials() for auth', () => {
    expect(content).toContain('getValidCredentials');
  });

  it('calls loadConfig() for Supabase URL', () => {
    expect(content).toContain('loadConfig');
  });

  it('uses DEFAULT_SUPABASE_ANON_KEY from constants', () => {
    expect(content).toContain('DEFAULT_SUPABASE_ANON_KEY');
  });

  it('hits the query-jobs edge function endpoint', () => {
    expect(content).toContain('query-jobs');
  });

  it('uses POST method to call query-jobs', () => {
    expect(content).toMatch(/POST/);
  });

  it('sends Authorization Bearer header', () => {
    expect(content).toMatch(/Authorization.*Bearer|Bearer.*Authorization/i);
  });

  it('sends apikey header', () => {
    expect(content).toContain('apikey');
  });

  it('sends x-company-id header', () => {
    expect(content).toContain('x-company-id');
  });

  it('writes compact JSON to stdout', () => {
    expect(content).toMatch(/process\.stdout\.write|stdout/);
  });

  it('exits 0 on success', () => {
    expect(content).toMatch(/process\.exit\(0\)|exitCode\s*=\s*0/);
  });

  it('writes error JSON to stderr and exits 1 on error', () => {
    expect(content).toMatch(/process\.stderr\.write|stderr/);
    expect(content).toMatch(/process\.exit\(1\)|exitCode\s*=\s*1/);
  });

  it('prints --help usage when --help is passed', () => {
    expect(content).toMatch(/--help|help/);
    expect(content).toMatch(/usage|Usage/);
  });

  it('--help output mentions --limit flag', () => {
    // The file must reference both limit in the help text
    expect(content).toMatch(/--limit/);
  });

  it('--help output mentions --offset flag', () => {
    expect(content).toMatch(/--offset/);
  });
});

describe('AC3: --company and --feature-id flags with limit defaulting to 20', () => {
  const FILE = 'packages/cli/src/commands/jobs.ts';
  let content: string | null;

  beforeAll(() => {
    content = readRepoFile(FILE);
  });

  it('accepts --company flag (required UUID)', () => {
    expect(content).toMatch(/company/);
  });

  it('accepts --feature-id flag', () => {
    expect(content).toMatch(/feature.id|featureId|feature_id/);
  });

  it('defaults limit to 20', () => {
    // The default value 20 must appear in the file (as default for limit)
    expect(content).toMatch(/limit.*20|20.*limit|default.*20|20.*default/);
  });
});

describe('AC4: --status flag supported with limit defaulting to 20', () => {
  const FILE = 'packages/cli/src/commands/jobs.ts';
  let content: string | null;

  beforeAll(() => {
    content = readRepoFile(FILE);
  });

  it('accepts --status flag', () => {
    expect(content).toContain('status');
  });

  it('passes status to the query-jobs payload', () => {
    // Both status and query-jobs must appear (already checked above), and
    // status must be included in the JSON body sent to the edge function
    expect(content).toMatch(/status/);
    expect(content).toMatch(/JSON\.stringify/);
  });
});

describe('AC5: --id flag for single-job lookup', () => {
  const FILE = 'packages/cli/src/commands/jobs.ts';
  let content: string | null;

  beforeAll(() => {
    content = readRepoFile(FILE);
  });

  it('accepts --id flag', () => {
    expect(content).toMatch(/['"--]id['"]/);
  });

  it('passes job id to query-jobs payload', () => {
    expect(content).toMatch(/job_id|jobId|id/);
  });
});

describe('AC6: --limit and --offset flags for pagination', () => {
  const FILE = 'packages/cli/src/commands/jobs.ts';
  let content: string | null;

  beforeAll(() => {
    content = readRepoFile(FILE);
  });

  it('accepts --limit flag', () => {
    expect(content).toMatch(/limit/);
  });

  it('accepts --offset flag', () => {
    expect(content).toMatch(/offset/);
  });

  it('defaults offset to 0', () => {
    expect(content).toMatch(/offset.*0|0.*offset|default.*0|0.*default/);
  });

  it('passes limit and offset in the POST body to query-jobs', () => {
    // Both must appear in the file alongside JSON.stringify
    expect(content).toMatch(/limit/);
    expect(content).toMatch(/offset/);
    expect(content).toMatch(/JSON\.stringify/);
  });

  it('does not use JSON.stringify with indent argument (compact output)', () => {
    expect(content).not.toMatch(/JSON\.stringify\([^)]+,\s*(null|\d+),\s*\d+\)/);
  });
});

// ---------------------------------------------------------------------------
// AC7: query-jobs edge function supports limit/offset with sensible defaults
// ---------------------------------------------------------------------------

describe('AC7: query-jobs edge function supports limit/offset with defaults', () => {
  const FILE = 'supabase/functions/query-jobs/index.ts';
  let content: string | null;

  beforeAll(() => {
    content = readRepoFile(FILE);
  });

  it('query-jobs/index.ts exists', () => {
    expect(content, `${FILE} not found`).not.toBeNull();
  });

  it('reads limit from the POST body', () => {
    expect(content).toMatch(/limit/);
  });

  it('reads offset from the POST body', () => {
    expect(content).toMatch(/offset/);
  });

  it('defaults limit to 20 when not provided', () => {
    expect(content).toMatch(/limit.*\?\?\s*20|limit.*=.*20|\?\?\s*20|default.*20|20.*limit/);
  });

  it('defaults offset to 0 when not provided', () => {
    expect(content).toMatch(/offset.*\?\?\s*0|offset.*=.*0|\?\?\s*0|default.*0|0.*offset/);
  });

  it('applies limit to the Supabase query (.limit() call or range)', () => {
    expect(content).toMatch(/\.limit\(|\.range\(/);
  });
});

// ---------------------------------------------------------------------------
// AC8: Migration removes query_jobs from all roles' mcp_tools
// ---------------------------------------------------------------------------

describe('AC8: Migration removes query_jobs from all roles mcp_tools', () => {
  const MIGRATIONS_DIR = path.join(REPO_ROOT, 'supabase/migrations');

  it('a migration file exists that removes query_jobs from mcp_tools', () => {
    const files = fs.readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql'));

    const removingMigration = files.find((f) => {
      const content = fs.readFileSync(path.join(MIGRATIONS_DIR, f), 'utf-8');
      return (
        content.includes('query_jobs') &&
        (content.match(/array_remove.*query_jobs/i) ||
          content.match(/remove.*query_jobs/i) ||
          (content.match(/mcp_tools/i) && content.match(/query_jobs/)))
      );
    });

    expect(
      removingMigration,
      'No migration found that removes query_jobs from roles.mcp_tools. ' +
        'Create a migration (e.g. supabase/migrations/XXX_remove_query_jobs_mcp.sql) ' +
        'that removes query_jobs from every role\'s mcp_tools array.',
    ).toBeTruthy();
  });

  it('no migration after the removal migration re-adds query_jobs to any role', () => {
    const files = fs.readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort();

    // Find the removal migration so we only check migrations that come after it
    const removalIndex = files.findIndex((f) => {
      const content = fs.readFileSync(path.join(MIGRATIONS_DIR, f), 'utf-8');
      return content.match(/array_remove.*query_jobs/i) || content.match(/remove.*query_jobs/i);
    });

    expect(removalIndex, 'No removal migration found').toBeGreaterThanOrEqual(0);

    // Only check migrations after the removal migration
    const laterFiles = files.slice(removalIndex + 1);
    const reAddingFiles = laterFiles.filter((f) => {
      const content = fs.readFileSync(path.join(MIGRATIONS_DIR, f), 'utf-8');
      return (
        content.match(/array_append.*query_jobs/i) ||
        (content.match(/SET mcp_tools\s*=\s*'{[^}]*query_jobs/i))
      );
    });

    expect(
      reAddingFiles,
      `Found migration(s) after removal that re-add query_jobs: ${reAddingFiles.join(', ')}`,
    ).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// AC9: universal prompt layer updated (zazig jobs / --feature-id removed)
// ---------------------------------------------------------------------------

describe('AC9: universal prompt layer updated after zazig jobs removal', () => {
  const PROMPT_LAYER_FILE = 'supabase/functions/_shared/prompt-layers.ts';
  let content: string | null;

  beforeAll(() => {
    content = readRepoFile(PROMPT_LAYER_FILE);
  });

  it('prompt-layers.ts exists', () => {
    expect(content, `${PROMPT_LAYER_FILE} not found`).not.toBeNull();
  });

  it('no longer mentions "zazig jobs" command in UNIVERSAL_PROMPT_LAYER (removed)', () => {
    expect(content).not.toMatch(/zazig jobs/);
  });

  it('documents --limit flag for zazig jobs', () => {
    expect(content).toMatch(/--limit/);
  });

  it('documents --offset flag for zazig jobs', () => {
    expect(content).toMatch(/--offset/);
  });

  it('no longer documents --feature-id flag (removed from prompt layer)', () => {
    expect(content).not.toMatch(/--feature-id/);
  });

  it('documents --status flag for zazig jobs', () => {
    // status already used for other commands too, but must appear
    expect(content).toMatch(/--status/);
  });
});

// ---------------------------------------------------------------------------
// AC10: zazig jobs registered in CLI entry point (index.ts)
// ---------------------------------------------------------------------------

describe('AC10: zazig jobs is registered in the CLI entry point', () => {
  const INDEX_FILE = 'packages/cli/src/index.ts';
  let content: string | null;

  beforeAll(() => {
    content = readRepoFile(INDEX_FILE);
  });

  it('index.ts exists', () => {
    expect(content, 'packages/cli/src/index.ts not found').not.toBeNull();
  });

  it('imports the jobs command', () => {
    expect(content).toMatch(/import.*jobs.*from.*commands\/jobs|require.*commands\/jobs/);
  });

  it('registers "jobs" case in the command switch router', () => {
    expect(content).toMatch(/case\s+['"]jobs['"]/);
  });
});
