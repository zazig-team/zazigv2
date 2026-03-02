/**
 * zazigv2 — Telegram Bot Handlers
 *
 * Handler functions for routing Telegram webhook updates.
 * Called by index.ts after parsing the incoming Update object.
 *
 * Runtime: Deno / Supabase Edge Functions
 */

import { type SupabaseClient } from "@supabase/supabase-js";

// ---------------------------------------------------------------------------
// Telegram API Types
// ---------------------------------------------------------------------------

export interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
  edited_message?: TelegramMessage;
}

export interface TelegramMessage {
  message_id: number;
  from?: TelegramUser;
  chat: TelegramChat;
  date: number;
  text?: string;
  voice?: TelegramVoice;
  audio?: TelegramAudio;
}

export interface TelegramUser {
  id: number;
  is_bot: boolean;
  first_name: string;
  username?: string;
}

export interface TelegramChat {
  id: number;
  type: string;
}

export interface TelegramVoice {
  file_id: string;
  file_unique_id: string;
  duration: number;
  mime_type?: string;
  file_size?: number;
}

export interface TelegramAudio {
  file_id: string;
  file_unique_id: string;
  duration: number;
  mime_type?: string;
  file_size?: number;
}

// ---------------------------------------------------------------------------
// Handler Context
// ---------------------------------------------------------------------------

export interface BotContext {
  supabase: SupabaseClient;
  token: string;
  openaiKey: string;
}

// ---------------------------------------------------------------------------
// Telegram API helpers
// ---------------------------------------------------------------------------

async function sendMessage(token: string, chatId: number, text: string): Promise<void> {
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text }),
    });
    if (!res.ok) {
      const err = await res.text();
      console.error(`[telegram-bot] sendMessage failed (${res.status}): ${err}`);
    }
  } catch (err) {
    console.error("[telegram-bot] sendMessage threw:", err);
  }
}

