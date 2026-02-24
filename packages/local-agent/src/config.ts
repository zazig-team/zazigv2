/**
 * config.ts — Machine configuration for the local agent.
 *
 * Reads from (in priority order):
 *  1. Environment variables set by `zazig start` (ZAZIG_MACHINE_NAME, ZAZIG_SLOTS_*)
 *  2. ~/.zazigv2/config.json (written by `zazig start` on first run)
 *
 * Supabase credentials come from SUPABASE_URL and SUPABASE_ACCESS_TOKEN env vars
 * (set by `zazig start`), plus SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY
 * from the environment (set by Doppler or manually).
 */

import { readFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { DEFAULT_SUPABASE_URL, DEFAULT_SUPABASE_ANON_KEY } from "@zazigv2/shared";

export interface SlotConfig {
  claude_code: number;
  codex: number;
}

export interface SupabaseConfig {
  url: string;
  anon_key: string;
  service_role_key?: string;
  access_token?: string;
  refresh_token?: string;
}

export interface MachineConfig {
  /** Stable machine identifier — used as machineId in heartbeats and Realtime channel name. */
  name: string;
  /** Primary company UUID — optional hint. Agent discovers all companies from user_companies table. */
  company_id?: string;
  slots: SlotConfig;
  supabase: SupabaseConfig;
}

const CONFIG_PATH = join(homedir(), ".zazigv2", "config.json");

export function loadConfig(): MachineConfig {
  // Try env vars first (set by `zazig start`)
  const nameFromEnv = process.env["ZAZIG_MACHINE_NAME"];
  const claudeFromEnv = process.env["ZAZIG_SLOTS_CLAUDE_CODE"];
  const codexFromEnv  = process.env["ZAZIG_SLOTS_CODEX"];

  // Fall back to config.json if env vars not set
  let name: string;
  let slots: SlotConfig;

  if (nameFromEnv) {
    name  = nameFromEnv;
    slots = {
      claude_code: parseInt(claudeFromEnv ?? "4", 10) || 4,
      codex:       parseInt(codexFromEnv  ?? "4", 10) || 4,
    };
  } else if (existsSync(CONFIG_PATH)) {
    const raw    = readFileSync(CONFIG_PATH, "utf-8");
    const parsed = JSON.parse(raw) as Partial<MachineConfig>;
    if (!parsed.name || typeof parsed.name !== "string") {
      throw new Error("config.json: missing or invalid 'name' field");
    }
    name  = parsed.name;
    slots = {
      claude_code: parsed.slots?.claude_code ?? 4,
      codex:       parsed.slots?.codex       ?? 4,
    };
  } else {
    throw new Error(
      `No machine config found at ${CONFIG_PATH}. Run 'zazig start' to configure.`
    );
  }

  // Supabase config — env vars with embedded defaults
  const supabaseUrl = process.env["SUPABASE_URL"] ?? DEFAULT_SUPABASE_URL;
  const anonKey = process.env["SUPABASE_ANON_KEY"] ?? DEFAULT_SUPABASE_ANON_KEY;

  const serviceRoleKey = process.env["SUPABASE_SERVICE_ROLE_KEY"];
  const accessToken    = process.env["SUPABASE_ACCESS_TOKEN"];
  const refreshToken   = process.env["SUPABASE_REFRESH_TOKEN"];

  return {
    name,
    slots,
    supabase: {
      url: supabaseUrl,
      anon_key: anonKey,
      ...(serviceRoleKey ? { service_role_key: serviceRoleKey } : {}),
      ...(accessToken    ? { access_token: accessToken }        : {}),
      ...(refreshToken   ? { refresh_token: refreshToken }      : {}),
    },
  };
}
