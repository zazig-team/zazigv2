/**
 * zazigv2 — Telegram Bot Webhook Handler
 *
 * Receives Telegram webhook updates and routes them to bot.ts handlers.
 * Implements the fire-and-forget pattern: returns 200 immediately and
 * processes the update asynchronously.
 *
 * Deploy with: --no-verify-jwt (public webhook endpoint)
 *
 * Runtime: Deno / Supabase Edge Functions
 */

import { createClient } from "@supabase/supabase-js";
import {
  type BotContext,
  type TelegramUpdate,
  handleCommand,
  handleText,
  handleVoice,
} from "./bot.ts";

// ---------------------------------------------------------------------------
// Environment
// ---------------------------------------------------------------------------

const TELEGRAM_BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN");
const TELEGRAM_ALLOWED_USERS = Deno.env.get("TELEGRAM_ALLOWED_USERS");
const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

// Optional: set this to the secret passed to Telegram's setWebhook call
const TELEGRAM_SECRET_TOKEN = Deno.env.get("TELEGRAM_SECRET_TOKEN");

if (!TELEGRAM_BOT_TOKEN || !OPENAI_API_KEY || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error(
    "Missing required env vars: TELEGRAM_BOT_TOKEN, OPENAI_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY",
  );
}

// ---------------------------------------------------------------------------
// Allowed-users set (TELEGRAM_ALLOWED_USERS is comma-separated Telegram IDs)
// An empty set means all users are allowed.
// ---------------------------------------------------------------------------

const allowedUserIds = new Set(
  (TELEGRAM_ALLOWED_USERS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSupabaseClient() {
  return createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });
}

function okResponse(): Response {
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

function errorResponse(message: string, status: number): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

// ---------------------------------------------------------------------------
// Update processing (async, runs after 200 is returned)
// ---------------------------------------------------------------------------

async function processUpdate(update: TelegramUpdate): Promise<void> {
  const message = update.message;

  // Ignore non-message updates (edited_message, channel_post, etc.)
  if (!message) {
    console.log(`[telegram-bot] Ignoring non-message update ${update.update_id}`);
    return;
  }

  const fromId = message.from?.id;
  const fromIdStr = fromId !== undefined ? String(fromId) : null;

  // User allowlist check — skip if allowedUserIds is populated and user not in it
  if (allowedUserIds.size > 0 && (!fromIdStr || !allowedUserIds.has(fromIdStr))) {
    console.warn(
      `[telegram-bot] Ignoring message from disallowed user: ${fromIdStr ?? "unknown"}`,
    );
    return;
  }

  const ctx: BotContext = {
    supabase: makeSupabaseClient(),
    token: TELEGRAM_BOT_TOKEN!,
    openaiKey: OPENAI_API_KEY!,
  };

  // Route by message type
  if (message.voice || message.audio) {
    await handleVoice(message, ctx);
  } else if (message.text?.startsWith("/")) {
    await handleCommand(message, ctx);
  } else if (message.text) {
    await handleText(message, ctx);
  } else {
    console.log(
      `[telegram-bot] Unhandled message content type in update ${update.update_id}`,
    );
  }
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method !== "POST") {
    return errorResponse("Method not allowed", 405);
  }

  // Validate X-Telegram-Bot-Api-Secret-Token header if a secret is configured
  if (TELEGRAM_SECRET_TOKEN) {
    const incoming = req.headers.get("X-Telegram-Bot-Api-Secret-Token");
    if (incoming !== TELEGRAM_SECRET_TOKEN) {
      console.warn("[telegram-bot] Invalid or missing secret token header");
      return errorResponse("Unauthorized", 401);
    }
  }

  // Parse the Telegram Update
  let update: TelegramUpdate;
  try {
    update = await req.json() as TelegramUpdate;
  } catch {
    return errorResponse("Invalid JSON", 400);
  }

  // Fire-and-forget: return 200 immediately, process asynchronously.
  // Telegram requires a response within 10 seconds or it will retry.
  const processingPromise = processUpdate(update).catch((err) => {
    console.error(
      `[telegram-bot] Unhandled error processing update ${update.update_id}:`,
      err,
    );
  });

  // Use EdgeRuntime.waitUntil if available (Supabase edge functions support this).
  // This ensures the background work completes even after the response is sent.
  try {
    // deno-lint-ignore no-explicit-any
    (globalThis as any).EdgeRuntime?.waitUntil(processingPromise);
  } catch {
    // EdgeRuntime not available — promise runs detached
  }

  return okResponse();
});
