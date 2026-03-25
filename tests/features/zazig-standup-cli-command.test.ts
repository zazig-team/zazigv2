/**
 * Feature: zazig standup CLI command
 *
 * Tests for acceptance criteria 1–7:
 * 1. Text output (no --json): human-readable, no JSON, no UUIDs
 * 2. --json flag: valid JSON with required top-level keys
 * 3. Text output under 30 lines for typical pipeline state
 * 4. Completed features include promoted_version
 * 5. Stuck detection: active features with updated_at > 2 hours
 * 6. Recommendations based on thresholds
 * 7. Missing --company flag → usage to stderr + exit 1
 *
 * These tests inspect file content and will FAIL until the feature is built.
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
// standup.ts — command file existence and structure
// ---------------------------------------------------------------------------

describe('standup.ts command file', () => {
  const FILE = 'packages/cli/src/commands/standup.ts';
  let content: string | null;

  beforeAll(() => {
    content = readRepoFile(FILE);
  });

  it('exists at packages/cli/src/commands/standup.ts', () => {
    expect(
      content,
      `Command file not found at ${FILE}. Create packages/cli/src/commands/standup.ts`,
    ).not.toBeNull();
  });

  it('exports a standup function', () => {
    expect(content).toMatch(/export\s+(async\s+)?function\s+standup/);
  });

  it('requires --company flag (exits 1 with usage when missing)', () => {
    // AC7: missing --company → usage to stderr, exit 1
    expect(content).toMatch(/Usage.*zazig\s+standup/);
    expect(content).toMatch(/process\.stderr\.write|stderr/);
    expect(content).toMatch(/process\.exit\(1\)|exitCode\s*=\s*1/);
  });

  it('uses getValidCredentials() for auth', () => {
    expect(content).toContain('getValidCredentials');
  });

  it('calls the get-pipeline-snapshot endpoint', () => {
    expect(content).toContain('get-pipeline-snapshot');
  });

  it('handles --json flag to switch between text and JSON output', () => {
    // AC2: --json flag produces JSON output
    expect(content).toContain('--json');
  });

  it('outputs JSON with required top-level keys when --json is set', () => {
    // AC2: date, inbox, pipeline, capacity, active, failed, completed, stuck, recommendations
    expect(content).toContain('"date"');
    expect(content).toContain('"inbox"');
    expect(content).toContain('"pipeline"');
    expect(content).toContain('"capacity"');
    expect(content).toContain('"active"');
    expect(content).toContain('"failed"');
    expect(content).toContain('"completed"');
    expect(content).toContain('"stuck"');
    expect(content).toContain('"recommendations"');
  });

  it('classifies backlog as features_by_status.created', () => {
    // Spec: backlog = features in features_by_status.created
    expect(content).toMatch(/created|backlog/);
  });

  it('classifies failed as features_by_status.failed', () => {
    expect(content).toContain('failed');
  });

  it('detects stuck features using a 2-hour threshold on updated_at', () => {
    // AC5: stuck = active features where updated_at is older than 2 hours
    expect(content).toMatch(/2\s*\*\s*60\s*\*\s*60|7200|2.*hour/i);
  });

  it('includes promoted_version in completed features output', () => {
    // AC4: completed features include promoted_version
    expect(content).toContain('promoted_version');
  });

  it('uses top 5 completed features (completed_features slice)', () => {
    // Spec: completed = top 5 from completed_features
    expect(content).toMatch(/slice\(0,\s*5\)|\.slice\(0,5\)|completed\.length|completed_features/);
  });

  it('implements recommendation for inbox.new > 0', () => {
    // AC6: inbox.new > 0 → "Triage the inbox?"
    expect(content).toMatch(/[Tt]riage.*inbox|inbox.*[Tt]riage/);
  });

  it('implements recommendation for failed > 3', () => {
    // AC6: failed.length > 3 → recommendation
    expect(content).toMatch(/failed.*>\s*3|> 3.*failed/);
  });

  it('implements recommendation for backlog > 5 AND active < 2', () => {
    // AC6: backlog > 5 AND active < 2 → pipeline capacity recommendation
    expect(content).toMatch(/backlog.*>\s*5|> 5.*backlog/);
    expect(content).toMatch(/active.*<\s*2|< 2.*active/);
  });

  it('implements recommendation for stuck.length > 0', () => {
    // AC6: stuck > 0 → investigate recommendation
    expect(content).toMatch(/stuck.*>\s*0|stuck\.length/);
  });

  it('text output does NOT use JSON.stringify unconditionally (text is human-readable)', () => {
    // AC1: default text output is human-readable, not raw JSON
    // The file must branch on --json before writing JSON.stringify to stdout
    // We verify JSON.stringify is guarded behind a json flag check
    expect(content).toMatch(/if.*json|json.*?JSON\.stringify/is);
  });

  it('writes to process.stdout', () => {
    expect(content).toMatch(/process\.stdout\.write|console\.log/);
  });

  it('exits 0 on success', () => {
    expect(content).toMatch(/process\.exit\(0\)|exitCode\s*=\s*0/);
  });

  it('writes error to stderr and exits 1 on HTTP or auth error', () => {
    expect(content).toMatch(/process\.stderr\.write|stderr/);
    expect(content).toMatch(/process\.exit\(1\)|exitCode\s*=\s*1/);
  });
});

// ---------------------------------------------------------------------------
// AC1: Text output format — no JSON, no UUIDs
// ---------------------------------------------------------------------------

describe('standup text output format', () => {
  const FILE = 'packages/cli/src/commands/standup.ts';
  let content: string | null;

  beforeAll(() => {
    content = readRepoFile(FILE);
  });

  it('includes "Standup" label in text output', () => {
    // AC1: human-readable standup header
    expect(content).toMatch(/[Ss]tandup/);
  });

  it('includes "Inbox" label in text output', () => {
    expect(content).toMatch(/Inbox/);
  });

  it('includes "Pipeline" label in text output', () => {
    expect(content).toMatch(/Pipeline/);
  });

  it('includes "Capacity" label in text output', () => {
    expect(content).toMatch(/Capacity/);
  });

  it('includes "Active work" section in text output', () => {
    expect(content).toMatch(/Active work|Active:/);
  });

  it('includes "Failed" section in text output', () => {
    expect(content).toMatch(/Failed:/);
  });

  it('includes "Recently completed" or "Completed" section in text output', () => {
    expect(content).toMatch(/[Rr]ecently completed|[Cc]ompleted:/);
  });

  it('includes "Stuck" section in text output', () => {
    expect(content).toMatch(/[Ss]tuck:/);
  });
});

// ---------------------------------------------------------------------------
// AC7: CLI entry point registers standup command
// ---------------------------------------------------------------------------

describe('CLI index.ts registers standup command', () => {
  const INDEX_FILE = 'packages/cli/src/index.ts';
  let content: string | null;

  beforeAll(() => {
    content = readRepoFile(INDEX_FILE);
  });

  it('index.ts exists', () => {
    expect(content).not.toBeNull();
  });

  it('imports standup from commands/standup', () => {
    expect(content).toMatch(/import.*standup.*from.*commands\/standup/);
  });

  it('registers "standup" case in command switch', () => {
    expect(content).toMatch(/case\s+['"]standup['"]/);
  });
});
