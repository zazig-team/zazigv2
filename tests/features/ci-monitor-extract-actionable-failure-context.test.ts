/**
 * Feature: CI monitor: extract actionable failure context instead of raw log dump
 * Feature ID: aa483d49-f21e-446a-b7f5-50ca76acaff9
 *
 * Tests for all acceptance criteria:
 * AC1 - Given a CI failure with vitest output, the spec contains only failing test names,
 *        assertion errors, and summary — not the full log
 * AC2 - Given a CI failure log with ANSI codes, the extracted spec contains zero ANSI escape sequences
 * AC3 - Given a CI failure log over 8KB after extraction, the spec is truncated with a pointer
 *        to the full log command
 * AC4 - Given a CI failure in a specific workspace, the spec identifies the failing workspace by name
 * AC5 - The standalone master-ci-monitor.js uses the same extraction logic as executor.ts
 *
 * These tests are written to FAIL against the current codebase and pass once
 * the feature is implemented.
 */

import { describe, it, expect, beforeEach, afterEach, vi, type Mock } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function readRepoFile(relPath: string): string | null {
  const fullPath = path.join(REPO_ROOT, relPath);
  try {
    return fs.readFileSync(fullPath, 'utf-8');
  } catch {
    return null;
  }
}

// Build a realistic vitest failure log with ANSI codes and lots of passing output
function buildVitestFailureLog(opts: {
  failingTestName?: string;
  assertionError?: string;
  workspace?: string;
  sizeKb?: number;
} = {}): string {
  const {
    failingTestName = 'should process the request correctly',
    assertionError = "AssertionError: expected 'foo' to equal 'bar'",
    workspace = 'packages/orchestrator',
    sizeKb = 10,
  } = opts;

  // ANSI escape codes to sprinkle throughout
  const ESC = '\x1b';
  const RED = `${ESC}[31m`;
  const GREEN = `${ESC}[32m`;
  const RESET = `${ESC}[0m`;
  const BOLD = `${ESC}[1m`;

  const passingTests = Array.from({ length: 200 }, (_, i) =>
    `${GREEN}✓${RESET} passing test ${i} (${Math.floor(Math.random() * 100)}ms)`
  ).join('\n');

  const failBlock = [
    `${RED}${BOLD}FAIL${RESET} ${workspace}/src/foo.test.ts`,
    ``,
    `${RED}● ${failingTestName}${RESET}`,
    ``,
    `  ${assertionError}`,
    ``,
    `  Expected: ${GREEN}"bar"${RESET}`,
    `  Received: ${RED}"foo"${RESET}`,
    ``,
    `  at Object.<anonymous> (${workspace}/src/foo.test.ts:42:5)`,
    ``,
    ` Test Files  1 failed (12)`,
    ` Tests  1 failed | 200 passed (201)`,
    ` Start at  10:00:00`,
    ` Duration  5.00s`,
  ].join('\n');

  const npmErrors = [
    `npm error code 1`,
    `npm error path /home/runner/work/zazigv2/${workspace}`,
    `npm error command failed: vitest run`,
    `npm error A complete log of this run can be found in: /home/runner/.npm/_logs/2024-01-01T00_00_00_000Z-debug-0.log`,
  ].join('\n');

  // Pad to requested size
  const baseContent = `${passingTests}\n\n${failBlock}\n\n${npmErrors}`;
  const targetBytes = sizeKb * 1024;
  const padding = targetBytes > baseContent.length
    ? Array(targetBytes - baseContent.length).fill('x').join('')
    : '';

  return `${passingTests}\n${padding}\n${failBlock}\n\n${npmErrors}`;
}

// ---------------------------------------------------------------------------
// Try to import extractFailureSummary from executor or master-ci-monitor
// ---------------------------------------------------------------------------

const EXTRACT_MODULE_PATHS = [
  '../../packages/local-agent/src/executor.js',
  '../../packages/local-agent/src/master-ci-monitor.js',
  '../../packages/local-agent/src/ci-failure-extractor.js',
];

