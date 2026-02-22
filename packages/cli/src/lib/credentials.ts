/**
 * credentials.ts — read/write ~/.zazigv2/credentials.json
 *
 * Stores Supabase Auth session credentials. The file is written with mode 0o600
 * (owner-readable only) to protect the refresh token.
 *
 * Schema: { supabaseUrl, anonKey, refreshToken, accessToken, userId, companyId }
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";

const ZAZIGV2_DIR = join(homedir(), ".zazigv2");
const CREDENTIALS_PATH = join(ZAZIGV2_DIR, "credentials.json");

export interface Credentials {
  supabaseUrl: string;
  anonKey: string;
  refreshToken: string;
  accessToken: string;
  userId: string;
  companyId: string;
}

export function credentialsExist(): boolean {
  return existsSync(CREDENTIALS_PATH);
}

export function loadCredentials(): Credentials {
  try {
    const raw = readFileSync(CREDENTIALS_PATH, "utf-8");
    const parsed = JSON.parse(raw) as Partial<Credentials>;
    if (!parsed.supabaseUrl || !parsed.anonKey || !parsed.refreshToken || !parsed.accessToken || !parsed.userId || !parsed.companyId) {
      throw new Error("Incomplete credentials. Run 'zazig login' to re-authenticate.");
    }
    return parsed as Credentials;
  } catch (err) {
    if (err instanceof Error && err.message.includes("Incomplete")) throw err;
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
 * Decode a JWT payload without verification (for extracting claims client-side).
 */
export function decodeJwtPayload(token: string): Record<string, unknown> {
  const parts = token.split(".");
  if (!parts[1]) throw new Error("Invalid JWT format");
  return JSON.parse(Buffer.from(parts[1], "base64url").toString()) as Record<string, unknown>;
}

/**
 * Refresh the session using stored credentials. Updates credentials.json
 * with the new access/refresh tokens.
 */
export async function refreshSession(creds: Credentials): Promise<{
  accessToken: string;
  refreshToken: string;
}> {
  const supabase = createClient(creds.supabaseUrl, creds.anonKey);
  const { data, error } = await supabase.auth.setSession({
    access_token: creds.accessToken,
    refresh_token: creds.refreshToken,
  });

  if (error || !data.session) {
    throw new Error(
      `Session refresh failed: ${error?.message ?? "no session returned"}. Run 'zazig login' to re-authenticate.`
    );
  }

  const updated: Credentials = {
    ...creds,
    accessToken: data.session.access_token,
    refreshToken: data.session.refresh_token,
  };
  saveCredentials(updated);

  return {
    accessToken: data.session.access_token,
    refreshToken: data.session.refresh_token,
  };
}

/**
 * Load credentials and return a valid access token, refreshing if needed.
 */
export async function getValidCredentials(): Promise<Credentials> {
  const creds = loadCredentials();

  // Check if the access token is expired or about to expire (within 60s)
  try {
    const payload = decodeJwtPayload(creds.accessToken);
    const exp = payload.exp as number | undefined;
    if (exp && exp * 1000 > Date.now() + 60_000) {
      return creds; // Still valid
    }
  } catch {
    // JWT decode failed — try refreshing
  }

  // Token expired or about to — refresh
  const refreshed = await refreshSession(creds);
  return {
    ...creds,
    accessToken: refreshed.accessToken,
    refreshToken: refreshed.refreshToken,
  };
}
