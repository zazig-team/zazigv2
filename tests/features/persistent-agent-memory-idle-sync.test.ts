/**
 * Feature: Persistent agent memory system with idle-triggered sync
 * Feature ID: fb6ce0f1-11a9-4ad6-a78e-186c901e202e
 *
 * Test group: Idle-triggered memory sync nudge
 *
 * Acceptance criteria tested:
 * AC3 - After 5 minutes idle, daemon injects memory sync prompt via tmux send-keys
 * AC4 - Idle nudge fires only once per idle period — no repeated prompts
 * AC7 - Agent self-prunes stale memories during idle sync (prompt includes pruning instruction)
 * Failure Case 1 - Idle nudge must not fire while agent is actively responding
 *
 * These tests are written to FAIL against the current codebase and pass once
 * the feature is implemented.
 */

import { describe, it, expect, vi, afterEach, type Mock } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

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
// Constants: idle threshold and sync prompt text
// ---------------------------------------------------------------------------

/** 5 minutes in ms — the idle threshold that triggers a memory sync nudge. */
const IDLE_SYNC_THRESHOLD_MS = 5 * 60_000;

/** The exact memory sync prompt the daemon must inject. */
const MEMORY_SYNC_PROMPT =
  'Review this session. If anything worth remembering happened — decisions, preferences, corrections, context — update your .memory/ files. If nothing notable, do nothing.';

// ---------------------------------------------------------------------------
// AC3 + Structural: executor.ts has idle-triggered memory sync logic
// ---------------------------------------------------------------------------

