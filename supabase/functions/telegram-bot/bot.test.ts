import {
  assertEquals,
  assertStringIncludes,
} from "https://deno.land/std@0.208.0/assert/mod.ts";

import {
  type BotContext,
  handleCommand,
  handlePhoto,
  handleText,
  handleVoice,
  sendMessageDraft,
  streamToTelegram,
  type TelegramMessage,
} from "./bot.ts";

interface MockSupabaseConfig {
  companyId?: string | null;
  telegramUsername?: string | null;
  ideasCountToday?: number;
  recentIdeas?: Array<
    { title: string | null; raw_text: string | null; created_at: string }
  >;
  // deno-lint-ignore no-explicit-any
  insertError?: any;
  // deno-lint-ignore no-explicit-any
  insertErrors?: any[];
}

function createMockSupabase(config: MockSupabaseConfig = {}) {
  const insertCalls: Record<string, unknown>[] = [];
  const companyId = config.companyId ?? "00000000-0000-0000-0000-000000000111";
  const telegramUsername = config.telegramUsername ?? null;

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
                            if (!companyId) {
                              return {
                                data: null,
                                error: { message: "not found" },
                              };
                            }
                            return {
                              data: {
                                company_id: companyId,
                                telegram_username: telegramUsername,
                              },
                              error: null,
                            };
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
            const queuedError = config.insertErrors?.shift();
            const error = queuedError ?? config.insertError ?? null;
            return { error };
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
    photo: partial.photo,
    caption: partial.caption,
  };
}

function makeContext(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  overrides: Partial<Pick<BotContext, "token" | "openaiKey" | "anthropicKey">> =
    {},
): BotContext {
  return {
    // deno-lint-ignore no-explicit-any
    supabase: supabase as any,
    token: overrides.token ?? "telegram-token",
    openaiKey: overrides.openaiKey ?? "openai-test-key",
    anthropicKey: overrides.anthropicKey ?? "",
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

async function* toAsyncChunks(chunks: string[]): AsyncIterable<string> {
  for (const chunk of chunks) {
    yield chunk;
  }
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

Deno.test("handleCommand /status@botname returns today's count", async () => {
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
    const { supabase } = createMockSupabase({ ideasCountToday: 7 });
    await handleCommand(
      makeMessage({ text: "/status@zazig_ideas_bot" }),
      makeContext(supabase),
    );
  } finally {
    restoreFetch();
  }

  assertEquals(sentTexts.length, 1);
  assertStringIncludes(sentTexts[0], "7 Telegram ideas captured today");
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
    telegramUsername: "tom.weaver",
  });

  try {
    await handleText(
      makeMessage({
        message_id: 42,
        chat: { id: 777, type: "private" },
        from: {
          id: 555,
          is_bot: false,
          first_name: "Tom",
          username: "different-user",
        },
        text: "Capture this idea from text",
      }),
      makeContext(supabase),
    );
  } finally {
    restoreFetch();
  }

  assertEquals(insertCalls.length, 1);
  assertEquals(
    insertCalls[0]["company_id"],
    "00000000-0000-0000-0000-000000000123",
  );
  assertEquals(insertCalls[0]["source"], "telegram");
  assertEquals(insertCalls[0]["source_ref"], "telegram:777:42");
  assertEquals(insertCalls[0]["originator"], "tom-weaver");
  assertEquals(sentTexts.length, 1);
  assertStringIncludes(sentTexts[0], "Captured as an idea");
});

