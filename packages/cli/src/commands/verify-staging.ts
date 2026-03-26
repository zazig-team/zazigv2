import { createClient } from "@supabase/supabase-js";
import { getValidCredentials } from "../lib/credentials.js";
import { DEFAULT_SUPABASE_ANON_KEY } from "../lib/constants.js";

function parseStringFlag(args: string[], name: string): string | undefined {
  const eq = args.find((a) => a.startsWith(`--${name}=`));
  if (eq) {
    const value = eq.slice(`--${name}=`.length);
    return value.length > 0 ? value : undefined;
  }

  const idx = args.indexOf(`--${name}`);
  if (idx === -1) return undefined;
  const value = args[idx + 1];
  if (!value || value.startsWith("--")) return undefined;
  return value;
}

function hasFlag(args: string[], name: string): boolean {
  return args.includes(`--${name}`) || args.some((a) => a.startsWith(`--${name}=`));
}

function fail(error: string): never {
  process.stderr.write(JSON.stringify({ error }));
  process.exit(1);
}

function printHelp(): void {
  const help = `Usage: zazig verify-staging --company <uuid> --id <feature-uuid> --by <name>
       zazig verify-staging --company <uuid> --id <feature-uuid> --clear

Flags:
  --company <uuid>      Company ID (required)
  --id <uuid>           Feature ID (required)
  --by <name>           Verifier name (required unless --clear)
  --clear               Clear staging verification fields
  --help, -h            Show this help and exit

Examples:
  zazig verify-staging --company <uuid> --id <feature-uuid> --by chris
  zazig verify-staging --company <uuid> --id <feature-uuid> --clear`;
  console.log(help);
  process.exit(0);
}

export async function verifyStaging(args: string[]): Promise<void> {
  if (args.includes("--help") || args.includes("-h")) {
    printHelp();
  }

  const company_id = parseStringFlag(args, "company");
  if (!company_id) fail("Missing required flag: --company <uuid>");

  const feature_id = parseStringFlag(args, "id");
  if (!feature_id) fail("Missing required flag: --id <feature-uuid>");

  const clear = hasFlag(args, "clear");
  const by = parseStringFlag(args, "by")?.trim();

  if (clear && by) {
    fail("Invalid flags: --clear cannot be used with --by");
  }
  if (!clear && !by) {
    fail("Missing required flag: --by <name> (or use --clear)");
  }

  let creds;
  try {
    creds = await getValidCredentials();
  } catch {
    fail("Not logged in. Run zazig login");
  }

  const anonKey = process.env["SUPABASE_ANON_KEY"] ?? DEFAULT_SUPABASE_ANON_KEY;
  const supabase = createClient(creds.supabaseUrl, anonKey);
  const { error: sessionError } = await supabase.auth.setSession({
    access_token: creds.accessToken,
    refresh_token: creds.refreshToken,
  });
  if (sessionError) {
    fail(`Authentication failed: ${sessionError.message}`);
  }

  const updates = clear
    ? {
      staging_verified_by: null,
      staging_verified_at: null,
    }
    : {
      staging_verified_by: by!,
      staging_verified_at: new Date().toISOString(),
    };

  const { data, error } = await supabase
    .from("features")
    .update(updates)
    .eq("company_id", company_id)
    .eq("id", feature_id)
    .select("id, staging_verified_by, staging_verified_at")
    .single();

  if (error) {
    fail(error.message);
  }

  process.stdout.write(JSON.stringify(data));
  process.exit(0);
}
