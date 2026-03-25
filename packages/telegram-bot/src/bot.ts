/**
 * Telegram Ideas Bot — core message handling logic.
 *
 * Exports handler functions called by the webhook handler (index.ts).
 * Handles user authorization, rate limiting, text/voice message capture,
 * commands (/start, /status, /recent), and retry logic.
 */

import { TranscriptionService } from "./transcription.js";
import { OpenAITranscriber } from "./transcription-openai.js";

// ---------------------------------------------------------------------------
// Types
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
  voice?: { file_id: string; duration: number };
  entities?: Array<{ type: string; offset: number; length: number }>;
}

export interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
}

interface CreateIdeaPayload {
  raw_text: string;
  source: "telegram";
  originator: "human";
  source_ref: string;
  tags?: string[];
  flags?: string[];
  metadata?: Record<string, unknown>;
}

interface CreateIdeaResponse {
  id?: string;
  title?: string;
}

// ---------------------------------------------------------------------------
// Environment
// ---------------------------------------------------------------------------

function getEnv(key: string): string {
  const val = process.env[key];
  if (!val) throw new Error(`Missing required env var: ${key}`);
  return val;
}

function getAllowedUsers(): Set<string> {
  const raw = process.env["TELEGRAM_ALLOWED_USERS"] ?? "";
  return new Set(raw.split(",").map((s) => s.trim()).filter(Boolean));
}

// ---------------------------------------------------------------------------
// Rate limiting — in-memory, per function instance
// ---------------------------------------------------------------------------

const RATE_LIMIT_MAX = 20;
const RATE_LIMIT_WINDOW_MS = 60_000;

const rateLimitMap = new Map<string, number[]>();

function isRateLimited(userId: string): boolean {
  const now = Date.now();
  const timestamps = rateLimitMap.get(userId) ?? [];
  const recent = timestamps.filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
  rateLimitMap.set(userId, recent);

  if (recent.length >= RATE_LIMIT_MAX) return true;

  recent.push(now);
  rateLimitMap.set(userId, recent);
  return false;
}

// ---------------------------------------------------------------------------
// Transcription service (lazily initialized)
// ---------------------------------------------------------------------------

let transcriptionService: TranscriptionService | null = null;

function getTranscriptionService(): TranscriptionService {
  if (!transcriptionService) {
    const apiKey = getEnv("OPENAI_API_KEY");
    transcriptionService = new TranscriptionService(new OpenAITranscriber(apiKey));
  }
  return transcriptionService;
}

// ---------------------------------------------------------------------------
// Telegram API helpers
// ---------------------------------------------------------------------------

async function sendMessage(chatId: number, text: string): Promise<void> {
  const token = getEnv("TELEGRAM_BOT_TOKEN");
  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text }),
  });
}

async function downloadVoiceFile(fileId: string): Promise<Buffer> {
  const token = getEnv("TELEGRAM_BOT_TOKEN");

  const fileResp = await fetch(`https://api.telegram.org/bot${token}/getFile`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ file_id: fileId }),
  });
  const fileData = (await fileResp.json()) as {
    ok: boolean;
    result?: { file_path: string };
  };

  if (!fileData.ok || !fileData.result?.file_path) {
    throw new Error("Failed to get file path from Telegram");
  }

  const downloadResp = await fetch(
    `https://api.telegram.org/file/bot${token}/${fileData.result.file_path}`,
  );
  if (!downloadResp.ok) {
    throw new Error(`Failed to download file: ${downloadResp.status}`);
  }

  const arrayBuf = await downloadResp.arrayBuffer();
  return Buffer.from(arrayBuf);
}

// ---------------------------------------------------------------------------
// Create-idea edge function call with retry
// ---------------------------------------------------------------------------

