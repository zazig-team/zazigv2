/**
 * credentials.ts — read/write ~/.zazigv2/credentials.json
 *
 * Stores OAuth tokens from browser-based login. The file is written with
 * mode 0o600 (owner-readable only) to limit exposure of tokens.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const ZAZIGV2_DIR = join(homedir(), ".zazigv2");
const CREDENTIALS_PATH = join(ZAZIGV2_DIR, "credentials.json");

export interface Credentials {
  accessToken: string;
  refreshToken: string;
  email?: string;
  companyId?: string | null;
  supabaseUrl: string;
}

export function credentialsExist(): boolean {
  return existsSync(CREDENTIALS_PATH);
}

export function loadCredentials(): Credentials {
  try {
    const raw = readFileSync(CREDENTIALS_PATH, "utf-8");
    return JSON.parse(raw) as Credentials;
  } catch {
    throw new Error("No credentials found. Run 'zazig login' first.");
  }
}

export function saveCredentials(creds: Credentials): void {
  mkdirSync(ZAZIGV2_DIR, { recursive: true });
  writeFileSync(CREDENTIALS_PATH, JSON.stringify(creds, null, 2) + "\n", {
    mode: 0o600,
  });
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
 * Requires SUPABASE_ANON_KEY env var for the refresh API call.
 */
export async function getValidCredentials(): Promise<Credentials> {
  const creds = loadCredentials();

  if (!isTokenExpired(creds.accessToken)) {
    return creds;
  }

  // Access token is expired — refresh it
  const anonKey = process.env["SUPABASE_ANON_KEY"];
  if (!anonKey) {
    throw new Error(
      "Access token expired and SUPABASE_ANON_KEY not set — cannot refresh. " +
        "Run 'zazig login' again or set SUPABASE_ANON_KEY."
    );
  }

  const resp = await fetch(
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

  if (!resp.ok) {
    throw new Error(
      `Token refresh failed (HTTP ${resp.status}). Run 'zazig login' again.`
    );
  }

  const data = (await resp.json()) as {
    access_token: string;
    refresh_token: string;
  };

  const updated: Credentials = {
    ...creds,
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
  };

  saveCredentials(updated);
  return updated;
}
