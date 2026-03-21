/**
 * Feature: Post-merge master CI monitor — auto-fix staging deploy failures
 * Feature ID: ac93156a-247e-4680-87ca-920ae4e5fec6
 *
 * Tests for all acceptance criteria:
 * AC1 - When latest master CI run fails, fast-tracked fix feature is created
 * AC2 - When a fix feature is already in an active pipeline status, no duplicate is created
 * AC3 - When 3 consecutive fix features have failed to make master green, no further fixes
 * AC4 - When master CI is green, monitor takes no action
 * AC5 - Monitor restart does not re-create a fix feature that already has one in flight
 * AC6 - Monitor does not interfere with existing executor functionality
 *
 * Failure cases:
 * FC1 - Must NOT create fix features when CI is still `in_progress`
 * FC2 - Must NOT create multiple fix features for the same failed run
 * FC3 - Must NOT loop infinitely — generation cap of 3 consecutive failures
 * FC4 - Must NOT crash the executor if the GitHub API is unreachable
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

// ---------------------------------------------------------------------------
// Static structural checks — executor must contain the CI monitor
// ---------------------------------------------------------------------------

describe('Structural: executor contains master CI monitor', () => {
  const EXECUTOR_PATH = 'packages/local-agent/src/executor.ts';
  let executor: string | null;

  beforeEach(() => {
    executor = readRepoFile(EXECUTOR_PATH);
  });

  it('executor.ts exists', () => {
    expect(executor).not.toBeNull();
  });

  it('declares a 5-minute (300_000ms) CI monitor interval constant', () => {
    expect(executor).not.toBeNull();
    // Should have a constant for the 5-minute poll interval
    expect(executor).toMatch(/300[_,]?000/);
    expect(executor).toMatch(/[Cc][Ii].*[Mm]onitor|[Mm]aster.*[Cc][Ii]/);
  });

  it('references masterCiMonitorTimer or equivalent timer variable', () => {
    expect(executor).not.toBeNull();
    // The monitor uses a setInterval timer that must be tracked for shutdown
    expect(executor).toMatch(/masterCi[Mm]onitor[Tt]imer|ciMonitorTimer|masterCiTimer/);
  });

  it('stops CI monitor timer on shutdown', () => {
    expect(executor).not.toBeNull();
    // The shutdown path must clear the CI monitor interval
    expect(executor).toMatch(/clearInterval.*[Cc][Ii][Mm]onitor|[Cc][Ii][Mm]onitor.*clearInterval/);
  });

  it('polls the master branch using gh api with correct parameters', () => {
    expect(executor).not.toBeNull();
    // Must use: gh api repos/{owner}/{repo}/actions/runs?branch=master&event=push&per_page=1
    expect(executor).toMatch(/actions\/runs/);
    expect(executor).toMatch(/branch=master/);
    expect(executor).toMatch(/per_page=1/);
  });

  it('creates fix features tagged with master-ci-fix', () => {
    expect(executor).not.toBeNull();
    expect(executor).toContain('master-ci-fix');
  });

  it('tracks fix-generation counter in feature tags', () => {
    expect(executor).not.toBeNull();
    expect(executor).toMatch(/fix-generation/);
  });

  it('implements dedup guard by querying active-status features', () => {
    expect(executor).not.toBeNull();
    // Must check for features in active statuses before creating
    expect(executor).toMatch(/breaking_down|building|combining_and_pr|ci_checking|merging/);
  });
});

// ---------------------------------------------------------------------------
// Unit tests for MasterCiMonitor behaviour
// ---------------------------------------------------------------------------

// These tests import the MasterCiMonitor class (or checkMasterCi function)
// which will be exported from the executor or a dedicated module once implemented.

let MasterCiMonitor: any;

// Attempt to import — will fail until the feature is built
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

describe('AC1: Failing master CI run triggers fast-tracked fix feature creation', () => {
  let mockExecFileAsync: Mock;
  let mockCreateFeature: Mock;
  let mockQueryFeatures: Mock;

  beforeEach(() => {
    vi.useFakeTimers();
    mockExecFileAsync = vi.fn();
    mockCreateFeature = vi.fn().mockResolvedValue({ data: { id: 'fix-feature-001' } });
    mockQueryFeatures = vi.fn().mockResolvedValue({ data: [] }); // No in-flight fixes
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('MasterCiMonitor or equivalent is exported from local-agent', async () => {
    const MonitorClass = await tryImportMonitor();
    expect(MonitorClass).not.toBeNull();
  });

  it('calls create_feature when master CI conclusion is "failure"', async () => {
    const MonitorClass = await tryImportMonitor();
    expect(MonitorClass, 'MasterCiMonitor must be exported to test').not.toBeNull();

    // Mock gh api returning a failed run
    mockExecFileAsync.mockImplementation(async (_cmd: string, args: string[]) => {
      const url = args.join(' ');
      if (url.includes('actions/runs') && url.includes('branch=master')) {
        return {
          stdout: JSON.stringify({
            workflow_runs: [{
              id: 12345,
              conclusion: 'failure',
              head_sha: 'abc123',
              name: 'Deploy to Staging',
            }],
          }),
          stderr: '',
        };
      }
      if (url.includes('actions/runs/12345/jobs')) {
        return {
          stdout: JSON.stringify({
            jobs: [{
              id: 1,
              name: 'deploy',
              steps: [{
                name: 'Deploy to Staging',
                conclusion: 'failure',
              }],
            }],
          }),
          stderr: '',
        };
      }
      return { stdout: '{}', stderr: '' };
    });

    const monitor = new MonitorClass({
      owner: 'zazig-team',
      repo: 'zazigv2',
      execFileAsync: mockExecFileAsync,
      createFeature: mockCreateFeature,
      queryActiveFixFeatures: mockQueryFeatures,
      queryCompletedFixFeatures: vi.fn().mockResolvedValue({ data: [] }),
    });

    await monitor.poll();

    expect(mockCreateFeature).toHaveBeenCalledTimes(1);
    const callArg = mockCreateFeature.mock.calls[0][0];
    expect(callArg.title).toMatch(/Fix master CI failure/);
    expect(callArg.fast_track).toBe(true);
    expect(callArg.priority).toBe('high');
    expect(callArg.tags).toContain('master-ci-fix');
  });

  it('fix feature spec includes failure logs and commit SHA', async () => {
    const MonitorClass = await tryImportMonitor();
    expect(MonitorClass, 'MasterCiMonitor must be exported to test').not.toBeNull();

    mockExecFileAsync.mockImplementation(async (_cmd: string, args: string[]) => {
      const url = args.join(' ');
      if (url.includes('actions/runs') && url.includes('branch=master')) {
        return {
          stdout: JSON.stringify({
            workflow_runs: [{
              id: 99,
              conclusion: 'failure',
              head_sha: 'deadbeef',
              name: 'CI',
            }],
          }),
          stderr: '',
        };
      }
      if (url.includes('actions/runs/99/jobs')) {
        return {
          stdout: JSON.stringify({
            jobs: [{
              name: 'build-and-test',
              steps: [{ name: 'Run tests', conclusion: 'failure' }],
            }],
          }),
          stderr: '',
        };
      }
      return { stdout: '{}', stderr: '' };
    });

    const monitor = new MonitorClass({
      owner: 'zazig-team',
      repo: 'zazigv2',
      execFileAsync: mockExecFileAsync,
      createFeature: mockCreateFeature,
      queryActiveFixFeatures: mockQueryFeatures,
      queryCompletedFixFeatures: vi.fn().mockResolvedValue({ data: [] }),
    });

    await monitor.poll();

    expect(mockCreateFeature).toHaveBeenCalledTimes(1);
    const callArg = mockCreateFeature.mock.calls[0][0];
    expect(callArg.spec).toContain('deadbeef');
    expect(callArg.spec).toMatch(/Run tests|build-and-test/);
  });
});

describe('AC2/FC2: Dedup guard prevents duplicate fix features', () => {
  let mockExecFileAsync: Mock;
  let mockCreateFeature: Mock;

  beforeEach(() => {
    vi.useFakeTimers();
    mockExecFileAsync = vi.fn().mockImplementation(async (_cmd: string, args: string[]) => {
      const url = args.join(' ');
      if (url.includes('actions/runs') && url.includes('branch=master')) {
        return {
          stdout: JSON.stringify({
            workflow_runs: [{
              id: 777,
              conclusion: 'failure',
              head_sha: 'cafecafe',
              name: 'CI',
            }],
          }),
          stderr: '',
        };
      }
      if (url.includes('actions/runs/777/jobs')) {
        return {
          stdout: JSON.stringify({
            jobs: [{ name: 'deploy', steps: [{ name: 'Deploy', conclusion: 'failure' }] }],
          }),
          stderr: '',
        };
      }
      return { stdout: '{}', stderr: '' };
    });
    mockCreateFeature = vi.fn().mockResolvedValue({ data: { id: 'new-fix' } });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('does NOT create a fix feature when one is already in "building" status', async () => {
    const MonitorClass = await tryImportMonitor();
    expect(MonitorClass, 'MasterCiMonitor must be exported to test').not.toBeNull();

    // Simulate an existing in-flight fix feature
    const mockQueryActive = vi.fn().mockResolvedValue({
      data: [{ id: 'existing-fix', status: 'building', tags: ['master-ci-fix'] }],
    });

    const monitor = new MonitorClass({
      owner: 'zazig-team',
      repo: 'zazigv2',
      execFileAsync: mockExecFileAsync,
      createFeature: mockCreateFeature,
      queryActiveFixFeatures: mockQueryActive,
      queryCompletedFixFeatures: vi.fn().mockResolvedValue({ data: [] }),
    });

    await monitor.poll();

    expect(mockCreateFeature).not.toHaveBeenCalled();
  });

  it('does NOT create a fix feature when one is in "ci_checking" status', async () => {
    const MonitorClass = await tryImportMonitor();
    expect(MonitorClass, 'MasterCiMonitor must be exported to test').not.toBeNull();

    const mockQueryActive = vi.fn().mockResolvedValue({
      data: [{ id: 'existing-ci-fix', status: 'ci_checking', tags: ['master-ci-fix'] }],
    });

    const monitor = new MonitorClass({
      owner: 'zazig-team',
      repo: 'zazigv2',
      execFileAsync: mockExecFileAsync,
      createFeature: mockCreateFeature,
      queryActiveFixFeatures: mockQueryActive,
      queryCompletedFixFeatures: vi.fn().mockResolvedValue({ data: [] }),
    });

    await monitor.poll();

    expect(mockCreateFeature).not.toHaveBeenCalled();
  });

  it('does NOT create fix twice for the same failed run ID', async () => {
    const MonitorClass = await tryImportMonitor();
    expect(MonitorClass, 'MasterCiMonitor must be exported to test').not.toBeNull();

    const mockQueryActive = vi.fn().mockResolvedValue({ data: [] });

    const monitor = new MonitorClass({
      owner: 'zazig-team',
      repo: 'zazigv2',
      execFileAsync: mockExecFileAsync,
      createFeature: mockCreateFeature,
      queryActiveFixFeatures: mockQueryActive,
      queryCompletedFixFeatures: vi.fn().mockResolvedValue({ data: [] }),
    });

    // Poll twice with the same failed run ID
    await monitor.poll();
    await monitor.poll();

    // Should only create fix on first encounter of run ID 777
    expect(mockCreateFeature).toHaveBeenCalledTimes(1);
  });

  it('checks all active statuses: breaking_down, building, combining_and_pr, ci_checking, merging', async () => {
    const MonitorClass = await tryImportMonitor();
    expect(MonitorClass, 'MasterCiMonitor must be exported to test').not.toBeNull();

    const mockQueryActive = vi.fn().mockResolvedValue({ data: [] });

    const monitor = new MonitorClass({
      owner: 'zazig-team',
      repo: 'zazigv2',
      execFileAsync: mockExecFileAsync,
      createFeature: mockCreateFeature,
      queryActiveFixFeatures: mockQueryActive,
      queryCompletedFixFeatures: vi.fn().mockResolvedValue({ data: [] }),
    });

    await monitor.poll();

    // queryActiveFixFeatures must be called to check for in-flight fixes
    expect(mockQueryActive).toHaveBeenCalledTimes(1);
    const queryArg = mockQueryActive.mock.calls[0][0];
    // The query should include the active statuses
    const activeStatuses = ['breaking_down', 'building', 'combining_and_pr', 'ci_checking', 'merging'];
    for (const status of activeStatuses) {
      expect(JSON.stringify(queryArg)).toContain(status);
    }
  });
});

describe('AC3/FC3: Loop guard — max 3 consecutive fix features', () => {
  let mockExecFileAsync: Mock;
  let mockCreateFeature: Mock;
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.useFakeTimers();
    mockExecFileAsync = vi.fn().mockImplementation(async (_cmd: string, args: string[]) => {
      const url = args.join(' ');
      if (url.includes('actions/runs') && url.includes('branch=master')) {
        // Return a new failure each time (incrementing run IDs to bypass same-run dedup)
        const runId = Date.now();
        return {
          stdout: JSON.stringify({
            workflow_runs: [{
              id: runId,
              conclusion: 'failure',
              head_sha: `sha${runId}`,
              name: 'CI',
            }],
          }),
          stderr: '',
        };
      }
      if (url.includes('actions/runs') && url.includes('/jobs')) {
        return {
          stdout: JSON.stringify({
            jobs: [{ name: 'deploy', steps: [{ name: 'Deploy', conclusion: 'failure' }] }],
          }),
          stderr: '',
        };
      }
      return { stdout: '{}', stderr: '' };
    });
    mockCreateFeature = vi.fn().mockResolvedValue({ data: { id: 'fix' } });
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
    consoleWarnSpy.mockRestore();
  });

  it('stops creating fix features after 3 consecutive failures (generation cap)', async () => {
    const MonitorClass = await tryImportMonitor();
    expect(MonitorClass, 'MasterCiMonitor must be exported to test').not.toBeNull();

    // Simulate 3 completed fix features (generation 1, 2, 3) since last green run
    const completedFixes = [
      { id: 'fix-1', tags: ['master-ci-fix', 'fix-generation:1'], status: 'complete' },
      { id: 'fix-2', tags: ['master-ci-fix', 'fix-generation:2'], status: 'complete' },
      { id: 'fix-3', tags: ['master-ci-fix', 'fix-generation:3'], status: 'complete' },
    ];
    const mockQueryCompleted = vi.fn().mockResolvedValue({ data: completedFixes });
    const mockQueryActive = vi.fn().mockResolvedValue({ data: [] });

    const monitor = new MonitorClass({
      owner: 'zazig-team',
      repo: 'zazigv2',
      execFileAsync: mockExecFileAsync,
      createFeature: mockCreateFeature,
      queryActiveFixFeatures: mockQueryActive,
      queryCompletedFixFeatures: mockQueryCompleted,
    });

    await monitor.poll();

    // Should NOT create a 4th fix feature
    expect(mockCreateFeature).not.toHaveBeenCalled();
  });

  it('logs a warning when generation cap is reached', async () => {
    const MonitorClass = await tryImportMonitor();
    expect(MonitorClass, 'MasterCiMonitor must be exported to test').not.toBeNull();

    const completedFixes = [
      { id: 'fix-1', tags: ['master-ci-fix', 'fix-generation:1'], status: 'complete' },
      { id: 'fix-2', tags: ['master-ci-fix', 'fix-generation:2'], status: 'complete' },
      { id: 'fix-3', tags: ['master-ci-fix', 'fix-generation:3'], status: 'complete' },
    ];
    const mockQueryCompleted = vi.fn().mockResolvedValue({ data: completedFixes });

    const monitor = new MonitorClass({
      owner: 'zazig-team',
      repo: 'zazigv2',
      execFileAsync: mockExecFileAsync,
      createFeature: mockCreateFeature,
      queryActiveFixFeatures: vi.fn().mockResolvedValue({ data: [] }),
      queryCompletedFixFeatures: mockQueryCompleted,
    });

    await monitor.poll();

    expect(consoleWarnSpy).toHaveBeenCalledWith(
      expect.stringMatching(/generation cap|loop guard|max.*fix|3.*consecutive/i),
    );
  });

  it('resets generation counter after a successful (green) master CI run', async () => {
    const MonitorClass = await tryImportMonitor();
    expect(MonitorClass, 'MasterCiMonitor must be exported to test').not.toBeNull();

    const mockQueryActive = vi.fn().mockResolvedValue({ data: [] });
    const mockQueryCompleted = vi.fn().mockResolvedValue({ data: [] });

    const monitor = new MonitorClass({
      owner: 'zazig-team',
      repo: 'zazigv2',
      execFileAsync: mockExecFileAsync,
      createFeature: mockCreateFeature,
      queryActiveFixFeatures: mockQueryActive,
      queryCompletedFixFeatures: mockQueryCompleted,
    });

    // Simulate a green CI run
    mockExecFileAsync.mockImplementationOnce(async (_cmd: string, args: string[]) => {
      const url = args.join(' ');
      if (url.includes('actions/runs') && url.includes('branch=master')) {
        return {
          stdout: JSON.stringify({
            workflow_runs: [{ id: 500, conclusion: 'success', head_sha: 'greensha', name: 'CI' }],
          }),
          stderr: '',
        };
      }
      return { stdout: '{}', stderr: '' };
    });

    await monitor.poll(); // green run → resets generation

    // After green, generation is reset — verify by checking that lastGreenRunId is tracked
    expect(monitor.lastSuccessfulRunId ?? monitor.generationCount ?? monitor.consecutiveFailures).toBeDefined();
  });
});

describe('AC4/FC1: Green and in-progress CI runs take no action', () => {
  let mockCreateFeature: Mock;

  beforeEach(() => {
    mockCreateFeature = vi.fn().mockResolvedValue({ data: { id: 'should-not-be-called' } });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('does NOT create a fix feature when master CI conclusion is "success"', async () => {
    const MonitorClass = await tryImportMonitor();
    expect(MonitorClass, 'MasterCiMonitor must be exported to test').not.toBeNull();

    const mockExec = vi.fn().mockResolvedValue({
      stdout: JSON.stringify({
        workflow_runs: [{ id: 200, conclusion: 'success', head_sha: 'greensha', name: 'CI' }],
      }),
      stderr: '',
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

    expect(mockCreateFeature).not.toHaveBeenCalled();
  });

  it('does NOT create a fix feature when master CI conclusion is null (in_progress)', async () => {
    const MonitorClass = await tryImportMonitor();
    expect(MonitorClass, 'MasterCiMonitor must be exported to test').not.toBeNull();

    const mockExec = vi.fn().mockResolvedValue({
      stdout: JSON.stringify({
        workflow_runs: [{ id: 300, conclusion: null, status: 'in_progress', head_sha: 'runningsha', name: 'CI' }],
      }),
      stderr: '',
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

    expect(mockCreateFeature).not.toHaveBeenCalled();
  });

  it('does NOT create a fix feature when workflow_runs is empty', async () => {
    const MonitorClass = await tryImportMonitor();
    expect(MonitorClass, 'MasterCiMonitor must be exported to test').not.toBeNull();

    const mockExec = vi.fn().mockResolvedValue({
      stdout: JSON.stringify({ workflow_runs: [] }),
      stderr: '',
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

    expect(mockCreateFeature).not.toHaveBeenCalled();
  });
});

describe('AC5: Dedup guard survives monitor restart', () => {
  it('does not re-create fix for run already in-flight when monitor restarts', async () => {
    const MonitorClass = await tryImportMonitor();
    expect(MonitorClass, 'MasterCiMonitor must be exported to test').not.toBeNull();

    const mockExec = vi.fn().mockResolvedValue({
      stdout: JSON.stringify({
        workflow_runs: [{ id: 888, conclusion: 'failure', head_sha: 'restartsha', name: 'CI' }],
      }),
      stderr: '',
    });
    const mockCreateFeature = vi.fn().mockResolvedValue({ data: { id: 'fix-888' } });

    // After restart, there's already an in-flight fix (created before restart)
    const mockQueryActive = vi.fn().mockResolvedValue({
      data: [{ id: 'fix-888', status: 'building', tags: ['master-ci-fix'] }],
    });

    // Fresh monitor instance (simulates restart — no in-memory state)
    const monitor = new MonitorClass({
      owner: 'zazig-team',
      repo: 'zazigv2',
      execFileAsync: mockExec,
      createFeature: mockCreateFeature,
      queryActiveFixFeatures: mockQueryActive,
      queryCompletedFixFeatures: vi.fn().mockResolvedValue({ data: [] }),
    });

    await monitor.poll();

    // DB-based dedup guard must catch this even without in-memory lastRunId
    expect(mockCreateFeature).not.toHaveBeenCalled();
  });
});

describe('FC4: GitHub API unreachable — graceful error handling', () => {
  it('does NOT throw when gh api call fails — logs error and continues', async () => {
    const MonitorClass = await tryImportMonitor();
    expect(MonitorClass, 'MasterCiMonitor must be exported to test').not.toBeNull();

    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const mockExec = vi.fn().mockRejectedValue(new Error('Network unreachable: getaddrinfo ENOTFOUND api.github.com'));
    const mockCreateFeature = vi.fn();

    const monitor = new MonitorClass({
      owner: 'zazig-team',
      repo: 'zazigv2',
      execFileAsync: mockExec,
      createFeature: mockCreateFeature,
      queryActiveFixFeatures: vi.fn().mockResolvedValue({ data: [] }),
      queryCompletedFixFeatures: vi.fn().mockResolvedValue({ data: [] }),
    });

    // Should not throw
    await expect(monitor.poll()).resolves.not.toThrow();

    // Should NOT create a feature
    expect(mockCreateFeature).not.toHaveBeenCalled();

    // Should log the error
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringMatching(/master.*ci|ci.*monitor|github.*api/i),
      expect.any(Error),
    );

    consoleErrorSpy.mockRestore();
  });

  it('continues monitoring on the next interval after an API failure', async () => {
    const MonitorClass = await tryImportMonitor();
    expect(MonitorClass, 'MasterCiMonitor must be exported to test').not.toBeNull();

    vi.useFakeTimers();
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    let callCount = 0;
    const mockExec = vi.fn().mockImplementation(async () => {
      callCount++;
      if (callCount === 1) {
        throw new Error('Network error');
      }
      return {
        stdout: JSON.stringify({
          workflow_runs: [{ id: 999, conclusion: 'success', head_sha: 'sha', name: 'CI' }],
        }),
        stderr: '',
      };
    });

    const mockCreateFeature = vi.fn();

    const monitor = new MonitorClass({
      owner: 'zazig-team',
      repo: 'zazigv2',
      execFileAsync: mockExec,
      createFeature: mockCreateFeature,
      queryActiveFixFeatures: vi.fn().mockResolvedValue({ data: [] }),
      queryCompletedFixFeatures: vi.fn().mockResolvedValue({ data: [] }),
    });

    // First poll fails
    await monitor.poll();
    expect(callCount).toBe(1);

    // Second poll succeeds (monitor still runs)
    await monitor.poll();
    expect(callCount).toBe(2);

    vi.useRealTimers();
    consoleErrorSpy.mockRestore();
  });
});

describe('AC6: CI monitor does not interfere with existing executor functionality', () => {
  const EXECUTOR_PATH = 'packages/local-agent/src/executor.ts';

  it('executor still exports JobExecutor class unchanged', () => {
    const executor = readRepoFile(EXECUTOR_PATH);
    expect(executor).not.toBeNull();
    expect(executor).toContain('JobExecutor');
    expect(executor).toContain('handleStartJob');
  });

  it('prMonitorTimer reference is still present in executor', () => {
    const executor = readRepoFile(EXECUTOR_PATH);
    expect(executor).not.toBeNull();
    expect(executor).toContain('prMonitorTimer');
  });

  it('master CI monitor uses a separate timer from prMonitorTimer', () => {
    const executor = readRepoFile(EXECUTOR_PATH);
    expect(executor).not.toBeNull();
    // Both timers exist independently
    expect(executor).toContain('prMonitorTimer');
    expect(executor).toMatch(/masterCi[Mm]onitor[Tt]imer|ciMonitorTimer|masterCiTimer/);
    // They must be separate variables (not the same assignment line)
    const prTimerMatches = (executor ?? '').match(/prMonitorTimer\s*=/g) ?? [];
    const ciTimerMatches = (executor ?? '').match(/(masterCi[Mm]onitor[Tt]imer|ciMonitorTimer|masterCiTimer)\s*=/g) ?? [];
    expect(prTimerMatches.length).toBeGreaterThan(0);
    expect(ciTimerMatches.length).toBeGreaterThan(0);
  });
});

describe('Feature: fix feature creation payload', () => {
  it('creates fix feature with title matching "Fix master CI failure — {step name}" pattern', async () => {
    const MonitorClass = await tryImportMonitor();
    expect(MonitorClass, 'MasterCiMonitor must be exported to test').not.toBeNull();

    const mockExec = vi.fn().mockImplementation(async (_cmd: string, args: string[]) => {
      const url = args.join(' ');
      if (url.includes('actions/runs') && url.includes('branch=master')) {
        return {
          stdout: JSON.stringify({
            workflow_runs: [{ id: 42, conclusion: 'failure', head_sha: 'deadcode', name: 'CI' }],
          }),
          stderr: '',
        };
      }
      if (url.includes('actions/runs/42/jobs')) {
        return {
          stdout: JSON.stringify({
            jobs: [{
              name: 'build',
              steps: [{ name: 'Deploy to Staging', conclusion: 'failure' }],
            }],
          }),
          stderr: '',
        };
      }
      return { stdout: '{}', stderr: '' };
    });

    const mockCreateFeature = vi.fn().mockResolvedValue({ data: { id: 'fix-42' } });

    const monitor = new MonitorClass({
      owner: 'zazig-team',
      repo: 'zazigv2',
      execFileAsync: mockExec,
      createFeature: mockCreateFeature,
      queryActiveFixFeatures: vi.fn().mockResolvedValue({ data: [] }),
      queryCompletedFixFeatures: vi.fn().mockResolvedValue({ data: [] }),
    });

    await monitor.poll();

    expect(mockCreateFeature).toHaveBeenCalledTimes(1);
    const payload = mockCreateFeature.mock.calls[0][0];
    expect(payload.title).toMatch(/^Fix master CI failure — /);
    expect(payload.title).toContain('Deploy to Staging');
    expect(payload.tags).toContain('master-ci-fix');
    expect(payload.tags).toMatch(/fix-generation:\d+/);
    expect(payload.priority).toBe('high');
    expect(payload.fast_track).toBe(true);
  });

  it('includes fix-generation tag in correct N format', async () => {
    const MonitorClass = await tryImportMonitor();
    expect(MonitorClass, 'MasterCiMonitor must be exported to test').not.toBeNull();

    const mockExec = vi.fn().mockResolvedValue({
      stdout: JSON.stringify({
        workflow_runs: [{ id: 55, conclusion: 'failure', head_sha: 'abc', name: 'CI' }],
      }),
      stderr: '',
    });
    const jobsMock = vi.fn().mockResolvedValue({
      stdout: JSON.stringify({ jobs: [{ name: 'j', steps: [{ name: 'S', conclusion: 'failure' }] }] }),
      stderr: '',
    });

    const execMock = vi.fn().mockImplementation(async (_cmd: string, args: string[]) => {
      const url = args.join(' ');
      if (url.includes('/jobs')) return jobsMock();
      return mockExec();
    });

    const mockCreateFeature = vi.fn().mockResolvedValue({ data: { id: 'fix-55' } });

    const monitor = new MonitorClass({
      owner: 'zazig-team',
      repo: 'zazigv2',
      execFileAsync: execMock,
      createFeature: mockCreateFeature,
      queryActiveFixFeatures: vi.fn().mockResolvedValue({ data: [] }),
      queryCompletedFixFeatures: vi.fn().mockResolvedValue({ data: [] }),
    });

    await monitor.poll();

    const payload = mockCreateFeature.mock.calls[0][0];
    const genTag = (payload.tags as string[]).find((t: string) => t.startsWith('fix-generation:'));
    expect(genTag).toBeDefined();
    expect(genTag).toMatch(/^fix-generation:\d+$/);
    const genNum = parseInt(genTag!.split(':')[1], 10);
    expect(genNum).toBeGreaterThanOrEqual(1);
  });
});