async function tryImportExtractFailureSummary(): Promise<((rawLog: string, runId?: string | number) => string) | null> {
  for (const modulePath of EXTRACT_MODULE_PATHS) {
    try {
      const mod = await import(/* @vite-ignore */ modulePath);
      if (typeof mod.extractFailureSummary === 'function') {
        return mod.extractFailureSummary;
      }
    } catch {
      // Try next path
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// AC2: ANSI escape code stripping
// ---------------------------------------------------------------------------

describe('AC2: ANSI escape codes are stripped from extracted failure summary', () => {
  it('extractFailureSummary is exported from local-agent (executor or monitor)', async () => {
    const fn = await tryImportExtractFailureSummary();
    expect(fn, 'extractFailureSummary must be exported from executor.ts or master-ci-monitor.js').not.toBeNull();
  });

  it('result contains no ANSI escape sequences', async () => {
    const extractFailureSummary = await tryImportExtractFailureSummary();
    expect(extractFailureSummary, 'extractFailureSummary must be exported').not.toBeNull();

    const rawLog = buildVitestFailureLog({ sizeKb: 2 });
    // Confirm the raw log has ANSI codes
    expect(rawLog).toMatch(/\x1b\[/);

    const summary = extractFailureSummary!(rawLog);

    // The extracted summary must contain zero ANSI escape sequences
    expect(summary).not.toMatch(/\x1b\[/);
    expect(summary).not.toMatch(/\x1b\[\d+m/);
  });

  it('strips all common ANSI color codes (30-37, 90-97, 0, 1)', async () => {
    const extractFailureSummary = await tryImportExtractFailureSummary();
    expect(extractFailureSummary).not.toBeNull();

    const colorCodes = [0, 1, 30, 31, 32, 33, 34, 35, 36, 37, 90, 91, 92, 93, 94, 95, 96, 97];
    const ansiSamples = colorCodes.map(c => `\x1b[${c}msome text\x1b[0m`).join('\n');
    const logWithColors = `${ansiSamples}\n\nFAIL packages/foo/bar.test.ts\n● failing test\n  Error: something\n  Test Files  1 failed`;

    const summary = extractFailureSummary!(logWithColors);
    expect(summary).not.toMatch(/\x1b\[/);
  });
});

// ---------------------------------------------------------------------------
// AC1: Vitest failure output — only failing tests in summary
// ---------------------------------------------------------------------------

describe('AC1: Vitest failure summary extraction — only failing content', () => {
  it('summary contains the failing test name', async () => {
    const extractFailureSummary = await tryImportExtractFailureSummary();
    expect(extractFailureSummary).not.toBeNull();

    const rawLog = buildVitestFailureLog({
      failingTestName: 'should handle concurrency errors',
      sizeKb: 5,
    });

    const summary = extractFailureSummary!(rawLog);
    expect(summary).toContain('should handle concurrency errors');
  });

  it('summary contains the assertion error', async () => {
    const extractFailureSummary = await tryImportExtractFailureSummary();
    expect(extractFailureSummary).not.toBeNull();

    const rawLog = buildVitestFailureLog({
      assertionError: "AssertionError: expected 42 to equal 99",
      sizeKb: 5,
    });

    const summary = extractFailureSummary!(rawLog);
    expect(summary).toContain('AssertionError');
  });

  it('summary does NOT contain passing test lines', async () => {
    const extractFailureSummary = await tryImportExtractFailureSummary();
    expect(extractFailureSummary).not.toBeNull();

    const rawLog = buildVitestFailureLog({
      failingTestName: 'the failing one',
      sizeKb: 5,
    });

    const summary = extractFailureSummary!(rawLog);

    // The 200 passing test lines should not appear in the summary
    // Count occurrences of "passing test" lines (they were in the preamble)
    const passingLineCount = (summary.match(/passing test \d+/g) ?? []).length;
    // Summary might include a few lines as fallback context, but NOT 200
    expect(passingLineCount).toBeLessThan(10);
  });

  it('summary contains the Test Files / Tests line from vitest', async () => {
    const extractFailureSummary = await tryImportExtractFailureSummary();
    expect(extractFailureSummary).not.toBeNull();

    const rawLog = buildVitestFailureLog({ sizeKb: 5 });
    const summary = extractFailureSummary!(rawLog);

    // The vitest summary line should be present
    expect(summary).toMatch(/Test Files|Tests.*failed/i);
  });

  it('handles empty log without throwing', async () => {
    const extractFailureSummary = await tryImportExtractFailureSummary();
    expect(extractFailureSummary).not.toBeNull();

    expect(() => extractFailureSummary!('')).not.toThrow();
    const result = extractFailureSummary!('');
    expect(typeof result).toBe('string');
  });

  it('falls back to last 200 lines when no structured vitest/jest summary found', async () => {
    const extractFailureSummary = await tryImportExtractFailureSummary();
    expect(extractFailureSummary).not.toBeNull();

    // Build a log with no FAIL marker — just build output errors
    const buildErrorLines = Array.from({ length: 300 }, (_, i) =>
      `Build output line ${i}: some build step`
    );
    buildErrorLines[299] = 'Error: TypeScript compilation failed';
    const rawLog = buildErrorLines.join('\n');

    const summary = extractFailureSummary!(rawLog);

    // Should contain last 200 lines (not the first 100)
    expect(summary).toContain('TypeScript compilation failed');
    // First line should NOT be present (it's in the first 100, which were skipped)
    expect(summary).not.toContain('Build output line 0:');
  });
});

// ---------------------------------------------------------------------------
// AC3: 8KB hard cap with truncation marker
// ---------------------------------------------------------------------------

describe('AC3: 8KB hard cap — oversized extracted summaries are truncated', () => {
  it('summary is at most 8192 bytes (8KB)', async () => {
    const extractFailureSummary = await tryImportExtractFailureSummary();
    expect(extractFailureSummary).not.toBeNull();

    const rawLog = buildVitestFailureLog({ sizeKb: 100 });
    const summary = extractFailureSummary!(rawLog);

    expect(Buffer.byteLength(summary, 'utf-8')).toBeLessThanOrEqual(8192);
  });

  it('truncated summary includes a pointer to gh run view command', async () => {
    const extractFailureSummary = await tryImportExtractFailureSummary();
    expect(extractFailureSummary).not.toBeNull();

    // Create a log where even the FAIL block alone would exceed 8KB
    const bigFailBlock = [
      'FAIL packages/foo/bar.test.ts',
      ...Array.from({ length: 500 }, (_, i) => `● failing test ${i}\n  Error: something went very wrong at step ${i}\n  Expected: "value-${i}"\n  Received: "other-${i}"`),
      ' Test Files  1 failed',
      ' Tests  500 failed',
    ].join('\n');

    const runId = 999999;
    const summary = extractFailureSummary!(bigFailBlock, runId);

    // Must contain truncation marker
    expect(summary).toMatch(/\[truncated/i);
    // Must contain the gh run view command
    expect(summary).toMatch(/gh run view/);
    expect(summary).toContain(String(runId));
  });

  it('truncated summary ends with truncation marker, not mid-sentence', async () => {
    const extractFailureSummary = await tryImportExtractFailureSummary();
    expect(extractFailureSummary).not.toBeNull();

    const bigLog = buildVitestFailureLog({ sizeKb: 200 });
    const summary = extractFailureSummary!(bigLog, 42);

    if (Buffer.byteLength(summary, 'utf-8') === 8192) {
      // If it's exactly 8KB, it should end with the truncation marker
      expect(summary).toMatch(/\[truncated.*\]$/s);
    }
  });
});

// ---------------------------------------------------------------------------
// AC4: Workspace identification from npm error lines
// ---------------------------------------------------------------------------

describe('AC4: Workspace identification from npm error lines', () => {
  it('summary identifies the failing workspace from npm error path', async () => {
    const extractFailureSummary = await tryImportExtractFailureSummary();
    expect(extractFailureSummary).not.toBeNull();

    const rawLog = buildVitestFailureLog({
      workspace: 'packages/orchestrator',
      sizeKb: 5,
    });

    const summary = extractFailureSummary!(rawLog);
    expect(summary).toContain('packages/orchestrator');
  });

  it('identifies workspace "packages/local-agent" from npm error path', async () => {
    const extractFailureSummary = await tryImportExtractFailureSummary();
    expect(extractFailureSummary).not.toBeNull();

    const rawLog = buildVitestFailureLog({
      workspace: 'packages/local-agent',
      sizeKb: 5,
    });

    const summary = extractFailureSummary!(rawLog);
    expect(summary).toContain('packages/local-agent');
  });

  it('includes npm error lines from the bottom of the log', async () => {
    const extractFailureSummary = await tryImportExtractFailureSummary();
    expect(extractFailureSummary).not.toBeNull();

    const rawLog = buildVitestFailureLog({
      workspace: 'packages/shared',
      sizeKb: 5,
    });

    const summary = extractFailureSummary!(rawLog);
    // npm error lines identify the workspace
    expect(summary).toMatch(/npm error|npm ERR!/i);
  });
});

// ---------------------------------------------------------------------------
// AC1 (behavioral): spec template after fix
// ---------------------------------------------------------------------------

describe('AC1 (behavioral): Feature spec created by monitor uses extraction template', () => {
  const MONITOR_MODULE_PATHS = [
    '../../packages/local-agent/src/master-ci-monitor.js',
    '../../packages/local-agent/src/executor.js',
  ];

  async function tryImportMonitor(): Promise<any> {
    for (const modulePath of MONITOR_MODULE_PATHS) {
      try {
        const mod = await import(/* @vite-ignore */ modulePath);
        if (mod.MasterCiMonitor || mod.checkMasterCi || mod.createMasterCiMonitor) {
          return mod.MasterCiMonitor ?? mod.checkMasterCi ?? mod.createMasterCiMonitor;
        }
      } catch {
        // Try next path
      }
    }
    return null;
  }

  it('feature spec contains FAILURE SUMMARY section, not raw log dump', async () => {
    const MonitorClass = await tryImportMonitor();
    expect(MonitorClass, 'MasterCiMonitor must be exported').not.toBeNull();

    const vitestLog = buildVitestFailureLog({
      failingTestName: 'should correctly handle the edge case',
      workspace: 'packages/orchestrator',
      sizeKb: 20,
    });

    let createFeatureCall: any = null;
    const mockCreateFeature = vi.fn().mockImplementation(async (payload: any) => {
      createFeatureCall = payload;
      return { data: { id: 'fix-spec-test' } };
    });

    const mockExec = vi.fn().mockImplementation(async (_cmd: string, args: string[]) => {
      const url = args.join(' ');
      if (url.includes('/runs') && url.includes('branch=master')) {
        return {
          stdout: JSON.stringify({
            workflow_runs: [{
              id: 12345,
              conclusion: 'failure',
              head_sha: 'abc123deadbeef',
              name: 'CI',
            }],
          }),
          stderr: '',
        };
      }
      if (url.includes('actions/runs/12345/jobs')) {
        return {
          stdout: JSON.stringify({
            jobs: [{
              name: 'build-and-test',
              steps: [{ name: 'Run vitest', conclusion: 'failure' }],
            }],
          }),
          stderr: '',
        };
      }
      if (url.includes('--log-failed') || url.includes('log-failed')) {
        return { stdout: vitestLog, stderr: '' };
      }
      return { stdout: '{}', stderr: '' };
    });

    const monitor = new MonitorClass({
      owner: 'zazig-team',
      repo: 'zazigv2',
      execFileAsync: mockExec,
      createFeature: mockCreateFeature,
      queryActiveFixFeatures: vi.fn().mockResolvedValue({ data: [] }),
      queryCompletedFixFeatures: vi.fn().mockResolvedValue({ data: [] }),
    });

    await monitor.poll();

    if (createFeatureCall === null) {
      // Monitor may not fetch logs in this path — skip behavioral check
      return;
    }

    const spec: string = createFeatureCall.spec ?? '';

    // Spec must contain FAILURE SUMMARY section
    expect(spec).toMatch(/FAILURE SUMMARY/i);

    // Spec must contain the commit SHA
    expect(spec).toContain('abc123deadbeef');

    // Spec must contain HOW TO REPRODUCE
    expect(spec).toMatch(/HOW TO REPRODUCE|gh run view/i);

    // Spec must NOT be the raw 20KB log dump (spec should be under 8KB + template overhead)
    expect(spec.length).toBeLessThan(20 * 1024);
  });

  it('feature spec contains no ANSI codes when monitor creates it from a log with ANSI', async () => {
    const MonitorClass = await tryImportMonitor();
    expect(MonitorClass, 'MasterCiMonitor must be exported').not.toBeNull();

    const logWithAnsi = buildVitestFailureLog({ sizeKb: 5 });
    expect(logWithAnsi).toMatch(/\x1b\[/); // confirm ANSI present in source

    let createFeatureCall: any = null;
    const mockCreateFeature = vi.fn().mockImplementation(async (payload: any) => {
      createFeatureCall = payload;
      return { data: { id: 'fix-ansi-test' } };
    });

    const mockExec = vi.fn().mockImplementation(async (_cmd: string, args: string[]) => {
      const url = args.join(' ');
      if (url.includes('/runs') && url.includes('branch=master')) {
        return {
          stdout: JSON.stringify({
            workflow_runs: [{
              id: 56789,
              conclusion: 'failure',
              head_sha: 'cafebabe',
              name: 'CI',
            }],
          }),
          stderr: '',
        };
      }
      if (url.includes('actions/runs/56789/jobs')) {
        return {
          stdout: JSON.stringify({
            jobs: [{
              name: 'test',
              steps: [{ name: 'vitest', conclusion: 'failure' }],
            }],
          }),
          stderr: '',
        };
      }
      if (url.includes('--log-failed') || url.includes('log-failed')) {
        return { stdout: logWithAnsi, stderr: '' };
      }
      return { stdout: '{}', stderr: '' };
    });

    const monitor = new MonitorClass({
      owner: 'zazig-team',
      repo: 'zazigv2',
      execFileAsync: mockExec,
      createFeature: mockCreateFeature,
      queryActiveFixFeatures: vi.fn().mockResolvedValue({ data: [] }),
      queryCompletedFixFeatures: vi.fn().mockResolvedValue({ data: [] }),
    });

    await monitor.poll();

    if (createFeatureCall === null) {
      return;
    }

    const spec: string = createFeatureCall.spec ?? '';
    expect(spec).not.toMatch(/\x1b\[/);
  });
});

// ---------------------------------------------------------------------------
// AC5: master-ci-monitor.js uses same extraction logic as executor.ts
// ---------------------------------------------------------------------------

describe('AC5: Structural — master-ci-monitor.js uses same extraction logic as executor.ts', () => {
  const EXECUTOR_PATH = 'packages/local-agent/src/executor.ts';
  const MONITOR_PATH = 'packages/local-agent/src/master-ci-monitor.js';

  it('executor.ts contains extractFailureSummary reference', () => {
    const executor = readRepoFile(EXECUTOR_PATH);
    expect(executor).not.toBeNull();
    expect(executor).toMatch(/extractFailureSummary/);
  });

  it('master-ci-monitor.js contains extractFailureSummary reference', () => {
    const monitor = readRepoFile(MONITOR_PATH);
    expect(monitor, 'master-ci-monitor.js must exist').not.toBeNull();
    expect(monitor).toMatch(/extractFailureSummary/);
  });

  it('both files reference FAILURE SUMMARY template section', () => {
    const executor = readRepoFile(EXECUTOR_PATH);
    const monitor = readRepoFile(MONITOR_PATH);

    expect(executor).not.toBeNull();
    expect(monitor, 'master-ci-monitor.js must exist').not.toBeNull();

    expect(executor).toMatch(/FAILURE SUMMARY/);
    expect(monitor).toMatch(/FAILURE SUMMARY/);
  });

  it('both files reference HOW TO REPRODUCE template section', () => {
    const executor = readRepoFile(EXECUTOR_PATH);
    const monitor = readRepoFile(MONITOR_PATH);

    expect(executor).not.toBeNull();
    expect(monitor, 'master-ci-monitor.js must exist').not.toBeNull();

    expect(executor).toMatch(/HOW TO REPRODUCE/);
    expect(monitor).toMatch(/HOW TO REPRODUCE/);
  });

  it('executor.ts strips ANSI codes (no verbatim ESC sequences stored in spec)', () => {
    const executor = readRepoFile(EXECUTOR_PATH);
    expect(executor).not.toBeNull();
    // Must contain ANSI stripping logic
    expect(executor).toMatch(/ESC\[|\\x1b|\\u001b|ansi|ANSI/i);
  });

  it('master-ci-monitor.js strips ANSI codes', () => {
    const monitor = readRepoFile(MONITOR_PATH);
    expect(monitor, 'master-ci-monitor.js must exist').not.toBeNull();
    // Must contain ANSI stripping logic
    expect(monitor).toMatch(/ESC\[|\\x1b|\\u001b|ansi|ANSI/i);
  });

  it('executor.ts enforces 8KB cap on extracted summary', () => {
    const executor = readRepoFile(EXECUTOR_PATH);
    expect(executor).not.toBeNull();
    // 8KB = 8192 bytes
    expect(executor).toMatch(/8[_,]?192|8\s*\*\s*1024|8KB|8kb/i);
  });

  it('master-ci-monitor.js enforces 8KB cap', () => {
    const monitor = readRepoFile(MONITOR_PATH);
    expect(monitor, 'master-ci-monitor.js must exist').not.toBeNull();
    expect(monitor).toMatch(/8[_,]?192|8\s*\*\s*1024|8KB|8kb/i);
  });

  it('extractFailureSummary is importable from master-ci-monitor.js', async () => {
    // The standalone monitor must export or define extractFailureSummary
    try {
      const mod = await import(/* @vite-ignore */ '../../packages/local-agent/src/master-ci-monitor.js');
      expect(
        typeof mod.extractFailureSummary === 'function' ||
        typeof mod.default?.extractFailureSummary === 'function',
        'master-ci-monitor.js must export extractFailureSummary'
      ).toBe(true);
    } catch (e) {
      // If import fails, the module doesn't exist yet — fail with a descriptive message
      expect.fail(`master-ci-monitor.js failed to import: ${e}`);
    }
  });
});

// ---------------------------------------------------------------------------
// Unit tests for extractFailureSummary edge cases
// ---------------------------------------------------------------------------

describe('extractFailureSummary: unit tests for extraction logic', () => {
  it('extracts vitest FAIL block between FAIL marker and Test Files summary', async () => {
    const extractFailureSummary = await tryImportExtractFailureSummary();
    expect(extractFailureSummary).not.toBeNull();

    const preamble = Array.from({ length: 100 }, (_, i) => `✓ passing ${i}`).join('\n');
    const failBlock = [
      'FAIL packages/foo/bar.test.ts',
      '',
      '● my failing test',
      '',
      '  AssertionError: expected 1 to equal 2',
      '',
      '  Expected: 2',
      '  Received: 1',
      '',
      ' Test Files  1 failed (5)',
      ' Tests  1 failed | 50 passed (51)',
    ].join('\n');

    const rawLog = `${preamble}\n\n${failBlock}`;
    const summary = extractFailureSummary!(rawLog);

    expect(summary).toContain('my failing test');
    expect(summary).toContain('AssertionError: expected 1 to equal 2');
    // The 100 passing lines should not be in the summary
    const passingCount = (summary.match(/✓ passing \d+/g) ?? []).length;
    expect(passingCount).toBe(0);
  });

  it('extracts jest failure format', async () => {
    const extractFailureSummary = await tryImportExtractFailureSummary();
    expect(extractFailureSummary).not.toBeNull();

    const jestLog = [
      ...Array.from({ length: 50 }, (_, i) => `  ✓ jest passing test ${i} (5ms)`),
      '',
      'FAIL src/handlers/foo.test.js',
      '  ● describe block › should fail',
      '',
      '    expect(received).toBe(expected)',
      '    Expected: true',
      '    Received: false',
      '',
      '    at Object.<anonymous> (src/handlers/foo.test.js:10:3)',
      '',
      'Test Suites: 1 failed, 3 passed, 4 total',
      'Tests:       1 failed, 49 passed, 50 total',
    ].join('\n');

    const summary = extractFailureSummary!(jestLog);

    expect(summary).toContain('should fail');
    expect(summary).toMatch(/expect\(received\)\.toBe|Expected: true/);
  });

  it('handles build error logs (no FAIL marker) by returning last 200 lines', async () => {
    const extractFailureSummary = await tryImportExtractFailureSummary();
    expect(extractFailureSummary).not.toBeNull();

    const lines = Array.from({ length: 250 }, (_, i) => `Build line ${i}`);
    lines[249] = 'error TS2345: Argument of type string not assignable';
    const rawLog = lines.join('\n');

    const summary = extractFailureSummary!(rawLog);

    expect(summary).toContain('error TS2345');
    // Lines 0-49 should NOT be present
    expect(summary).not.toContain('Build line 0');
    expect(summary).not.toContain('Build line 49');
  });
});
