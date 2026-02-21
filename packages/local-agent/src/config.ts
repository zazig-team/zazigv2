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
}

export interface CpoSlackConfig {
  /** CPO bot user OAuth token (xoxb-...). Loaded from CPO_SLACK_BOT_TOKEN env var. */
  bot_token: string;
  /** Socket Mode app-level token (xapp-...). Loaded from CPO_SLACK_APP_TOKEN env var. */
  app_token: string;
  /** Channel IDs the CPO listens to for @mentions. DMs are always accepted. */
  channels: string[];
}

export interface CpoConfig {
  enabled: boolean;
  slack: CpoSlackConfig;
}

export interface MachineConfig {
  /** Stable machine identifier — used as the machineId in heartbeats and the Realtime channel name. */
  name: string;
  /** Company UUID — tenant boundary. Used to scope DB writes to the correct company. */
  company_id: string;
  slots: SlotConfig;
  supabase: SupabaseConfig;
  /** Optional CPO Slack chat configuration. CPO spawning and chat routing only active when enabled. */
  cpo?: CpoConfig;
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

  // CPO config: optional section. Tokens always come from env vars (never yaml).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const parsedCpo = (parsed as any).cpo;
  let cpo: CpoConfig | undefined;
  if (parsedCpo?.enabled === true) {
    const botToken = process.env["CPO_SLACK_BOT_TOKEN"] ?? parsedCpo?.slack?.bot_token;
    const appToken = process.env["CPO_SLACK_APP_TOKEN"] ?? parsedCpo?.slack?.app_token;
    if (!botToken) {
      throw new Error("cpo.enabled=true but CPO_SLACK_BOT_TOKEN is not set");
    }
    if (!appToken) {
      throw new Error("cpo.enabled=true but CPO_SLACK_APP_TOKEN is not set");
    }
    cpo = {
      enabled: true,
      slack: {
        bot_token: botToken,
        app_token: appToken,
        channels: Array.isArray(parsedCpo?.slack?.channels) ? parsedCpo.slack.channels : [],
      },
    };
  }

  return {
    name: parsed.name,
    company_id: parsed.company_id,
    slots,
    supabase: {
      url: supabaseUrl,
      anon_key: anonKey,
      ...(serviceRoleKey ? { service_role_key: serviceRoleKey } : {}),
    },
    ...(cpo ? { cpo } : {}),
  };
}