Deno.test("handleText streams Claude response when anthropic key is set", async () => {
  const draftTexts: string[] = [];
  const finalTexts: string[] = [];
  const streamedChunkA = "A".repeat(60);
  const streamedChunkB = " Follow-up.";

  const restoreFetch = installFetchMock(async (input, init) => {
    const url = String(input);

    if (url.endsWith("/sendMessageDraft")) {
      draftTexts.push(extractMessageText(init));
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (url.endsWith("/sendMessage")) {
      finalTexts.push(extractMessageText(init));
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (url === "https://api.anthropic.com/v1/messages") {
      const streamBody = [
        `data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"${streamedChunkA}"}}\n\n`,
        `data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"${streamedChunkB}"}}\n\n`,
        'data: {"type":"message_stop"}\n\n',
      ].join("");
      return new Response(streamBody, {
        status: 200,
        headers: { "Content-Type": "text/event-stream" },
      });
    }

    throw new Error(`Unexpected fetch URL: ${url}`);
  });

  const { supabase, insertCalls } = createMockSupabase();
  try {
    await handleText(
      makeMessage({
        message_id: 66,
        chat: { id: 321, type: "private" },
        text: "Claude-stream this",
      }),
      makeContext(supabase, { anthropicKey: "anthropic-test-key" }),
    );
  } finally {
    restoreFetch();
  }

  assertEquals(insertCalls.length, 1);
  assertEquals(draftTexts.length, 1);
  assertEquals(finalTexts.length, 1);
  assertEquals(draftTexts[0], streamedChunkA);
  assertEquals(finalTexts[0], `${streamedChunkA}${streamedChunkB}`);
});

Deno.test("handleText falls back to static confirmation on Claude error", async () => {
  const sentTexts: string[] = [];

  const restoreFetch = installFetchMock(async (input, init) => {
    const url = String(input);

    if (url.endsWith("/sendMessage")) {
      sentTexts.push(extractMessageText(init));
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (url === "https://api.anthropic.com/v1/messages") {
      return new Response("anthropic failure", { status: 500 });
    }

    throw new Error(`Unexpected fetch URL: ${url}`);
  });

  const { supabase, insertCalls } = createMockSupabase();
  try {
    await handleText(
      makeMessage({
        text: "Fallback text idea",
      }),
      makeContext(supabase, { anthropicKey: "anthropic-test-key" }),
    );
  } finally {
    restoreFetch();
  }

  assertEquals(insertCalls.length, 1);
  assertEquals(sentTexts.length, 1);
  assertStringIncludes(sentTexts[0], "Captured as an idea.");
  assertStringIncludes(sentTexts[0], '"Fallback text idea"');
});

Deno.test("handlePhoto builds caption + vision text and streams response", async () => {
  const sentTexts: string[] = [];
  let visionRequestSeen = false;
  let streamingRequestSeen = false;

  const restoreFetch = installFetchMock(async (input, init) => {
    const url = String(input);

    if (url.endsWith("/sendMessage")) {
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
          result: { file_path: "photos/file.png" },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }

    if (url.includes("/file/bot")) {
      return new Response(new Uint8Array([137, 80, 78, 71]), {
        status: 200,
        headers: { "Content-Type": "image/png" },
      });
    }

    if (url === "https://api.anthropic.com/v1/messages") {
      const body = JSON.parse(
        String((init as { body?: BodyInit | null } | undefined)?.body ?? "{}"),
      ) as {
        stream?: boolean;
      };

      if (body.stream) {
        streamingRequestSeen = true;
        const streamBody =
          `data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"Streamed confirmation"}}\n\n` +
          'data: {"type":"message_stop"}\n\n';
        return new Response(streamBody, {
          status: 200,
          headers: { "Content-Type": "text/event-stream" },
        });
      }

      visionRequestSeen = true;
      return new Response(
        JSON.stringify({
          content: [{
            type: "text",
            text: "Whiteboard with product metrics and action items.",
          }],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }

    throw new Error(`Unexpected fetch URL: ${url}`);
  });

  const { supabase, insertCalls } = createMockSupabase({
    companyId: "00000000-0000-0000-0000-000000000987",
  });

  try {
    await handlePhoto(
      makeMessage({
        message_id: 77,
        chat: { id: 654, type: "private" },
        caption: "Please capture this whiteboard",
        photo: [
          {
            file_id: "small-photo-id",
            file_unique_id: "small-photo-unique-id",
            width: 100,
            height: 100,
          },
          {
            file_id: "large-photo-id",
            file_unique_id: "large-photo-unique-id",
            width: 1000,
            height: 800,
          },
        ],
      }),
      makeContext(supabase, { anthropicKey: "anthropic-test-key" }),
    );
  } finally {
    restoreFetch();
  }

  assertEquals(visionRequestSeen, true);
  assertEquals(streamingRequestSeen, true);
  assertEquals(insertCalls.length, 1);
  assertEquals(insertCalls[0]["source_ref"], "telegram:654:77");
  assertEquals(
    insertCalls[0]["raw_text"],
    "Please capture this whiteboard\n\n[Image description]: Whiteboard with product metrics and action items.",
  );
  assertEquals(insertCalls[0]["flags"], undefined);
  assertEquals(sentTexts.length, 1);
  assertEquals(sentTexts[0], "Streamed confirmation");
});

Deno.test("handlePhoto sets vision-failed and retries insert without flags when unsupported", async () => {
  const sentTexts: string[] = [];

  const restoreFetch = installFetchMock(async (input, init) => {
    const url = String(input);

    if (url.endsWith("/sendMessage")) {
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
          result: { file_path: "photos/file.jpg" },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }

    if (url.includes("/file/bot")) {
      return new Response(new Uint8Array([1, 2, 3]), {
        status: 200,
        headers: { "Content-Type": "image/jpeg" },
      });
    }

    throw new Error(`Unexpected fetch URL: ${url}`);
  });

  const { supabase, insertCalls } = createMockSupabase({
    insertErrors: [
      {
        code: "42703",
        message: 'column "flags" of relation "ideas" does not exist',
      },
      null,
    ],
  });

  try {
    await handlePhoto(
      makeMessage({
        message_id: 88,
        chat: { id: 999, type: "private" },
        caption: "Receipt for office chairs",
        photo: [
          {
            file_id: "photo-id",
            file_unique_id: "photo-unique-id",
            width: 300,
            height: 200,
          },
        ],
      }),
      makeContext(supabase, { anthropicKey: "" }),
    );
  } finally {
    restoreFetch();
  }

  assertEquals(insertCalls.length, 2);
  assertEquals(insertCalls[0]["flags"] instanceof Array, true);
  assertEquals(insertCalls[1]["flags"], undefined);
  assertEquals(
    insertCalls[1]["raw_text"],
    "Receipt for office chairs\n\n[Image — description unavailable]",
  );
  assertEquals(sentTexts.length, 1);
  assertStringIncludes(sentTexts[0], "Captured as an idea.");
  assertStringIncludes(sentTexts[0], "Image — description unavailable");
});

Deno.test("handleVoice downloads, transcribes, inserts, and confirms", async () => {
  const draftTexts: string[] = [];
  const sentTexts: string[] = [];

  const restoreFetch = installFetchMock(async (input, init) => {
    const url = String(input);

    if (url.endsWith("/sendMessageDraft")) {
      draftTexts.push(extractMessageText(init));
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (url.endsWith("/sendMessage")) {
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
        from: {
          id: 444,
          is_bot: false,
          first_name: "Tom",
          username: "voicecreator",
        },
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
  assertEquals(
    insertCalls[0]["company_id"],
    "00000000-0000-0000-0000-000000000abc",
  );
  assertEquals(insertCalls[0]["raw_text"], "Transcribed voice idea text");
  assertEquals(insertCalls[0]["source_ref"], "telegram:888:9");
  assertEquals(insertCalls[0]["originator"], "voicecreator");

  assertEquals(draftTexts.length, 1);
  assertStringIncludes(draftTexts[0], "Transcribing your voice note");
  assertEquals(sentTexts.length, 1);
  assertStringIncludes(sentTexts[0], "Captured your voice note");
});

Deno.test("handleVoice streams Claude response after save when anthropic key is set", async () => {
  const draftTexts: string[] = [];
  const sentTexts: string[] = [];
  const streamedChunk = "B".repeat(64);
  let insertCountAtGeneratedDraft = 0;

  const { supabase, insertCalls } = createMockSupabase();

  const restoreFetch = installFetchMock(async (input, init) => {
    const url = String(input);

    if (url.endsWith("/sendMessageDraft")) {
      const text = extractMessageText(init);
      draftTexts.push(text);
      if (text !== "Got it. Transcribing your voice note...") {
        insertCountAtGeneratedDraft = insertCalls.length;
      }
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (url.endsWith("/sendMessage")) {
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

    if (url === "https://api.anthropic.com/v1/messages") {
      const streamBody = [
        `data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"${streamedChunk}"}}\n\n`,
        'data: {"type":"message_stop"}\n\n',
      ].join("");
      return new Response(streamBody, {
        status: 200,
        headers: { "Content-Type": "text/event-stream" },
      });
    }

    throw new Error(`Unexpected fetch URL: ${url}`);
  });

  try {
    await handleVoice(
      makeMessage({
        message_id: 10,
        chat: { id: 889, type: "private" },
        from: {
          id: 445,
          is_bot: false,
          first_name: "Tom",
          username: "voicecreator",
        },
        voice: {
          file_id: "voice-file-id",
          file_unique_id: "voice-unique-id",
          duration: 6,
          mime_type: "audio/ogg",
        },
      }),
      makeContext(supabase, { anthropicKey: "anthropic-test-key" }),
    );
  } finally {
    restoreFetch();
  }

  assertEquals(insertCalls.length, 1);
  assertEquals(draftTexts.length, 2);
  assertEquals(draftTexts[0], "Got it. Transcribing your voice note...");
  assertEquals(draftTexts[1], streamedChunk);
  assertEquals(insertCountAtGeneratedDraft, 1);
  assertEquals(sentTexts.length, 1);
  assertEquals(sentTexts[0], streamedChunk);
});

Deno.test("sendMessageDraft calls Telegram sendMessageDraft endpoint", async () => {
  let calledUrl = "";
  let bodyChatId = 0;
  let bodyText = "";

  const restoreFetch = installFetchMock(async (input, init) => {
    calledUrl = String(input);
    const body = JSON.parse(
      String((init as { body?: BodyInit | null } | undefined)?.body ?? "{}"),
    ) as { chat_id?: number; text?: string };
    bodyChatId = body.chat_id ?? 0;
    bodyText = body.text ?? "";

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  });

  try {
    await sendMessageDraft("telegram-token", 456, "Draft reply");
  } finally {
    restoreFetch();
  }

  assertEquals(
    calledUrl,
    "https://api.telegram.org/bottelegram-token/sendMessageDraft",
  );
  assertEquals(bodyChatId, 456);
  assertEquals(bodyText, "Draft reply");
});

Deno.test("streamToTelegram sends draft updates then final message", async () => {
  const calls: Array<{ url: string; text: string }> = [];

  const restoreFetch = installFetchMock(async (input, init) => {
    calls.push({ url: String(input), text: extractMessageText(init) });
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  });

  try {
    await streamToTelegram(
      "telegram-token",
      123,
      toAsyncChunks(["Hello ", "world"]),
      0,
    );
  } finally {
    restoreFetch();
  }

  const draftCalls = calls.filter((call) =>
    call.url.endsWith("/sendMessageDraft")
  );
  const finalCalls = calls.filter((call) => call.url.endsWith("/sendMessage"));

  assertEquals(draftCalls.length, 2);
  assertEquals(draftCalls[0].text, "Hello ");
  assertEquals(draftCalls[1].text, "Hello world");
  assertEquals(finalCalls.length, 1);
  assertEquals(finalCalls[0].text, "Hello world");
});

Deno.test("streamToTelegram batches close chunks before draft update", async () => {
  const calls: Array<{ url: string; text: string }> = [];

  const restoreFetch = installFetchMock(async (input, init) => {
    calls.push({ url: String(input), text: extractMessageText(init) });
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  });

  const chunks = [
    "a".repeat(20),
    "b".repeat(20),
    "c".repeat(20),
  ];

  try {
    await streamToTelegram(
      "telegram-token",
      123,
      toAsyncChunks(chunks),
      60_000,
    );
  } finally {
    restoreFetch();
  }

  const draftCalls = calls.filter((call) =>
    call.url.endsWith("/sendMessageDraft")
  );
  const finalCalls = calls.filter((call) => call.url.endsWith("/sendMessage"));
  const combined = chunks.join("");

  assertEquals(draftCalls.length, 1);
  assertEquals(draftCalls[0].text, combined);
  assertEquals(finalCalls.length, 1);
  assertEquals(finalCalls[0].text, combined);
});
