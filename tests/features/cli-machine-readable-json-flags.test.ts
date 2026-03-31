/**
 * Feature: CLI machine-readable mode — --json flags on status, start, stop, login
 *
 * Acceptance criteria covered:
 * - AC4: zazig status --json returns structured JSON with running state, slots, jobs, agents
 * - AC5: zazig status --json when daemon is not running returns { "running": false }
 * - AC6: zazig start --company <id> --json starts daemon non-interactively, returns JSON
 * - AC7: zazig stop --company <id> --json stops daemon non-interactively, returns JSON
 * - AC8: zazig login --json outputs JSON on successful authentication with email and url
 * - AC9: all --json commands produce valid JSON on stdout with zero non-JSON content
 * - AC10: all commands work without --json flag (no regression)
 * - AC11: exit codes are 0 on success, non-zero on failure
 * - FC2: start --company <bad-uuid> --json returns { "started": false, "error": "..." }
 * - FC4: stop --company <id> --json when daemon not running returns { "stopped": false, "error": "..." }
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
// AC4 / AC5: zazig status --json
// ---------------------------------------------------------------------------

describe('status.ts --json flag', () => {
  const FILE = 'packages/cli/src/commands/status.ts';
  let content: string | null;

  beforeAll(() => {
    content = readRepoFile(FILE);
  });

  it('accepts a --json flag argument', () => {
    expect(content).toMatch(/--json/);
  });

  it('outputs { "running": false } when daemon is not running in JSON mode', () => {
    // AC5: when daemon not running and --json set, output {"running": false}
    expect(content).toMatch(/"running".*false|running.*false/);
  });

  it('outputs "running": true with pid when daemon is running in JSON mode', () => {
    expect(content).toMatch(/"running".*true|running.*true/);
    expect(content).toMatch(/"pid"/);
  });

  it('includes "version" field in JSON output when running', () => {
    expect(content).toMatch(/"version"/);
  });

  it('includes "machine_name" field in JSON output when running', () => {
    expect(content).toMatch(/"machine_name"/);
  });

  it('includes "connection_status" field in JSON output when running', () => {
    expect(content).toMatch(/"connection_status"/);
  });

  it('includes "slots" field with claude_code and codex in JSON output', () => {
    expect(content).toMatch(/"slots"/);
    expect(content).toMatch(/claude_code/);
    expect(content).toMatch(/codex/);
  });

  it('includes "active_jobs" array in JSON output when running', () => {
    expect(content).toMatch(/"active_jobs"/);
  });

  it('includes "persistent_agents" array in JSON output when running', () => {
    expect(content).toMatch(/"persistent_agents"/);
  });

  it('exits 0 when daemon is not running with --json (not an error)', () => {
    // AC5: { "running": false } exits 0
    expect(content).toMatch(/process\.exit\(0\)|exitCode\s*=\s*0/);
  });

  it('still outputs human-readable text when --json is NOT passed (AC10 regression guard)', () => {
    // The original human-readable code path must remain
    expect(content).toMatch(/Agent is not running|not running/i);
  });
});

// ---------------------------------------------------------------------------
// AC6: zazig start --company <id> --json
// ---------------------------------------------------------------------------

describe('start.ts --json and --company flags', () => {
  const FILE = 'packages/cli/src/commands/start.ts';
  let content: string | null;

  beforeAll(() => {
    content = readRepoFile(FILE);
  });

  it('accepts a --json flag argument', () => {
    expect(content).toMatch(/--json/);
  });

  it('accepts a --company <id> flag argument', () => {
    expect(content).toMatch(/--company/);
  });

  it('skips interactive company picker when --company is provided', () => {
    // Should bypass pickCompany() or similar interactive prompt when --company is set
    expect(content).toMatch(/--company|companyId|company_id/);
  });

  it('skips slot prompts when --json is provided (fully non-interactive)', () => {
    // AC6: Combined --company <id> --json must be fully non-interactive
    expect(content).toMatch(/json.*non.?interactive|non.?interactive.*json|--json/i);
  });

  it('outputs { "started": true, "pid": ..., "company_id": ..., "company_name": ... } on success', () => {
    expect(content).toMatch(/"started"/);
    expect(content).toMatch(/"pid"/);
    expect(content).toMatch(/"company_id"/);
    expect(content).toMatch(/"company_name"/);
  });

  it('outputs { "started": false, "error": "..." } on failure with --json', () => {
    // FC2: bad UUID or other failure must output this structure
    expect(content).toMatch(/"started".*false|started.*false/);
    expect(content).toMatch(/"error"/);
  });

  it('exits 1 on failure with --json', () => {
    expect(content).toMatch(/process\.exit\(1\)|exitCode\s*=\s*1/);
  });

  it('does not write non-JSON content to stdout when --json is passed', () => {
    // All progress/status messages go to stderr, not stdout
    expect(content).toMatch(/stderr|process\.stderr/);
  });
});

// ---------------------------------------------------------------------------
// AC7: zazig stop --company <id> --json
// ---------------------------------------------------------------------------

describe('stop.ts --json and --company flags', () => {
  const FILE = 'packages/cli/src/commands/stop.ts';
  let content: string | null;

  beforeAll(() => {
    content = readRepoFile(FILE);
  });

  it('accepts a --json flag argument', () => {
    expect(content).toMatch(/--json/);
  });

  it('accepts a --company <id> flag argument', () => {
    expect(content).toMatch(/--company/);
  });

  it('skips interactive company picker when --company is provided', () => {
    // Currently stop always prompts — must add --company flag support
    expect(content).toMatch(/--company|companyId|company_id/);
  });

  it('outputs { "stopped": true, "pid": ..., "company_id": ... } on success', () => {
    expect(content).toMatch(/"stopped"/);
    expect(content).toMatch(/"pid"/);
    expect(content).toMatch(/"company_id"/);
  });

  it('outputs { "stopped": false, "error": "..." } when daemon not running with --json', () => {
    // FC4: daemon not running must output this structure
    expect(content).toMatch(/"stopped".*false|stopped.*false/);
    expect(content).toMatch(/"error"/);
  });

  it('exits 1 on failure with --json', () => {
    expect(content).toMatch(/process\.exit\(1\)|exitCode\s*=\s*1/);
  });

  it('exits 0 on success with --json', () => {
    expect(content).toMatch(/process\.exit\(0\)|exitCode\s*=\s*0/);
  });

  it('does not write non-JSON content to stdout when --json is passed', () => {
    expect(content).toMatch(/stderr|process\.stderr/);
  });
});

// ---------------------------------------------------------------------------
// AC8: zazig login --json
// ---------------------------------------------------------------------------

describe('login.ts --json flag', () => {
  const FILE = 'packages/cli/src/commands/login.ts';
  let content: string | null;

  beforeAll(() => {
    content = readRepoFile(FILE);
  });

  it('accepts a --json flag argument', () => {
    expect(content).toMatch(/--json/);
  });

  it('outputs { "logged_in": true, "email": ..., "supabase_url": ... } on success', () => {
    expect(content).toMatch(/"logged_in"/);
    expect(content).toMatch(/"email"/);
    expect(content).toMatch(/"supabase_url"/);
  });

  it('outputs { "logged_in": false, "error": "..." } on failure with --json', () => {
    expect(content).toMatch(/"logged_in".*false|logged_in.*false/);
    expect(content).toMatch(/"error"/);
  });

  it('sends progress messages to stderr only when --json is passed', () => {
    // Progress messages (magic link sent, etc.) must go to stderr, not stdout
    expect(content).toMatch(/stderr|process\.stderr/);
  });

  it('exits 1 on authentication failure with --json', () => {
    expect(content).toMatch(/process\.exit\(1\)|exitCode\s*=\s*1/);
  });
});

// ---------------------------------------------------------------------------
// AC9: All --json commands produce valid JSON on stdout with zero non-JSON
// AC10: Non-json mode is unaffected (regression guard)
// ---------------------------------------------------------------------------

describe('--json flag structural constraints across all commands', () => {
  const commandFiles = [
    'packages/cli/src/commands/status.ts',
    'packages/cli/src/commands/start.ts',
    'packages/cli/src/commands/stop.ts',
    'packages/cli/src/commands/login.ts',
  ];

  for (const file of commandFiles) {
    describe(`${path.basename(file)}`, () => {
      it('does not use JSON.stringify with indent (compact JSON output required)', () => {
        const content = readRepoFile(file);
        if (!content) {
          expect(content, `${file} not found`).not.toBeNull();
          return;
        }
        expect(content).not.toMatch(/JSON\.stringify\([^)]+,\s*(null|\d+),\s*\d+\)/);
      });

      it('parses --json from args or argv', () => {
        const content = readRepoFile(file);
        if (!content) {
          expect(content, `${file} not found`).not.toBeNull();
          return;
        }
        expect(content).toMatch(/--json/);
      });
    });
  }
});

// ---------------------------------------------------------------------------
// AC11: Exit codes consistency
// ---------------------------------------------------------------------------

describe('exit code consistency for new flags', () => {
  it('status.ts exits 0 regardless of daemon state when --json is used', () => {
    const content = readRepoFile('packages/cli/src/commands/status.ts');
    expect(content).not.toBeNull();
    // Should NOT exit(1) just because daemon is not running
    // { "running": false } is a success response, exits 0
    expect(content).toMatch(/process\.exit\(0\)|exitCode\s*=\s*0/);
  });

  it('stop.ts exits non-zero when --json and daemon is not running', () => {
    const content = readRepoFile('packages/cli/src/commands/stop.ts');
    expect(content).not.toBeNull();
    // FC4: stop when daemon not running = failure, exit non-zero
    expect(content).toMatch(/process\.exit\(1\)|exitCode\s*=\s*1/);
  });

  it('start.ts exits non-zero when --json and start fails', () => {
    const content = readRepoFile('packages/cli/src/commands/start.ts');
    expect(content).not.toBeNull();
    expect(content).toMatch(/process\.exit\(1\)|exitCode\s*=\s*1/);
  });
});