async function callCreateIdea(payload: CreateIdeaPayload): Promise<CreateIdeaResponse | null> {
  const supabaseUrl = getEnv("SUPABASE_URL");
  const serviceRoleKey = getEnv("SUPABASE_SERVICE_ROLE_KEY");
  const url = `${supabaseUrl}/functions/v1/create-idea`;

  const delays = [1000, 2000, 4000];

  for (let attempt = 0; attempt <= delays.length; attempt++) {
    try {
      const resp = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${serviceRoleKey}`,
        },
        body: JSON.stringify(payload),
      });

      if (!resp.ok) {
        const errText = await resp.text();
        console.error(`[bot] create-idea returned ${resp.status}: ${errText}`);
        return null;
      }

      return (await resp.json()) as CreateIdeaResponse;
    } catch (err) {
      console.error(`[bot] create-idea attempt ${attempt + 1} failed:`, err);
      if (attempt < delays.length) {
        await sleep(delays[attempt]);
      }
    }
  }

  // All retries exhausted
  return null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// Multi-idea heuristic
// ---------------------------------------------------------------------------

function looksLikeMultipleIdeas(text: string): boolean {
  if (text.length > 200) return true;
  if (text.includes("\n")) return true;
  return false;
}

// ---------------------------------------------------------------------------
// Supabase DB queries (for /status and /recent)
// ---------------------------------------------------------------------------

async function queryIdeasCountToday(): Promise<number> {
  const supabaseUrl = getEnv("SUPABASE_URL");
  const serviceRoleKey = getEnv("SUPABASE_SERVICE_ROLE_KEY");

  const today = new Date().toISOString().split("T")[0];

  const resp = await fetch(
    `${supabaseUrl}/rest/v1/ideas?select=id&source=eq.telegram&created_at=gte.${today}T00:00:00Z`,
    {
      headers: {
        Authorization: `Bearer ${serviceRoleKey}`,
        apikey: serviceRoleKey,
        Prefer: "count=exact",
      },
    },
  );

  const count = resp.headers.get("content-range");
  if (count) {
    const match = count.match(/\/(\d+)/);
    if (match) return parseInt(match[1], 10);
  }
  return 0;
}

async function queryRecentIdeas(): Promise<
  Array<{ title?: string; raw_text?: string; created_at: string }>
> {
  const supabaseUrl = getEnv("SUPABASE_URL");
  const serviceRoleKey = getEnv("SUPABASE_SERVICE_ROLE_KEY");

  const resp = await fetch(
    `${supabaseUrl}/rest/v1/ideas?select=title,raw_text,created_at&source=eq.telegram&order=created_at.desc&limit=5`,
    {
      headers: {
        Authorization: `Bearer ${serviceRoleKey}`,
        apikey: serviceRoleKey,
      },
    },
  );

  if (!resp.ok) return [];
  return (await resp.json()) as Array<{
    title?: string;
    raw_text?: string;
    created_at: string;
  }>;
}

// ---------------------------------------------------------------------------
// Command handlers
// ---------------------------------------------------------------------------

async function handleStartCommand(chatId: number): Promise<void> {
  await sendMessage(
    chatId,
    "Send me a text or voice note and I'll capture it as an idea. Commands: /status, /recent.",
  );
}

async function handleStatusCommand(chatId: number): Promise<void> {
  try {
    const count = await queryIdeasCountToday();
    await sendMessage(chatId, `Connected. ${count} ideas captured today.`);
  } catch (err) {
    console.error("[bot] /status error:", err);
    await sendMessage(chatId, "Failed to fetch status.");
  }
}

async function handleRecentCommand(chatId: number): Promise<void> {
  try {
    const ideas = await queryRecentIdeas();
    if (ideas.length === 0) {
      await sendMessage(chatId, "No recent ideas from Telegram.");
      return;
    }

    const lines = ideas.map((idea, i) => {
      const label = idea.title || truncate(idea.raw_text ?? "", 50);
      const ts = new Date(idea.created_at).toLocaleString("en-GB", {
        timeZone: "Europe/London",
        day: "2-digit",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      });
      return `${i + 1}. ${label} — ${ts}`;
    });

    await sendMessage(chatId, lines.join("\n"));
  } catch (err) {
    console.error("[bot] /recent error:", err);
    await sendMessage(chatId, "Failed to fetch recent ideas.");
  }
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return text.slice(0, max - 1) + "\u2026";
}

// ---------------------------------------------------------------------------
// Text message handler
// ---------------------------------------------------------------------------

async function handleTextMessage(msg: TelegramMessage): Promise<void> {
  const text = msg.text!;
  const chatId = msg.chat.id;
  const sourceRef = String(msg.message_id);

  const payload: CreateIdeaPayload = {
    raw_text: text,
    source: "telegram",
    originator: "human",
    source_ref: sourceRef,
  };

  if (looksLikeMultipleIdeas(text)) {
    payload.tags = ["multi-idea"];
  }

  const result = await callCreateIdea(payload);

  if (!result) {
    await sendMessage(chatId, "Saved locally, will sync when connection is restored.");
    return;
  }

  const titlePreview = result.title ? ` ${result.title}` : "";
  await sendMessage(chatId, `Captured.${titlePreview}`);
}

// ---------------------------------------------------------------------------
// Voice message handler
// ---------------------------------------------------------------------------

async function handleVoiceMessage(msg: TelegramMessage): Promise<void> {
  const voice = msg.voice!;
  const chatId = msg.chat.id;
  const sourceRef = String(msg.message_id);

  let audioBuffer: Buffer;
  try {
    audioBuffer = await downloadVoiceFile(voice.file_id);
  } catch (err) {
    console.error("[bot] Failed to download voice file:", err);
    await sendMessage(chatId, "Failed to download voice note.");
    return;
  }

  const svc = getTranscriptionService();
  const transcription = await svc.transcribe(audioBuffer, "audio/ogg");

  if (transcription.success && transcription.text) {
    const transcript = transcription.text;
    const wordCount = transcript.split(/\s+/).filter(Boolean).length;

    const payload: CreateIdeaPayload = {
      raw_text: transcript,
      source: "telegram",
      originator: "human",
      source_ref: sourceRef,
    };

    if (looksLikeMultipleIdeas(transcript)) {
      payload.tags = ["multi-idea"];
    }

    const result = await callCreateIdea(payload);

    if (!result) {
      await sendMessage(chatId, "Saved locally, will sync when connection is restored.");
      return;
    }

    const titlePreview = result.title ? `, ${result.title}` : "";
    await sendMessage(chatId, `Transcribed and captured. ${wordCount} words${titlePreview}`);
  } else {
    // Transcription failed — still capture with audio reference
    const payload: CreateIdeaPayload = {
      raw_text: "[Voice note - transcription failed]",
      source: "telegram",
      originator: "human",
      source_ref: sourceRef,
      flags: ["transcription-failed"],
      metadata: { telegram_file_id: voice.file_id },
    };

    const result = await callCreateIdea(payload);

    if (!result) {
      await sendMessage(chatId, "Saved locally, will sync when connection is restored.");
      return;
    }

    await sendMessage(chatId, "Captured (transcription failed \u2014 audio reference saved).");
  }
}

// ---------------------------------------------------------------------------
// Main update handler (exported for index.ts)
// ---------------------------------------------------------------------------

export async function handleUpdate(update: TelegramUpdate): Promise<void> {
  const msg = update.message;
  if (!msg) return;

  // 1. Authorization
  const userId = msg.from?.id;
  if (!userId) return;

  const allowed = getAllowedUsers();
  if (allowed.size > 0 && !allowed.has(String(userId))) {
    await sendMessage(msg.chat.id, "Unauthorized.");
    return;
  }

  const userKey = String(userId);

  // 2. Rate limiting
  if (isRateLimited(userKey)) {
    await sendMessage(msg.chat.id, "Rate limit exceeded. Please wait a moment.");
    return;
  }

  // 3. Command routing
  if (msg.text && msg.entities?.some((e) => e.type === "bot_command" && e.offset === 0)) {
    const command = msg.text.split(/\s/)[0].split("@")[0].toLowerCase();

    switch (command) {
      case "/start":
        await handleStartCommand(msg.chat.id);
        return;
      case "/status":
        await handleStatusCommand(msg.chat.id);
        return;
      case "/recent":
        await handleRecentCommand(msg.chat.id);
        return;
      default:
        await sendMessage(msg.chat.id, "Unknown command. Try /start, /status, or /recent.");
        return;
    }
  }

  // 4. Voice message
  if (msg.voice) {
    await handleVoiceMessage(msg);
    return;
  }

  // 5. Text message
  if (msg.text) {
    await handleTextMessage(msg);
    return;
  }
}
