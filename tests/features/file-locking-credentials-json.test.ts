/**
 * Feature: Add file locking on credentials.json to fix auth token race condition
 *
 * Tests encode acceptance criteria for file-locking semantics around
 * credentials.json reads and writes. Tests are written to FAIL against the
 * current codebase (no locking exists) and pass once the feature is implemented.
 *
 * Files being verified:
 *   - packages/cli/src/lib/credentials.ts
 *   - packages/local-agent/src/connection.ts
 *
 * Acceptance criteria:
 *   AC1: CLI succeeds without 'not logged in' after daemon refresh cycle
 *   AC2: Multiple concurrent CLI commands produce no race condition or stale token errors
 *   AC3: CLI can independently refresh after daemon is killed mid-refresh
 *   AC4: Lock timeout after 5s — log warning and fail gracefully, not hang
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
// AC1 + AC2: credentials.ts — getValidCredentials() and saveCredentials()
// are wrapped in file lock acquire/release
// ---------------------------------------------------------------------------

describe('credentials.ts — getValidCredentials() acquires a file lock', () => {
  const FILE = 'packages/cli/src/lib/credentials.ts';
  let content: string | null;

  beforeAll(() => {
    content = readRepoFile(FILE);
  });

  it('file exists', () => {
    expect(content, `File not found: ${FILE}`).not.toBeNull();
  });

  it('imports a lock mechanism (proper-lockfile, flock, or similar)', () => {
    // The file must import a locking library or locking utility
    expect(content).toMatch(
      /import.*lock|require.*lock|from ['"]proper-lockfile['"]|from ['"].*flock.*['"]|lockFile|acquireLock|withLock/i,
    );
  });

  it('getValidCredentials() calls lock acquire before reading credentials', () => {
    // Lock acquire must appear in the body of getValidCredentials
    expect(content).toMatch(
      /getValidCredentials[\s\S]{0,600}(lock|acquire|flock)/i,
    );
  });

  it('getValidCredentials() releases the lock after write (in finally block or equivalent)', () => {
    // Lock release must be guaranteed even on error — look for finally + release pattern
    expect(content).toMatch(
      /(finally[\s\S]{0,200}(release|unlock|remove|unlink)|release[\s\S]{0,200}finally)/i,
    );
  });

  it('saveCredentials() acquires a file lock before writing', () => {
    // saveCredentials must also hold the lock when writing
    expect(content).toMatch(
      /saveCredentials[\s\S]{0,400}(lock|acquire|flock)/i,
    );
  });
});

// ---------------------------------------------------------------------------
// AC1 + AC2: credentials.ts — lock file is at ~/.zazigv2/credentials.lock
// ---------------------------------------------------------------------------

describe('credentials.ts — uses credentials.lock as the lock file', () => {
  const FILE = 'packages/cli/src/lib/credentials.ts';
  let content: string | null;

  beforeAll(() => {
    content = readRepoFile(FILE);
  });

  it('references credentials.lock as the lock file path', () => {
    expect(content).toContain('credentials.lock');
  });

  it('lock file path is under the zazigDir() / ZAZIG_HOME directory', () => {
    // Lock file must live next to credentials.json, not at an arbitrary path
    expect(content).toMatch(
      /zazigDir\(\).*credentials\.lock|ZAZIG_HOME.*credentials\.lock|credentials\.lock.*zazigDir|credentials\.lock.*ZAZIG_HOME/,
    );
  });
});

// ---------------------------------------------------------------------------
// AC4: credentials.ts — lock timeout is 5 seconds, fails gracefully
// ---------------------------------------------------------------------------

describe('credentials.ts — lock timeout is 5 seconds with graceful failure', () => {
  const FILE = 'packages/cli/src/lib/credentials.ts';
  let content: string | null;

  beforeAll(() => {
    content = readRepoFile(FILE);
  });

  it('configures a timeout value of 5000ms (5 seconds) for lock acquisition', () => {
    // Must have 5000 or 5_000 as a timeout value near lock configuration
    expect(content).toMatch(/5[_]?000/);
  });

  it('logs a warning when lock acquisition times out', () => {
    // Must call console.warn when lock times out
    expect(content).toMatch(
      /console\.warn[\s\S]{0,200}(lock|timeout)|warn[\s\S]{0,200}(lock|timeout)/i,
    );
  });

  it('does not re-throw lock timeout as an unhandled error that hangs the process', () => {
    // Lock timeout must be caught and handled — the function must not propagate
    // an uncaught ELOCKED error upward. It should log and return/throw a user-friendly error.
    // Check that ELOCKED or lock timeout is explicitly caught.
    expect(content).toMatch(
      /ELOCKED|lock.*timeout|timeout.*lock|catch[\s\S]{0,200}(lock|ELOCKED)/i,
    );
  });
});

// ---------------------------------------------------------------------------
// AC2 + AC3: connection.ts — recoverSessionFromDisk() acquires a lock
// ---------------------------------------------------------------------------

describe('connection.ts — recoverSessionFromDisk() acquires a file lock', () => {
  const FILE = 'packages/local-agent/src/connection.ts';
  let content: string | null;

  beforeAll(() => {
    content = readRepoFile(FILE);
  });

  it('file exists', () => {
    expect(content, `File not found: ${FILE}`).not.toBeNull();
  });

  it('imports a lock mechanism', () => {
    expect(content).toMatch(
      /import.*lock|require.*lock|from ['"]proper-lockfile['"]|from ['"].*flock.*['"]|lockFile|acquireLock|withLock/i,
    );
  });

  it('recoverSessionFromDisk() acquires a lock before reading credentials.json', () => {
    expect(content).toMatch(
      /recoverSessionFromDisk[\s\S]{0,600}(lock|acquire|flock)/i,
    );
  });

  it('recoverSessionFromDisk() releases the lock in a finally block', () => {
    expect(content).toMatch(
      /(finally[\s\S]{0,200}(release|unlock|remove|unlink)|release[\s\S]{0,200}finally)/i,
    );
  });
});

// ---------------------------------------------------------------------------
// AC1 + AC2: connection.ts — AUTH_STATE_CHANGE write-back acquires a lock
// ---------------------------------------------------------------------------

describe('connection.ts — onAuthStateChange write-back acquires a file lock', () => {
  const FILE = 'packages/local-agent/src/connection.ts';
  let content: string | null;

  beforeAll(() => {
    content = readRepoFile(FILE);
  });

  it('the onAuthStateChange handler acquires a lock before writeFileSync', () => {
    // The AUTH_STATE_CHANGE callback writes credentials — it must hold the lock
    expect(content).toMatch(
      /onAuthStateChange[\s\S]{0,800}(lock|acquire|flock)/i,
    );
  });

  it('the lock is released after writeFileSync in the auth state change handler', () => {
    // In the write-back path, release must follow write
    expect(content).toMatch(
      /(writeFileSync[\s\S]{0,200}(release|unlock)|release[\s\S]{0,200}writeFileSync[\s\S]{0,400}onAuthStateChange|onAuthStateChange[\s\S]{0,800}release)/i,
    );
  });
});

// ---------------------------------------------------------------------------
// AC4: connection.ts — lock timeout is 5 seconds with graceful failure
// ---------------------------------------------------------------------------

describe('connection.ts — lock timeout is 5 seconds with graceful failure', () => {
  const FILE = 'packages/local-agent/src/connection.ts';
  let content: string | null;

  beforeAll(() => {
    content = readRepoFile(FILE);
  });

  it('configures a timeout value of 5000ms for lock acquisition', () => {
    expect(content).toMatch(/5[_]?000/);
  });

  it('logs a warning when lock acquisition times out', () => {
    expect(content).toMatch(
      /console\.warn[\s\S]{0,200}(lock|timeout)|warn[\s\S]{0,200}(lock|timeout)/i,
    );
  });

  it('handles ELOCKED or lock timeout without crashing the daemon', () => {
    // Daemon must survive a lock timeout — log and continue, not throw unhandled
    expect(content).toMatch(
      /ELOCKED|lock.*timeout|timeout.*lock|catch[\s\S]{0,200}(lock|ELOCKED)/i,
    );
  });
});

// ---------------------------------------------------------------------------
// AC3: lock file uses stale-lock detection so CLI can acquire after daemon dies
// ---------------------------------------------------------------------------

describe('stale lock detection — CLI can acquire lock after daemon killed mid-refresh', () => {
  const CREDENTIALS_FILE = 'packages/cli/src/lib/credentials.ts';
  const CONNECTION_FILE = 'packages/local-agent/src/connection.ts';

  it('credentials.ts uses proper-lockfile or equivalent with stale detection', () => {
    const content = readRepoFile(CREDENTIALS_FILE);
    expect(content, `File not found: ${CREDENTIALS_FILE}`).not.toBeNull();
    // proper-lockfile has stale detection built in via `stale` option or default behavior.
    // Either the package is proper-lockfile or the code sets a stale/retries option.
    expect(content).toMatch(
      /proper-lockfile|stale|retries|STALE/i,
    );
  });

  it('connection.ts uses proper-lockfile or equivalent with stale detection', () => {
    const content = readRepoFile(CONNECTION_FILE);
    expect(content, `File not found: ${CONNECTION_FILE}`).not.toBeNull();
    expect(content).toMatch(
      /proper-lockfile|stale|retries|STALE/i,
    );
  });
});

// ---------------------------------------------------------------------------
// Structural: lock utility is shared or co-located (not duplicated in each file)
// ---------------------------------------------------------------------------

describe('lock implementation — consistent lock file path across CLI and daemon', () => {
  const CREDENTIALS_FILE = 'packages/cli/src/lib/credentials.ts';
  const CONNECTION_FILE = 'packages/local-agent/src/connection.ts';

  it('credentials.ts references credentials.lock', () => {
    const content = readRepoFile(CREDENTIALS_FILE);
    expect(content).not.toBeNull();
    expect(content).toContain('credentials.lock');
  });

  it('connection.ts references credentials.lock (same lock file as CLI)', () => {
    // Both the CLI and daemon must lock the same file for mutual exclusion
    const content = readRepoFile(CONNECTION_FILE);
    expect(content).not.toBeNull();
    expect(content).toContain('credentials.lock');
  });
});
