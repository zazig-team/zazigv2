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
  photo?: TelegramPhotoSize[];
  caption?: string;
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

export interface TelegramPhotoSize {
  file_id: string;
  file_unique_id: string;
  width: number;
  height: number;
  file_size?: number;
}

// ---------------------------------------------------------------------------
// Handler Context
// ---------------------------------------------------------------------------

export interface BotContext {
  supabase: SupabaseClient;
  token: string;
  openaiKey: string;
  anthropicKey: string;
}

// ---------------------------------------------------------------------------
// Telegram API helpers
// ---------------------------------------------------------------------------

async function sendMessage(
  token: string,
  chatId: number,
  text: string,
): Promise<void> {
  try {
    const res = await fetch(
      `https://api.telegram.org/bot${token}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: chatId, text }),
      },
    );
    if (!res.ok) {
      const err = await res.text();
      console.error(
        `[telegram-bot] sendMessage failed (${res.status}): ${err}`,
      );
    }
  } catch (err) {
    console.error("[telegram-bot] sendMessage threw:", err);
  }
}

export async function sendMessageDraft(
  token: string,
  chatId: number,
  text: string,
): Promise<void> {
  try {
    const res = await fetch(
      `https://api.telegram.org/bot${token}/sendMessageDraft`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: chatId, text }),
      },
    );
    if (!res.ok) {
      const err = await res.text();
      console.error(
        `[telegram-bot] sendMessageDraft failed (${res.status}): ${err}`,
      );
    }
  } catch (err) {
    console.error("[telegram-bot] sendMessageDraft threw:", err);
  }
}

export async function streamToTelegram(
  token: string,
  chatId: number,
  chunks: AsyncIterable<string>,
  throttleMs = 600,
): Promise<void> {
  const growthThreshold = 50;
  const errorSuffix = "\n\n(Response interrupted due to an error.)";
  let buffer = "";
  let lastDraftAt = Date.now();
  let lastDraftLength = 0;

  try {
    for await (const chunk of chunks) {
      if (!chunk) continue;

      buffer += chunk;
      const now = Date.now();
      const shouldSendByTime = now - lastDraftAt >= throttleMs;
      const shouldSendByGrowth =
        buffer.length - lastDraftLength >= growthThreshold;

      if (shouldSendByTime || shouldSendByGrowth) {
        await sendMessageDraft(token, chatId, buffer);
        lastDraftAt = now;
        lastDraftLength = buffer.length;
      }
    }

    if (!buffer) return;
    await sendMessage(token, chatId, buffer);
  } catch (err) {
    console.error("[telegram-bot] streamToTelegram threw:", err);
    const fallback = buffer
      ? `${buffer}${errorSuffix}`
      : "Response interrupted due to an error.";
    await sendMessage(token, chatId, fallback);
  }
}

