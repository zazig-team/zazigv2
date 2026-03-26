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
  const help = `Usage: zazig send-message-to-human --company <uuid> --text <message> [--conversation-id <id>] [--job-id <uuid>]

Flags:
  --company <uuid>           Company ID (required)
  --text <message>           Message text to send to the human via Slack (required)
  --conversation-id <id>     Slack conversation/channel ID for threaded replies (optional)
  --job-id <uuid>            Job ID for threading context (optional)

Example:
  zazig send-message-to-human --company <uuid> --text "Build complete, ready for review"
  zazig send-message-to-human --company <uuid> --text "Blocked on credentials" --conversation-id C012AB3CD --job-id <uuid>`;
  console.log(help);
  process.exit(0);
}

export async function sendMessageToHuman(args: string[]): Promise<void> {
  if (args.includes("--help") || args.includes("-h")) {
    printHelp();
  }

  const company_id = parseStringFlag(args, "company");
  if (!company_id) fail("Missing required flag: --company <uuid>");

  const text = parseStringFlag(args, "text");
  if (!text) fail("Missing required flag: --text <message>");

  const conversationId = parseStringFlag(args, "conversation-id");
  const jobId = parseStringFlag(args, "job-id");

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

  const body: Record<string, string> = { text };
  if (conversationId) body.conversationId = conversationId;
  if (jobId) body.jobId = jobId;

  const response = await fetch(`${supabaseUrl}/functions/v1/agent-message`, {
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
    process.stderr.write(JSON.stringify({ error: `HTTP ${response.status}: ${errorBody}` }));
    process.exit(1);
  }

  const data = await response.json();
  process.stdout.write(JSON.stringify(data));
  process.exit(0);
}
