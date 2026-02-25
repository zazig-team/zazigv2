/**
 * zazigv2 — Telegram Bot Edge Function (inbound webhook)
 *
 * Receives Telegram webhook updates, filters by allowed users,
 * and captures text messages as ideas in the ideas table.
 *
 * Deploy with: --no-verify-jwt (Telegram doesn't send JWTs)
 *
 * Runtime: Deno / Supabase Edge Functions
 *
 * Required environment variables:
 *   TELEGRAM_BOT_TOKEN      — Bot token from BotFather
 *   SUPABASE_URL            — Auto-injected by Supabase
 *   SUPABASE_SERVICE_ROLE_KEY — Auto-injected by Supabase
 *   TELEGRAM_ALLOWED_USERS  — Comma-separated Telegram user IDs
 */

import { createClient } from "@supabase/supabase-js";

// ---------------------------------------------------------------------------
// Environment
// ---------------------------------------------------------------------------

const TELEGRAM_BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const TELEGRAM_ALLOWED_USERS_RAW = Deno.env.get("TELEGRAM_ALLOWED_USERS") ?? "";

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("Missing required environment variables: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY");
}

const ALLOWED_USER_IDS = new Set(
  TELEGRAM_ALLOWED_USERS_RAW.split(",").map((s) => s.trim()).filter(Boolean),
);

// ---------------------------------------------------------------------------
// Telegram types (minimal)
// ---------------------------------------------------------------------------

interface TelegramUser {
  id: number;
  first_name?: string;
  username?: string;
}

interface TelegramMessage {
  message_id: number;
  from?: TelegramUser;
  chat: { id: number };
  text?: string;
  date: number;
}

interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
}

// ---------------------------------------------------------------------------
// Telegram API helper
// ---------------------------------------------------------------------------

async function sendMessage(chatId: number, text: string): Promise<void> {
  if (!TELEGRAM_BOT_TOKEN) {
    console.error("[telegram-bot] TELEGRAM_BOT_TOKEN not set — cannot send message");
    return;
  }
  try {
    const res = await fetch(
      `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: chatId, text }),
      },
    );
    if (!res.ok) {
      const body = await res.text();
      console.error(`[telegram-bot] sendMessage failed: ${res.status} ${body}`);
    }
  } catch (err) {
    console.error("[telegram-bot] sendMessage error:", err);
  }
}

// ---------------------------------------------------------------------------
// Supabase client
// ---------------------------------------------------------------------------

function makeAdminClient() {
  return createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  let update: TelegramUpdate;
  try {
    update = await req.json() as TelegramUpdate;
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const message = update.message;
  if (!message) {
    // Non-message update (e.g. inline query) — acknowledge and ignore
    return new Response(JSON.stringify({ ok: true }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  const chatId = message.chat.id;
  const userId = message.from?.id;
  const text = message.text?.trim() ?? "";

  // Authorization: only process messages from allowed users
  if (ALLOWED_USER_IDS.size > 0 && userId !== undefined) {
    if (!ALLOWED_USER_IDS.has(String(userId))) {
      console.log(`[telegram-bot] Unauthorized user ${userId} — ignoring`);
      return new Response(JSON.stringify({ ok: true }), {
        headers: { "Content-Type": "application/json" },
      });
    }
  }

  // /start command → welcome message
  if (text === "/start") {
    await sendMessage(
      chatId,
      "Welcome to Zazig Idea Capture!\n\nSend me any text and I'll save it as an idea. That's it.",
    );
    return new Response(JSON.stringify({ ok: true }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  // Empty text (e.g. sticker, photo, etc.) — ignore silently
  if (!text) {
    return new Response(JSON.stringify({ ok: true }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  // Save idea to database
  const supabase = makeAdminClient();
  const { error } = await supabase.from("ideas").insert({
    text,
    source: "telegram",
    metadata: {
      telegram_user_id: userId,
      telegram_username: message.from?.username ?? null,
      telegram_chat_id: chatId,
      telegram_message_id: message.message_id,
    },
  });

  if (error) {
    console.error("[telegram-bot] Failed to insert idea:", error.message);
    await sendMessage(chatId, "Sorry, failed to save your idea. Please try again.");
    return new Response(JSON.stringify({ ok: true }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  console.log(`[telegram-bot] Captured idea from user ${userId}: ${text.slice(0, 60)}`);
  await sendMessage(chatId, "Captured.");

  return new Response(JSON.stringify({ ok: true }), {
    headers: { "Content-Type": "application/json" },
  });
});
