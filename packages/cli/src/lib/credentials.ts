/**
 * credentials.ts — read/write ~/.zazigv2/credentials.json
 *
 * Stores OAuth tokens from browser-based login. The file is written with
 * mode 0o600 (owner-readable only) to limit exposure of tokens.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, openSync, closeSync, unlinkSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { DEFAULT_SUPABASE_ANON_KEY } from "./constants.js";

function zazigDir(): string {
  return process.env["ZAZIG_HOME"] ?? join(homedir(), ".zazigv2");
}

function credentialsPath(): string {
  return join(zazigDir(), "credentials.json");
}

function credentialsLockPath(): string {
  return join(zazigDir(), "credentials.lock");
}

const LOCK_TIMEOUT_MS = 5_000;
const LOCK_STALE_MS = 30_000;
const LOCK_RETRY_SLEEP_MS = 50;

function isErrnoError(error: unknown): error is NodeJS.ErrnoException {
  return typeof error === "object" && error !== null && "code" in error;
}

function isLockTimeoutError(error: unknown): boolean {
  if (!isErrnoError(error)) return false;
  return error.code === "ELOCKED" || error.code === "ETIMEDOUT";
}

function sleepSync(ms: number): void {
  const waitBuffer = new SharedArrayBuffer(4);
  const waitArray = new Int32Array(waitBuffer);
  Atomics.wait(waitArray, 0, 0, ms);
}

function clearStaleCredentialsLockIfPresent(lockPath: string): void {
  try {
    const lockStat = statSync(lockPath);
    const lockAgeMs = Date.now() - lockStat.mtimeMs;
    if (lockAgeMs > LOCK_STALE_MS) {
      unlinkSync(lockPath);
    }
  } catch {
    // lock file may have been released by another process.
  }
}

function acquireLock(): () => void {
  mkdirSync(zazigDir(), { recursive: true });
  const lockPath = credentialsLockPath();
  const deadline = Date.now() + LOCK_TIMEOUT_MS;

  while (Date.now() < deadline) {
    try {
      const fd = openSync(lockPath, "wx");
      closeSync(fd);
      let released = false;
      return () => {
        if (released) return;
        released = true;
        try {
          unlinkSync(lockPath);
        } catch {
          // Best effort: lock file might already be gone.
        }
      };
    } catch (err) {
      if (isErrnoError(err) && err.code === "EEXIST") {
        clearStaleCredentialsLockIfPresent(lockPath);
        sleepSync(LOCK_RETRY_SLEEP_MS);
        continue;
      }
      throw err;
    }
  }

  console.warn(`[credentials] lock timeout after ${LOCK_TIMEOUT_MS}ms while acquiring credentials.lock`);
  const timeoutError = new Error("ELOCKED: lock timeout acquiring credentials.lock") as NodeJS.ErrnoException;
  timeoutError.code = "ELOCKED";
  throw timeoutError;
}

function writeCredentialsUnlocked(creds: Credentials): void {
  mkdirSync(zazigDir(), { recursive: true });
  writeFileSync(credentialsPath(), JSON.stringify(creds, null, 2) + "\n", {
    mode: 0o600,
  });
}

export interface Credentials {
  accessToken: string;
  refreshToken: string;
  email?: string;
  supabaseUrl: string;
}

export function credentialsExist(): boolean {
  return existsSync(credentialsPath());
}

export function loadCredentials(): Credentials {
  try {
    const raw = readFileSync(credentialsPath(), "utf-8");
    return JSON.parse(raw) as Credentials;
  } catch {
    throw new Error("No credentials found. Run 'zazig login' first.");
  }
}

export function saveCredentials(creds: Credentials): void {
  let releaseLock: (() => void) | null = null;
  try {
    releaseLock = acquireLock();
    writeCredentialsUnlocked(creds);
  } catch (err) {
    if (isLockTimeoutError(err)) {
      console.warn("[credentials] lock timeout while saving credentials.json");
    }
    throw err;
  } finally {
    releaseLock?.();
  }
}

/**
 * Decode a JWT payload without verification (we only need exp and claims).
 */
export function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    return JSON.parse(Buffer.from(parts[1]!, "base64url").toString("utf-8"));
  } catch {
    return null;
  }
}

/**
 * Returns true if the JWT's exp claim is in the past (or within 60s of expiry).
 */
function isTokenExpired(token: string): boolean {
  const payload = decodeJwtPayload(token);
  if (!payload || typeof payload.exp !== "number") return true;
  return Date.now() >= (payload.exp as number) * 1000 - 60_000;
}

/**
 * Load credentials and auto-refresh the access token if expired.
 * Uses the built-in anon key for refresh (overridable via SUPABASE_ANON_KEY env var).
 */
export async function getValidCredentials(): Promise<Credentials> {
  let releaseLock: (() => void) | null = null;
  try {
    releaseLock = acquireLock();
    const creds = loadCredentials();

    if (!isTokenExpired(creds.accessToken)) {
      return creds;
    }

    // Access token is expired — refresh it.
    // Only respect env override when ZAZIG_ENV is set (staging binary).
    const envOverride = Boolean(process.env["ZAZIG_ENV"]);
    const anonKey = (envOverride && process.env["SUPABASE_ANON_KEY"]) || DEFAULT_SUPABASE_ANON_KEY;

    // Retry on transient server errors (5xx) — a single Supabase hiccup should not
    // require the user to re-login. Auth errors (4xx) are not retried.
    const retryDelaysMs = [0, 2000, 5000];
    let lastStatus = 0;
    for (let attempt = 0; attempt < retryDelaysMs.length; attempt++) {
      if (attempt > 0) {
        await new Promise<void>((resolve) => setTimeout(resolve, retryDelaysMs[attempt]));
      }

      let resp: Response;
      try {
        resp = await fetch(
          `${creds.supabaseUrl}/auth/v1/token?grant_type=refresh_token`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              apikey: anonKey,
            },
            body: JSON.stringify({ refresh_token: creds.refreshToken }),
          }
        );
      } catch {
        // Network error — retry
        continue;
      }

      if (resp.ok) {
        const data = (await resp.json()) as {
          access_token: string;
          refresh_token: string;
        };
        const updated: Credentials = {
          ...creds,
          accessToken: data.access_token,
          refreshToken: data.refresh_token,
        };
        writeCredentialsUnlocked(updated);
        return updated;
      }

      lastStatus = resp.status;
      // Auth errors (4xx) indicate genuinely invalid credentials — no point retrying.
      if (resp.status >= 400 && resp.status < 500) break;
      // 5xx — retry
    }

    throw new Error(
      `Token refresh failed (HTTP ${lastStatus || "network error"}). Run 'zazig login' again.`
    );
  } catch (err) {
    if (isLockTimeoutError(err)) {
      console.warn("[credentials] lock timeout while reading/updating credentials.json");
    }
    throw err;
  } finally {
    releaseLock?.();
  }
}
