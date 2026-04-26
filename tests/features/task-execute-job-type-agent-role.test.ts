/**
 * Feature: task-execute job type — task-executor role behavior
 *
 * Static analysis tests covering:
 * - task-executor role prompt contract (migration)
 * - ask_user/update_idea integration surface
 * - repo clone/commit/push/output-path instructions
 */

import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');

const MIGRATIONS_DIR = path.join(REPO_ROOT, 'supabase', 'migrations');
const WORKSPACE_FILE = path.join(REPO_ROOT, 'packages', 'local-agent', 'src', 'workspace.ts');
const MCP_SERVER_FILE = path.join(REPO_ROOT, 'packages', 'local-agent', 'src', 'agent-mcp-server.ts');

function readSource(filePath: string): string {
  try {
    return fs.readFileSync(filePath, 'utf-8');
  } catch {
    return '';
  }
}

function readAllMigrations(): Array<{ name: string; content: string }> {
  try {
    return fs
      .readdirSync(MIGRATIONS_DIR)
      .sort()
      .filter((fileName) => fileName.endsWith('.sql'))
      .map((fileName) => ({
        name: fileName,
        content: fs.readFileSync(path.join(MIGRATIONS_DIR, fileName), 'utf-8'),
      }));
  } catch {
    return [];
  }
}

function findLatestMigrationContaining(...terms: string[]): string | null {
  const migrations = readAllMigrations().reverse(); // newest first
  for (const { content } of migrations) {
    if (terms.every((term) => content.includes(term))) return content;
  }
  return null;
}

// ---------------------------------------------------------------------------
// AC: Reads enriched idea content and idea_messages conversation history
// ---------------------------------------------------------------------------

describe('task-executor role reads enriched idea content and idea_messages history', () => {
  let rolePromptMigration: string | null = null;

  beforeAll(() => {
    rolePromptMigration = findLatestMigrationContaining(
      "WHERE name = 'task-executor'",
      'Read full conversation history',
    );
  });

  it('task-executor role prompt migration exists', () => {
    expect(
      rolePromptMigration,
      "Expected a migration that updates task-executor role prompt (WHERE name = 'task-executor').",
    ).not.toBeNull();
  });

  it('instructs agent to read title, description, and spec from the idea record', () => {
    expect(rolePromptMigration).toMatch(/title/i);
    expect(rolePromptMigration).toMatch(/description/i);
    expect(rolePromptMigration).toMatch(/spec/i);
  });

  it('instructs agent to read conversation history from idea_messages oldest-first', () => {
    expect(rolePromptMigration).toMatch(/idea_messages/i);
    expect(rolePromptMigration).toMatch(/order by created_at asc/i);
  });
});

// ---------------------------------------------------------------------------
// AC: Output type selection by task intent
// ---------------------------------------------------------------------------

describe('task-executor output type selection rules', () => {
  let rolePromptMigration: string | null = null;

  beforeAll(() => {
    rolePromptMigration = findLatestMigrationContaining(
      "WHERE name = 'task-executor'",
      'Determine output type and plan',
    );
  });

  it('presentation ideas are mapped to HTML output', () => {
    expect(rolePromptMigration).toMatch(/presentation/i);
    expect(rolePromptMigration).toMatch(/html/i);
  });

  it('doc ideas are mapped to Markdown (or HTML) output', () => {
    expect(rolePromptMigration).toMatch(/documents?/i);
    expect(rolePromptMigration).toMatch(/markdown|\.md/i);
  });

  it('research ideas are mapped to structured report sections', () => {
    expect(rolePromptMigration).toMatch(/research\/analysis|research/i);
    expect(rolePromptMigration).toMatch(/Executive Summary/i);
    expect(rolePromptMigration).toMatch(/Findings/i);
    expect(rolePromptMigration).toMatch(/Methodology/i);
    expect(rolePromptMigration).toMatch(/Recommendations/i);
  });
});

