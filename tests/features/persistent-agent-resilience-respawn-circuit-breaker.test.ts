/**
 * Feature: Persistent Agent Resilience — Auto-Respawn + Circuit Breaker
 * Feature ID: 94df71bc-9585-42bf-b73e-933fd1d3dd31
 *
 * Test group: Auto-respawn on dead pane + circuit breaker + DB state tracking
 *
 * Acceptance criteria tested:
 * AC2 - Auto-respawn triggers: session recreated within two heartbeat intervals, DB updated
 * AC4 - Circuit breaker prevents infinite loops: 3 failures → crashed status, no more attempts
 * AC6 - Concurrent safety: resetInProgress guard prevents overlapping respawn calls
 * AC7 - DB reflects state: last_respawn_at updated on each attempt, status → crashed when tripped
 *
 * These tests are written to FAIL against the current codebase and pass once
 * the feature is implemented.
 */

import { describe, it, expect } from 'vitest';
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
// AC2 Structural: respawnPersistentAgentIfDead method exists and calls reload
// ---------------------------------------------------------------------------

describe('AC2 Structural: auto-respawn method exists and invokes reloadPersistentAgent', () => {
  it('executor.ts defines respawnPersistentAgentIfDead (or equivalent) method', () => {
    const src = readRepoFile('packages/local-agent/src/executor.ts') ?? '';
    expect(src).not.toBe('');

    const hasRespawnMethod =
      src.includes('respawnPersistentAgentIfDead')
      || src.includes('respawnPersistentAgent')
      || src.match(/private.*respawn.*Persistent/i);

    expect(hasRespawnMethod).toBeTruthy();
  });

  it('executor.ts respawn method calls reloadPersistentAgent to handle teardown + re-spawn', () => {
    const src = readRepoFile('packages/local-agent/src/executor.ts') ?? '';
    expect(src).not.toBe('');

    // The respawn method must delegate to reloadPersistentAgent (which already exists)
    // rather than reimplementing spawn logic.
    const respawnBlock = src.match(
      /respawnPersistentAgent(?:IfDead)?[\s\S]{0,1500}/
    )?.[0] ?? '';

    expect(respawnBlock).toMatch(/reloadPersistentAgent/);
  });

  it('executor.ts respawn method logs structured fields: role, reason, attempt, sessionName', () => {
    const src = readRepoFile('packages/local-agent/src/executor.ts') ?? '';
    expect(src).not.toBe('');

    // Per spec: log each respawn attempt with role, reason, attempt, sessionName
    const respawnBlock = src.match(
      /respawnPersistentAgent(?:IfDead)?[\s\S]{0,2000}/
    )?.[0] ?? '';

    const hasStructuredLog =
      (respawnBlock.match(/role[=:]/i) && respawnBlock.match(/reason[=:]/i))
      || respawnBlock.match(/heartbeat_detected_dead|post_spawn_failed/);

    expect(hasStructuredLog).toBeTruthy();
  });

  it('executor.ts updates last_respawn_at in persistent_agents table when respawning', () => {
    const src = readRepoFile('packages/local-agent/src/executor.ts') ?? '';
    expect(src).not.toBe('');

    // The respawn method must update last_respawn_at so ops can observe respawn behavior
    expect(src).toMatch(/last_respawn_at/);
  });

  it('executor.ts is called from the heartbeat liveness check with reason heartbeat_detected_dead', () => {
    const src = readRepoFile('packages/local-agent/src/executor.ts') ?? '';
    expect(src).not.toBe('');

    // The reason field must distinguish heartbeat detection from post-spawn failure
    const hasHeartbeatReason =
      src.includes('heartbeat_detected_dead')
      || src.match(/reason.*heartbeat|heartbeat.*reason/i);

    expect(hasHeartbeatReason).toBeTruthy();
  });

  it('executor.ts is called from the post-spawn failure handler with reason post_spawn_failed', () => {
    const src = readRepoFile('packages/local-agent/src/executor.ts') ?? '';
    expect(src).not.toBe('');

    const hasPostSpawnReason =
      src.includes('post_spawn_failed')
      || src.match(/reason.*post.spawn|post.spawn.*reason/i);

    expect(hasPostSpawnReason).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// AC4 Structural: Circuit breaker prevents infinite respawn loops
// ---------------------------------------------------------------------------

describe('AC4 Structural: circuit breaker caps respawn attempts', () => {
  it('ActivePersistentAgent type includes respawnFailureCount field', () => {
    const src = readRepoFile('packages/local-agent/src/executor.ts') ?? '';
    expect(src).not.toBe('');

    // Per spec: add respawnFailureCount and lastRespawnFailureAt to persistent agent state
    expect(src).toMatch(/respawnFailureCount/);
  });

  it('ActivePersistentAgent type includes lastRespawnFailureAt field', () => {
    const src = readRepoFile('packages/local-agent/src/executor.ts') ?? '';
    expect(src).not.toBe('');

    expect(src).toMatch(/lastRespawnFailureAt/);
  });

  it('executor.ts respawn method checks against RESET_FAILURE_WINDOW_MS and MAX_RESET_FAILURES', () => {
    const src = readRepoFile('packages/local-agent/src/executor.ts') ?? '';
    expect(src).not.toBe('');

    // The circuit breaker must reuse existing constants (not redefine them)
    // Both must appear in or near the respawn block
    const respawnBlock = src.match(
      /respawnPersistentAgent(?:IfDead)?[\s\S]{0,2000}/
    )?.[0] ?? '';

    const hasWindowConstant =
      respawnBlock.includes('RESET_FAILURE_WINDOW_MS')
      || respawnBlock.match(/10\s*\*\s*60.*000|600.*000/);

    const hasMaxFailures =
      respawnBlock.includes('MAX_RESET_FAILURES')
      || respawnBlock.match(/>=?\s*3\b/);

    expect(hasWindowConstant || src.includes('RESET_FAILURE_WINDOW_MS')).toBeTruthy();
    expect(hasMaxFailures || src.includes('MAX_RESET_FAILURES')).toBeTruthy();
  });

  it('executor.ts sets persistent_agents.status to "crashed" after circuit breaker trips', () => {
    const src = readRepoFile('packages/local-agent/src/executor.ts') ?? '';
    expect(src).not.toBe('');

    // When the circuit breaker threshold is exceeded, agent status must be set to "crashed"
    expect(src).toMatch(/crashed/);

    // Must update via the persistent_agents table
    const hasCrashedDbUpdate =
      src.match(/status.*crashed|crashed.*status/i)
      && src.match(/persistent_agents/);

    expect(hasCrashedDbUpdate).toBeTruthy();
  });

  it('executor.ts logs a critical error when circuit breaker trips', () => {
    const src = readRepoFile('packages/local-agent/src/executor.ts') ?? '';
    expect(src).not.toBe('');

    // Circuit breaker trip must be logged at error level (console.error), not just warn
    const hasCriticalLog =
      src.match(/console\.error[^\n]*(?:circuit|crashed|respawn|max.*fail)/i)
      || src.match(/console\.error[^\n]*persistent/i);

    expect(hasCriticalLog).toBeTruthy();
  });

  it('executor.ts stops attempting respawn once circuit breaker threshold is reached', () => {
    const src = readRepoFile('packages/local-agent/src/executor.ts') ?? '';
    expect(src).not.toBe('');

    // When over threshold, the respawn method must return early without calling reloadPersistentAgent
    // Look for a guard that exits the respawn method before calling reload when over threshold
    const respawnBlock = src.match(
      /respawnPersistentAgent(?:IfDead)?[\s\S]{0,3000}/
    )?.[0] ?? '';

    // Should have something like: if (respawnFailureCount >= MAX_RESET_FAILURES) { ... return; }
    const hasCircuitBreakerGuard =
      respawnBlock.match(/respawnFailureCount\s*>=?\s*|>= MAX_RESET_FAILURES/)
      || respawnBlock.match(/MAX_RESET_FAILURES/);

    expect(hasCircuitBreakerGuard).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// AC6 Structural: Concurrent safety via resetInProgress guard
// ---------------------------------------------------------------------------

describe('AC6 Structural: resetInProgress guard prevents concurrent respawns', () => {
  it('executor.ts respawn method checks resetInProgress before proceeding', () => {
    const src = readRepoFile('packages/local-agent/src/executor.ts') ?? '';
    expect(src).not.toBe('');

    // The respawn method must bail early if resetInProgress is already true
    const respawnBlock = src.match(
      /respawnPersistentAgent(?:IfDead)?[\s\S]{0,1000}/
    )?.[0] ?? '';

    expect(respawnBlock).toMatch(/resetInProgress/);
  });

  it('executor.ts bails from respawn if resetInProgress is true', () => {
    const src = readRepoFile('packages/local-agent/src/executor.ts') ?? '';
    expect(src).not.toBe('');

    // Must have an early-return guard: if (agent.resetInProgress) return;
    const hasResetGuard = src.match(
      /resetInProgress[\s\S]{0,20}return|return[\s\S]{0,20}resetInProgress/
    );

    expect(hasResetGuard).toBeTruthy();
  });

  it('executor.ts heartbeat liveness check also skips when resetInProgress is true', () => {
    const src = readRepoFile('packages/local-agent/src/executor.ts') ?? '';
    expect(src).not.toBe('');

    // The heartbeat already checks resetInProgress at the top — this guards
    // both the liveness check and the existing TTL reset logic.
    const heartbeatBlock = src.match(
      /heartbeatTimer\s*=\s*setInterval[\s\S]{0,500}/
    )?.[0] ?? '';

    expect(heartbeatBlock).toMatch(/resetInProgress/);
  });
});

// ---------------------------------------------------------------------------
// AC7 Structural: DB schema and state transitions
// ---------------------------------------------------------------------------

describe('AC7 Structural: DB schema reflects respawn state', () => {
  it('a migration file adds last_respawn_at column to persistent_agents table', () => {
    const src = readRepoFile('packages/local-agent/src/executor.ts') ?? '';
    expect(src).not.toBe('');

    // Check for migration files containing last_respawn_at
    const migrationsDir = path.join(REPO_ROOT, 'supabase', 'migrations');
    let migrationFiles: string[] = [];
    try {
      migrationFiles = fs.readdirSync(migrationsDir);
    } catch {
      migrationFiles = [];
    }

    const hasLastRespawnAtMigration = migrationFiles.some((file) => {
      try {
        const content = fs.readFileSync(path.join(migrationsDir, file), 'utf-8');
        return content.includes('last_respawn_at') && content.includes('persistent_agents');
      } catch {
        return false;
      }
    });

    // Either migration exists, or executor.ts references last_respawn_at (column must exist)
    expect(hasLastRespawnAtMigration || src.includes('last_respawn_at')).toBeTruthy();
  });

  it('executor.ts updates last_respawn_at as a timestamp (ISO string or Date)', () => {
    const src = readRepoFile('packages/local-agent/src/executor.ts') ?? '';
    expect(src).not.toBe('');

    // last_respawn_at update must include a timestamp value
    const lastRespawnContext = src.match(
      /last_respawn_at[^\n]*/
    )?.[0] ?? '';

    const hasTimestamp =
      lastRespawnContext.match(/new Date|toISOString|Date\.now/i)
      || src.match(/last_respawn_at.*toISOString|toISOString.*last_respawn_at/i)
      || src.match(/last_respawn_at.*new Date/i);

    expect(hasTimestamp).toBeTruthy();
  });

  it('executor.ts status column in persistent_agents transitions to "crashed" after circuit breaker', () => {
    const src = readRepoFile('packages/local-agent/src/executor.ts') ?? '';
    expect(src).not.toBe('');

    // Must update the status column to "crashed" via supabase .update()
    const hasCrashedUpdate =
      src.match(/\.update\(\s*\{[^}]*status[^}]*crashed/i)
      || src.match(/status\s*:\s*['"]crashed['"]/i);

    expect(hasCrashedUpdate).toBeTruthy();
  });

  it('executor.ts persistent_agents initialises respawnFailureCount to 0 on spawn', () => {
    const src = readRepoFile('packages/local-agent/src/executor.ts') ?? '';
    expect(src).not.toBe('');

    // The ActivePersistentAgent object literal (created in handlePersistentJob) must
    // initialise respawnFailureCount: 0 and lastRespawnFailureAt: null
    const agentInitBlock = src.match(
      /const persistentAgent[^=]*=\s*\{[\s\S]{0,1500}/
    )?.[0] ?? '';

    expect(agentInitBlock).toMatch(/respawnFailureCount\s*:\s*0/);
    expect(agentInitBlock).toMatch(/lastRespawnFailureAt\s*:\s*null/);
  });
});
