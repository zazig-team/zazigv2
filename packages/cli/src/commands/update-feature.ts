import { getValidCredentials } from "../lib/credentials.js";
import { DEFAULT_SUPABASE_ANON_KEY } from "../lib/constants.js";
import { loadConfig } from "../lib/config.js";

const VALID_PRIORITY = new Set(["low", "medium", "high"]);
const VALID_STATUS = new Set(["breaking_down", "complete", "cancelled"]);

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

function parseBooleanFlag(args: string[], name: string): boolean | undefined {
  const eq = args.find((a) => a.startsWith(`--${name}=`));
  if (eq) {
    const value = eq.slice(`--${name}=`.length).trim().toLowerCase();
    if (value === "true") return true;
    if (value === "false") return false;
    return undefined;
  }

  const idx = args.indexOf(`--${name}`);
  if (idx === -1) return undefined;
  const value = args[idx + 1];
  if (!value || value.startsWith("--")) return true;
  const normalized = value.trim().toLowerCase();
  if (normalized === "true") return true;
  if (normalized === "false") return false;
  return undefined;
}

function fail(error: string): never {
  process.stderr.write(JSON.stringify({ error }));
  process.exit(1);
}

function printHelp(): void {
  const help = `Usage: zazig update-feature --company <uuid> --id <uuid> [fields to update]

Flags:
  --company <uuid>                                    Company ID (required)
  --id <uuid>                                         Feature ID (required)
  --title <string>                                    Feature title (optional)
  --description <string>                              Feature description (optional)
  --spec <string>                                     Implementation spec (optional)
  --acceptance-tests <string>                         Acceptance criteria (optional)
  --human-checklist <string>                          Human checklist items (optional)
  --priority <low|medium|high>                        Priority level (optional)
  --status <breaking_down|complete|cancelled>         Feature status (optional)
  --fast-track <true|false>                           Fast-track flag (optional)

At least one mutable field must be provided.

Example:
  zazig update-feature --company <uuid> --id <uuid> --status complete --priority high`;
  console.log(help);
  process.exit(0);
}

export async function updateFeature(args: string[]): Promise<void> {
  if (args.includes("--help") || args.includes("-h")) {
    printHelp();
  }

  const company_id = parseStringFlag(args, "company");
  if (!company_id) fail("Missing required flag: --company <uuid>");

  const feature_id = parseStringFlag(args, "id");
  if (!feature_id) fail("Missing required flag: --id");

  const title = parseStringFlag(args, "title");
  const description = parseStringFlag(args, "description");
  const spec = parseStringFlag(args, "spec");
  const acceptance_tests = parseStringFlag(args, "acceptance-tests");
  const human_checklist = parseStringFlag(args, "human-checklist");
  const priority = parseStringFlag(args, "priority");
  const status = parseStringFlag(args, "status");
  const fast_track = parseBooleanFlag(args, "fast-track");

  if (priority !== undefined && !VALID_PRIORITY.has(priority)) {
    fail("Invalid --priority. Expected one of: low, medium, high");
  }
  if (status !== undefined && !VALID_STATUS.has(status)) {
    fail("Invalid --status. Expected one of: breaking_down, complete, cancelled");
  }
  if (args.some((a) => a.startsWith("--fast-track")) && fast_track === undefined) {
    fail("Invalid --fast-track. Expected boolean: true or false");
  }

  const updates = {
    ...(title !== undefined ? { title } : {}),
    ...(description !== undefined ? { description } : {}),
    ...(spec !== undefined ? { spec } : {}),
    ...(acceptance_tests !== undefined ? { acceptance_tests } : {}),
    ...(human_checklist !== undefined ? { human_checklist } : {}),
    ...(priority !== undefined ? { priority } : {}),
    ...(status !== undefined ? { status } : {}),
    ...(fast_track !== undefined ? { fast_track } : {}),
  };
  if (Object.keys(updates).length === 0) {
    fail("No-op update: provide at least one mutable field to update");
  }

  let creds;
  try {
    creds = await getValidCredentials();
  } catch {
    fail("Not logged in. Run zazig login");
  }

  const config = (() => {
    try {
      return loadConfig() as { supabaseUrl?: string; supabase_url?: string };
    } catch {
      return undefined;
    }
  })();
  const supabaseUrl = config?.supabaseUrl ?? config?.supabase_url ?? creds.supabaseUrl;

  const body = {
    company_id,
    feature_id,
    ...updates,
  };

  const response = await fetch(`${supabaseUrl}/functions/v1/update-feature`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${creds.accessToken}`,
      apikey: DEFAULT_SUPABASE_ANON_KEY,
      "Content-Type": "application/json",
      "x-company-id": company_id,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => "unknown error");
    fail(`HTTP ${response.status}: ${errorBody}`);
  }

  const data = await response.json();
  process.stdout.write(JSON.stringify(data));
  process.exit(0);
}
