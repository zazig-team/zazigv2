/**
 * Feature: CLI: show job errors and feature diagnostics
 *
 * Tests for acceptance criteria related to feature diagnostics:
 * 4. Feature diagnostics command shows job breakdown (complete/failed/pending)
 * 5. Failed jobs show error messages and timestamps
 * 6. Stuck jobs (running >1 hour) are flagged
 * 7. Feature list includes error summary (failed count, health indicator)
 * 8. Output is human-readable, not just raw JSON
 *
 * These tests inspect source file content and will FAIL until the feature is built.
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
// AC4 + AC5 + AC6: zazig feature-errors — diagnostic command
// New command: packages/cli/src/commands/feature-errors.ts
// ---------------------------------------------------------------------------

describe('zazig feature-errors command file', () => {
  const FILE = 'packages/cli/src/commands/feature-errors.ts';
  let content: string | null;

  beforeAll(() => {
    content = readRepoFile(FILE);
  });

  it('feature-errors.ts exists at packages/cli/src/commands/feature-errors.ts', () => {
    expect(
      content,
      `Command file not found at ${FILE}. Create packages/cli/src/commands/feature-errors.ts`,
    ).not.toBeNull();
  });

  it('exports a featureErrors function', () => {
    expect(content).toMatch(/export\s+(async\s+)?function\s+featureErrors/);
  });

  it('requires --company flag', () => {
    expect(content).toMatch(/--company/);
    expect(content).toMatch(/process\.stderr\.write|stderr/);
    expect(content).toMatch(/process\.exit\(1\)|exitCode\s*=\s*1/);
  });

  it('requires --id flag for the feature ID', () => {
    expect(content).toMatch(/--id/);
  });

  it('uses getValidCredentials() for auth', () => {
    expect(content).toContain('getValidCredentials');
  });

  // AC4: shows job breakdown (complete/failed/pending counts)
  it('displays count of complete jobs', () => {
    expect(content).toMatch(/complete|completed/i);
  });

  it('displays count of failed jobs', () => {
    expect(content).toMatch(/failed/i);
  });

  it('displays count of pending jobs', () => {
    expect(content).toMatch(/pending|queued/i);
  });

  it('outputs job summary totals (X complete, Y failed, Z pending out of N total)', () => {
    // Output must aggregate job counts into a summary line
    expect(content).toMatch(/total|out of/i);
  });

  // AC5: failed jobs show error messages and timestamps
  it('outputs error_message for failed jobs', () => {
    expect(content).toMatch(/error_message/);
  });

  it('outputs failure timestamp (completed_at or updated_at for failed jobs)', () => {
    expect(content).toMatch(/completed_at|updated_at/);
  });

  it('outputs retry count for failed jobs', () => {
    expect(content).toMatch(/retr/i);
  });

  // AC6: stuck jobs (running >1 hour) are flagged
  it('detects stuck jobs using a 1-hour threshold', () => {
    // Stuck = running for more than 1 hour (3600 seconds or 60*60*1000 ms)
    expect(content).toMatch(/3600|60\s*\*\s*60|1\s*hour|stuck/i);
  });

  it('outputs how long a stuck job has been running', () => {
    // Show elapsed time for stuck jobs
    expect(content).toMatch(/running|elapsed|duration/i);
  });

  it('includes a recommendation in the output', () => {
    // Spec: "retry failed jobs", "cancel and re-create feature", "investigate error X"
    expect(content).toMatch(/[Rr]ecommend|retry|investigate|cancel/);
  });

  // AC8: output is human-readable, not just raw JSON
  it('does not unconditionally write raw JSON to stdout', () => {
    // Output should be formatted, not just JSON.stringify of the raw API response
    // The file must use labels/headers in the output
    expect(content).toMatch(/Feature:|Status:|Jobs:|Failed:|Stuck:|Recommendation/i);
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
// AC7: zazig features — error summary in list output
// The features command must include failed_job_count, health indicator
// ---------------------------------------------------------------------------

describe('zazig features — error summary in list output', () => {
  const FILE = 'packages/cli/src/commands/features.ts';
  let content: string | null;

  beforeAll(() => {
    content = readRepoFile(FILE);
  });

  it('features.ts exists', () => {
    expect(content).not.toBeNull();
  });

  it('includes failed_job_count in output', () => {
    expect(content).toMatch(/failed_job_count/);
  });

  it('includes a health indicator in output', () => {
    // health: healthy, degraded, or stuck
    expect(content).toMatch(/health|healthy|degraded|stuck/i);
  });

  it('includes critical_error_count or critical_job_error_count in output', () => {
    expect(content).toMatch(/critical_error_count|critical_job_error_count/);
  });
});

// ---------------------------------------------------------------------------
// AC8: Output is human-readable — feature-errors formats errors nicely
// ---------------------------------------------------------------------------

describe('zazig feature-errors — human-readable output format', () => {
  const FILE = 'packages/cli/src/commands/feature-errors.ts';
  let content: string | null;

  beforeAll(() => {
    content = readRepoFile(FILE);
  });

  it('feature-errors.ts file exists', () => {
    expect(content, 'feature-errors.ts must exist').not.toBeNull();
  });

  it('uses section headers in output (not raw JSON)', () => {
    // Verify the output uses human-readable labels rather than JSON.stringify
    expect(content).toMatch(/process\.stdout\.write|console\.log/);
    // Should NOT call JSON.stringify unconditionally on the full response
    expect(content).not.toMatch(/process\.stdout\.write\(JSON\.stringify\(data\)\)/);
  });

  it('formats error messages with visual separation or indentation', () => {
    // Error output should use formatting characters like newlines, dashes, or bullets
    expect(content).toMatch(/\\n|  |---|\*/);
  });
});

// ---------------------------------------------------------------------------
// CLI index.ts — feature-errors command registration
// ---------------------------------------------------------------------------

describe('CLI index.ts — feature-errors command registration', () => {
  const INDEX_FILE = 'packages/cli/src/index.ts';
  let content: string | null;

  beforeAll(() => {
    content = readRepoFile(INDEX_FILE);
  });

  it('index.ts exists', () => {
    expect(content).not.toBeNull();
  });

  it('imports featureErrors from commands/feature-errors', () => {
    expect(content).toMatch(/import.*featureErrors.*from.*commands\/feature-errors/);
  });

  it('registers "feature-errors" case in command switch', () => {
    expect(content).toMatch(/case\s+['"]feature-errors['"]/);
  });
});
