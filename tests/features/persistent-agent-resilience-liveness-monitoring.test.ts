/**
 * Feature: Persistent Agent Resilience — Liveness Monitoring + Post-Spawn Verification
 * Feature ID: 94df71bc-9585-42bf-b73e-933fd1d3dd31
 *
 * Test group: Liveness monitoring in heartbeat + post-spawn health check
 *
 * Acceptance criteria tested:
 * AC1 - Liveness detection fires: dead tmux session logged within one heartbeat interval
 * AC3 - Post-spawn failure detected: health check catches dead/errored pane within 2-3s
 * AC5 - Normal operation unaffected: healthy agents pass liveness check with no false positives
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
// AC1 Structural: Liveness check in heartbeat before capturePane()
// ---------------------------------------------------------------------------

describe('AC1 Structural: heartbeat liveness check wires isTmuxSessionAlive', () => {
  it('executor.ts calls isTmuxSessionAlive inside the heartbeat setInterval block', () => {
    const src = readRepoFile('packages/local-agent/src/executor.ts') ?? '';
    expect(src).not.toBe('');

    // The heartbeat block uses setInterval with HEARTBEAT_INTERVAL_MS.
    // isTmuxSessionAlive must appear inside that block (before capturePane).
    // We look for isTmuxSessionAlive appearing near the heartbeat timer assignment.
    const heartbeatBlock = src.match(
      /heartbeatTimer\s*=\s*setInterval[\s\S]{0,4000}/
    )?.[0] ?? '';

    expect(heartbeatBlock).toMatch(/isTmuxSessionAlive/);
  });

  it('executor.ts logs a structured warning when persistent agent session is dead', () => {
    const src = readRepoFile('packages/local-agent/src/executor.ts') ?? '';
    expect(src).not.toBe('');

    // Must log: [executor] Persistent agent session dead: role=... session=...
    expect(src).toMatch(/Persistent agent session dead/i);
  });

  it('executor.ts heartbeat liveness log includes role and session fields', () => {
    const src = readRepoFile('packages/local-agent/src/executor.ts') ?? '';
    expect(src).not.toBe('');

    // The dead-session log must include role= and session= for structured observability
    const deadSessionLog = src.match(
      /Persistent agent session dead[^\n]*/
    )?.[0] ?? '';

    expect(deadSessionLog).toMatch(/role=/);
    expect(deadSessionLog).toMatch(/session=/);
  });

  it('executor.ts skips capturePane when session is dead (liveness check gates capture)', () => {
    const src = readRepoFile('packages/local-agent/src/executor.ts') ?? '';
    expect(src).not.toBe('');

    // The liveness check must appear BEFORE capturePane in the heartbeat block.
    // The block must have an early return or conditional that prevents capturePane
    // from executing when the session is dead.
    const heartbeatBlock = src.match(
      /heartbeatTimer\s*=\s*setInterval[\s\S]{0,6000}/
    )?.[0] ?? '';

    const aliveIdx = heartbeatBlock.indexOf('isTmuxSessionAlive');
    const captureIdx = heartbeatBlock.indexOf('capturePane');

    // isTmuxSessionAlive must appear before capturePane
    expect(aliveIdx).toBeGreaterThanOrEqual(0);
    expect(captureIdx).toBeGreaterThanOrEqual(0);
    expect(aliveIdx).toBeLessThan(captureIdx);
  });

  it('executor.ts narrows the catch block after adding liveness check (errors at error level not warn)', () => {
    const src = readRepoFile('packages/local-agent/src/executor.ts') ?? '';
    expect(src).not.toBe('');

    // After liveness check, unexpected capturePane errors should be logged as errors,
    // not silently swallowed or logged at warn level only.
    // The catch block near capturePane should not merely console.warn generic errors.
    // Check that console.error is used for unexpected capture failures, OR
    // that the warn message now says something more specific than before.
    const hasCaptureErrorLogging =
      src.match(/console\.error[^\n]*(?:capture|pane)/i)
      || src.match(/console\.error[^\n]*heartbeat/i)
      || src.match(/console\.warn[^\n]*(?:Failed to capture|capture.*failed)/i);

    expect(hasCaptureErrorLogging).toBeTruthy();
  });

  it('executor.ts delegates dead-session detection to respawnPersistentAgentIfDead or equivalent', () => {
    const src = readRepoFile('packages/local-agent/src/executor.ts') ?? '';
    expect(src).not.toBe('');

    // When session is dead, the heartbeat must call the respawn method (Gap 3)
    const heartbeatBlock = src.match(
      /heartbeatTimer\s*=\s*setInterval[\s\S]{0,6000}/
    )?.[0] ?? '';

    const hasRespawnCall =
      heartbeatBlock.includes('respawnPersistentAgentIfDead')
      || heartbeatBlock.includes('respawnPersistentAgent')
      || heartbeatBlock.includes('reloadPersistentAgent');

    expect(hasRespawnCall).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// AC3 Structural: Post-spawn health check after spawnTmuxSession
// ---------------------------------------------------------------------------

describe('AC3 Structural: post-spawn health check in handlePersistentJob', () => {
  it('executor.ts performs a post-spawn isTmuxSessionAlive check after spawnTmuxSession', () => {
    const src = readRepoFile('packages/local-agent/src/executor.ts') ?? '';
    expect(src).not.toBe('');

    // After spawnTmuxSession, there must be a health check using isTmuxSessionAlive.
    // Look for spawnTmuxSession followed by a liveness check within the same function scope.
    const spawnBlock = src.match(
      /spawnTmuxSession[\s\S]{0,2000}/
    )?.[0] ?? '';

    expect(spawnBlock).toMatch(/isTmuxSessionAlive/);
  });

  it('executor.ts waits ~2 seconds after spawn before checking liveness', () => {
    const src = readRepoFile('packages/local-agent/src/executor.ts') ?? '';
    expect(src).not.toBe('');

    // The post-spawn health check must include a delay so Claude Code has time
    // to begin initializing (~1s). Look for a 2000ms or 2-second delay near the spawn check.
    const hasSpawnDelay =
      src.match(/await.*delay.*2000|sleep.*2000|setTimeout.*2000/i)
      || src.match(/2000|2_000/);

    // At minimum, some delay mechanism near spawn
    expect(hasSpawnDelay).toBeTruthy();
  });

  it('executor.ts checks pane_dead_status or exit code after spawn', () => {
    const src = readRepoFile('packages/local-agent/src/executor.ts') ?? '';
    expect(src).not.toBe('');

    // The post-spawn check should inspect the pane exit status via:
    // tmux display-message -p -t <session> "#{pane_dead_status}"
    const hasExitCodeCheck =
      src.includes('pane_dead_status')
      || src.match(/display-message[^\n]*pane_dead/i)
      || src.match(/pane.*dead.*status|exit.*code.*pane/i);

    expect(hasExitCodeCheck).toBeTruthy();
  });

  it('executor.ts logs spawn failure with context from pane output or log file', () => {
    const src = readRepoFile('packages/local-agent/src/executor.ts') ?? '';
    expect(src).not.toBe('');

    // When spawn fails the health check, it must log with context
    // (from log file tail or pane capture output).
    const hasSpawnFailureLog =
      src.match(/spawn.*fail|fail.*spawn/i)
      || src.match(/post.*spawn|spawn.*health/i)
      || src.match(/Persistent agent.*dead|spawn.*dead/i);

    expect(hasSpawnFailureLog).toBeTruthy();
  });

  it('executor.ts throws or returns error when post-spawn health check fails', () => {
    const src = readRepoFile('packages/local-agent/src/executor.ts') ?? '';
    expect(src).not.toBe('');

    // The caller must be notified of spawn failure — either by throwing
    // or returning an error result. This ensures the caller can handle it.
    // Look for error handling near the spawn liveness check.
    const spawnHealthContext = src.match(
      /isTmuxSessionAlive[\s\S]{0,500}/
    )?.[0] ?? '';

    const hasErrorPropagation =
      spawnHealthContext.match(/throw\s+new\s+Error|throw\s+err/i)
      || spawnHealthContext.match(/return\s+\{[^}]*error/i)
      || src.match(/respawnPersistentAgentIfDead|post_spawn_failed/);

    expect(hasErrorPropagation).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// AC5 Structural: Normal operation — healthy agents pass liveness check
// ---------------------------------------------------------------------------

describe('AC5 Structural: healthy agents pass liveness check without degradation', () => {
  it('executor.ts liveness check only acts when session is dead (not on every tick)', () => {
    const src = readRepoFile('packages/local-agent/src/executor.ts') ?? '';
    expect(src).not.toBe('');

    // The heartbeat must contain a conditional: if alive → continue normal path
    // if dead → log + respawn. The normal path must remain unaffected.
    const heartbeatBlock = src.match(
      /heartbeatTimer\s*=\s*setInterval[\s\S]{0,6000}/
    )?.[0] ?? '';

    // Should have an "if alive" or "if dead" conditional around the liveness check
    const hasLivenessConditional =
      heartbeatBlock.match(/if\s*\(.*isTmuxSessionAlive|isTmuxSessionAlive.*\)\s*\{/i)
      || heartbeatBlock.match(/if\s*\(!.*alive\)|if\s*\(.*dead\)/i)
      || heartbeatBlock.match(/isTmuxSessionAlive[\s\S]{0,200}return/);

    expect(hasLivenessConditional).toBeTruthy();
  });

  it('executor.ts still updates last_heartbeat in persistent_agents on healthy ticks', () => {
    const src = readRepoFile('packages/local-agent/src/executor.ts') ?? '';
    expect(src).not.toBe('');

    // Healthy heartbeat ticks must still update the last_heartbeat column in the DB
    const heartbeatBlock = src.match(
      /heartbeatTimer\s*=\s*setInterval[\s\S]{0,8000}/
    )?.[0] ?? '';

    expect(heartbeatBlock).toMatch(/last_heartbeat/);
  });

  it('executor.ts isTmuxSessionAlive is reused from existing implementation (not reimplemented)', () => {
    const src = readRepoFile('packages/local-agent/src/executor.ts') ?? '';
    expect(src).not.toBe('');

    // isTmuxSessionAlive must be defined once and reused — not re-implemented inline
    const definitions = (src.match(/(?:async )?function isTmuxSessionAlive/g) ?? []).length;
    // One canonical definition
    expect(definitions).toBe(1);

    // Used in multiple places (heartbeat + pollJob + now heartbeat persistent)
    const usages = (src.match(/isTmuxSessionAlive\(/g) ?? []).length;
    expect(usages).toBeGreaterThanOrEqual(3);
  });
});
