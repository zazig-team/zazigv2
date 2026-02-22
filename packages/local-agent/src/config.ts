/**
 * config.ts — Machine configuration reader
 *
 * Reads ~/.zazigv2/machine.yaml for machine identity and slot config.
 * Reads ~/.zazigv2/credentials.json for Supabase auth (JWT-based).
 *
 * company_id is derived from the authenticated user's JWT, not from machine.yaml.
 * The anon key comes from credentials or SUPABASE_ANON_KEY env var.
 */

import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { parse as parseYaml } from "yaml";

export interface SlotConfig {
  claude_code: number;
  codex: number;
}

export interface SupabaseConfig {
  url: string;
  anon_key: string;
}

export interface AuthCredentials {
  refreshToken: string;
  accessToken: string;
  userId: string;
  companyId: string;
}

export interface MachineConfig {
  /** Stable machine identifier — used as the machineId in heartbeats and the Realtime channel name. */
  name: string;
  /** Company UUID — derived from authenticated user's JWT claim. */
  company_id: string;
  slots: SlotConfig;
  supabase: SupabaseConfig;
  /** Auth credentials from ~/.zazigv2/credentials.json */
  auth: AuthCredentials;
}

const CONFIG_PATH = join(homedir(), ".zazigv2", "machine.yaml");
const CREDENTIALS_PATH = join(homedir(), ".zazigv2", "credentials.json");

interface StoredCredentials {
  supabaseUrl: string;
  anonKey: string;
  refreshToken: string;
  accessToken: string;
  userId: string;
  companyId: string;
}

function loadStoredCredentials(): StoredCredentials {
  try {
    const raw = readFileSync(CREDENTIALS_PATH, "utf-8");
    const parsed = JSON.parse(raw) as Partial<StoredCredentials>;
    if (!parsed.supabaseUrl || !parsed.anonKey || !parsed.refreshToken || !parsed.accessToken || !parsed.userId || !parsed.companyId) {
      throw new Error("Incomplete credentials.");
    }
    return parsed as StoredCredentials;
  } catch {
    throw new Error(
      `Failed to read credentials from ${CREDENTIALS_PATH}. Run 'zazig login' first.`
    );
  }
}

export function loadConfig(): MachineConfig {
  // Load credentials first — provides auth and company_id
  const creds = loadStoredCredentials();

  let raw: string;
  try {
    raw = readFileSync(CONFIG_PATH, "utf-8");
  } catch (err) {
    throw new Error(
      `Failed to read machine config from ${CONFIG_PATH}: ${(err as NodeJS.ErrnoException).message}. ` +
        "Run 'zazig login' to configure this machine."
    );
  }

  const parsed = parseYaml(raw) as Record<string, unknown>;

  if (!parsed.name || typeof parsed.name !== "string") {
    throw new Error("machine.yaml: missing or invalid 'name' field");
  }

  const slotsRaw = parsed.slots as Partial<SlotConfig> | undefined;
  const slots: SlotConfig = {
    claude_code: slotsRaw?.claude_code ?? 1,
    codex: slotsRaw?.codex ?? 0,
  };

  // Supabase URL: prefer env var, fall back to credentials, then config file
  const supabaseUrl =
    process.env["SUPABASE_URL"] ?? creds.supabaseUrl ??
    (parsed.supabase as Record<string, unknown> | undefined)?.url;
  if (!supabaseUrl || typeof supabaseUrl !== "string") {
    throw new Error(
      "Supabase URL not configured. Set SUPABASE_URL env var or run 'zazig login'."
    );
  }

  // Anon key: prefer env var, fall back to credentials
  const anonKey = process.env["SUPABASE_ANON_KEY"] ?? creds.anonKey;
  if (!anonKey) {
    throw new Error(
      "Supabase anon key not configured. Set SUPABASE_ANON_KEY env var or run 'zazig login'."
    );
  }

  // company_id comes from credentials (JWT claim), not machine.yaml
  const companyId = creds.companyId;

  return {
    name: parsed.name,
    company_id: companyId,
    slots,
    supabase: {
      url: supabaseUrl,
      anon_key: anonKey,
    },
    auth: {
      refreshToken: creds.refreshToken,
      accessToken: creds.accessToken,
      userId: creds.userId,
      companyId: creds.companyId,
    },
  };
}
