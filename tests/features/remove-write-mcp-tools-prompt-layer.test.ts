/**
 * Feature: Remove write MCP tools — replace with CLI read commands in prompt layer
 * AC3: Universal prompt layer documents read CLI commands and shared flags
 * AC6: prompt-layers.ts and universal-layer.ts are in sync
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

const READ_COMMANDS = [
  'zazig snapshot --company <company_id>',
  'zazig ideas --company <company_id>',
  'zazig features --company <company_id>',
  'zazig projects --company <company_id>',
];

const COMMON_FLAGS = [
  '--limit <n>',
  '--offset <n>',
  '--status <value>',
  '--id <uuid>',
  '--search <term>',
];

const REMOVED_WRITE_COMMANDS = [
  'zazig create-feature',
  'zazig update-feature',
  'zazig create-idea',
  'zazig update-idea',
  'zazig promote-idea',
];

// ---------------------------------------------------------------------------
// AC3: packages/shared/src/prompt/universal-layer.ts has read commands
// ---------------------------------------------------------------------------

describe('packages/shared universal-layer.ts — read CLI commands', () => {
  let content: string | null;
  let layer: string;

  beforeAll(() => {
    content = readRepoFile(SHARED_LAYER);
    layer = content ? extractPromptLayerContent(content) : '';
  });

  it('file exists', () => {
    expect(content, `${SHARED_LAYER} not found`).not.toBeNull();
  });

  it('has the CLI commands section', () => {
    expect(layer).toContain('## CLI Commands');
  });

  it('documents read commands', () => {
    for (const cmd of READ_COMMANDS) {
      expect(layer).toContain(cmd);
    }
  });

  it('documents common read flags', () => {
    for (const flag of COMMON_FLAGS) {
      expect(layer).toContain(flag);
    }
  });

  it('does not document removed write commands', () => {
    for (const cmd of REMOVED_WRITE_COMMANDS) {
      expect(layer).not.toContain(cmd);
    }
  });
});

// ---------------------------------------------------------------------------
// AC3: supabase/functions/_shared/prompt-layers.ts has read commands
// ---------------------------------------------------------------------------

describe('supabase/functions/_shared/prompt-layers.ts — read CLI commands', () => {
  let content: string | null;
  let layer: string;

  beforeAll(() => {
    content = readRepoFile(EDGE_LAYER);
    layer = content ? extractPromptLayerContent(content) : '';
  });

  it('file exists', () => {
    expect(content, `${EDGE_LAYER} not found`).not.toBeNull();
  });

  it('has the CLI commands section', () => {
    expect(layer).toContain('## CLI Commands');
  });

  it('documents read commands', () => {
    for (const cmd of READ_COMMANDS) {
      expect(layer).toContain(cmd);
    }
  });

  it('documents common read flags', () => {
    for (const flag of COMMON_FLAGS) {
      expect(layer).toContain(flag);
    }
  });

  it('does not document removed write commands', () => {
    for (const cmd of REMOVED_WRITE_COMMANDS) {
      expect(layer).not.toContain(cmd);
    }
  });
});

// ---------------------------------------------------------------------------
// AC6: Both files export the same universal prompt layer
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

  it('both files have identical prompt-layer content', () => {
    expect(sharedLayer).toBe(edgeLayer);
  });

  it('both files still include the four read commands', () => {
    for (const cmd of READ_COMMANDS) {
      expect(sharedLayer).toContain(cmd);
      expect(edgeLayer).toContain(cmd);
    }
  });
});
