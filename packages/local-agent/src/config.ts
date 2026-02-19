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
}

export interface MachineConfig {
  /** Stable machine identifier — used as the machineId in heartbeats and the Realtime channel name. */
  name: string;
  slots: SlotConfig;
  hosts_cpo: boolean;
  supabase: SupabaseConfig;
}

const CONFIG_PATH = join(homedir(), ".zazigv2", "machine.yaml");

function requireEnv(name: string): string {
  const val = process.env[name];
  if (!val) {
    throw new Error(`Required environment variable ${name} is not set`);
  }
  return val;
}

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

  // Anon key: always from env var — never hardcoded
  const anonKey = requireEnv("SUPABASE_ANON_KEY");

  return {
    name: parsed.name,
    slots,
    hosts_cpo: parsed.hosts_cpo ?? false,
    supabase: {
      url: supabaseUrl,
      anon_key: anonKey,
    },
  };
}
