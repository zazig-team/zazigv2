/**
 * Feature: Remove write MCP tools — replace with CLI commands in prompt layer
 *
 * Tests for acceptance criteria 3, 4, and 6:
 *   AC3: Universal prompt layer lists all five write CLI commands with correct flags.
 *   AC4: CLI write command files still exist and POST to edge functions (not MCP).
 *   AC6: Both prompt-layers.ts and universal-layer.ts are in sync.
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

// ---------------------------------------------------------------------------
// AC3: supabase/functions/_shared/prompt-layers.ts has write CLI commands
// ---------------------------------------------------------------------------

describe('prompt-layers.ts: write CLI commands section', () => {
  const FILE = 'supabase/functions/_shared/prompt-layers.ts';
  let content: string | null;

  beforeAll(() => {
    content = readRepoFile(FILE);
  });

  it('file exists', () => {
    expect(content, `${FILE} not found`).not.toBeNull();
  });

  it('contains a Write commands section heading', () => {
    expect(content).toMatch(/###\s*Write commands/i);
  });

  it('documents zazig create-feature command', () => {
    expect(content).toContain('zazig create-feature');
  });

  it('documents --title flag for create-feature', () => {
    // The create-feature command requires --title
    const idx = (content ?? '').indexOf('zazig create-feature');
    const snippet = (content ?? '').slice(idx, idx + 200);
    expect(snippet).toContain('--title');
  });

  it('documents --description flag for create-feature', () => {
    const idx = (content ?? '').indexOf('zazig create-feature');
    const snippet = (content ?? '').slice(idx, idx + 300);
    expect(snippet).toContain('--description');
  });

  it('documents --spec flag for create-feature', () => {
    const idx = (content ?? '').indexOf('zazig create-feature');
    const snippet = (content ?? '').slice(idx, idx + 300);
    expect(snippet).toContain('--spec');
  });

  it('documents --acceptance-tests flag for create-feature', () => {
    const idx = (content ?? '').indexOf('zazig create-feature');
    const snippet = (content ?? '').slice(idx, idx + 400);
    expect(snippet).toContain('--acceptance-tests');
  });

  it('documents --priority flag for create-feature', () => {
    const idx = (content ?? '').indexOf('zazig create-feature');
    const snippet = (content ?? '').slice(idx, idx + 400);
    expect(snippet).toContain('--priority');
  });

  it('documents zazig update-feature command', () => {
    expect(content).toContain('zazig update-feature');
  });

  it('documents --id flag for update-feature', () => {
    const idx = (content ?? '').indexOf('zazig update-feature');
    const snippet = (content ?? '').slice(idx, idx + 200);
    expect(snippet).toContain('--id');
  });

  it('documents --status flag for update-feature', () => {
    const idx = (content ?? '').indexOf('zazig update-feature');
    const snippet = (content ?? '').slice(idx, idx + 300);
    expect(snippet).toContain('--status');
  });

  it('documents zazig create-idea command', () => {
    expect(content).toContain('zazig create-idea');
  });

  it('documents --raw-text flag for create-idea', () => {
    const idx = (content ?? '').indexOf('zazig create-idea');
    const snippet = (content ?? '').slice(idx, idx + 200);
    expect(snippet).toContain('--raw-text');
  });

  it('documents --originator flag for create-idea', () => {
    const idx = (content ?? '').indexOf('zazig create-idea');
    const snippet = (content ?? '').slice(idx, idx + 300);
    expect(snippet).toContain('--originator');
  });

  it('documents zazig update-idea command', () => {
    expect(content).toContain('zazig update-idea');
  });

  it('documents --id flag for update-idea', () => {
    const idx = (content ?? '').indexOf('zazig update-idea');
    const snippet = (content ?? '').slice(idx, idx + 200);
    expect(snippet).toContain('--id');
  });

  it('documents zazig promote-idea command', () => {
    expect(content).toContain('zazig promote-idea');
  });

  it('documents --id flag for promote-idea', () => {
    const idx = (content ?? '').indexOf('zazig promote-idea');
    const snippet = (content ?? '').slice(idx, idx + 200);
    expect(snippet).toContain('--id');
  });

  it('documents --to flag for promote-idea (the actual CLI flag name)', () => {
    // CLI uses --to (feature|job|research|capability), not positional
    const idx = (content ?? '').indexOf('zazig promote-idea');
    const snippet = (content ?? '').slice(idx, idx + 300);
    expect(snippet).toContain('--to');
  });
});

// ---------------------------------------------------------------------------
// AC3: packages/shared/src/prompt/universal-layer.ts has write CLI commands
// ---------------------------------------------------------------------------

describe('universal-layer.ts: write CLI commands section', () => {
  const FILE = 'packages/shared/src/prompt/universal-layer.ts';
  let content: string | null;

  beforeAll(() => {
    content = readRepoFile(FILE);
  });

  it('file exists', () => {
    expect(content, `${FILE} not found`).not.toBeNull();
  });

  it('contains a Write commands section heading', () => {
    expect(content).toMatch(/###\s*Write commands/i);
  });

  it('documents zazig create-feature command', () => {
    expect(content).toContain('zazig create-feature');
  });

  it('documents --acceptance-tests flag for create-feature', () => {
    const idx = (content ?? '').indexOf('zazig create-feature');
    const snippet = (content ?? '').slice(idx, idx + 400);
    expect(snippet).toContain('--acceptance-tests');
  });

  it('documents zazig update-feature command', () => {
    expect(content).toContain('zazig update-feature');
  });

  it('documents zazig create-idea command', () => {
    expect(content).toContain('zazig create-idea');
  });

  it('documents --raw-text flag for create-idea', () => {
    const idx = (content ?? '').indexOf('zazig create-idea');
    const snippet = (content ?? '').slice(idx, idx + 200);
    expect(snippet).toContain('--raw-text');
  });

  it('documents zazig update-idea command', () => {
    expect(content).toContain('zazig update-idea');
  });

  it('documents zazig promote-idea command', () => {
    expect(content).toContain('zazig promote-idea');
  });
});

// ---------------------------------------------------------------------------
// AC4: CLI write command files still exist and call edge functions via fetch
// ---------------------------------------------------------------------------

describe('CLI write commands: files exist and post to edge functions', () => {
  const commands = [
    {
      name: 'create-feature',
      file: 'packages/cli/src/commands/create-feature.ts',
      endpoint: 'create-feature',
    },
    {
      name: 'update-feature',
      file: 'packages/cli/src/commands/update-feature.ts',
      endpoint: 'update-feature',
    },
    {
      name: 'create-idea',
      file: 'packages/cli/src/commands/create-idea.ts',
      endpoint: 'create-idea',
    },
    {
      name: 'update-idea',
      file: 'packages/cli/src/commands/update-idea.ts',
      endpoint: 'update-idea',
    },
    {
      name: 'promote-idea',
      file: 'packages/cli/src/commands/promote-idea.ts',
      endpoint: 'promote-idea',
    },
  ];

  for (const cmd of commands) {
    describe(`${cmd.name} command`, () => {
      let content: string | null;

      beforeAll(() => {
        content = readRepoFile(cmd.file);
      });

      it(`${cmd.file} still exists`, () => {
        expect(content, `${cmd.file} was deleted — CLI must keep calling edge functions directly`).not.toBeNull();
      });

      it(`calls ${cmd.endpoint} edge function via fetch (not MCP)`, () => {
        expect(content).toContain(`functions/v1/${cmd.endpoint}`);
      });

      it('uses fetch() directly, not MCP messaging', () => {
        expect(content).toContain('fetch(');
        expect(content).not.toContain('mcp__zazig');
      });

      it('sends POST request to edge function', () => {
        expect(content).toMatch(/method:\s*["']POST["']/);
      });
    });
  }

  it('CLI index.ts still registers all five write commands', () => {
    const indexContent = readRepoFile('packages/cli/src/index.ts');
    expect(indexContent).toMatch(/case\s+["']create-feature["']/);
    expect(indexContent).toMatch(/case\s+["']update-feature["']/);
    expect(indexContent).toMatch(/case\s+["']create-idea["']/);
    expect(indexContent).toMatch(/case\s+["']update-idea["']/);
    expect(indexContent).toMatch(/case\s+["']promote-idea["']/);
  });
});

// ---------------------------------------------------------------------------
// Edge functions: source files still exist (not deleted by this change)
// ---------------------------------------------------------------------------

describe('Edge functions: source files are NOT deleted', () => {
  const edgeFunctions = [
    'supabase/functions/create-feature/index.ts',
    'supabase/functions/update-feature/index.ts',
    'supabase/functions/create-idea/index.ts',
    'supabase/functions/update-idea/index.ts',
    'supabase/functions/promote-idea/index.ts',
  ];

  for (const fn of edgeFunctions) {
    it(`${fn} still exists (edge function is kept — CLI POSTs to it)`, () => {
      const content = readRepoFile(fn);
      expect(
        content,
        `${fn} was deleted. Edge functions must remain — the CLI calls them. Only MCP access is removed.`,
      ).not.toBeNull();
    });
  }
});

// ---------------------------------------------------------------------------
// AC6: prompt-layers.ts and universal-layer.ts are in sync
// ---------------------------------------------------------------------------

describe('Sync: prompt-layers.ts and universal-layer.ts have the same write commands', () => {
  const EDGE_FILE = 'supabase/functions/_shared/prompt-layers.ts';
  const SHARED_FILE = 'packages/shared/src/prompt/universal-layer.ts';

  let edgeContent: string | null;
  let sharedContent: string | null;

  beforeAll(() => {
    edgeContent = readRepoFile(EDGE_FILE);
    sharedContent = readRepoFile(SHARED_FILE);
  });

  const writeCommands = [
    'zazig create-feature',
    'zazig update-feature',
    'zazig create-idea',
    'zazig update-idea',
    'zazig promote-idea',
  ];

  for (const cmd of writeCommands) {
    it(`both files document "${cmd}"`, () => {
      expect(edgeContent, `${EDGE_FILE} missing "${cmd}"`).toContain(cmd);
      expect(sharedContent, `${SHARED_FILE} missing "${cmd}"`).toContain(cmd);
    });
  }

  it('both files have the Write commands section heading', () => {
    expect(edgeContent).toMatch(/###\s*Write commands/i);
    expect(sharedContent).toMatch(/###\s*Write commands/i);
  });
});
