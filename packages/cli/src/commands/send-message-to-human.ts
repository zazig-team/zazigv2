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
  process.stderr.write(`${error}\n`);
  process.exit(1);
}

function printHelp(): void {
  const help = `Usage: zazig send-message-to-human --company <uuid> --text <string> [options]

Flags:
  --company <uuid>            Company ID (required)
  --text <string>             Message text (required)
  --conversation-id <string>  Conversation identifier (optional; defaults to company default Slack channel)
  --job-id <string>           Job ID for threading context (optional; overrides ZAZIG_JOB_ID)
  --help                      Show this help message

Example:
  zazig send-message-to-human --company <uuid> --text "Need QA signoff" --job-id <job-id>`;

  console.log(help);
  process.exit(0);
}

export async function sendMessageToHuman(args: string[]): Promise<void> {
  if (args.includes("--help") || args.includes("-h")) {
    printHelp();
  }

  const companyId = parseStringFlag(args, "company");
  const text = parseStringFlag(args, "text");
  const conversationId = parseStringFlag(args, "conversation-id");
  const jobId = parseStringFlag(args, "job-id") ?? process.env["ZAZIG_JOB_ID"];

  if (!companyId) fail("Usage: zazig send-message-to-human --company <company-id> --text <message>");
  if (!text) fail("Missing required flag: --text <string>");

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
    text,
    ...(conversationId !== undefined ? { conversationId } : {}),
    ...(jobId !== undefined ? { jobId } : {}),
  };

  let response: Response;
  try {
    response = await fetch(`${supabaseUrl}/functions/v1/agent-message`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${creds.accessToken}`,
        apikey: DEFAULT_SUPABASE_ANON_KEY,
        "Content-Type": "application/json",
        "x-company-id": companyId,
      },
      body: JSON.stringify(body),
    });
  } catch (error) {
    fail(`Network error: ${String(error)}`);
  }

  if (!response.ok) {
    const errorBody = await response.text().catch(() => "unknown error");
    fail(`HTTP ${response.status}: ${errorBody}`);
  }

  process.stdout.write("Message sent successfully.\n");
  process.exit(0);
}
