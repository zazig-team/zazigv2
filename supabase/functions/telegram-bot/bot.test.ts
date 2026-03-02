import {
  assertEquals,
  assertStringIncludes,
} from "https://deno.land/std@0.208.0/assert/mod.ts";

import {
  handleCommand,
  handleText,
  handleVoice,
  type BotContext,
  type TelegramMessage,
} from "./bot.ts";

interface MockSupabaseConfig {
  companyId?: string | null;
  ideasCountToday?: number;
  recentIdeas?: Array<{ title: string | null; raw_text: string | null; created_at: string }>;
  // deno-lint-ignore no-explicit-any
  insertError?: any;
}

function createMockSupabase(config: MockSupabaseConfig = {}) {
  const insertCalls: Record<string, unknown>[] = [];
  const companyId = config.companyId ?? "00000000-0000-0000-0000-000000000111";

  const ideasCountToday = config.ideasCountToday ?? 0;
  const recentIdeas = config.recentIdeas ?? [];

  // deno-lint-ignore no-explicit-any
  const supabase: any = {
    from(table: string) {
      if (table === "telegram_users") {
        return {
          select(_cols: string) {
            return {
              eq(_col1: string, _val1: unknown) {
                return {
                  eq(_col2: string, _val2: unknown) {
                    return {
                      limit(_n: number) {
                        return {
                          single: async () => {
                            if (!companyId) return { data: null, error: { message: "not found" } };
                            return { data: { company_id: companyId }, error: null };
                          },
                        };
                      },
                    };
                  },
                };
              },
            };
          },
        };
      }

      if (table === "ideas") {
        return {
          // deno-lint-ignore no-explicit-any
          insert: async (payload: any) => {
            insertCalls.push(payload);
            return { error: config.insertError ?? null };
          },
          // deno-lint-ignore no-explicit-any
          select(cols: string, opts?: any) {
            if (cols === "id" && opts?.head === true) {
              const countChain = {
                eq(_col1: string, _val1: unknown) {
                  return countChain;
                },
                gte: async (_col3: string, _val3: unknown) => {
                  return { count: ideasCountToday, error: null };
                },
              };
              return countChain;
            }

            const recentChain = {
              eq(_col1: string, _val1: unknown) {
                return recentChain;
              },
              order(_col3: string, _opts2: unknown) {
                return recentChain;
              },
              limit: async (_n: number) => {
                return { data: recentIdeas, error: null };
              },
            };
            return recentChain;
          },
        };
      }

      throw new Error(`Unexpected table: ${table}`);
    },
  };

  return { supabase, insertCalls };
}

function makeMessage(partial: Partial<TelegramMessage>): TelegramMessage {
  return {
    message_id: partial.message_id ?? 1,
    chat: partial.chat ?? { id: 123, type: "private" },
    date: partial.date ?? Math.floor(Date.now() / 1000),
    from: partial.from ?? { id: 999, is_bot: false, first_name: "Tom" },
    text: partial.text,
    voice: partial.voice,
    audio: partial.audio,
  };
}

function makeContext(
  // deno-lint-ignore no-explicit-any
  supabase: any,
): BotContext {
  return {
    // deno-lint-ignore no-explicit-any
    supabase: supabase as any,
    token: "telegram-token",
    openaiKey: "openai-test-key",
  };
}

function installFetchMock(
  mock: typeof fetch,
): () => void {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = mock;
  return () => {
    globalThis.fetch = originalFetch;
  };
}

function extractMessageText(init: unknown): string {
  const maybeInit = init as { body?: BodyInit | null } | undefined;
  const body = JSON.parse(String(maybeInit?.body ?? "{}")) as { text?: string };
  return body.text ?? "";
}

