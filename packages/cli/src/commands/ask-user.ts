import { getValidCredentials } from "../lib/credentials.js";
import { DEFAULT_SUPABASE_ANON_KEY } from "../lib/constants.js";
import { loadConfig } from "../lib/config.js";

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

function printHelp(): void {
  const help = `Usage: zazig ask-user --company <uuid> --idea-id <uuid> --question <string> [options]

Flags:
  --company <uuid>     Company ID (required)
  --idea-id <uuid>     Idea ID (required)
  --question <string>  Question to ask the user (required)
  --job-id <string>    Job ID for threading context (optional; overrides ZAZIG_JOB_ID)
  --help               Show this help message

Inserts a message into the idea's message thread with sender='job'.
The local agent daemon listens for user replies via Realtime.

Example:
  zazig ask-user --company <uuid> --idea-id <uuid> --question "Which pages should this apply to?"`;

  console.log(help);
  process.exit(0);
}

export async function askUser(args: string[]): Promise<void> {
  if (args.includes("--help") || args.includes("-h")) {
    printHelp();
  }

  const companyId = parseStringFlag(args, "company");
  const ideaId = parseStringFlag(args, "idea-id");
  const question = parseStringFlag(args, "question");
  const jobId = parseStringFlag(args, "job-id") ?? process.env["ZAZIG_JOB_ID"];

  if (!companyId) fail("Missing required flag: --company <uuid>");
  if (!ideaId) fail("Missing required flag: --idea-id <uuid>");
  if (!question) fail("Missing required flag: --question <string>");

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

  // Insert directly into idea_messages via PostgREST
  const response = await fetch(`${supabaseUrl}/rest/v1/idea_messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${creds.accessToken}`,
      apikey: DEFAULT_SUPABASE_ANON_KEY,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify({
      idea_id: ideaId,
      job_id: jobId ?? null,
      sender: "job",
      content: question,
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => "unknown error");
    fail(`HTTP ${response.status}: ${errorBody}`);
  }

  const data = await response.json();
  process.stdout.write(JSON.stringify(data));
  process.exit(0);
}