// ---------------------------------------------------------------------------
// AC: ask_user integration for ambiguous specs
// ---------------------------------------------------------------------------

describe('task-executor ask_user integration for ambiguity handling', () => {
  let rolePromptMigration: string | null = null;
  let workspaceSource = '';
  let mcpServerSource = '';

  beforeAll(() => {
    rolePromptMigration = findLatestMigrationContaining(
      "WHERE name = 'task-executor'",
      'Ask questions if needed',
    );
    workspaceSource = readSource(WORKSPACE_FILE);
    mcpServerSource = readSource(MCP_SERVER_FILE);
  });

  it('role prompt instructs ask_user when spec is ambiguous or missing', () => {
    expect(rolePromptMigration).toMatch(/ask.user/i);
    expect(rolePromptMigration).toMatch(/ambiguous|missing/i);
  });

  it('role prompt instructs ask_user via CLI', () => {
    expect(rolePromptMigration).toMatch(/zazig\s+ask.user/i);
  });

  it('task-executor workspace MCP defaults include ask_user and update_idea', () => {
    const taskToolsBlock = workspaceSource.match(
      /const TASK_EXECUTOR_MCP_TOOLS\s*=\s*\[[^\]]+\]/s,
    );
    expect(taskToolsBlock).not.toBeNull();
    expect(taskToolsBlock![0]).toMatch(/ask_user/);
    expect(taskToolsBlock![0]).toMatch(/update_idea/);
    expect(workspaceSource).toMatch(/["']task-executor["']\s*:\s*TASK_EXECUTOR_MCP_TOOLS/);
  });

  it('ask_user tool exists with timeout path that sets awaiting_response', () => {
    const askUserBlock = mcpServerSource.match(
      /server\.tool\(\s*["']ask_user["'][\s\S]{0,3500}?\)\s*\)/s,
    );
    expect(askUserBlock).not.toBeNull();
    expect(askUserBlock![0]).toMatch(/awaiting_response/);
  });
});

// ---------------------------------------------------------------------------
// AC: Repo clone/commit/push with [idea:<uuid>] and output directories
// ---------------------------------------------------------------------------

describe('task-executor repo write + commit contract', () => {
  let rolePromptMigration: string | null = null;

  beforeAll(() => {
    rolePromptMigration = findLatestMigrationContaining(
      "WHERE name = 'task-executor'",
      'Commit output to company project repo',
    );
  });

  it('instructs clone + push flow for company repo', () => {
    expect(rolePromptMigration).toMatch(/clone/i);
    expect(rolePromptMigration).toMatch(/push to [`'"]?master[`'"]?/i);
  });

  it('specifies task-output destination subdirectories', () => {
    expect(rolePromptMigration).toMatch(/sales\/decks|marketing\/decks/i);
    expect(rolePromptMigration).toMatch(/research\//i);
    expect(rolePromptMigration).toMatch(/docs\//i);
  });

  it('requires commit message to include [idea:<idea_id>]', () => {
    expect(rolePromptMigration).toMatch(/\[idea:<idea_id>\]/i);
  });
});

// ---------------------------------------------------------------------------
// AC: Idea output_path update after commit
// ---------------------------------------------------------------------------

describe('task-executor updates idea output_path after commit', () => {
  let rolePromptMigration: string | null = null;
  let mcpServerSource = '';

  beforeAll(() => {
    rolePromptMigration = findLatestMigrationContaining(
      "WHERE name = 'task-executor'",
      'output_path',
    );
    mcpServerSource = readSource(MCP_SERVER_FILE);
  });

  it('role prompt requires setting output_path on the idea record', () => {
    expect(rolePromptMigration).toMatch(/output_path/i);
    expect(rolePromptMigration).toMatch(/update_idea/i);
  });

  it('update_idea MCP tool is available to task-executor role', () => {
    expect(mcpServerSource).toMatch(/server\.tool\(\s*["']update_idea["']/);
  });
});
