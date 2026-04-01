/**
 * Feature: Desktop expert sessions still missing from sidebar (v0.59.0 fix failed)
 * Tests for: PipelineColumn.tsx — expert sessions section in the sidebar
 *
 * AC1: Expert sessions appear as a named section in the desktop sidebar
 * AC2: PipelineViewData includes an expertSessions field
 * AC3: parsePipelinePayload populates expertSessions from status.expert_sessions
 * AC4: Each expert session card shows role name and session id
 *
 * Static analysis of packages/desktop/src/renderer/components/PipelineColumn.tsx
 * Written to FAIL against the current codebase; passes once the feature is built.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');
const PIPELINE_COLUMN = 'packages/desktop/src/renderer/components/PipelineColumn.tsx';

function readRepoFile(relPath: string): string | null {
  const fullPath = path.join(REPO_ROOT, relPath);
  try {
    return fs.readFileSync(fullPath, 'utf-8');
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// PipelineViewData interface must include expertSessions
// ---------------------------------------------------------------------------

describe('PipelineColumn: PipelineViewData includes expertSessions field', () => {
  let content: string | null;

  beforeAll(() => {
    content = readRepoFile(PIPELINE_COLUMN);
  });

  it('PipelineColumn.tsx file exists', () => {
    expect(content, `File not found: ${PIPELINE_COLUMN}`).not.toBeNull();
  });

  it('PipelineViewData interface declares expertSessions field', () => {
    // The interface must have an expertSessions property
    expect(content).toMatch(/expertSessions/);
  });

  it('expertSessions is typed as an array', () => {
    // Must be typed as an array (e.g. ExpertSession[] or SidebarExpertSession[])
    expect(content).toMatch(/expertSessions\s*[?:][^;]*\[\]/);
  });
});

// ---------------------------------------------------------------------------
// ExpertSession type shape for sidebar display
// ---------------------------------------------------------------------------

describe('PipelineColumn: ExpertSession type includes required display fields', () => {
  let content: string | null;

  beforeAll(() => {
    content = readRepoFile(PIPELINE_COLUMN);
  });

  it('expert session type or interface includes id field', () => {
    // There must be an ExpertSession or SidebarExpertSession type with id
    expect(content).toMatch(/ExpertSession|SidebarExpertSession/);
  });

  it('expert session type includes roleName or role_name field', () => {
    expect(content).toMatch(/roleName|role_name/);
  });

  it('expert session type includes sessionId or session_id field', () => {
    expect(content).toMatch(/sessionId|session_id/);
  });

  it('expert session type includes status field', () => {
    // Status should be present to distinguish running vs completed
    expect(content).toMatch(/ExpertSession[\s\S]{0,300}status|status[\s\S]{0,300}ExpertSession/);
  });
});

// ---------------------------------------------------------------------------
// parsePipelinePayload must map status.expert_sessions → expertSessions
// ---------------------------------------------------------------------------

describe('PipelineColumn: parsePipelinePayload populates expertSessions', () => {
  let content: string | null;

  beforeAll(() => {
    content = readRepoFile(PIPELINE_COLUMN);
  });

  it('parsePipelinePayload returns object with expertSessions key', () => {
    // The return object literal must assign expertSessions
    expect(content).toMatch(/expertSessions\s*:/);
  });

  it('getExpertSessions or equivalent function reads from status.expert_sessions', () => {
    // A helper must read expert_sessions from the status object
    expect(content).toMatch(/expert_sessions|getExpertSessions/);
  });
});

// ---------------------------------------------------------------------------
// Sidebar renders an Expert Sessions section
// ---------------------------------------------------------------------------

describe('PipelineColumn: sidebar renders Expert Sessions section', () => {
  let content: string | null;

  beforeAll(() => {
    content = readRepoFile(PIPELINE_COLUMN);
  });

  it('sidebar JSX includes an Expert Sessions section title', () => {
    // The rendered output must have a section header for expert sessions
    expect(content).toMatch(/Expert Sessions|expert.?sessions/i);
  });

  it('sidebar maps over expertSessions to render session cards', () => {
    // Must iterate over expertSessions (map/forEach over the array)
    expect(content).toMatch(/expertSessions\s*\.\s*map\s*\(/);
  });

  it('sidebar shows role name for each expert session card', () => {
    // Each card must display the role name
    expect(content).toMatch(/roleName|role_name/);
  });
});
