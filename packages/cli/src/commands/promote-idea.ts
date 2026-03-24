import { getValidCredentials } from "../lib/credentials.js";
import { DEFAULT_SUPABASE_ANON_KEY } from "../lib/constants.js";
import { loadConfig } from "../lib/config.js";

const VALID_TO = new Set(["feature", "job", "research", "capability"]);

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

function fail(error: string): never {
  process.stderr.write(JSON.stringify({ error }));
  process.exit(1);
}

export async function promoteIdea(args: string[]): Promise<void> {
  const company_id = parseStringFlag(args, "company");
  if (!company_id) fail("Missing required flag: --company <uuid>");

  const idea_id = parseStringFlag(args, "id");
  if (!idea_id) fail("Missing required flag: --id");

  const promote_to = parseStringFlag(args, "to");
  if (!promote_to) fail("Missing required flag: --to (feature|job|research|capability)");
  if (!VALID_TO.has(promote_to)) {
    fail("Invalid --to. Expected one of: feature, job, research, capability");
  }

  const project_id = parseStringFlag(args, "project-id");
  if ((promote_to === "feature" || promote_to === "job") && !project_id) {
    fail("--project-id is required when --to is feature or job");
  }

  const title = parseStringFlag(args, "title");

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
    idea_id,
    promote_to,
    ...(project_id !== undefined ? { project_id } : {}),
    ...(title !== undefined ? { title } : {}),
  };

  const response = await fetch(`${supabaseUrl}/functions/v1/promote-idea`, {
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
