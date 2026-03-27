import { getValidCredentials } from "../lib/credentials.js";
import { DEFAULT_SUPABASE_ANON_KEY } from "../lib/constants.js";
import { loadConfig } from "../lib/config.js";

const VALID_PRIORITY = new Set(["low", "medium", "high"]);
const UUID_V4ISH_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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

function isUuid(value: string): boolean {
  return UUID_V4ISH_REGEX.test(value);
}

function printHelp(): void {
  const help = `Usage: zazig create-feature --company <uuid> --title <string> --description <string> --spec <string> --acceptance-tests <string> --priority <low|medium|high> [options]

Flags:
  --company <uuid>              Company ID (required)
  --title <string>              Feature title (required)
  --description <string>        Feature description (required)
  --spec <string>               Implementation spec (required)
  --acceptance-tests <string>   Gherkin acceptance criteria (required)
  --priority <low|medium|high>  Priority level (required)
  --project-id <uuid>           Project ID (optional)
  --depends-on <uuid>           Parent feature ID dependency (optional)
  --human-checklist <string>    Human checklist items (optional)
  --fast-track <true|false>     Skip breakdown and fast-track the feature (optional)

Example:
  zazig create-feature --company <uuid> --title "Add login page" --description "OAuth login flow" --spec "Build a login page with..." --acceptance-tests "Given...When...Then..." --priority high`;
  console.log(help);
  process.exit(0);
}

export async function createFeature(args: string[]): Promise<void> {
  if (args.includes("--help") || args.includes("-h")) {
    printHelp();
  }

  const company_id = parseStringFlag(args, "company");
  if (!company_id) fail("Missing required flag: --company <uuid>");

  const title = parseStringFlag(args, "title");
  const description = parseStringFlag(args, "description");
  const spec = parseStringFlag(args, "spec");
  const acceptance_tests = parseStringFlag(args, "acceptance-tests");
  const priority = parseStringFlag(args, "priority");
  const project_id = parseStringFlag(args, "project-id");
  const depends_on = parseStringFlag(args, "depends-on");
  const human_checklist = parseStringFlag(args, "human-checklist");
  const fast_track = parseBooleanFlag(args, "fast-track");

  if (!title) fail("Missing required flag: --title");
  if (!description) fail("Missing required flag: --description");
  if (!spec) fail("Missing required flag: --spec");
  if (!acceptance_tests) fail("Missing required flag: --acceptance-tests");
  if (!priority) fail("Missing required flag: --priority (low|medium|high)");
  if (!VALID_PRIORITY.has(priority)) fail("Invalid --priority. Expected one of: low, medium, high");
  if (depends_on !== undefined && !isUuid(depends_on)) {
    fail("Invalid --depends-on. Expected UUID");
  }
  if (args.some((a) => a.startsWith("--fast-track")) && fast_track === undefined) {
    fail("Invalid --fast-track. Expected boolean: true or false");
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
    title,
    description,
    spec,
    acceptance_tests,
    priority,
    ...(project_id !== undefined ? { project_id } : {}),
    ...(depends_on !== undefined ? { depends_on } : {}),
    ...(human_checklist !== undefined ? { human_checklist } : {}),
    ...(fast_track !== undefined ? { fast_track } : {}),
  };

  const response = await fetch(`${supabaseUrl}/functions/v1/create-feature`, {
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