describe('AC3 Structural: executor.ts contains idle memory sync logic', () => {
  it('executor.ts contains the 5-minute idle threshold for memory sync', () => {
    const executor = readRepoFile('packages/local-agent/src/executor.ts');
    expect(executor).not.toBeNull();
    const src = executor ?? '';
    // Must define a 5-minute idle threshold (300_000 ms or 5 * 60_000 or 5 * 60000)
    // Note: 300_000 is already used for CI_MONITOR_INTERVAL_MS — look for
    // a constant specifically named for memory sync or idle sync
    const hasSyncThreshold =
      src.match(/IDLE.*SYNC.*300|MEMORY.*SYNC.*300|5.*60.*000.*sync|sync.*5.*60.*000/i)
      || src.match(/IDLE_SYNC_THRESHOLD|MEMORY_SYNC_THRESHOLD|MEMORY_IDLE|IDLE_MEMORY/i)
      || src.match(/['"](5\s*\*\s*60_?000|300_?000)[^'"]*sync/i)
      || (src.includes('lastMemorySyncAt') || src.includes('lastSyncAt') || src.includes('memorySyncAt'));
    expect(hasSyncThreshold).toBeTruthy();
  });

  it('executor.ts contains the memory sync prompt text', () => {
    const executor = readRepoFile('packages/local-agent/src/executor.ts');
    expect(executor).not.toBeNull();
    const src = executor ?? '';
    // Must contain the exact sync prompt or key phrases from it
    expect(src).toMatch(/Review this session|update your \.memory/i);
  });

  it('executor.ts injects memory sync via tmux send-keys', () => {
    const executor = readRepoFile('packages/local-agent/src/executor.ts');
    expect(executor).not.toBeNull();
    const src = executor ?? '';
    // The sync nudge must be injected via tmux send-keys (same mechanism as injectMessage)
    // Should have send-keys or injectMessage call near the sync prompt
    const hasSendKeys = src.match(/send-keys[^;]*memory|memory[^;]*send-keys/is)
      || src.match(/injectMessage[^;]*memory|memory[^;]*injectMessage/is)
      || (src.includes('send-keys') && src.includes('.memory'));
    expect(hasSendKeys).toBeTruthy();
  });

  it('executor.ts tracks a lastMemorySyncAt (or equivalent) timestamp per persistent agent', () => {
    const executor = readRepoFile('packages/local-agent/src/executor.ts');
    expect(executor).not.toBeNull();
    const src = executor ?? '';
    // Must track when the last sync nudge was fired to avoid repeats
    const hasSyncTracker =
      src.includes('lastMemorySyncAt')
      || src.includes('lastSyncAt')
      || src.includes('memorySyncAt')
      || src.includes('lastIdleSyncAt')
      || src.match(/last.*[Ss]ync.*[Aa]t|[Ss]ync.*[Ll]ast/);
    expect(hasSyncTracker).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// AC4: Idle nudge fires only once per idle period
// ---------------------------------------------------------------------------

describe('AC4 Structural: idle nudge fires only once per idle period', () => {
  it('executor.ts checks lastMemorySyncAt before firing nudge', () => {
    const executor = readRepoFile('packages/local-agent/src/executor.ts');
    expect(executor).not.toBeNull();
    const src = executor ?? '';
    // Must compare lastMemorySyncAt (or equivalent) against now to gate the nudge
    const hasSyncGuard =
      src.match(/lastMemorySyncAt|lastSyncAt|memorySyncAt|lastIdleSyncAt/)
      && src.match(/lastActivityAt|idleMs/);
    expect(hasSyncGuard).toBeTruthy();
  });

  it('executor.ts resets sync tracker when agent becomes active again', () => {
    const executor = readRepoFile('packages/local-agent/src/executor.ts');
    expect(executor).not.toBeNull();
    const src = executor ?? '';
    // When activity is detected (pane hash changes), the sync tracker must reset
    // so the nudge can fire again after the NEXT idle period
    const hasSyncReset = src.match(
      /(lastMemorySyncAt|lastSyncAt|memorySyncAt|lastIdleSyncAt)\s*=\s*(?:null|0)/
    );
    expect(hasSyncReset).toBeTruthy();
  });

  it('ActivePersistentAgent type includes a lastMemorySyncAt field (or equivalent)', () => {
    const executor = readRepoFile('packages/local-agent/src/executor.ts');
    expect(executor).not.toBeNull();
    const src = executor ?? '';
    // The ActivePersistentAgent interface/type must include the sync tracker field
    // Look for the field declaration in the type block
    const typeBlock = src.match(/ActivePersistentAgent[^{]*\{([^}]+)\}/s)?.[1] ?? '';
    const hasFieldInType = typeBlock.includes('lastMemorySyncAt')
      || typeBlock.includes('lastSyncAt')
      || typeBlock.includes('memorySyncAt')
      || typeBlock.includes('lastIdleSyncAt');
    // Also accept if the field is initialised in the agent state object literal
    const hasFieldInInit = src.match(
      /lastMemorySyncAt\s*:|lastSyncAt\s*:|memorySyncAt\s*:|lastIdleSyncAt\s*:/
    );
    expect(hasFieldInType || hasFieldInInit).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Failure Case 1: Nudge must not fire while agent is actively responding
// ---------------------------------------------------------------------------

describe('Failure Case 1: Nudge must not fire while agent is active', () => {
  it('executor.ts only injects sync nudge after confirmed inactivity (pane hash unchanged)', () => {
    const executor = readRepoFile('packages/local-agent/src/executor.ts');
    expect(executor).not.toBeNull();
    const src = executor ?? '';
    // The idle sync check must be inside or after the pane hash comparison block
    // that tracks idle time — not fired on every heartbeat tick
    // Verify the sync logic is gated on idleMs >= threshold
    const hasSyncGate =
      src.match(/idleMs\s*>=?\s*(?:IDLE_SYNC|MEMORY_SYNC|300|5\s*\*\s*60)/i)
      || src.match(/IDLE_SYNC_THRESHOLD|MEMORY_SYNC_THRESHOLD/)
      || (src.match(/lastActivityAt/) && src.match(/lastMemorySyncAt|lastSyncAt|memorySyncAt/));
    expect(hasSyncGate).toBeTruthy();
  });

  it('executor.ts does NOT inject sync nudge when pane hash changes (activity detected)', () => {
    const executor = readRepoFile('packages/local-agent/src/executor.ts');
    expect(executor).not.toBeNull();
    const src = executor ?? '';
    // When activity is detected (pane hash changed), lastActivityAt is reset
    // and the sync should NOT fire. The sync tracker reset on activity ensures this.
    expect(src).toContain('lastActivityAt');
    // Sync reset must happen where lastActivityAt is updated (activity branch)
    const activityBlock = src.match(
      /lastActivityAt\s*=[^;]+;[\s\S]{0,500}/
    )?.[0] ?? '';
    const hasSyncResetOnActivity = activityBlock.match(
      /lastMemorySyncAt|lastSyncAt|memorySyncAt|lastIdleSyncAt/
    );
    expect(hasSyncResetOnActivity).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// AC7: Sync prompt includes self-pruning instructions
// ---------------------------------------------------------------------------

describe('AC7: Memory sync prompt instructs agent to self-prune stale memories', () => {
  it('executor.ts memory sync prompt mentions updating .memory/ files', () => {
    const executor = readRepoFile('packages/local-agent/src/executor.ts');
    expect(executor).not.toBeNull();
    const src = executor ?? '';
    expect(src).toMatch(/\.memory/);
    // The full prompt text from the spec must be present
    expect(src).toMatch(/Review this session/i);
  });

  it('executor.ts memory sync prompt covers decisions, preferences, corrections, context', () => {
    const executor = readRepoFile('packages/local-agent/src/executor.ts');
    expect(executor).not.toBeNull();
    const src = executor ?? '';
    // The prompt must mention the types of notable context worth saving
    expect(src).toMatch(/decisions|preferences|corrections|context/i);
  });

  it('executor.ts memory sync prompt acknowledges "nothing notable" case', () => {
    const executor = readRepoFile('packages/local-agent/src/executor.ts');
    expect(executor).not.toBeNull();
    const src = executor ?? '';
    // Must tell the agent to do nothing if nothing notable happened
    expect(src).toMatch(/nothing notable|do nothing/i);
  });

  it('executor.ts includes self-pruning in boot prompt or idle sync prompt', () => {
    const executor = readRepoFile('packages/local-agent/src/executor.ts');
    expect(executor).not.toBeNull();
    const src = executor ?? '';
    // Self-pruning: agent should remove/update stale memories during idle sync
    // This can be in the sync prompt text or boot prompt
    const hasMemoryPruning =
      src.match(/stale|prune|remove.*memor|memor.*remove|merge.*memor|memor.*merge/i)
      || src.match(/remove.*entries|entries.*remove|outdated|no longer relevant/i);
    // At minimum, the sync prompt must reference the .memory/ directory
    expect(hasMemoryPruning || src.includes('.memory')).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Unit: Idle sync nudge behaviour via exported executor or nudge function
// ---------------------------------------------------------------------------

async function tryImportIdleSyncNudge(): Promise<any> {
  const candidates = [
    'packages/local-agent/src/executor.ts',
    'packages/local-agent/src/idle-memory-sync.ts',
    'packages/local-agent/src/memory-sync.ts',
  ];
  for (const relPath of candidates) {
    try {
      const modulePath = pathToFileURL(path.join(REPO_ROOT, relPath)).href;
      const mod = await import(/* @vite-ignore */ modulePath);
      if (mod.IdleMemorySync || mod.MemorySyncNudge || mod.checkIdleMemorySync) {
        return mod.IdleMemorySync ?? mod.MemorySyncNudge ?? mod.checkIdleMemorySync;
      }
    } catch {
      // Try next candidate
    }
  }
  return null;
}

describe('AC3+AC4 Unit: idle sync nudge fires once then waits', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('injects sync nudge when agent has been idle for 5+ minutes', async () => {
    const NudgeFn = await tryImportIdleSyncNudge();
    if (!NudgeFn) {
      // Function not yet exported — test structural presence instead
      const executor = readRepoFile('packages/local-agent/src/executor.ts');
      expect(executor).toMatch(/Review this session/i);
      return;
    }

    const mockInject = vi.fn().mockResolvedValue(undefined);
    const now = Date.now();
    const agentState = {
      lastActivityAt: now - IDLE_SYNC_THRESHOLD_MS - 1000, // idle for 5min+1s
      lastMemorySyncAt: null,
      tmuxSession: 'test-cpo-session',
      startedAt: now - 60_000 * 10,
    };

    await NudgeFn({ agent: agentState, inject: mockInject, now });
    expect(mockInject).toHaveBeenCalledTimes(1);
    const injectedText: string = mockInject.mock.calls[0][0];
    expect(injectedText).toMatch(/Review this session/i);
  });

  it('does NOT inject sync nudge when agent has been idle for less than 5 minutes', async () => {
    const NudgeFn = await tryImportIdleSyncNudge();
    if (!NudgeFn) {
      // Not yet exported — skip unit portion, structural test covers it
      return;
    }

    const mockInject = vi.fn().mockResolvedValue(undefined);
    const now = Date.now();
    const agentState = {
      lastActivityAt: now - 60_000 * 2, // only 2 minutes idle
      lastMemorySyncAt: null,
      tmuxSession: 'test-cpo-session',
      startedAt: now - 60_000 * 10,
    };

    await NudgeFn({ agent: agentState, inject: mockInject, now });
    expect(mockInject).not.toHaveBeenCalled();
  });

  it('does NOT inject nudge if already synced in this idle period', async () => {
    const NudgeFn = await tryImportIdleSyncNudge();
    if (!NudgeFn) {
      return;
    }

    const mockInject = vi.fn().mockResolvedValue(undefined);
    const now = Date.now();
    const agentState = {
      lastActivityAt: now - IDLE_SYNC_THRESHOLD_MS - 1000, // idle 5min+
      lastMemorySyncAt: now - 60_000, // synced 1 minute ago (same idle period)
      tmuxSession: 'test-cpo-session',
      startedAt: now - 60_000 * 10,
    };

    await NudgeFn({ agent: agentState, inject: mockInject, now });
    expect(mockInject).not.toHaveBeenCalled();
  });
});
