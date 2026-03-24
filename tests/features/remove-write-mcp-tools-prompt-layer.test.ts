/**
 * Feature: Remove write MCP tools — replace with CLI commands in prompt layer
 * AC3: Universal prompt layer lists all five write CLI commands with correct flags
 * AC6: Both prompt-layers.ts and universal-layer.ts are in sync
 *
 * These tests verify the write CLI commands are documented in both copies of
 * the universal prompt layer. They FAIL against the current codebase (neither
 * file has write commands yet) and pass once the feature is built.
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

const SHARED_LAYER = 'packages/shared/src/prompt/universal-layer.ts';
const EDGE_LAYER = 'supabase/functions/_shared/prompt-layers.ts';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Extracts the UNIVERSAL_PROMPT_LAYER string value from a TypeScript source
 * file that exports it as a template literal or string constant.
 */
function extractPromptLayerContent(source: string): string {
  // The export is: export const UNIVERSAL_PROMPT_LAYER = `...`;
  // We capture everything between the first backtick after the = and the
  // closing backtick followed by semicolon/newline.
  const match = source.match(/UNIVERSAL_PROMPT_LAYER\s*=\s*`([\s\S]*?)`\s*;/);
  return match ? match[1] : source;
}

// ---------------------------------------------------------------------------
// AC3: packages/shared/src/prompt/universal-layer.ts has write commands
// ---------------------------------------------------------------------------

