/**
 * Feature: Retry Failed Uploads
 *
 * Tests for acceptance criteria: when fetching a contextRef presigned URL fails
 * due to a transient error (5xx, network timeout), the executor retries the
 * download automatically before failing the job. Permanent errors (4xx) are NOT
 * retried. After exhausting retries, the job is failed with a clear error.
 *
 * These tests do static analysis of executor.ts source to verify the required
 * implementation patterns. Written to FAIL against the current codebase and
 * pass once the feature is implemented.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');
const EXECUTOR_TS = 'packages/local-agent/src/executor.ts';

function readRepoFile(relPath: string): string | null {
  const fullPath = path.join(REPO_ROOT, relPath);
  try {
    return fs.readFileSync(fullPath, 'utf-8');
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// AC1: Transient fetch failures trigger retries
// ---------------------------------------------------------------------------

describe('AC1: contextRef fetch retries on transient errors (5xx / network)', () => {
  let content: string | null;

  beforeAll(() => {
    content = readRepoFile(EXECUTOR_TS);
  });

  it('executor.ts exists', () => {
    expect(content, `File not found: ${EXECUTOR_TS}`).not.toBeNull();
  });

  it('resolveContext contains a retry loop or recursive retry call', () => {
    // Must loop or recurse inside resolveContext / a helper it delegates to
    // Patterns: for/while loop, recursive call, or a named retry utility
    const hasRetryLoop =
      /for\s*\(|while\s*\(|retryFetch|withRetry|fetchWithRetry|retries|attempt/.test(content ?? '');
    expect(hasRetryLoop, 'expected a retry loop or helper in the fetch path').toBe(true);
  });

  it('declares a maximum number of retry attempts (constant or parameter)', () => {
    // Must define how many retries are allowed
    expect(content).toMatch(
      /MAX_FETCH_RETRIES|maxRetries|maxAttempts|MAX_RETRIES|CONTEXT_REF_RETRIES|retryLimit/,
    );
  });

  it('implements exponential or fixed back-off between retries', () => {
    // Back-off: sleep/delay between attempts
    // Patterns: setTimeout/sleep in a retry loop, backoff, delay
    expect(content).toMatch(/setTimeout|sleep|backoff|delay|wait/i);
  });

  it('retries specifically on 5xx HTTP status codes', () => {
    // Must treat 5xx as retriable
    // Patterns: status >= 500, status >= 500 && status < 600, response.status >= 500
    expect(content).toMatch(/status\s*>=\s*500|5[0-9]{2}/);
  });

  it('retries on network/fetch errors (non-HTTP failures)', () => {
    // Must catch fetch() rejections (network errors) and retry
    // Patterns: catch around fetch, retry on error, try/catch in retry loop
    expect(content).toMatch(/catch\s*\([\s\S]{0,30}\)\s*\{[\s\S]{0,200}retry|retries?\s*>/i);
  });
});

// ---------------------------------------------------------------------------
// AC2: Permanent errors are NOT retried
// ---------------------------------------------------------------------------

describe('AC2: contextRef fetch does NOT retry on permanent errors (4xx)', () => {
  let content: string | null;

  beforeAll(() => {
    content = readRepoFile(EXECUTOR_TS);
  });

  it('distinguishes retriable from permanent status codes', () => {
    // Must have logic that skips retry for 4xx responses
    // Patterns: status < 500, !isRetriable, permanent error check
    expect(content).toMatch(/status\s*<\s*500|[^>]status\s*>=\s*400|isRetriable|permanent/);
  });

  it('throws immediately on 4xx without retry', () => {
    // A 4xx should propagate without entering the retry path
    // Pattern: throw / break out of retry loop on non-retriable status
    expect(content).toMatch(
      /4[0-9]{2}[\s\S]{0,200}throw|throw[\s\S]{0,100}4[0-9]{2}|break[\s\S]{0,100}4[0-9]{2}/s,
    );
  });
});

// ---------------------------------------------------------------------------
// AC3: Job fails clearly after exhausting retries
// ---------------------------------------------------------------------------

describe('AC3: Job is failed with a clear error after max retries exhausted', () => {
  let content: string | null;

  beforeAll(() => {
    content = readRepoFile(EXECUTOR_TS);
  });

  it('throws a descriptive error when retries are exhausted', () => {
    // After retries are used up, must throw with a message that includes retry context
    expect(content).toMatch(
      /retries? exhausted|after.*attempt|max.*retr|failed to fetch.*retr|contextRef.*retr/i,
    );
  });

  it('sendJobFailed is reachable when resolveContext throws after exhausted retries', () => {
    // The caller of resolveContext must propagate to sendJobFailed
    // Verify resolveContext is called in a try/catch that routes to sendJobFailed
    expect(content).toMatch(/resolveContext[\s\S]{0,500}sendJobFailed|catch[\s\S]{0,200}sendJobFailed/s);
  });
});

// ---------------------------------------------------------------------------
// AC4: Retry count and back-off are configurable / bounded
// ---------------------------------------------------------------------------

describe('AC4: Retry parameters are bounded and reasonable', () => {
  let content: string | null;

  beforeAll(() => {
    content = readRepoFile(EXECUTOR_TS);
  });

  it('maximum retry count is ≤ 5 (avoids infinite loops on persistent failures)', () => {
    // Extract the constant value used for max retries
    // Pattern: MAX_FETCH_RETRIES = N or similar numeric literal ≤ 5
    const match = content?.match(
      /(?:MAX_FETCH_RETRIES|maxRetries|CONTEXT_REF_RETRIES|retryLimit)\s*=\s*(\d+)/,
    );
    expect(match, 'expected a numeric retry constant').not.toBeNull();
    const retryCount = parseInt(match![1]!, 10);
    expect(retryCount).toBeGreaterThanOrEqual(1);
    expect(retryCount).toBeLessThanOrEqual(5);
  });

  it('back-off delay is reasonable (≥ 500ms, ≤ 30000ms)', () => {
    // Base delay should be between 500ms and 30 seconds
    const match = content?.match(
      /(?:backoff|delay|RETRY_DELAY|BASE_DELAY|retryDelay|sleep)\D{0,10}(\d{3,5})/,
    );
    if (match) {
      const delay = parseInt(match[1]!, 10);
      expect(delay).toBeGreaterThanOrEqual(500);
      expect(delay).toBeLessThanOrEqual(30_000);
    } else {
      // If no explicit constant, a multiplied delay (e.g. attempt * 1000) is acceptable
      expect(content).toMatch(/attempt\s*\*|i\s*\*\s*\d+|\d+\s*\*\s*attempt/);
    }
  });
});

// ---------------------------------------------------------------------------
// AC5: Successful retry produces the correct context string
// ---------------------------------------------------------------------------

describe('AC5: Successful retry returns the fetched context text', () => {
  let content: string | null;

  beforeAll(() => {
    content = readRepoFile(EXECUTOR_TS);
  });

  it('resolveContext still returns response.text() on success', () => {
    // The success path must still call response.text()
    expect(content).toMatch(/response\.text\(\)|\.text\(\)/);
  });

  it('retry loop exits and returns on a successful fetch (2xx)', () => {
    // On success the loop must break/return, not keep looping
    // Patterns: return inside loop on ok response, break + return after
    expect(content).toMatch(/response\.ok[\s\S]{0,200}return|return[\s\S]{0,50}response\.text/s);
  });
});

// ---------------------------------------------------------------------------
// AC6: Logging — retry attempts are observable
// ---------------------------------------------------------------------------

describe('AC6: Retry attempts are logged for observability', () => {
  let content: string | null;

  beforeAll(() => {
    content = readRepoFile(EXECUTOR_TS);
  });

  it('logs a warning or info message when a retry is attempted', () => {
    // Operators need visibility into retry behaviour
    expect(content).toMatch(
      /console\.warn.*retry|console\.log.*retry|Retrying|retry attempt|attempt \d/i,
    );
  });

  it('logs the attempt number and/or remaining retries', () => {
    // Log must include attempt/retry context (not just a static string)
    expect(content).toMatch(
      /attempt\s+\$\{|retry\s+\$\{|retries remaining|attempt \d+|\battемpt\b/i,
    );
  });
});