async function getFileDownloadUrl(token: string, fileId: string): Promise<string | null> {
  try {
    const res = await fetch(
      `https://api.telegram.org/bot${token}/getFile?file_id=${encodeURIComponent(fileId)}`,
    );
    if (!res.ok) return null;
    const json = await res.json() as { ok: boolean; result?: { file_path?: string } };
    if (!json.ok || !json.result?.file_path) return null;
    return `https://api.telegram.org/file/bot${token}/${json.result.file_path}`;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Company lookup via telegram_users table
// ---------------------------------------------------------------------------

async function lookupCompanyId(
  supabase: SupabaseClient,
  telegramUserId: number,
): Promise<string | null> {
  try {
    const { data, error } = await supabase
      .from("telegram_users")
      .select("company_id")
      .eq("telegram_user_id", String(telegramUserId))
      .eq("is_active", true)
      .limit(1)
      .single();
    if (error || !data) return null;
    return data.company_id as string;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Transcription via OpenAI Whisper
// ---------------------------------------------------------------------------

async function transcribeAudio(
  openaiKey: string,
  audioBytes: Uint8Array,
  mimeType: string,
): Promise<string | null> {
  try {
    const formData = new FormData();
    // Normalize into an ArrayBuffer-backed view for BlobPart typing/runtime safety.
    const normalizedAudio = new Uint8Array(audioBytes.byteLength);
    normalizedAudio.set(audioBytes);
    const blob = new Blob([normalizedAudio], { type: mimeType });
    formData.append("file", blob, "audio.ogg");
    formData.append("model", "whisper-1");

    const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${openaiKey}` },
      body: formData,
    });
    if (!res.ok) {
      const err = await res.text();
      console.error(`[telegram-bot] transcribeAudio failed (${res.status}): ${err}`);
      return null;
    }
    const json = await res.json() as { text?: string };
    return json.text ?? null;
  } catch (err) {
    console.error("[telegram-bot] transcribeAudio threw:", err);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Ideas table helpers (/status and /recent)
// ---------------------------------------------------------------------------

interface RecentIdeaRow {
  title: string | null;
  raw_text: string | null;
  created_at: string;
}

async function queryIdeasCountToday(
  supabase: SupabaseClient,
  companyId: string,
): Promise<number | null> {
  try {
    const start = new Date();
    start.setUTCHours(0, 0, 0, 0);

    const { count, error } = await supabase
      .from("ideas")
      .select("id", { count: "exact", head: true })
      .eq("company_id", companyId)
      .eq("source", "telegram")
      .gte("created_at", start.toISOString());

    if (error) {
      console.error("[telegram-bot] queryIdeasCountToday failed:", error.message);
      return null;
    }
    return count ?? 0;
  } catch (err) {
    console.error("[telegram-bot] queryIdeasCountToday threw:", err);
    return null;
  }
}

async function queryRecentIdeas(
  supabase: SupabaseClient,
  companyId: string,
): Promise<RecentIdeaRow[] | null> {
  try {
    const { data, error } = await supabase
      .from("ideas")
      .select("title,raw_text,created_at")
      .eq("company_id", companyId)
      .eq("source", "telegram")
      .order("created_at", { ascending: false })
      .limit(5);

    if (error) {
      console.error("[telegram-bot] queryRecentIdeas failed:", error.message);
      return null;
    }
    return (data ?? []) as RecentIdeaRow[];
  } catch (err) {
    console.error("[telegram-bot] queryRecentIdeas threw:", err);
    return null;
  }
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return text.slice(0, max - 3) + "...";
}

function formatUtcTimestamp(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toISOString().replace("T", " ").slice(0, 16) + " UTC";
}

// ---------------------------------------------------------------------------
// handleCommand — /start, /help, and unknown commands
// ---------------------------------------------------------------------------

export async function handleCommand(
  message: TelegramMessage,
  ctx: BotContext,
): Promise<void> {
  const chatId = message.chat.id;
  const text = message.text ?? "";
  const command = text.split(" ")[0].toLowerCase();

  console.log(`[telegram-bot] Command "${command}" from chat ${chatId}`);

  switch (command) {
    case "/start":
      await sendMessage(
        ctx.token,
        chatId,
        "Welcome to the Zazig Ideas Bot.\n\n" +
          "Send me a voice note or text message to capture an idea into your inbox. " +
          "Voice notes are transcribed automatically.\n\n" +
          "Type /help for more info.",
      );
      break;

    case "/help":
      await sendMessage(
        ctx.token,
        chatId,
        "Zazig Ideas Bot\n\n" +
          "• Voice note → transcribed and saved as an idea\n" +
          "• Text message → saved directly as an idea\n" +
          "• Your CPO will triage ideas during the next session\n\n" +
          "Commands:\n" +
          "/start – Welcome message\n" +
          "/help – This message\n" +
          "/status – Count of Telegram ideas captured today\n" +
          "/recent – Last 5 Telegram ideas",
      );
      break;

    case "/status": {
      const fromId = message.from?.id;
      if (!fromId) {
        await sendMessage(
          ctx.token,
          chatId,
          "I could not identify your Telegram user ID for /status.",
        );
        break;
      }

      const companyId = await lookupCompanyId(ctx.supabase, fromId);
      if (!companyId) {
        await sendMessage(
          ctx.token,
          chatId,
          "You are not registered with a Zazig company. Please contact your administrator.",
        );
        break;
      }

      const count = await queryIdeasCountToday(ctx.supabase, companyId);
      if (count === null) {
        await sendMessage(
          ctx.token,
          chatId,
          "I could not fetch status right now. Please try again.",
        );
        break;
      }

      await sendMessage(
        ctx.token,
        chatId,
        `Connected. ${count} Telegram ideas captured today.`,
      );
      break;
    }

    case "/recent": {
      const fromId = message.from?.id;
      if (!fromId) {
        await sendMessage(
          ctx.token,
          chatId,
          "I could not identify your Telegram user ID for /recent.",
        );
        break;
      }

      const companyId = await lookupCompanyId(ctx.supabase, fromId);
      if (!companyId) {
        await sendMessage(
          ctx.token,
          chatId,
          "You are not registered with a Zazig company. Please contact your administrator.",
        );
        break;
      }

      const ideas = await queryRecentIdeas(ctx.supabase, companyId);
      if (ideas === null) {
        await sendMessage(
          ctx.token,
          chatId,
          "I could not fetch recent ideas right now. Please try again.",
        );
        break;
      }

      if (ideas.length === 0) {
        await sendMessage(
          ctx.token,
          chatId,
          "No recent Telegram ideas for your company yet.",
        );
        break;
      }

      const lines = ideas.map((idea, idx) => {
        const raw = (idea.raw_text ?? "").replace(/\s+/g, " ").trim();
        const label = (idea.title ?? "").trim() || (raw ? truncate(raw, 60) : "(empty)");
        return `${idx + 1}. ${label} — ${formatUtcTimestamp(idea.created_at)}`;
      });

      await sendMessage(
        ctx.token,
        chatId,
        `Recent Telegram ideas:\n${lines.join("\n")}`,
      );
      break;
    }

    default:
      await sendMessage(
        ctx.token,
        chatId,
        `Unknown command: ${command}. Type /help for available commands.`,
      );
  }
}

// ---------------------------------------------------------------------------
// handleVoice — download audio, transcribe, save idea
// ---------------------------------------------------------------------------

export async function handleVoice(
  message: TelegramMessage,
  ctx: BotContext,
): Promise<void> {
  const chatId = message.chat.id;
  const fromId = message.from?.id;
  const messageId = message.message_id;

  if (!fromId) {
    console.warn("[telegram-bot] handleVoice: missing from.id");
    return;
  }

  const voice = message.voice ?? message.audio;
  if (!voice) {
    console.warn("[telegram-bot] handleVoice: no voice/audio on message");
    return;
  }

  const companyId = await lookupCompanyId(ctx.supabase, fromId);
  if (!companyId) {
    await sendMessage(
      ctx.token,
      chatId,
      "You are not registered with a Zazig company. Please contact your administrator.",
    );
    return;
  }

  await sendMessage(ctx.token, chatId, "Got it. Transcribing your voice note...");

  // Download audio from Telegram
  const fileUrl = await getFileDownloadUrl(ctx.token, voice.file_id);
  if (!fileUrl) {
    console.error(
      `[telegram-bot] handleVoice: could not resolve file URL for file_id=${voice.file_id}`,
    );
    await sendMessage(
      ctx.token,
      chatId,
      "Sorry, I could not download your voice note. Please try again.",
    );
    return;
  }

  const audioRes = await fetch(fileUrl);
  if (!audioRes.ok) {
    console.error(
      `[telegram-bot] handleVoice: audio download failed (${audioRes.status})`,
    );
    await sendMessage(
      ctx.token,
      chatId,
      "Sorry, I could not download your voice note. Please try again.",
    );
    return;
  }

  const audioBytes = new Uint8Array(await audioRes.arrayBuffer());
  const mimeType = voice.mime_type ?? "audio/ogg";

  // Transcribe via Whisper
  const transcript = await transcribeAudio(ctx.openaiKey, audioBytes, mimeType);
  if (!transcript) {
    await sendMessage(
      ctx.token,
      chatId,
      "Sorry, I could not transcribe your voice note. Try sending the key points as text instead.",
    );
    return;
  }

  // Save to ideas table
  const sourceRef = `telegram:${chatId}:${messageId}`;
  const { error } = await ctx.supabase.from("ideas").insert({
    company_id: companyId,
    raw_text: transcript,
    source: "telegram",
    originator: "human",
    source_ref: sourceRef,
    status: "new",
  });

  if (error) {
    if (error.code === "23505") {
      // Unique constraint — duplicate delivery, already processed
      console.log(`[telegram-bot] handleVoice: duplicate ignored for ${sourceRef}`);
      return;
    }
    console.error(
      `[telegram-bot] handleVoice: ideas insert failed for ${sourceRef}:`,
      error.message,
    );
    await sendMessage(
      ctx.token,
      chatId,
      "Sorry, I could not save your idea. Please try again.",
    );
    return;
  }

  const durationNote = voice.duration ? ` (${voice.duration}s)` : "";
  const preview = transcript.length > 200
    ? transcript.slice(0, 200) + "..."
    : transcript;

  await sendMessage(
    ctx.token,
    chatId,
    `Got it. Captured your voice note${durationNote} as an idea.\n\n"${preview}"\n\nYour CPO will triage it soon.`,
  );
}

// ---------------------------------------------------------------------------
// handleText — save plain text message as idea
// ---------------------------------------------------------------------------

export async function handleText(
  message: TelegramMessage,
  ctx: BotContext,
): Promise<void> {
  const chatId = message.chat.id;
  const fromId = message.from?.id;
  const messageId = message.message_id;
  const text = message.text ?? "";

  if (!fromId) {
    console.warn("[telegram-bot] handleText: missing from.id");
    return;
  }

  const companyId = await lookupCompanyId(ctx.supabase, fromId);
  if (!companyId) {
    await sendMessage(
      ctx.token,
      chatId,
      "You are not registered with a Zazig company. Please contact your administrator.",
    );
    return;
  }

  const sourceRef = `telegram:${chatId}:${messageId}`;
  const { error } = await ctx.supabase.from("ideas").insert({
    company_id: companyId,
    raw_text: text,
    source: "telegram",
    originator: "human",
    source_ref: sourceRef,
    status: "new",
  });

  if (error) {
    if (error.code === "23505") {
      // Unique constraint — duplicate delivery, already processed
      console.log(`[telegram-bot] handleText: duplicate ignored for ${sourceRef}`);
      return;
    }
    console.error(
      `[telegram-bot] handleText: ideas insert failed for ${sourceRef}:`,
      error.message,
    );
    await sendMessage(
      ctx.token,
      chatId,
      "Sorry, I could not save your idea. Please try again.",
    );
    return;
  }

  const preview = text.length > 200 ? text.slice(0, 200) + "..." : text;
  await sendMessage(
    ctx.token,
    chatId,
    `Got it. Captured as an idea:\n\n"${preview}"\n\nYour CPO will triage it soon.`,
  );
}