describe('packages/shared universal-layer.ts — write CLI commands', () => {
  let content: string | null;
  let layer: string;

  beforeAll(() => {
    content = readRepoFile(SHARED_LAYER);
    layer = content ? extractPromptLayerContent(content) : '';
  });

  it('file exists', () => {
    expect(content, `${SHARED_LAYER} not found`).not.toBeNull();
  });

  it('has a Write commands section', () => {
    expect(layer).toMatch(/###?\s*Write commands/i);
  });

  it('documents zazig create-feature command', () => {
    expect(layer).toContain('zazig create-feature');
  });

  it('documents --title flag for create-feature', () => {
    // create-feature requires --title
    expect(layer).toMatch(/create-feature[^\n]*--title/);
  });

  it('documents --description flag for create-feature', () => {
    expect(layer).toMatch(/create-feature[^\n]*--description/);
  });

  it('documents --spec flag for create-feature', () => {
    expect(layer).toMatch(/create-feature[^\n]*--spec/);
  });

  it('documents --acceptance-tests flag for create-feature', () => {
    expect(layer).toMatch(/create-feature[^\n]*--acceptance-tests/);
  });

  it('documents --priority flag for create-feature', () => {
    expect(layer).toMatch(/create-feature[^\n]*--priority/);
  });

  it('documents zazig update-feature command', () => {
    expect(layer).toContain('zazig update-feature');
  });

  it('documents --id flag for update-feature', () => {
    expect(layer).toMatch(/update-feature[^\n]*--id/);
  });

  it('documents --status flag for update-feature', () => {
    expect(layer).toMatch(/update-feature[^\n]*--status/);
  });

  it('documents zazig create-idea command', () => {
    expect(layer).toContain('zazig create-idea');
  });

  it('documents --raw-text flag for create-idea', () => {
    expect(layer).toMatch(/create-idea[^\n]*--raw-text/);
  });

  it('documents --originator flag for create-idea', () => {
    expect(layer).toMatch(/create-idea[^\n]*--originator/);
  });

  it('documents zazig update-idea command', () => {
    expect(layer).toContain('zazig update-idea');
  });

  it('documents --id flag for update-idea', () => {
    expect(layer).toMatch(/update-idea[^\n]*--id/);
  });

  it('documents --raw-text flag for update-idea', () => {
    expect(layer).toMatch(/update-idea[^\n]*--raw-text/);
  });

  it('documents zazig promote-idea command', () => {
    expect(layer).toContain('zazig promote-idea');
  });

  it('documents --id flag for promote-idea', () => {
    expect(layer).toMatch(/promote-idea[^\n]*--id/);
  });

  it('still has the Read commands section', () => {
    // Regression: existing read commands must remain
    expect(layer).toMatch(/###?\s*(Available|Read) commands/i);
    expect(layer).toContain('zazig snapshot');
    expect(layer).toContain('zazig ideas');
    expect(layer).toContain('zazig features');
  });
});

// ---------------------------------------------------------------------------
// AC3: supabase/functions/_shared/prompt-layers.ts has write commands
// ---------------------------------------------------------------------------

describe('supabase/functions/_shared/prompt-layers.ts — write CLI commands', () => {
  let content: string | null;
  let layer: string;

  beforeAll(() => {
    content = readRepoFile(EDGE_LAYER);
    layer = content ? extractPromptLayerContent(content) : '';
  });

  it('file exists', () => {
    expect(content, `${EDGE_LAYER} not found`).not.toBeNull();
  });

  it('has a Write commands section', () => {
    expect(layer).toMatch(/###?\s*Write commands/i);
  });

  it('documents zazig create-feature command', () => {
    expect(layer).toContain('zazig create-feature');
  });

  it('documents --title flag for create-feature', () => {
    expect(layer).toMatch(/create-feature[^\n]*--title/);
  });

  it('documents --acceptance-tests flag for create-feature', () => {
    expect(layer).toMatch(/create-feature[^\n]*--acceptance-tests/);
  });

  it('documents --priority flag for create-feature', () => {
    expect(layer).toMatch(/create-feature[^\n]*--priority/);
  });

  it('documents zazig update-feature command', () => {
    expect(layer).toContain('zazig update-feature');
  });

  it('documents zazig create-idea command', () => {
    expect(layer).toContain('zazig create-idea');
  });

  it('documents --raw-text flag for create-idea', () => {
    expect(layer).toMatch(/create-idea[^\n]*--raw-text/);
  });

  it('documents --originator flag for create-idea', () => {
    expect(layer).toMatch(/create-idea[^\n]*--originator/);
  });

  it('documents zazig update-idea command', () => {
    expect(layer).toContain('zazig update-idea');
  });

  it('documents zazig promote-idea command', () => {
    expect(layer).toContain('zazig promote-idea');
  });

  it('still has the Read commands section', () => {
    expect(layer).toContain('zazig snapshot');
    expect(layer).toContain('zazig ideas');
    expect(layer).toContain('zazig features');
  });
});

// ---------------------------------------------------------------------------
// AC6: Both files export the same write CLI commands
// ---------------------------------------------------------------------------

describe('prompt layer sync — shared and edge functions in sync (AC6)', () => {
  let sharedContent: string | null;
  let edgeContent: string | null;
  let sharedLayer: string;
  let edgeLayer: string;

  beforeAll(() => {
    sharedContent = readRepoFile(SHARED_LAYER);
    edgeContent = readRepoFile(EDGE_LAYER);
    sharedLayer = sharedContent ? extractPromptLayerContent(sharedContent) : '';
    edgeLayer = edgeContent ? extractPromptLayerContent(edgeContent) : '';
  });

  it('both files exist', () => {
    expect(sharedContent, `${SHARED_LAYER} not found`).not.toBeNull();
    expect(edgeContent, `${EDGE_LAYER} not found`).not.toBeNull();
  });

  const writeCommands = [
    'zazig create-feature',
    'zazig update-feature',
    'zazig create-idea',
    'zazig update-idea',
    'zazig promote-idea',
  ];

  for (const cmd of writeCommands) {
    it(`both files contain "${cmd}"`, () => {
      expect(sharedLayer, `shared universal-layer.ts missing "${cmd}"`).toContain(cmd);
      expect(edgeLayer, `edge prompt-layers.ts missing "${cmd}"`).toContain(cmd);
    });
  }

  it('both files mention --acceptance-tests flag (key shared flag)', () => {
    expect(sharedLayer).toContain('--acceptance-tests');
    expect(edgeLayer).toContain('--acceptance-tests');
  });

  it('both files mention --raw-text flag (key shared flag)', () => {
    expect(sharedLayer).toContain('--raw-text');
    expect(edgeLayer).toContain('--raw-text');
  });

  it('both files mention --originator flag (required by create-idea)', () => {
    expect(sharedLayer).toContain('--originator');
    expect(edgeLayer).toContain('--originator');
  });
});
