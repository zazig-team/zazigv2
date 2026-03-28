/**
 * Feature: Startup preflight check — validate required CLI tools and versions
 *
 * Tests for acceptance criteria: zazig start validates all required CLI tools
 * (with min versions where relevant) before launching the daemon, collects all
 * failures in one pass, and warns about optional tools without blocking.
 *
 * These tests do static analysis of start.ts source to verify the required
 * implementation patterns. Written to FAIL against the current codebase and
 * pass once the feature is implemented.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');
const START_TS = 'packages/cli/src/commands/start.ts';

function readRepoFile(relPath: string): string | null {
  const fullPath = path.join(REPO_ROOT, relPath);
  try {
    return fs.readFileSync(fullPath, 'utf-8');
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// AC1: Missing tmux → exit code 1 + install hint
// ---------------------------------------------------------------------------

describe('AC1: tmux is a required tool — missing tmux causes exit with code 1', () => {
  let content: string | null;

  beforeAll(() => {
    content = readRepoFile(START_TS);
  });

  it('start.ts exists', () => {
    expect(content, `File not found: ${START_TS}`).not.toBeNull();
  });

  it('checks for tmux presence', () => {
    expect(content).toMatch(/tmux/);
  });

  it('runs a tmux version/check command', () => {
    // tmux -V is the standard tmux version command
    expect(content).toMatch(/tmux\s+-V|execSync.*tmux/);
  });

  it('sets process.exitCode = 1 when a required tool is missing', () => {
    // Must set exitCode = 1 in the required-tool failure path
    expect(content).toMatch(/process\.exitCode\s*=\s*1/);
  });

  it('includes tmux install hint (brew or apt)', () => {
    // Should suggest: brew install tmux / apt install tmux
    expect(content).toMatch(/brew install tmux|apt install tmux/);
  });
});

// ---------------------------------------------------------------------------
// AC2: git version < 2.29 → exit code 1 with version message
// ---------------------------------------------------------------------------

describe('AC2: git version check — below 2.29 causes exit with message', () => {
  let content: string | null;

  beforeAll(() => {
    content = readRepoFile(START_TS);
  });

  it('checks git version', () => {
    expect(content).toMatch(/git\s+--version|execSync.*git/);
  });

  it('enforces minimum git version 2.29', () => {
    // Must reference the 2.29 minimum somewhere
    expect(content).toMatch(/2\.29/);
  });

  it('parses git version from "git version X.Y.Z" output', () => {
    // Should extract version numbers from git --version output
    expect(content).toMatch(/git version|git\s+--version/);
  });

  it('emits a "below minimum" message for version failures', () => {
    // Required message format: "{tool} version {found} is below minimum {required}. Please upgrade."
    expect(content).toMatch(/below minimum|Please upgrade/i);
  });

  it('includes git install hint', () => {
    expect(content).toMatch(/brew install git|apt install git/);
  });
});

// ---------------------------------------------------------------------------
// AC3: All required tools present → normal startup (no exit)
// ---------------------------------------------------------------------------

describe('AC3: All required tools present — startup proceeds normally', () => {
  let content: string | null;

  beforeAll(() => {
    content = readRepoFile(START_TS);
  });

  it('checks all six required tools: git, tmux, node, gh, jq, claude', () => {
    // Each of the six required tools must be referenced
    expect(content).toMatch(/git/);
    expect(content).toMatch(/tmux/);
    expect(content).toMatch(/node/);
    expect(content).toMatch(/\bgh\b/);
    expect(content).toMatch(/jq/);
    expect(content).toMatch(/claude/);
  });

  it('enforces minimum node version 20', () => {
    expect(content).toMatch(/20\.0\.0|node.*20|>= 20/);
  });

  it('enforces minimum gh version 2.0', () => {
    expect(content).toMatch(/2\.0\.0|gh.*2\./);
  });

  it('only exits when required failures are present — does not exit if all pass', () => {
    // The exit must be conditional on having failures collected
    // Pattern: if (failures.length > 0) or similar guard before process.exitCode = 1
    expect(content).toMatch(/failures|requiredFailures|errors/);
    // Exit is gated, not unconditional
    expect(content).toMatch(
      /if\s*\(.*(?:failures|errors|missing).*\)[\s\S]{0,200}process\.exitCode\s*=\s*1/,
    );
  });
});

// ---------------------------------------------------------------------------
// AC4: Missing optional tools → warning only, startup continues
// ---------------------------------------------------------------------------

describe('AC4: Optional tools — warnings printed but startup not blocked', () => {
  let content: string | null;

  beforeAll(() => {
    content = readRepoFile(START_TS);
  });

  it('treats bun as optional (warns only in staging)', () => {
    expect(content).toMatch(/bun/);
  });

  it('bun warning is gated on ZAZIG_ENV=staging', () => {
    // bun should only warn when ZAZIG_ENV is staging
    expect(content).toMatch(/ZAZIG_ENV.*staging.*bun|bun.*ZAZIG_ENV.*staging/s);
  });

  it('treats codesign as optional (warns only on macOS)', () => {
    expect(content).toMatch(/codesign/);
  });

  it('codesign warning is gated on darwin platform', () => {
    expect(content).toMatch(/darwin.*codesign|codesign.*darwin/s);
  });

  it('optional tool warnings do NOT set process.exitCode = 1', () => {
    // Optional block must NOT contain exitCode = 1
    // We verify by checking warnings are separated from exit logic
    // (optional block uses console.warn or similar, not exitCode)
    expect(content).toMatch(/warn.*codesign|warn.*bun|console\.warn|optional/i);
  });
});

// ---------------------------------------------------------------------------
// AC5: Multiple missing required tools reported together (collect-all pattern)
// ---------------------------------------------------------------------------

describe('AC5: All failures collected before reporting — not one at a time', () => {
  let content: string | null;

  beforeAll(() => {
    content = readRepoFile(START_TS);
  });

  it('uses an array or collection to accumulate failures', () => {
    // Must collect into an array before checking/exiting
    expect(content).toMatch(/\[\]|push\(|failures|errors|missing/);
  });

  it('does not return/exit immediately inside each individual tool check', () => {
    // The pattern of "return;" or "process.exit" immediately after each check
    // (before all checks are done) indicates fail-fast; we must NOT have this.
    // Instead we push to an array and exit after all checks.
    // Verify there is a collect-then-exit structure by checking for array push pattern
    expect(content).toMatch(/\.push\(/);
  });

  it('reports all failures in a single grouped output block', () => {
    // After collecting, must iterate and print all failures
    // Pattern: forEach or for...of over the failures array
    expect(content).toMatch(/forEach|for.*of.*failures|for.*of.*errors/s);
  });

  it('exits once after all checks, not inside each check', () => {
    // exitCode is set once after all checks, not inside individual try/catch blocks
    // Verify by checking that the exit is outside (after) the check loop/sequence
    const exitCodeCount = (content?.match(/process\.exitCode\s*=\s*1/g) ?? []).length;
    // There should be a small number of exitCode = 1 assignments (ideally 1 or 2),
    // not one per tool (6 tools)
    expect(exitCodeCount).toBeLessThan(5);
  });
});

// ---------------------------------------------------------------------------
// AC6: codexInstalled boolean still works correctly downstream
// ---------------------------------------------------------------------------

describe('AC6: codexInstalled boolean preserved for downstream config', () => {
  let content: string | null;

  beforeAll(() => {
    content = readRepoFile(START_TS);
  });

  it('declares codexInstalled boolean', () => {
    expect(content).toMatch(/codexInstalled/);
  });

  it('sets codexInstalled to true when codex is available', () => {
    // Must set codexInstalled = true in the try block
    expect(content).toMatch(/codexInstalled\s*=\s*true/);
  });

  it('codexInstalled defaults to false', () => {
    expect(content).toMatch(/codexInstalled\s*=\s*false|let codexInstalled/);
  });

  it('codexInstalled is passed to promptForConfig', () => {
    // Downstream usage: promptForConfig(codexInstalled)
    expect(content).toMatch(/promptForConfig\s*\(\s*codexInstalled/);
  });
});

// ---------------------------------------------------------------------------
// FC1: Version parsing resilient to unexpected output formats
// ---------------------------------------------------------------------------

describe('FC1: Version parsing resilient to unexpected output formats', () => {
  let content: string | null;

  beforeAll(() => {
    content = readRepoFile(START_TS);
  });

  it('version parsing is wrapped in try/catch to handle unexpected formats', () => {
    // Version parsing should not crash on unexpected output
    // The check functions must handle exceptions (try/catch around execSync)
    expect(content).toMatch(/try\s*\{[\s\S]*?execSync[\s\S]*?\}\s*catch/);
  });

  it('falls back gracefully when version cannot be parsed', () => {
    // When version parse fails, should treat as "installed but version unknown"
    // rather than crashing — the catch block should not re-throw
    // Pattern: catch block that does NOT contain "throw"
    // We check that the preflight check section uses try/catch extensively
    const tryCatchBlocks = (content?.match(/try\s*\{/g) ?? []).length;
    expect(tryCatchBlocks).toBeGreaterThanOrEqual(3);
  });
});

// ---------------------------------------------------------------------------
// FC2: Optional tools do not block startup
// ---------------------------------------------------------------------------

describe('FC2: Optional tool failures do not block startup', () => {
  let content: string | null;

  beforeAll(() => {
    content = readRepoFile(START_TS);
  });

  it('optional tool checks are clearly separated from required tool checks', () => {
    // There must be distinct handling for optional vs required tools
    // Pattern: "optional" keyword, or separate section comment, or warn vs error
    expect(content).toMatch(/optional|warn|warning/i);
  });

  it('optional tool section does not call process.exit or set exitCode = 1', () => {
    // The optional section must not set exitCode = 1
    // We verify by checking that optional tool names are not directly adjacent to exitCode = 1
    // bun and codesign (optional tools) should not be in the same conditional as exitCode = 1
    const bunExitPattern = /bun[\s\S]{0,100}process\.exitCode\s*=\s*1/.test(content ?? '');
    expect(bunExitPattern).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// FC3: Existing claude/codex check behavior not regressed
// ---------------------------------------------------------------------------

describe('FC3: Existing claude/codex check behavior preserved', () => {
  let content: string | null;

  beforeAll(() => {
    content = readRepoFile(START_TS);
  });

  it('still checks for claude installation', () => {
    expect(content).toMatch(/claudeInstalled|claude\s+--version/);
  });

  it('still prints the claude not installed error message', () => {
    expect(content).toMatch(/Claude Code is not installed|claude.*not installed/i);
  });

  it('still suggests installing claude via npm', () => {
    expect(content).toMatch(/@anthropic-ai\/claude-code|npm install.*claude/);
  });

  it('still checks for codex installation (soft check)', () => {
    expect(content).toMatch(/codexInstalled|codex\s+--version/);
  });

  it('codex check is still a soft check (no exit on codex missing)', () => {
    // codex missing must NOT trigger exitCode = 1
    // The existing behavior: codexInstalled = false, warn/log only
    expect(content).toMatch(/codexInstalled\s*=\s*false/);
  });

  it('still references npm install -g @openai/codex install hint', () => {
    expect(content).toMatch(/@openai\/codex/);
  });
});

// ---------------------------------------------------------------------------
// Structural: preflight checks run at the top of start()
// ---------------------------------------------------------------------------

describe('Structural: preflight block is at the top of start()', () => {
  let content: string | null;

  beforeAll(() => {
    content = readRepoFile(START_TS);
  });

  it('preflight check section appears before credential check', () => {
    // The preflight block must come before getValidCredentials() call
    const preflightPos = content?.search(/tmux|jq/) ?? -1;
    const credentialsPos = content?.indexOf('getValidCredentials') ?? -1;
    expect(preflightPos).toBeGreaterThan(-1);
    expect(credentialsPos).toBeGreaterThan(-1);
    expect(preflightPos).toBeLessThan(credentialsPos);
  });

  it('includes install hints for all required tools', () => {
    // Every required tool must have an install hint
    expect(content).toMatch(/brew install git|apt install git/);
    expect(content).toMatch(/brew install tmux|apt install tmux/);
    expect(content).toMatch(/brew install node|nvm/);
    expect(content).toMatch(/brew install gh|cli\.github\.com/);
    expect(content).toMatch(/brew install jq|apt install jq/);
  });
});
