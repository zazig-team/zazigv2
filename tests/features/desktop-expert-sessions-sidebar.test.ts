/**
 * Feature: Desktop auto-attach and sidebar listing for expert sessions
 * Tests for: Desktop sidebar — Expert Sessions section in PipelineColumn
 *
 * AC2: Expert sessions appear as clickable cards in the sidebar below Active Jobs
 * AC3: Clicking an expert session card attaches the terminal to that session
 * AC4: When expert session ends, card disappears from sidebar on next poll
 * AC5: Multiple expert sessions can be listed simultaneously
 *
 * Static analysis of packages/desktop/src/renderer/components/PipelineColumn.tsx
 * Written to FAIL against the current codebase; pass once the feature is built.
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

function readPipelineColumn(): string | null {
  for (const candidate of [
    'packages/desktop/src/renderer/components/PipelineColumn.tsx',
    'packages/desktop/src/renderer/PipelineColumn.tsx',
  ]) {
    const content = readRepoFile(candidate);
    if (content !== null) return content;
  }
  return null;
}

// ---------------------------------------------------------------------------
// AC2: Expert Sessions section exists in the sidebar
// ---------------------------------------------------------------------------

describe('AC2: Expert Sessions section rendered in PipelineColumn sidebar', () => {
  let pipelineContent: string | null;

  beforeAll(() => {
    pipelineContent = readPipelineColumn();
  });

  it('PipelineColumn.tsx exists', () => {
    expect(pipelineContent, 'PipelineColumn.tsx must exist').not.toBeNull();
  });

  it('renders an "Expert Sessions" section heading', () => {
    expect(pipelineContent).toMatch(/Expert Sessions/i);
  });

  it('renders expert session cards mapped from expert_sessions data', () => {
    // Must iterate over expert_sessions array to render cards
    expect(pipelineContent).toMatch(/expert_sessions|expertSessions/i);
  });

  it('expert session cards are positioned below Active Jobs section', () => {
    // Expert Sessions section must appear after Active Jobs in the source
    const content = pipelineContent ?? '';
    const activeJobsPos = content.search(/Active Jobs/i);
    const expertSessionsPos = content.search(/Expert Sessions/i);
    expect(activeJobsPos).toBeGreaterThanOrEqual(0);
    expect(expertSessionsPos).toBeGreaterThan(activeJobsPos);
  });

  it('each expert session card displays the role name', () => {
    expect(pipelineContent).toMatch(/role_name|roleName/);
  });
});

// ---------------------------------------------------------------------------
// AC3: Clicking expert session card attaches the terminal
// ---------------------------------------------------------------------------

describe('AC3: Clicking an expert session card attaches its tmux session', () => {
  let pipelineContent: string | null;

  beforeAll(() => {
    pipelineContent = readPipelineColumn();
  });

  it('expert session card has an onClick handler', () => {
    expect(pipelineContent).toMatch(/onClick|handleClick|onSessionClick/i);
  });

  it('click handler calls terminalAttach with the session_id', () => {
    expect(pipelineContent).toMatch(/terminalAttach|terminal_attach/i);
  });

  it('terminalAttach is called with session_id or sessionName from expert session', () => {
    // Must pass session_id (tmux session name) to the attach call
    expect(pipelineContent).toMatch(/terminalAttach[\s\S]{0,100}session_id|session_id[\s\S]{0,100}terminalAttach/s);
  });

  it('uses window.zazig.terminalAttach — same IPC flow as job clicks', () => {
    expect(pipelineContent).toMatch(/window\.zazig\.terminalAttach|zazig\.terminalAttach/);
  });
});

// ---------------------------------------------------------------------------
// AC4: Disappeared sessions no longer appear (data-driven rendering)
// ---------------------------------------------------------------------------

describe('AC4: Expert session cards disappear when session ends', () => {
  let pipelineContent: string | null;

  beforeAll(() => {
    pipelineContent = readPipelineColumn();
  });

  it('expert session list is rendered purely from polled data (not local state)', () => {
    // Cards must come from the parsed pipeline payload, not maintained in separate local state
    // Presence of .map() over expert_sessions guarantees data-driven render
    expect(pipelineContent).toMatch(/expert_sessions[\s\S]{0,200}\.map\(|expertSessions[\s\S]{0,200}\.map\(/s);
  });
});

// ---------------------------------------------------------------------------
// AC5: Multiple expert sessions can be listed simultaneously
// ---------------------------------------------------------------------------

describe('AC5: Multiple expert sessions rendered simultaneously', () => {
  let pipelineContent: string | null;

  beforeAll(() => {
    pipelineContent = readPipelineColumn();
  });

  it('renders a list (map) of expert sessions, supporting multiple entries', () => {
    // .map() over the array supports 0..N sessions
    expect(pipelineContent).toMatch(/expert_sessions[\s\S]{0,200}\.map\(|expertSessions[\s\S]{0,200}\.map\(/s);
  });
});

// ---------------------------------------------------------------------------
// parsePipelinePayload parses expert_sessions from status output
// ---------------------------------------------------------------------------

describe('parsePipelinePayload extracts expert_sessions from status JSON', () => {
  let pipelineContent: string | null;

  beforeAll(() => {
    pipelineContent = readPipelineColumn();
  });

  it('parsePipelinePayload function references expert_sessions', () => {
    expect(pipelineContent).toMatch(/parsePipelinePayload[\s\S]{0,500}expert_sessions|expert_sessions[\s\S]{0,500}parsePipelinePayload/s);
  });
});
