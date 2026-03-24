import { getValidCredentials } from "../lib/credentials.js";
import { DEFAULT_SUPABASE_ANON_KEY } from "../lib/constants.js";
import { loadConfig } from "../lib/config.js";

const VALID_STATUS = new Set([
  "new",
  "triaging",
  "triaged",
  "developing",
  "specced",
  "workshop",
  "hardening",
  "parked",
  "rejected",
  "done",
]);
const VALID_PRIORITY = new Set(["low", "medium", "high", "urgent"]);
const VALID_TRIAGE_ROUTE = new Set(["promote", "develop", "workshop", "harden", "park", "reject", "founder-review"]);
const VALID_COMPLEXITY = new Set(["simple", "medium", "complex"]);

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

function parseCommaSeparatedFlag(args: string[], name: string): string[] | undefined {
  const value = parseStringFlag(args, name);
  if (value === undefined) return undefined;
  return value
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

function fail(error: string): never {
  process.stderr.write(JSON.stringify({ error }));
  process.exit(1);
}

export async function updateIdea(args: string[]): Promise<void> {
  const company_id = parseStringFlag(args, "company");
  if (!company_id) fail("Missing required flag: --company <uuid>");

  const idea_id = parseStringFlag(args, "id");
  if (!idea_id) fail("Missing required flag: --id");

  const title = parseStringFlag(args, "title");
  const description = parseStringFlag(args, "description");
  const status = parseStringFlag(args, "status");
  const priority = parseStringFlag(args, "priority");
  const triage_notes = parseStringFlag(args, "triage-notes");
  const triage_route = parseStringFlag(args, "triage-route");
  const spec = parseStringFlag(args, "spec");
  const tags = parseCommaSeparatedFlag(args, "tags");
  const complexity = parseStringFlag(args, "complexity");
  const project_id = parseStringFlag(args, "project-id");
  const raw_text = parseStringFlag(args, "raw-text");

  if (status !== undefined && !VALID_STATUS.has(status)) {
    fail("Invalid --status. Expected one of: new, triaging, triaged, developing, specced, workshop, hardening, parked, rejected, done");
  }
  if (priority !== undefined && !VALID_PRIORITY.has(priority)) {
    fail("Invalid --priority. Expected one of: low, medium, high, urgent");
  }
  if (triage_route !== undefined && !VALID_TRIAGE_ROUTE.has(triage_route)) {
    fail("Invalid --triage-route. Expected one of: promote, develop, workshop, harden, park, reject, founder-review");
  }
  if (complexity !== undefined && !VALID_COMPLEXITY.has(complexity)) {
    fail("Invalid --complexity. Expected one of: simple, medium, complex");
  }

  const updates = {
    ...(raw_text !== undefined ? { raw_text } : {}),
    ...(title !== undefined ? { title } : {}),
    ...(description !== undefined ? { description } : {}),
    ...(status !== undefined ? { status } : {}),
    ...(priority !== undefined ? { priority } : {}),
    ...(triage_notes !== undefined ? { triage_notes } : {}),
    ...(triage_route !== undefined ? { triage_route } : {}),
    ...(spec !== undefined ? { spec } : {}),
    ...(tags !== undefined ? { tags } : {}),
    ...(complexity !== undefined ? { complexity } : {}),
    ...(project_id !== undefined ? { project_id } : {}),
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
    idea_id,
    ...updates,
  };

  const response = await fetch(`${supabaseUrl}/functions/v1/update-idea`, {
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