async function getFileDownloadUrl(
  token: string,
  fileId: string,
): Promise<string | null> {
  try {
    const res = await fetch(
      `https://api.telegram.org/bot${token}/getFile?file_id=${
        encodeURIComponent(fileId)
      }`,
    );
    if (!res.ok) return null;
    const json = await res.json() as {
      ok: boolean;
      result?: { file_path?: string };
    };
    if (!json.ok || !json.result?.file_path) return null;
    return `https://api.telegram.org/file/bot${token}/${json.result.file_path}`;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Company lookup via telegram_users table
// ---------------------------------------------------------------------------

interface TelegramUserMapping {
  company_id: string;
  telegram_username: string | null;
}

async function lookupTelegramUserMapping(
  supabase: SupabaseClient,
  telegramUserId: number,
): Promise<TelegramUserMapping | null> {
  try {
    const { data, error } = await supabase
      .from("telegram_users")
      .select("company_id,telegram_username")
      .eq("telegram_user_id", String(telegramUserId))
      .eq("is_active", true)
      .limit(1)
      .single();
    if (error || !data) return null;
    return {
      company_id: String(data.company_id),
      telegram_username: typeof data.telegram_username === "string"
        ? data.telegram_username
        : null,
    };
  } catch {
    return null;
  }
}

function normalizeOriginator(value: string | null | undefined): string | null {
  if (!value) return null;
  const normalized = value
    .trim()
    .replace(/^@+/, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return normalized || null;
}

function resolveOriginator(
  message: TelegramMessage,
  mapping: TelegramUserMapping,
): string {
  const candidates = [
    mapping.telegram_username,
    message.from?.username,
    message.from?.first_name,
  ];

  for (const candidate of candidates) {
    const normalized = normalizeOriginator(candidate);
    if (normalized) return normalized;
  }

  return message.from?.id
    ? `telegram-user-${message.from.id}`
    : "telegram-user-unknown";
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
      console.error(
        `[telegram-bot] transcribeAudio failed (${res.status}): ${err}`,
      );
      return null;
    }
    const json = await res.json() as { text?: string };
    return json.text ?? null;
  } catch (err) {
    console.error("[telegram-bot] transcribeAudio threw:", err);
    return null;
  }
}

interface AnthropicVisionTextBlock {
  type?: string;
  text?: string;
}

interface AnthropicVisionResponse {
  content?: AnthropicVisionTextBlock[];
}

async function describeImageWithAnthropic(
  anthropicKey: string,
  mimeType: string,
  base64Data: string,
): Promise<string | null> {
  if (!anthropicKey) return null;

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": anthropicKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5",
        max_tokens: 1024,
        messages: [{
          role: "user",
          content: [
            {
              type: "image",
              source: {
                type: "base64",
                media_type: mimeType,
                data: base64Data,
              },
            },
            {
              type: "text",
              text:
                "Extract all text and describe what you see in this image. Be concise.",
            },
          ],
        }],
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error(
        `[telegram-bot] describeImageWithAnthropic failed (${res.status}): ${err}`,
      );
      return null;
    }

    const json = await res.json() as AnthropicVisionResponse;
    const text = (json.content ?? [])
      .filter((block) =>
        block.type === "text" && typeof block.text === "string"
      )
      .map((block) => block.text?.trim() ?? "")
      .filter(Boolean)
      .join("\n")
      .trim();

    return text || null;
  } catch (err) {
    console.error("[telegram-bot] describeImageWithAnthropic threw:", err);
    return null;
  }
}

function isFlagsSchemaCompatibilityError(
  error: { code?: string; message?: string } | null,
): boolean {
  if (!error) return false;
  if (error.code === "42703" || error.code === "PGRST204") return true;
  const message = (error.message ?? "").toLowerCase();
  return message.includes("flags") &&
    (message.includes("column") || message.includes("schema"));
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
      console.error(
        "[telegram-bot] queryIdeasCountToday failed:",
        error.message,
      );
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

function formatTextCaptureConfirmation(rawText: string): string {
  const preview = rawText.length > 200
    ? rawText.slice(0, 200) + "..."
    : rawText;
  return `Got it. Captured as an idea.\n\n"${preview}"\n\nYour CPO will triage it soon.`;
}

function formatVoiceCaptureConfirmation(
  transcript: string,
  durationSeconds?: number,
): string {
  const durationNote = durationSeconds ? ` (${durationSeconds}s)` : "";
  const preview = transcript.length > 200
    ? transcript.slice(0, 200) + "..."
    : transcript;
  return `Got it. Captured your voice note${durationNote} as an idea.\n\n"${preview}"\n\nYour CPO will triage it soon.`;
}

async function buildRawTextWithLinkSummary(
  text: string,
  anthropicKey: string,
): Promise<string> {
  const URL_REGEX = /https?:\/\/\S+/;
  const urlMatch = text.match(URL_REGEX);
  const firstUrl = urlMatch?.[0] ?? null;
  if (!firstUrl) return text;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10_000);
  let body = "";

  try {
    const res = await fetch(firstUrl, { signal: controller.signal });
    if (!res.ok) return text;

    const buf = await res.arrayBuffer();
    body = new TextDecoder().decode(buf.slice(0, 50_000));
  } catch {
    // Timeout or network error.
    return text;
  } finally {
    clearTimeout(timeoutId);
  }

  const extractedText = body
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 2000);

  if (!extractedText || !anthropicKey) return text;

  try {
    const summaryRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": anthropicKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5",
        max_tokens: 256,
        messages: [{
          role: "user",
          content: `Summarise this web page content in 2-3 sentences: ${extractedText}`,
        }],
      }),
    });

    if (!summaryRes.ok) return text;

    const summaryPayload = await summaryRes.json() as { content?: Array<{ text?: string }> };
    const summary = summaryPayload.content?.[0]?.text?.trim() ?? "";
    if (!summary) return text;

    return `${text}\n\n[Link summary]: ${summary}`;
  } catch {
    return text;
  }
}

