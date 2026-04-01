import { homedir } from "node:os";
import { join } from "node:path";

interface DaemonEnvBuildArgs {
  baseEnv?: NodeJS.ProcessEnv;
  creds: {
    accessToken: string;
    refreshToken?: string;
    supabaseUrl: string;
  };
  config: {
    name: string;
    slots?: {
      claude_code?: number;
      codex?: number;
    };
  };
  company: {
    id: string;
    name: string;
  };
  zazigEnv: string;
}

export function resolveZazigHome(zazigEnv: string): string {
  return zazigEnv === "staging"
    ? join(homedir(), ".zazigv2-staging")
    : join(homedir(), ".zazigv2");
}

export function buildDaemonEnv({
  baseEnv = process.env,
  creds,
  config,
  company,
  zazigEnv,
}: DaemonEnvBuildArgs): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {
    ...baseEnv,
    SUPABASE_ACCESS_TOKEN: creds.accessToken,
    SUPABASE_REFRESH_TOKEN: creds.refreshToken ?? "",
    SUPABASE_URL: creds.supabaseUrl,
    ZAZIG_MACHINE_NAME: config.name,
    ZAZIG_COMPANY_ID: company.id,
    ZAZIG_COMPANY_NAME: company.name,
    ZAZIG_SLOTS_CLAUDE_CODE: String(config.slots?.claude_code ?? 3),
    ZAZIG_SLOTS_CODEX: String(config.slots?.codex ?? 2),
    ZAZIG_ENV: zazigEnv,
    ZAZIG_HOME: resolveZazigHome(zazigEnv),
  };

  return env;
}
