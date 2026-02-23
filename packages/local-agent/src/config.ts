/**
 * config.ts — Machine configuration reader
 *
 * Reads ~/.zazigv2/machine.yaml and merges with environment variables.
 * The anon key is always sourced from SUPABASE_ANON_KEY env var (never hardcoded).
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
  /** Service-role key for direct DB writes. Bypasses RLS. Loaded from SUPABASE_SERVICE_ROLE_KEY env var. */
  service_role_key?: string;
  /** User access token from OAuth login. Used for authenticated DB writes (respects RLS). Loaded from SUPABASE_ACCESS_TOKEN env var. */
  access_token?: string;
}

export interface MachineConfig {
  /** Stable machine identifier — used as the machineId in heartbeats and the Realtime channel name. */
  name: string;
  /** Company UUID — tenant boundary. Used to scope DB writes to the correct company. */
  company_id: string;
  slots: SlotConfig;
  supabase: SupabaseConfig;
}

const CONFIG_PATH = join(homedir(), ".zazigv2", "machine.yaml");

export function loadConfig(): MachineConfig {
  let raw: string;
  try {
    raw = readFileSync(CONFIG_PATH, "utf-8");
  } catch (err) {
    throw new Error(
      `Failed to read machine config from ${CONFIG_PATH}: ${(err as NodeJS.ErrnoException).message}. ` +
        "Create ~/.zazigv2/machine.yaml to configure this machine."
    );
  }

  const parsed = parseYaml(raw) as Partial<MachineConfig>;

  if (!parsed.name || typeof parsed.name !== "string") {
    throw new Error("machine.yaml: missing or invalid 'name' field");
  }

  if (!parsed.company_id || typeof parsed.company_id !== "string") {
    throw new Error("machine.yaml: missing or invalid 'company_id' field");
  }

  const slots: SlotConfig = {
    claude_code: parsed.slots?.claude_code ?? 1,
    codex: parsed.slots?.codex ?? 0,
  };

  // Supabase URL: prefer env var, fall back to config file
  const supabaseUrl =
    process.env["SUPABASE_URL"] ?? parsed.supabase?.url;
  if (!supabaseUrl) {
    throw new Error(
      "Supabase URL not configured. Set SUPABASE_URL env var or provide supabase.url in machine.yaml"
    );
  }

  // Anon key: prefer env var, fall back to config file (anon key is public, safe to store in yaml)
  const anonKey = process.env["SUPABASE_ANON_KEY"] ?? parsed.supabase?.anon_key;
  if (!anonKey) {
    throw new Error(
      "Supabase anon key not configured. Set SUPABASE_ANON_KEY env var or provide supabase.anon_key in machine.yaml"
    );
  }

  // Service-role key: optional, from env var. Used for direct DB writes (bypasses RLS).
  const serviceRoleKey = process.env["SUPABASE_SERVICE_ROLE_KEY"];

  // Access token: from OAuth login, passed by CLI start command. Used for authenticated DB writes.
  const accessToken = process.env["SUPABASE_ACCESS_TOKEN"];

  return {
    name: parsed.name,
    company_id: parsed.company_id,
    slots,
    supabase: {
      url: supabaseUrl,
      anon_key: anonKey,
      ...(serviceRoleKey ? { service_role_key: serviceRoleKey } : {}),
      ...(accessToken ? { access_token: accessToken } : {}),
    },
  };
}
