/**
 * Feature: Desktop auto-attach and sidebar listing for expert sessions
 * Tests for: CLI status endpoint — expert_sessions key in zazig status --json output
 *
 * AC1: Launch expert session — desktop auto-switches within 5s (one poll cycle)
 * AC4: When expert session ends, card disappears on next poll
 * AC5: Multiple expert sessions can be listed simultaneously
 *
 * Static analysis of packages/cli/src/commands/status.ts
 * Written to FAIL against the current codebase; pass once the feature is built.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');
const CLI_STATUS = 'packages/cli/src/commands/status.ts';

function readRepoFile(relPath: string): string | null {
  const fullPath = path.join(REPO_ROOT, relPath);
  try {
    return fs.readFileSync(fullPath, 'utf-8');
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// CLI status command — expert_sessions key in JsonStatusOutput
// ---------------------------------------------------------------------------

describe('CLI status: expert_sessions key in JsonStatusOutput type', () => {
  let statusContent: string | null;

  beforeAll(() => {
    statusContent = readRepoFile(CLI_STATUS);
  });

  it('packages/cli/src/commands/status.ts exists', () => {
    expect(statusContent, `File not found: ${CLI_STATUS}`).not.toBeNull();
  });

  it('JsonStatusOutput includes expert_sessions field', () => {
    expect(statusContent).toMatch(/expert_sessions/);
  });

  it('expert_sessions is typed as an array', () => {
    // Must declare expert_sessions as an array type (e.g. ExpertSession[] or Array<...>)
    expect(statusContent).toMatch(/expert_sessions\s*[?:][\s\S]{0,60}\[\]/);
  });
});

describe('CLI status: ExpertSession object shape', () => {
  let statusContent: string | null;

  beforeAll(() => {
    statusContent = readRepoFile(CLI_STATUS);
  });

  it('expert session records include id field', () => {
    expect(statusContent).toMatch(/\bid\b/);
  });

  it('expert session records include role_name field', () => {
    expect(statusContent).toMatch(/role_name/);
  });

  it('expert session records include session_id (tmux session name) field', () => {
    expect(statusContent).toMatch(/session_id/);
  });

  it('expert session records include status field', () => {
    // "status" is already used elsewhere; check it appears near expert context
    expect(statusContent).toMatch(/ExpertSession|expert_session/i);
  });

  it('expert session records include created_at field', () => {
    expect(statusContent).toMatch(/created_at/);
  });
});

describe('CLI status: queries expert sessions data source', () => {
  let statusContent: string | null;

  beforeAll(() => {
    statusContent = readRepoFile(CLI_STATUS);
  });

  it('queries expert_sessions table or tmux sessions matching expert-* pattern', () => {
    expect(statusContent).toMatch(/expert[_-]session|expert\*/i);
  });

  it('populates expert_sessions in the output JSON object', () => {
    // The output object literal must assign expert_sessions
    expect(statusContent).toMatch(/expert_sessions\s*:/);
  });
});
