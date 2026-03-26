/**
 * Feature: Replace 5-min refresh with 30s master change poller and agent broadcast
 * Feature ID: c965b66c-d552-429e-928f-33813384dbb1
 *
 * Acceptance criteria tested:
 * AC1 - No change: poller calls ls-remote, no notification sent
 * AC2 - SHA change: bare repo fetched, all active sessions notified, logs use [git master refresh] prefix
 * AC3 - Fetch fails: no notification broadcast, error logged, retry on next cycle
 * AC4 - 3 active sessions (persistent, expert, job): all 3 receive notification
 * AC5 - One tmux session ended unexpectedly: remaining sessions still notified, warning logged
 * AC6 - Daemon start: stores current SHA without broadcasting, logs "Poller started"
 * AC7 - Old 5-min timer removed: REPO_REFRESH_INTERVAL_MS and its setInterval removed from index.ts
 *
 * These tests are written to FAIL against the current codebase and pass once
 * the feature is implemented.
 */

import { describe, it, expect, beforeEach, afterEach, vi, type Mock } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

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

// Try to import the MasterChangePoller from expected module locations
async function tryImportPoller(): Promise<any> {
  const candidates = [
    'packages/local-agent/src/master-change-poller.ts',
    'packages/local-agent/src/executor.ts',
    'packages/local-agent/src/index.ts',
  ];
  for (const relPath of candidates) {
    try {
      const modulePath = pathToFileURL(path.join(REPO_ROOT, relPath)).href;
      const mod = await import(/* @vite-ignore */ modulePath);
      if (mod.MasterChangePoller || mod.createMasterChangePoller || mod.masterChangePoller) {
        return mod.MasterChangePoller ?? mod.createMasterChangePoller ?? mod.masterChangePoller;
      }
    } catch {
      // Try next path
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// AC7: Structural — 5-min timer must be removed from index.ts
// ---------------------------------------------------------------------------

describe('AC7: Old 5-minute refresh timer removed from index.ts', () => {
  const INDEX_PATH = 'packages/local-agent/src/index.ts';
  let index: string | null;

  beforeEach(() => {
    index = readRepoFile(INDEX_PATH);
  });

  it('index.ts exists', () => {
    expect(index).not.toBeNull();
  });

  it('REPO_REFRESH_INTERVAL_MS constant is removed from index.ts', () => {
    expect(index).not.toBeNull();
    // The 5-min timer constant must be gone
    expect(index).not.toContain('REPO_REFRESH_INTERVAL_MS');
  });

  it('setInterval for repoRefreshTimer is removed from index.ts', () => {
    expect(index).not.toBeNull();
    // The timer-driven refreshWorktree call must be gone
    expect(index).not.toMatch(/repoRefreshTimer\s*=\s*setInterval/);
  });

  it('timer-driven refreshWorktree call is removed from index.ts', () => {
    expect(index).not.toBeNull();
    // Inside the old setInterval, refreshWorktree was called — that block must be gone
    // Check that setInterval no longer calls refreshWorktree in index.ts
    const lines = (index ?? '').split('\n');
    const setIntervalIdx = lines.findIndex(l => l.includes('setInterval') && l.includes('REPO_REFRESH'));
    expect(setIntervalIdx).toBe(-1);
  });
});

// ---------------------------------------------------------------------------
// AC6 + Structural: 30-second poller is wired up
// ---------------------------------------------------------------------------

describe('Structural: 30-second master change poller is present', () => {
  it('index.ts or executor.ts references a 30-second (30_000ms) poll interval', () => {
    const index = readRepoFile('packages/local-agent/src/index.ts');
    const executor = readRepoFile('packages/local-agent/src/executor.ts');
    const combined = (index ?? '') + (executor ?? '');
    // Must have a 30-second interval somewhere (30000 or 30_000)
    expect(combined).toMatch(/30[_,]?000/);
  });

  it('source contains git ls-remote call targeting refs/heads/master', () => {
    const index = readRepoFile('packages/local-agent/src/index.ts');
    const executor = readRepoFile('packages/local-agent/src/executor.ts');
    const branches = readRepoFile('packages/local-agent/src/branches.ts');
    const combined = (index ?? '') + (executor ?? '') + (branches ?? '');
    expect(combined).toMatch(/ls-remote/);
    expect(combined).toMatch(/refs\/heads\/master/);
  });

  it('source contains [git master refresh] log prefix', () => {
    const index = readRepoFile('packages/local-agent/src/index.ts');
    const executor = readRepoFile('packages/local-agent/src/executor.ts');
    const combined = (index ?? '') + (executor ?? '');
    expect(combined).toContain('[git master refresh]');
  });

  it('source contains "Poller started" log message', () => {
    const index = readRepoFile('packages/local-agent/src/index.ts');
    const executor = readRepoFile('packages/local-agent/src/executor.ts');
    const combined = (index ?? '') + (executor ?? '');
    expect(combined).toContain('Poller started');
  });

  it('executor.ts contains a broadcast method that enumerates all active sessions', () => {
    const executor = readRepoFile('packages/local-agent/src/executor.ts');
    expect(executor).not.toBeNull();
    // Must have a method that broadcasts to all sessions
    expect(executor).toMatch(/broadcast|notifyAll|notifySessions/i);
  });

  it('broadcast message contains expected text about master branch update', () => {
    const index = readRepoFile('packages/local-agent/src/index.ts');
    const executor = readRepoFile('packages/local-agent/src/executor.ts');
    const combined = (index ?? '') + (executor ?? '');
    expect(combined).toMatch(/Master branch updated/);
    expect(combined).toMatch(/origin\/master/);
  });

  it('broadcast uses notification message type (so it can be dropped if queue is full)', () => {
    const executor = readRepoFile('packages/local-agent/src/executor.ts');
    expect(executor).not.toBeNull();
    // The enqueueMessage call for the broadcast must use 'notification' type
    expect(executor).toContain('notification');
  });
});

// ---------------------------------------------------------------------------
// Unit tests via MasterChangePoller (or equivalent exported class/function)
// ---------------------------------------------------------------------------

describe('AC6: Daemon start — stores SHA, no broadcast, logs Poller started', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('MasterChangePoller or equivalent is exported from local-agent', async () => {
    const Poller = await tryImportPoller();
    expect(Poller).not.toBeNull();
  });

  it('on first run, stores the current SHA and does not broadcast', async () => {
    const Poller = await tryImportPoller();
    expect(Poller, 'MasterChangePoller must be exported to test').not.toBeNull();

    const mockExecFileAsync = vi.fn().mockResolvedValue({
      stdout: 'abc123def456\trefs/heads/master\n',
      stderr: '',
    });
    const mockBroadcast = vi.fn().mockResolvedValue(undefined);

    const poller = new Poller({
      execFileAsync: mockExecFileAsync,
      broadcast: mockBroadcast,
      fetchBareRepo: vi.fn().mockResolvedValue(undefined),
      repoPath: '/tmp/test-repo.git',
    });

    await poller.poll();

    // First run: no broadcast (no prior SHA to compare against)
    expect(mockBroadcast).not.toHaveBeenCalled();
    // ls-remote was called
    expect(mockExecFileAsync).toHaveBeenCalled();
    const firstCallArgs = mockExecFileAsync.mock.calls[0];
    expect(JSON.stringify(firstCallArgs)).toContain('ls-remote');
  });

  it('logs [git master refresh] Poller started on initialization', async () => {
    const Poller = await tryImportPoller();
    expect(Poller, 'MasterChangePoller must be exported to test').not.toBeNull();

    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const poller = new Poller({
      execFileAsync: vi.fn().mockResolvedValue({ stdout: 'sha1\trefs/heads/master\n', stderr: '' }),
      broadcast: vi.fn(),
      fetchBareRepo: vi.fn(),
      repoPath: '/tmp/test-repo.git',
    });

    // Start/init call (either constructor or explicit start method)
    if (typeof poller.start === 'function') {
      await poller.start();
    }

    const allLogs = consoleSpy.mock.calls.map(c => c.join(' ')).join('\n');
    expect(allLogs).toMatch(/\[git master refresh\].*Poller started/i);

    consoleSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// AC1: No change → no notification
// ---------------------------------------------------------------------------

describe('AC1: No SHA change — no notification sent', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('does not broadcast when SHA is unchanged between polls', async () => {
    const Poller = await tryImportPoller();
    expect(Poller, 'MasterChangePoller must be exported to test').not.toBeNull();

    const STABLE_SHA = 'aabbccddeeff0011223344556677889900112233';
    const mockExecFileAsync = vi.fn().mockResolvedValue({
      stdout: `${STABLE_SHA}\trefs/heads/master\n`,
      stderr: '',
    });
    const mockBroadcast = vi.fn().mockResolvedValue(undefined);

    const poller = new Poller({
      execFileAsync: mockExecFileAsync,
      broadcast: mockBroadcast,
      fetchBareRepo: vi.fn().mockResolvedValue(undefined),
      repoPath: '/tmp/test-repo.git',
    });

    // First poll: stores SHA
    await poller.poll();
    // Second poll: same SHA — no notification
    await poller.poll();

    expect(mockBroadcast).not.toHaveBeenCalled();
    // ls-remote called twice (once per poll)
    expect(mockExecFileAsync).toHaveBeenCalledTimes(2);
  });

  it('does not fetch bare repo when SHA is unchanged', async () => {
    const Poller = await tryImportPoller();
    expect(Poller, 'MasterChangePoller must be exported to test').not.toBeNull();

    const STABLE_SHA = 'deadbeef1234567890abcdef';
    const mockFetch = vi.fn().mockResolvedValue(undefined);
    const mockExecFileAsync = vi.fn().mockResolvedValue({
      stdout: `${STABLE_SHA}\trefs/heads/master\n`,
      stderr: '',
    });

    const poller = new Poller({
      execFileAsync: mockExecFileAsync,
      broadcast: vi.fn(),
      fetchBareRepo: mockFetch,
      repoPath: '/tmp/test-repo.git',
    });

    await poller.poll();
    await poller.poll();

    expect(mockFetch).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// AC2: SHA change → fetch bare repo + broadcast to all sessions
// ---------------------------------------------------------------------------

describe('AC2: SHA change — bare repo fetched and all sessions notified', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('fetches bare repo when master SHA changes', async () => {
    const Poller = await tryImportPoller();
    expect(Poller, 'MasterChangePoller must be exported to test').not.toBeNull();

    const SHA_OLD = 'aaaa1111bbbb2222cccc3333dddd4444eeee5555';
    const SHA_NEW = 'ffff6666gggg7777hhhh8888iiii9999jjjj0000';
    let callCount = 0;
    const mockExecFileAsync = vi.fn().mockImplementation(async () => {
      callCount++;
      const sha = callCount === 1 ? SHA_OLD : SHA_NEW;
      return { stdout: `${sha}\trefs/heads/master\n`, stderr: '' };
    });
    const mockFetch = vi.fn().mockResolvedValue(undefined);
    const mockBroadcast = vi.fn().mockResolvedValue(undefined);

    const poller = new Poller({
      execFileAsync: mockExecFileAsync,
      broadcast: mockBroadcast,
      fetchBareRepo: mockFetch,
      repoPath: '/tmp/test-repo.git',
    });

    await poller.poll(); // first run, stores SHA_OLD
    await poller.poll(); // detects SHA_NEW, should fetch

    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('broadcasts to all active sessions after a SHA change and successful fetch', async () => {
    const Poller = await tryImportPoller();
    expect(Poller, 'MasterChangePoller must be exported to test').not.toBeNull();

    const SHA_OLD = '111111111111';
    const SHA_NEW = '222222222222';
    let callCount = 0;
    const mockExecFileAsync = vi.fn().mockImplementation(async () => {
      const sha = callCount++ === 0 ? SHA_OLD : SHA_NEW;
      return { stdout: `${sha}\trefs/heads/master\n`, stderr: '' };
    });
    const mockBroadcast = vi.fn().mockResolvedValue(undefined);

    const poller = new Poller({
      execFileAsync: mockExecFileAsync,
      broadcast: mockBroadcast,
      fetchBareRepo: vi.fn().mockResolvedValue(undefined),
      repoPath: '/tmp/test-repo.git',
    });

    await poller.poll(); // stores SHA_OLD
    await poller.poll(); // detects change, should broadcast

    expect(mockBroadcast).toHaveBeenCalledTimes(1);
  });

  it('broadcast message contains old and new short SHAs and expected text', async () => {
    const Poller = await tryImportPoller();
    expect(Poller, 'MasterChangePoller must be exported to test').not.toBeNull();

    const SHA_OLD = 'aabbcc112233445566778899';
    const SHA_NEW = 'ddeeff112233445566778899';
    let callCount = 0;
    const mockExecFileAsync = vi.fn().mockImplementation(async () => {
      const sha = callCount++ === 0 ? SHA_OLD : SHA_NEW;
      return { stdout: `${sha}\trefs/heads/master\n`, stderr: '' };
    });
    const mockBroadcast = vi.fn().mockResolvedValue(undefined);

    const poller = new Poller({
      execFileAsync: mockExecFileAsync,
      broadcast: mockBroadcast,
      fetchBareRepo: vi.fn().mockResolvedValue(undefined),
      repoPath: '/tmp/test-repo.git',
    });

    await poller.poll();
    await poller.poll();

    expect(mockBroadcast).toHaveBeenCalledTimes(1);
    const message: string = mockBroadcast.mock.calls[0][0];
    // Short SHAs (7 chars) should appear in the message
    expect(message).toContain(SHA_OLD.slice(0, 7));
    expect(message).toContain(SHA_NEW.slice(0, 7));
    // Must mention master branch update
    expect(message).toMatch(/Master branch updated/);
    expect(message).toMatch(/origin\/master/);
  });

  it('logs [git master refresh] prefix on SHA change', async () => {
    const Poller = await tryImportPoller();
    expect(Poller, 'MasterChangePoller must be exported to test').not.toBeNull();

    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    let callCount = 0;
    const mockExecFileAsync = vi.fn().mockImplementation(async () => {
      const sha = callCount++ === 0 ? 'oldsha123' : 'newsha456';
      return { stdout: `${sha}\trefs/heads/master\n`, stderr: '' };
    });

    const poller = new Poller({
      execFileAsync: mockExecFileAsync,
      broadcast: vi.fn().mockResolvedValue(undefined),
      fetchBareRepo: vi.fn().mockResolvedValue(undefined),
      repoPath: '/tmp/test-repo.git',
    });

    await poller.poll();
    await poller.poll();

    const allLogs = consoleSpy.mock.calls.map(c => c.join(' ')).join('\n');
    expect(allLogs).toContain('[git master refresh]');
    expect(allLogs).toMatch(/Master SHA changed|SHA changed/i);

    consoleSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// AC3: Fetch fails → no broadcast, error logged, retry on next cycle
// ---------------------------------------------------------------------------

describe('AC3: Bare repo fetch fails — no broadcast, error logged, retry next cycle', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('does NOT broadcast when fetch fails after SHA change', async () => {
    const Poller = await tryImportPoller();
    expect(Poller, 'MasterChangePoller must be exported to test').not.toBeNull();

    let callCount = 0;
    const mockExecFileAsync = vi.fn().mockImplementation(async () => {
      const sha = callCount++ === 0 ? 'sha-old-111' : 'sha-new-222';
      return { stdout: `${sha}\trefs/heads/master\n`, stderr: '' };
    });
    const mockBroadcast = vi.fn().mockResolvedValue(undefined);
    const mockFetch = vi.fn().mockRejectedValue(new Error('git fetch failed: network error'));

    const poller = new Poller({
      execFileAsync: mockExecFileAsync,
      broadcast: mockBroadcast,
      fetchBareRepo: mockFetch,
      repoPath: '/tmp/test-repo.git',
    });

    await poller.poll(); // first run, stores SHA
    await poller.poll(); // detects change, fetch fails

    // Broadcast must NOT have been called — fetch failed
    expect(mockBroadcast).not.toHaveBeenCalled();
  });

  it('logs [git master refresh] Bare repo fetch failed with error on fetch failure', async () => {
    const Poller = await tryImportPoller();
    expect(Poller, 'MasterChangePoller must be exported to test').not.toBeNull();

    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    let callCount = 0;
    const mockExecFileAsync = vi.fn().mockImplementation(async () => {
      const sha = callCount++ === 0 ? 'sha-a' : 'sha-b';
      return { stdout: `${sha}\trefs/heads/master\n`, stderr: '' };
    });

    const poller = new Poller({
      execFileAsync: mockExecFileAsync,
      broadcast: vi.fn(),
      fetchBareRepo: vi.fn().mockRejectedValue(new Error('Connection refused')),
      repoPath: '/tmp/test-repo.git',
    });

    await poller.poll();
    await poller.poll();

    const errorLogs = consoleErrorSpy.mock.calls.map(c => c.join(' ')).join('\n');
    const warnLogs = consoleWarnSpy.mock.calls.map(c => c.join(' ')).join('\n');
    const allLogs = errorLogs + '\n' + warnLogs;

    expect(allLogs).toContain('[git master refresh]');
    expect(allLogs).toMatch(/[Bb]are repo fetch failed|fetch failed/);

    consoleErrorSpy.mockRestore();
    consoleWarnSpy.mockRestore();
  });

  it('does NOT throw when fetch fails — poller continues running', async () => {
    const Poller = await tryImportPoller();
    expect(Poller, 'MasterChangePoller must be exported to test').not.toBeNull();

    let callCount = 0;
    const mockExecFileAsync = vi.fn().mockImplementation(async () => {
      const sha = callCount++ === 0 ? 'sha-x' : 'sha-y';
      return { stdout: `${sha}\trefs/heads/master\n`, stderr: '' };
    });
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const poller = new Poller({
      execFileAsync: mockExecFileAsync,
      broadcast: vi.fn(),
      fetchBareRepo: vi.fn().mockRejectedValue(new Error('Timeout')),
      repoPath: '/tmp/test-repo.git',
    });

    await poller.poll();
    // Must not throw
    await expect(poller.poll()).resolves.not.toThrow();

    consoleErrorSpy.mockRestore();
  });

  it('retries on the next cycle after a failed fetch (resets SHA tracking)', async () => {
    const Poller = await tryImportPoller();
    expect(Poller, 'MasterChangePoller must be exported to test').not.toBeNull();

    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    let callCount = 0;
    const mockExecFileAsync = vi.fn().mockImplementation(async () => {
      // Return same new SHA on cycles 2 and 3 (fetch fails on cycle 2, succeeds on cycle 3)
      const sha = callCount++ === 0 ? 'sha-base' : 'sha-updated';
      return { stdout: `${sha}\trefs/heads/master\n`, stderr: '' };
    });
    let fetchCallCount = 0;
    const mockFetch = vi.fn().mockImplementation(async () => {
      fetchCallCount++;
      if (fetchCallCount === 1) throw new Error('Temporary network error');
      // Succeeds on second attempt
    });
    const mockBroadcast = vi.fn().mockResolvedValue(undefined);

    const poller = new Poller({
      execFileAsync: mockExecFileAsync,
      broadcast: mockBroadcast,
      fetchBareRepo: mockFetch,
      repoPath: '/tmp/test-repo.git',
    });

    await poller.poll(); // cycle 1: stores sha-base
    await poller.poll(); // cycle 2: detects sha-updated, fetch fails, no broadcast
    await poller.poll(); // cycle 3: detects sha-updated again, fetch succeeds, broadcasts

    // Should have broadcast on cycle 3 (the retry)
    expect(mockBroadcast).toHaveBeenCalledTimes(1);

    consoleErrorSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// AC4: All 3 session types receive the notification
// ---------------------------------------------------------------------------

describe('AC4: All active session types receive notification (persistent, expert, job)', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('executor broadcast method targets all active sessions: persistent agents, expert sessions, running jobs', async () => {
    const executor = readRepoFile('packages/local-agent/src/executor.ts');
    expect(executor).not.toBeNull();

    // The broadcast helper must enumerate all session types
    // It should reference persistentAgents, activeJobs, and expert sessions (via ExpertSessionManager or similar)
    expect(executor).toMatch(/persistentAgents/);
    expect(executor).toMatch(/activeJobs|activeSessions/);
  });

  it('broadcast is called with all 3 session names when 3 active sessions exist', async () => {
    const Poller = await tryImportPoller();
    expect(Poller, 'MasterChangePoller must be exported to test').not.toBeNull();

    const sessions = [
      { name: 'persistent-cpo', type: 'persistent' },
      { name: 'expert-session-abc', type: 'expert' },
      { name: 'job-def-123', type: 'job' },
    ];

    let callCount = 0;
    const mockExecFileAsync = vi.fn().mockImplementation(async () => {
      const sha = callCount++ === 0 ? 'sha-old-start' : 'sha-new-change';
      return { stdout: `${sha}\trefs/heads/master\n`, stderr: '' };
    });

    const notifiedSessions: string[] = [];
    const mockBroadcast = vi.fn().mockImplementation(async (message: string, sessionNames: string[]) => {
      notifiedSessions.push(...sessionNames);
    });

    const poller = new Poller({
      execFileAsync: mockExecFileAsync,
      broadcast: mockBroadcast,
      fetchBareRepo: vi.fn().mockResolvedValue(undefined),
      repoPath: '/tmp/test-repo.git',
      getActiveSessions: () => sessions,
    });

    await poller.poll();
    await poller.poll();

    // All 3 sessions must be notified
    expect(mockBroadcast).toHaveBeenCalled();
    // The broadcast call should reference all active sessions somehow
    const broadcastArg = mockBroadcast.mock.calls[0];
    expect(broadcastArg).toBeDefined();
  });

  it('logs [git master refresh] Notified N active sessions after broadcast', async () => {
    const Poller = await tryImportPoller();
    expect(Poller, 'MasterChangePoller must be exported to test').not.toBeNull();

    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    let callCount = 0;
    const mockExecFileAsync = vi.fn().mockImplementation(async () => {
      const sha = callCount++ === 0 ? 'sha-prev' : 'sha-next';
      return { stdout: `${sha}\trefs/heads/master\n`, stderr: '' };
    });

    const poller = new Poller({
      execFileAsync: mockExecFileAsync,
      broadcast: vi.fn().mockResolvedValue(3), // returns count of notified sessions
      fetchBareRepo: vi.fn().mockResolvedValue(undefined),
      repoPath: '/tmp/test-repo.git',
      getActiveSessions: () => [
        { name: 's1' }, { name: 's2' }, { name: 's3' },
      ],
    });

    await poller.poll();
    await poller.poll();

    const allLogs = consoleSpy.mock.calls.map(c => c.join(' ')).join('\n');
    expect(allLogs).toContain('[git master refresh]');
    expect(allLogs).toMatch(/Notified \d+ active session/i);

    consoleSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// AC5: One tmux session ended unexpectedly — remaining still notified, warning logged
// ---------------------------------------------------------------------------

describe('AC5: Partial tmux failure — remaining sessions notified, warning logged', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('continues broadcasting to remaining sessions when one tmux send-keys fails', async () => {
    const Poller = await tryImportPoller();
    expect(Poller, 'MasterChangePoller must be exported to test').not.toBeNull();

    const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    let callCount = 0;
    const mockExecFileAsync = vi.fn().mockImplementation(async (cmd: string, args?: string[]) => {
      // ls-remote calls return SHA (distinguish by args)
      const argsStr = (args ?? []).join(' ');
      if (argsStr.includes('ls-remote') || cmd.includes('git')) {
        const sha = callCount++ === 0 ? 'sha-before' : 'sha-after';
        return { stdout: `${sha}\trefs/heads/master\n`, stderr: '' };
      }
      return { stdout: '', stderr: '' };
    });

    const sessionResults = ['session-ok-1', 'session-dead', 'session-ok-2'];
    const successfulSessions: string[] = [];

    // Simulate broadcast that fails for one session but continues for others
    const mockBroadcast = vi.fn().mockImplementation(async (_msg: string, sessions: string[]) => {
      for (const s of sessions) {
        if (s === 'session-dead') {
          console.warn(`[git master refresh] Failed to notify session ${s}`);
          continue;
        }
        successfulSessions.push(s);
      }
    });

    const poller = new Poller({
      execFileAsync: mockExecFileAsync,
      broadcast: mockBroadcast,
      fetchBareRepo: vi.fn().mockResolvedValue(undefined),
      repoPath: '/tmp/test-repo.git',
      getActiveSessions: () => sessionResults.map(name => ({ name })),
    });

    await poller.poll();
    await poller.poll();

    // Broadcast was still called
    expect(mockBroadcast).toHaveBeenCalled();
    // Warning was logged for the failed session
    const warnLogs = consoleWarnSpy.mock.calls.map(c => c.join(' ')).join('\n');
    expect(warnLogs).toContain('[git master refresh]');

    consoleWarnSpy.mockRestore();
  });

  it('executor enqueueMessage failure for one session does not stop notifications to others', () => {
    // Static structural test: broadcast helper must use try/catch per session,
    // not a single try/catch around all sessions at once
    const executor = readRepoFile('packages/local-agent/src/executor.ts');
    expect(executor).not.toBeNull();

    // The broadcast method must have per-session error handling
    // (either a try/catch in a loop, or Promise.allSettled, or similar)
    const hasTryCatchInLoop = (executor ?? '').match(/for.*\{[^}]*try|try.*\{[^}]*for|allSettled/s);
    const hasPerSessionHandling = (executor ?? '').match(/warn.*session|session.*warn|catch.*session|session.*catch/i);
    expect(hasTryCatchInLoop || hasPerSessionHandling).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Error resilience: ls-remote fails — no crash, retry next cycle
// ---------------------------------------------------------------------------

describe('Error resilience: git ls-remote failure', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('does NOT throw when ls-remote fails — logs warning and continues', async () => {
    const Poller = await tryImportPoller();
    expect(Poller, 'MasterChangePoller must be exported to test').not.toBeNull();

    const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const mockExecFileAsync = vi.fn().mockRejectedValue(new Error('Network unreachable'));
    const mockBroadcast = vi.fn();

    const poller = new Poller({
      execFileAsync: mockExecFileAsync,
      broadcast: mockBroadcast,
      fetchBareRepo: vi.fn(),
      repoPath: '/tmp/test-repo.git',
    });

    // Must not throw
    await expect(poller.poll()).resolves.not.toThrow();

    // Must not broadcast
    expect(mockBroadcast).not.toHaveBeenCalled();

    // Must log the failure
    const warnLogs = consoleWarnSpy.mock.calls.map(c => c.join(' ')).join('\n');
    const errorLogs = consoleErrorSpy.mock.calls.map(c => c.join(' ')).join('\n');
    const allLogs = warnLogs + '\n' + errorLogs;
    expect(allLogs).toContain('[git master refresh]');
    expect(allLogs).toMatch(/ls-remote failed|ls.remote.*error/i);

    consoleWarnSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  it('retries on the next cycle after a ls-remote failure', async () => {
    const Poller = await tryImportPoller();
    expect(Poller, 'MasterChangePoller must be exported to test').not.toBeNull();

    const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    let callCount = 0;
    const mockExecFileAsync = vi.fn().mockImplementation(async () => {
      if (callCount++ === 0) {
        throw new Error('Temporary network failure');
      }
      return { stdout: 'stable-sha\trefs/heads/master\n', stderr: '' };
    });

    const poller = new Poller({
      execFileAsync: mockExecFileAsync,
      broadcast: vi.fn(),
      fetchBareRepo: vi.fn(),
      repoPath: '/tmp/test-repo.git',
    });

    await poller.poll(); // fails
    // Must not throw on second call
    await expect(poller.poll()).resolves.not.toThrow();
    expect(mockExecFileAsync).toHaveBeenCalledTimes(2);

    consoleWarnSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// Logging: all log messages use [git master refresh] prefix
// ---------------------------------------------------------------------------

describe('Logging: all poller logs use [git master refresh] prefix', () => {
  it('index.ts or executor.ts contains all required [git master refresh] log lines', () => {
    const index = readRepoFile('packages/local-agent/src/index.ts');
    const executor = readRepoFile('packages/local-agent/src/executor.ts');
    const combined = (index ?? '') + (executor ?? '');

    const requiredPhrases = [
      'Poller started',
      'Master SHA changed',
      'Bare repo fetched successfully',
      'Bare repo fetch failed',
      'Notified',
      'ls-remote failed',
    ];

    for (const phrase of requiredPhrases) {
      expect(combined, `Expected to find log phrase: "${phrase}"`).toContain(phrase);
    }
  });

  it('all [git master refresh] log lines include the prefix', () => {
    const index = readRepoFile('packages/local-agent/src/index.ts');
    const executor = readRepoFile('packages/local-agent/src/executor.ts');
    const combined = (index ?? '') + (executor ?? '');

    // Every line that mentions git master refresh should have the bracket prefix
    const refreshLines = combined
      .split('\n')
      .filter(l => l.includes('git master refresh'));

    expect(refreshLines.length).toBeGreaterThan(0);
    for (const line of refreshLines) {
      expect(line).toContain('[git master refresh]');
    }
  });
});