Deno.test("handleCommand /help includes /status and /recent", async () => {
  const sentTexts: string[] = [];

  const restoreFetch = installFetchMock(async (input, init) => {
    const url = String(input);
    if (url.includes("/sendMessage")) {
      sentTexts.push(extractMessageText(init));
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    throw new Error(`Unexpected fetch URL: ${url}`);
  });

  try {
    const { supabase } = createMockSupabase();
    await handleCommand(
      makeMessage({ text: "/help" }),
      makeContext(supabase),
    );
  } finally {
    restoreFetch();
  }

  assertEquals(sentTexts.length, 1);
  assertStringIncludes(sentTexts[0], "/status");
  assertStringIncludes(sentTexts[0], "/recent");
});

Deno.test("handleCommand /status returns today's count", async () => {
  const sentTexts: string[] = [];
  const restoreFetch = installFetchMock(async (input, init) => {
    const url = String(input);
    if (url.includes("/sendMessage")) {
      sentTexts.push(extractMessageText(init));
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    throw new Error(`Unexpected fetch URL: ${url}`);
  });

  try {
    const { supabase } = createMockSupabase({ ideasCountToday: 4 });
    await handleCommand(
      makeMessage({ text: "/status" }),
      makeContext(supabase),
    );
  } finally {
    restoreFetch();
  }

  assertEquals(sentTexts.length, 1);
  assertStringIncludes(sentTexts[0], "4 Telegram ideas captured today");
});

Deno.test("handleCommand /recent formats recent ideas list", async () => {
  const sentTexts: string[] = [];
  const restoreFetch = installFetchMock(async (input, init) => {
    const url = String(input);
    if (url.includes("/sendMessage")) {
      sentTexts.push(extractMessageText(init));
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    throw new Error(`Unexpected fetch URL: ${url}`);
  });

  try {
    const { supabase } = createMockSupabase({
      recentIdeas: [
        {
          title: "Idea title one",
          raw_text: "ignored when title exists",
          created_at: "2026-03-02T12:00:00.000Z",
        },
        {
          title: null,
          raw_text: "A raw text fallback should appear when title is missing",
          created_at: "2026-03-02T11:30:00.000Z",
        },
      ],
    });

    await handleCommand(
      makeMessage({ text: "/recent" }),
      makeContext(supabase),
    );
  } finally {
    restoreFetch();
  }

  assertEquals(sentTexts.length, 1);
  assertStringIncludes(sentTexts[0], "Recent Telegram ideas:");
  assertStringIncludes(sentTexts[0], "1. Idea title one");
  assertStringIncludes(sentTexts[0], "2. A raw text fallback");
});

Deno.test("handleText inserts idea row with source_ref", async () => {
  const sentTexts: string[] = [];
  const restoreFetch = installFetchMock(async (input, init) => {
    const url = String(input);
    if (url.includes("/sendMessage")) {
      sentTexts.push(extractMessageText(init));
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    throw new Error(`Unexpected fetch URL: ${url}`);
  });

  const { supabase, insertCalls } = createMockSupabase({
    companyId: "00000000-0000-0000-0000-000000000123",
  });

  try {
    await handleText(
      makeMessage({
        message_id: 42,
        chat: { id: 777, type: "private" },
        from: { id: 555, is_bot: false, first_name: "Tom" },
        text: "Capture this idea from text",
      }),
      makeContext(supabase),
    );
  } finally {
    restoreFetch();
  }

  assertEquals(insertCalls.length, 1);
  assertEquals(insertCalls[0]["company_id"], "00000000-0000-0000-0000-000000000123");
  assertEquals(insertCalls[0]["source"], "telegram");
  assertEquals(insertCalls[0]["source_ref"], "telegram:777:42");
  assertEquals(sentTexts.length, 1);
  assertStringIncludes(sentTexts[0], "Captured as an idea");
});

Deno.test("handleVoice downloads, transcribes, inserts, and confirms", async () => {
  const sentTexts: string[] = [];

  const restoreFetch = installFetchMock(async (input, init) => {
    const url = String(input);

    if (url.includes("/sendMessage")) {
      sentTexts.push(extractMessageText(init));
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (url.includes("/getFile?")) {
      return new Response(
        JSON.stringify({
          ok: true,
          result: { file_path: "voice/file.ogg" },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }

    if (url.includes("/file/bot")) {
      return new Response(new Uint8Array([1, 2, 3]), {
        status: 200,
        headers: { "Content-Type": "audio/ogg" },
      });
    }

    if (url === "https://api.openai.com/v1/audio/transcriptions") {
      return new Response(
        JSON.stringify({ text: "Transcribed voice idea text" }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }

    throw new Error(`Unexpected fetch URL: ${url}`);
  });

  const { supabase, insertCalls } = createMockSupabase({
    companyId: "00000000-0000-0000-0000-000000000abc",
  });

  try {
    await handleVoice(
      makeMessage({
        message_id: 9,
        chat: { id: 888, type: "private" },
        from: { id: 444, is_bot: false, first_name: "Tom" },
        voice: {
          file_id: "voice-file-id",
          file_unique_id: "voice-unique-id",
          duration: 12,
          mime_type: "audio/ogg",
        },
      }),
      makeContext(supabase),
    );
  } finally {
    restoreFetch();
  }

  assertEquals(insertCalls.length, 1);
  assertEquals(insertCalls[0]["company_id"], "00000000-0000-0000-0000-000000000abc");
  assertEquals(insertCalls[0]["raw_text"], "Transcribed voice idea text");
  assertEquals(insertCalls[0]["source_ref"], "telegram:888:9");

  // One progress message + one success confirmation
  assertEquals(sentTexts.length, 2);
  assertStringIncludes(sentTexts[0], "Transcribing your voice note");
  assertStringIncludes(sentTexts[1], "Captured your voice note");
});