// ---------------------------------------------------------------------------
// Claude AI streaming response generation
// ---------------------------------------------------------------------------

const ANTHROPIC_SYSTEM_PROMPT =
  "You are a helpful assistant that briefly acknowledges and insightfully comments on ideas captured via the Zazig pipeline. Be concise (2-4 sentences), encouraging, and actionable.";

export async function generateStreamingIdeaResponse(
  rawText: string,
  anthropicKey: string,
): Promise<AsyncIterable<string>> {
  if (!anthropicKey) {
    throw new Error("Anthropic API key is not configured");
  }

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": anthropicKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 300,
      stream: true,
      system: ANTHROPIC_SYSTEM_PROMPT,
      messages: [{ role: "user", content: rawText }],
    }),
  });

  if (!res.ok) {
    const errBody = await res.text();
    console.error(
      `[telegram-bot] Anthropic API error (${res.status}): ${errBody}`,
    );
    throw new Error(`Anthropic API returned ${res.status}`);
  }

  const body = res.body;
  if (!body) {
    throw new Error("Anthropic API returned no response body");
  }

  async function* parseSSEStream(
    stream: ReadableStream<Uint8Array>,
  ): AsyncIterable<string> {
    const reader = stream.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        // Keep the last potentially incomplete line in the buffer
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const jsonStr = line.slice(6).trim();
          if (jsonStr === "[DONE]") return;

          try {
            const event = JSON.parse(jsonStr);
            if (event.type === "message_stop") return;
            if (
              event.type === "content_block_delta" &&
              event.delta?.type === "text_delta" &&
              event.delta.text
            ) {
              yield event.delta.text;
            }
          } catch {
            // Skip malformed JSON lines
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  return parseSSEStream(body);
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
  const command = text.trim().split(/\s+/)[0].toLowerCase().split("@")[0];

  console.log(`[telegram-bot] Command "${command}" from chat ${chatId}`);

  switch (command) {
    case "/start":
      await sendMessage(
        ctx.token,
        chatId,
        "Welcome to the Zazig Ideas Bot.\n\n" +
          "Send me a voice note, photo, or text message (including links) to capture an idea into your inbox. " +
          "Voice notes are transcribed automatically, photos are described by AI, and links are summarised.\n\n" +
          "Type /help for more info.",
      );
      break;

    case "/help":
      await sendMessage(
        ctx.token,
        chatId,
        "Zazig Ideas Bot\n\n" +
          "• Voice note → transcribed and saved as an idea\n" +
          "• Photo → image is described by AI and saved as an idea\n" +
          "• Text message → saved directly as an idea\n" +
          "• Text with a link → page is summarised and saved as an idea\n" +
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

      const mapping = await lookupTelegramUserMapping(ctx.supabase, fromId);
      if (!mapping) {
        await sendMessage(
          ctx.token,
          chatId,
          "You are not registered with a Zazig company. Please contact your administrator.",
        );
        break;
      }

      const count = await queryIdeasCountToday(
        ctx.supabase,
        mapping.company_id,
      );
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

      const mapping = await lookupTelegramUserMapping(ctx.supabase, fromId);
      if (!mapping) {
        await sendMessage(
          ctx.token,
          chatId,
          "You are not registered with a Zazig company. Please contact your administrator.",
        );
        break;
      }

      const ideas = await queryRecentIdeas(ctx.supabase, mapping.company_id);
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
        const label = (idea.title ?? "").trim() ||
          (raw ? truncate(raw, 60) : "(empty)");
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

  const mapping = await lookupTelegramUserMapping(ctx.supabase, fromId);
  if (!mapping) {
    await sendMessage(
      ctx.token,
      chatId,
      "You are not registered with a Zazig company. Please contact your administrator.",
    );
    return;
  }
  const originator = resolveOriginator(message, mapping);

  await sendMessageDraft(
    ctx.token,
    chatId,
    "Got it. Transcribing your voice note...",
  );

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
    company_id: mapping.company_id,
    raw_text: transcript,
    source: "telegram",
    originator,
    source_ref: sourceRef,
    status: "new",
  });

  if (error) {
    if (error.code === "23505") {
      // Unique constraint — duplicate delivery, already processed
      console.log(
        `[telegram-bot] handleVoice: duplicate ignored for ${sourceRef}`,
      );
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

  const fallbackText = formatVoiceCaptureConfirmation(
    transcript,
    voice.duration,
  );

  if (!ctx.anthropicKey) {
    await sendMessage(ctx.token, chatId, fallbackText);
    return;
  }

  try {
    const chunkIterator = await generateStreamingIdeaResponse(
      transcript,
      ctx.anthropicKey,
    );
    await streamToTelegram(ctx.token, chatId, chunkIterator);
    return;
  } catch (err) {
    console.error("[telegram-bot] handleVoice: Claude streaming failed:", err);
  }

  await sendMessage(ctx.token, chatId, fallbackText);
}

// ---------------------------------------------------------------------------
// handlePhoto — download image, describe with vision, save idea
// ---------------------------------------------------------------------------

export async function handlePhoto(
  message: TelegramMessage,
  ctx: BotContext,
): Promise<void> {
  const chatId = message.chat.id;
  const fromId = message.from?.id;
  const messageId = message.message_id;
  const caption = message.caption?.trim();
  const photo = message.photo?.[message.photo.length - 1];

  if (!fromId) {
    console.warn("[telegram-bot] handlePhoto: missing from.id");
    return;
  }

  if (!photo) {
    console.warn("[telegram-bot] handlePhoto: no photo on message");
    return;
  }

  const mapping = await lookupTelegramUserMapping(ctx.supabase, fromId);
  if (!mapping) {
    await sendMessage(
      ctx.token,
      chatId,
      "You are not registered with a Zazig company. Please contact your administrator.",
    );
    return;
  }
  const originator = resolveOriginator(message, mapping);

  const fileUrl = await getFileDownloadUrl(ctx.token, photo.file_id);
  if (!fileUrl) {
    console.error(
      `[telegram-bot] handlePhoto: could not resolve file URL for file_id=${photo.file_id}`,
    );
    await sendMessage(
      ctx.token,
      chatId,
      "Sorry, I could not download your photo. Please try again.",
    );
    return;
  }

  const imageRes = await fetch(fileUrl);
  if (!imageRes.ok) {
    console.error(
      `[telegram-bot] handlePhoto: image download failed (${imageRes.status})`,
    );
    await sendMessage(
      ctx.token,
      chatId,
      "Sorry, I could not download your photo. Please try again.",
    );
    return;
  }

  const mimeType =
    imageRes.headers.get("Content-Type")?.split(";")[0]?.trim() || "image/jpeg";
  const imageBase64 = btoa(
    String.fromCharCode(...new Uint8Array(await imageRes.arrayBuffer())),
  );
  const visionText = await describeImageWithAnthropic(
    ctx.anthropicKey,
    mimeType,
    imageBase64,
  );
  const visionSucceeded = Boolean(visionText);

  let rawText = "[Image — description unavailable]";
  if (visionSucceeded && caption) {
    rawText = `${caption}\n\n[Image description]: ${visionText}`;
  } else if (visionSucceeded && visionText) {
    rawText = visionText;
  } else if (caption) {
    rawText = `${caption}\n\n[Image — description unavailable]`;
  }

  const sourceRef = `telegram:${chatId}:${messageId}`;
  const insertPayload: Record<string, unknown> = {
    company_id: mapping.company_id,
    raw_text: rawText,
    source: "telegram",
    originator,
    source_ref: sourceRef,
    status: "new",
  };
  if (!visionSucceeded) {
    insertPayload.flags = ["vision-failed"];
  }

  let { error } = await ctx.supabase.from("ideas").insert(insertPayload);

  if (error && !visionSucceeded && isFlagsSchemaCompatibilityError(error)) {
    const { flags: _ignored, ...withoutFlags } = insertPayload;
    const retry = await ctx.supabase.from("ideas").insert(withoutFlags);
    error = retry.error;
  }

  if (error) {
    if (error.code === "23505") {
      // Unique constraint — duplicate delivery, already processed
      console.log(
        `[telegram-bot] handlePhoto: duplicate ignored for ${sourceRef}`,
      );
      return;
    }
    console.error(
      `[telegram-bot] handlePhoto: ideas insert failed for ${sourceRef}:`,
      error.message,
    );
    await sendMessage(
      ctx.token,
      chatId,
      "Sorry, I could not save your idea. Please try again.",
    );
    return;
  }

  const fallbackText = formatTextCaptureConfirmation(rawText);

  if (!ctx.anthropicKey) {
    await sendMessage(ctx.token, chatId, fallbackText);
    return;
  }

  try {
    const chunkIterator = await generateStreamingIdeaResponse(
      rawText,
      ctx.anthropicKey,
    );
    await streamToTelegram(ctx.token, chatId, chunkIterator);
    return;
  } catch (err) {
    console.error("[telegram-bot] handlePhoto: Claude streaming failed:", err);
  }

  await sendMessage(ctx.token, chatId, fallbackText);
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

  const mapping = await lookupTelegramUserMapping(ctx.supabase, fromId);
  if (!mapping) {
    await sendMessage(
      ctx.token,
      chatId,
      "You are not registered with a Zazig company. Please contact your administrator.",
    );
    return;
  }
  const originator = resolveOriginator(message, mapping);
  const rawText = await buildRawTextWithLinkSummary(text, ctx.anthropicKey);

  const sourceRef = `telegram:${chatId}:${messageId}`;
  const { error } = await ctx.supabase.from("ideas").insert({
    company_id: mapping.company_id,
    raw_text: rawText,
    source: "telegram",
    originator,
    source_ref: sourceRef,
    status: "new",
  });

  if (error) {
    if (error.code === "23505") {
      // Unique constraint — duplicate delivery, already processed
      console.log(
        `[telegram-bot] handleText: duplicate ignored for ${sourceRef}`,
      );
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

  const fallbackText = formatTextCaptureConfirmation(rawText);

  if (!ctx.anthropicKey) {
    await sendMessage(ctx.token, chatId, fallbackText);
    return;
  }

  try {
    const chunkIterator = await generateStreamingIdeaResponse(
      rawText,
      ctx.anthropicKey,
    );
    await streamToTelegram(ctx.token, chatId, chunkIterator);
    return;
  } catch (err) {
    console.error("[telegram-bot] handleText: Claude streaming failed:", err);
  }

  await sendMessage(ctx.token, chatId, fallbackText);
}
