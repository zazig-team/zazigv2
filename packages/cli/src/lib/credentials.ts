/**
 * credentials.ts — read/write ~/.zazigv2/credentials.json
 *
 * Stores Supabase connection credentials. The file is written with mode 0o600
 * (owner-readable only) to limit exposure of the service-role key.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const ZAZIGV2_DIR = join(homedir(), ".zazigv2");
const CREDENTIALS_PATH = join(ZAZIGV2_DIR, "credentials.json");

export interface Credentials {
  supabaseUrl: string;
  anonKey: string;
  serviceRoleKey: string;
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
