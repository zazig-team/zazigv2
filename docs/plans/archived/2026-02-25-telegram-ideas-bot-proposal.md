# Telegram Ideas Bot: Mobile Capture for the Ideas Inbox

**Date:** 2026-02-25
**Status:** Proposal (initial research)
**Author:** CPO
**Related docs:** `2026-02-25-ideas-inbox-proposal.md` (ideas inbox schema/MCP tools), `2026-02-24-idea-to-job-pipeline-design.md` (full pipeline), `2026-02-22-agent-messaging-bidirectional.md` (messaging architecture), `2026-02-25-terminal-first-cpo-design.md` (terminal CPO design)


___
## Tom feedback
2026-02-25 This all looks great but now we need to align the ideas in this, 2026-02-25-ideaify-inbox-proposal.md, 2026-02-25-ideaify-skill-proposal so we're not inventing or designing multiple things that do the same thing.

---

	## Problem Statement

The Ideas Inbox proposal establishes a Supabase table and MCP tools for capturing raw ideas before they enter the pipeline. Seven source channels are defined: terminal, Slack, Telegram, agent, web, API, monitoring.

The terminal channel works well at a desk. The Slack channel works when the user is at a computer. But the highest-value ideas often arrive when the user cannot type:

- Walking the dog and realising the onboarding flow is wrong
- Driving and thinking through a competitor's pricing move
- At the gym, working through a complex architecture decision
- Lying in bed at 2am with a solution to yesterday's blocker

These moments produce long, stream-of-consciousness voice notes -- 5 to 10+ minutes of rambling that may contain 3 to 7 distinct ideas mixed together. Today, these notes either go into Apple Notes (and are forgotten), get sent to a chat app (and require manual re-processing later), or stay in the user's head (and are lost).

The gap is a **mobile-first capture tool** that accepts voice notes, transcribes them reliably, splits the stream into discrete ideas, and writes them directly to the Ideas Inbox in Supabase. Telegram is the natural platform: it is already installed on the user's phone, supports voice messages natively, and has a well-documented bot API.

### Why voice notes are the critical path

Text capture on mobile is a solved problem -- any messaging app can forward text to a webhook. The hard part is voice. Long voice notes break things. The user's existing OpenClaw bot fails on long voice notes because it "overwhelms the context." The voice pipeline needs to be resilient to 10+ minute recordings, handle transcription failures gracefully, and never lose the original audio.

---

## Architecture Overview

```
                                TELEGRAM
                                  |
                          [Telegram Bot API]
                          Webhook → HTTPS POST
                                  |
                                  v
                     ┌──────────────────────────┐
                     │  SUPABASE EDGE FUNCTION   │
                     │  telegram-ideas-webhook    │
                     │                            │
                     │  1. Validate secret        │
                     │  2. Parse message type      │
                     │  3. Store raw input         │
                     │  4. Acknowledge (200 OK)    │
                     │  5. Background: process     │
                     └──────────┬─────────────────┘
                                │
              ┌─────────────────┼─────────────────┐
              │                 │                   │
              v                 v                   v
        TEXT MESSAGE      VOICE NOTE           PHOTO/IMAGE
              │                 │                   │
              │          ┌──────┴──────┐            │
              │          │  Download   │            │
              │          │  .ogg file  │            │
              │          │  Store in   │            │
              │          │  Supabase   │            │
              │          │  Storage    │            │
              │          └──────┬──────┘            │
              │                 │                   │
              │          ┌──────┴──────┐     ┌──────┴──────┐
              │          │ Transcribe  │     │  Download   │
              │          │ (Whisper/   │     │  image,     │
              │          │  Deepgram)  │     │  store in   │
              │          └──────┬──────┘     │  Storage    │
              │                 │            └──────┬──────┘
              │                 │                   │
              │          ┌──────┴──────┐            │
              │          │  Store raw  │            │
              │          │  transcript │            │
              │          └──────┬──────┘            │
              │                 │                   │
              v                 v                   v
         ┌──────────────────────────────────────────────┐
         │           IDEAIFY PROCESSING                  │
         │                                               │
         │  LLM call (Claude Haiku / Sonnet):            │
         │  - Clean up / structure raw text               │
         │  - Identify discrete ideas                     │
         │  - For each idea: title, summary, tags,        │
         │    suggested scope, complexity                  │
         │  - Handle multi-idea splitting                  │
         └──────────────────────┬───────────────────────┘
                                │
                                v
                     ┌──────────────────────────┐
                     │     SUPABASE IDEAS TABLE   │
                     │                            │
                     │  INSERT one row per idea    │
                     │  source = 'telegram'        │
                     │  originator = 'human'       │
                     │  source_ref = telegram msg   │
                     │  raw_text = original input   │
                     │  refined_summary = processed │
                     │  status = 'new'              │
                     └──────────────────────────────┘
                                │
                                v
                     ┌──────────────────────────┐
                     │  CONFIRM TO USER          │
                     │                            │
                     │  "Got it. Created 3 ideas: │
                     │   1. Fix onboarding flow   │
                     │   2. Competitor pricing     │
                     │   3. API rate limiting"     │
                     └──────────────────────────┘
```

### Design Principle: Capture Before Processing

Every step in the pipeline persists its output before the next step begins. A 10-minute voice note must never be lost because a downstream step failed.

```
Step 1: Receive webhook         → Log to ideas_inbox_raw table (message metadata)
Step 2: Download audio file     → Store .ogg in Supabase Storage bucket
Step 3: Transcribe              → Store transcript in ideas_inbox_raw.transcript
Step 4: Process with Ideaify    → Store structured ideas in ideas table
Step 5: Confirm to user         → Send Telegram reply

If Step 3 fails: audio is safe in Storage. Retry transcription.
If Step 4 fails: transcript is safe in raw table. Retry processing.
If Step 5 fails: ideas are already saved. User can check later.
```

This is the critical difference from naive implementations that try to do everything in one pass. Each step writes its output to durable storage. Failures at any point are recoverable.

---

## Voice Note Pipeline (Detailed)

This is the hardest part and the differentiator. Each stage is designed for resilience.

### Stage 1: Receive and Acknowledge

**Trigger:** Telegram sends a webhook POST to the edge function.

**What happens:**
1. Validate the request (check Telegram secret token in query params)
2. Parse the incoming `Update` object
3. Determine message type: text, voice, audio, photo, document
4. Insert a row into `ideas_inbox_raw` with message metadata
5. Return `200 OK` immediately (Telegram will retry if no response within ~60 seconds)
6. Use `EdgeRuntime.waitUntil()` to continue processing in the background

**Why immediate ack matters:** Telegram retries failed webhooks aggressively. If transcription takes 30 seconds and the edge function times out, Telegram sends the same message again. Immediate acknowledgement prevents duplicate processing.

**The `ideas_inbox_raw` table:**

```sql
CREATE TABLE public.ideas_inbox_raw (
    id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id       uuid        NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,

    -- Source
    platform         text        NOT NULL DEFAULT 'telegram'
                                 CHECK (platform IN ('telegram', 'slack', 'whatsapp')),
    platform_user_id text        NOT NULL,   -- Telegram user ID
    platform_msg_id  text,                   -- Telegram message ID
    message_type     text        NOT NULL
                                 CHECK (message_type IN ('text', 'voice', 'audio', 'photo', 'document')),

    -- Raw content
    raw_text         text,                   -- For text messages, or caption on photos
    file_id          text,                   -- Telegram file_id for voice/photo/document
    file_path        text,                   -- Supabase Storage path after download
    file_size_bytes  integer,
    duration_seconds integer,                -- For voice/audio messages

    -- Processing state
    status           text        NOT NULL DEFAULT 'received'
                                 CHECK (status IN (
                                     'received',        -- webhook received, ack sent
                                     'downloading',     -- file download in progress
                                     'downloaded',      -- file stored in Supabase Storage
                                     'transcribing',    -- transcription in progress
                                     'transcribed',     -- transcript available
                                     'processing',      -- Ideaify running
                                     'processed',       -- ideas created
                                     'failed',          -- terminal failure (after retries)
                                     'confirmed'        -- user notified
                                 )),
    transcript       text,                   -- Raw transcript from STT
    error_message    text,                   -- Last error if failed
    retry_count      integer     NOT NULL DEFAULT 0,
    max_retries      integer     NOT NULL DEFAULT 3,

    -- Output
    idea_ids         uuid[],                 -- IDs of ideas created from this message

    -- Timestamps
    created_at       timestamptz NOT NULL DEFAULT now(),
    updated_at       timestamptz NOT NULL DEFAULT now()
);
```

This table is the audit trail and recovery mechanism. If processing fails at any stage, the raw data is preserved and the `status` column tells us exactly where it failed.

### Stage 2: File Download

**For voice notes:**
1. Call Telegram's `getFile` API with the `file_id` from the message
2. Receive a temporary download URL (valid for 60 minutes)
3. Download the file (Telegram voice messages are OGG/Opus format)
4. Upload to Supabase Storage bucket: `ideas-inbox/{company_id}/{raw_id}.ogg`
5. Update `ideas_inbox_raw.file_path` and `status = 'downloaded'`

**File size concern:** Telegram's standard Bot API limits file downloads to **20 MB**. An OGG/Opus voice note at typical Telegram quality (~32kbps) is approximately:

| Duration | Approximate Size |
|----------|-----------------|
| 1 minute | ~240 KB |
| 5 minutes | ~1.2 MB |
| 10 minutes | ~2.4 MB |
| 30 minutes | ~7.2 MB |
| 60 minutes | ~14.4 MB |

The 20 MB limit accommodates voice notes up to roughly 80 minutes. This is sufficient for the target use case (5-15 minute voice notes). For extreme cases (60+ minutes), a self-hosted Telegram Bot API server raises the limit to 4 GB.

**Recommendation:** Standard Bot API for v1. The 20 MB limit is not a practical constraint for voice notes at Telegram's bitrate.

### Stage 3: Transcription

This is the stage most likely to fail and the most expensive per-call. It must be resilient.

**Provider selection** (see Technology Comparison section below for detailed analysis):

| Criterion | OpenAI gpt-4o-transcribe | Deepgram Nova-3 | AssemblyAI Universal-2 |
|-----------|-------------------------|-----------------|----------------------|
| **Cost** | $0.006/min ($0.36/hr) | $0.0043/min ($0.26/hr) | $0.0025/min ($0.15/hr) |
| **Accuracy (English)** | ~6.5% WER | ~8.1% WER | Best-in-class, lowest hallucination |
| **File size limit** | 25 MB (API), auto-chunking available | No hard limit (streaming) | No hard limit (async) |
| **Long audio handling** | `chunking_strategy: "auto"` with VAD | Native, no chunking needed | Native, no chunking needed |
| **Latency (10 min audio)** | ~15-30s | ~10-20s | ~20-40s |
| **Format support** | OGG, MP3, WAV, FLAC, etc. | OGG, MP3, WAV, FLAC, etc. | Most formats |
| **Speaker diarization** | Yes (gpt-4o-transcribe-diarize, same price) | Yes (add-on cost) | Yes (add-on ~$0.02/hr) |
| **Free tier** | $5 credits (~14 hours) | $200 credits (~775 hours) | $50 credits (~333 hours) |

**Primary recommendation: OpenAI gpt-4o-transcribe.**

Rationale:
1. zazigv2 already uses OpenAI for other infrastructure (API key exists)
2. Best accuracy for the price tier ($0.006/min is reasonable for low volume)
3. Native `chunking_strategy: "auto"` handles long audio without manual FFmpeg splitting
4. Diarization at no extra cost (useful if multiple people are brainstorming in the voice note)
5. OGG format is natively supported (no transcoding needed)

**Fallback recommendation: Deepgram Nova-3** if cost becomes a concern at scale. The $200 free tier is generous for prototyping.

**Transcription flow:**

```
1. Read audio file from Supabase Storage
2. Check file size:
   a. Under 25 MB → single API call with chunking_strategy: "auto"
   b. Over 25 MB → split with FFmpeg into 24 MB chunks with 5s overlap
3. Call OpenAI transcription API
4. If chunked: merge transcripts, adjust timestamps, deduplicate overlap
5. Store raw transcript in ideas_inbox_raw.transcript
6. Update status = 'transcribed'
```

**Error handling:**
- API timeout → retry with exponential backoff (max 3 retries)
- Rate limit → queue for retry in 60 seconds
- Transcription garbage (detect via heuristic: transcript length vs audio duration ratio) → flag for manual review
- Permanent failure → status = 'failed', error_message populated, user notified

### Stage 4: Multi-Idea Processing (Ideaify)

This is where a single stream-of-consciousness transcript becomes discrete idea records. This is an LLM problem.

**The challenge:** A 10-minute voice note might contain:

> "So I was thinking about the onboarding flow and it's just too many steps, we need to cut it down to like three screens max. Oh and another thing, the competitor just launched a new pricing tier, we should look at that. Also I keep running into this bug where the session expires during a long operation, that needs fixing. And we should probably add a dark mode at some point, everyone keeps asking. Oh yeah, and the API rate limits are too aggressive for the enterprise plan, that came up in the sales call today."

That is five distinct ideas. The LLM needs to:
1. Identify idea boundaries in the transcript
2. Separate each idea into its own record
3. Clean up the conversational text into a structured summary
4. Assign preliminary metadata (tags, suggested scope, complexity hint)

**Prompt design:**

```
You are an idea extraction assistant for a product team. You will receive
a raw transcript from a voice note. Your job is to:

1. Identify every distinct idea, feature request, bug report, or
   observation in the transcript.
2. For each idea, produce a structured JSON object.
3. Preserve the speaker's intent even when the language is informal.
4. If an idea spans multiple mentions in the transcript (the speaker
   returns to it), consolidate into one idea.
5. If the transcript contains no actionable ideas (just thinking aloud,
   social conversation), return an empty array.

For each idea, return:
{
  "title": "Short title (under 80 chars)",
  "summary": "1-3 sentence description of the idea, written clearly",
  "raw_excerpt": "The relevant portion of the transcript for this idea",
  "tags": ["relevant", "tags"],
  "suggested_scope": "job | feature | project | research",
  "complexity_hint": "trivial | small | medium | large | unknown"
}

Return a JSON array of ideas. Return [] if no actionable ideas found.
```

**Model selection for Ideaify:**
- **Claude 3.5 Haiku** for routine processing (fast, cheap, handles structured extraction well)
- **Claude 3.5 Sonnet** as fallback if Haiku output quality degrades on long/complex transcripts

**Cost estimate for Ideaify LLM call:**
A 10-minute voice note produces approximately 1,500-2,000 words of transcript (~2,000-2,500 tokens input). With the system prompt (~400 tokens) and output (~500 tokens per idea, ~2,500 for 5 ideas):
- Haiku: ~$0.001 per processing call
- Sonnet: ~$0.01 per processing call

This is negligible compared to transcription cost.

### Stage 5: Write to Ideas Inbox

For each idea extracted by Ideaify:

```typescript
// For each idea from the LLM response:
const ideaRecord = {
  company_id: companyId,
  raw_text: idea.raw_excerpt,
  refined_summary: idea.summary,
  tags: idea.tags,
  source: 'telegram',
  originator: 'human',
  source_ref: `telegram:${chatId}:${messageId}`,
  status: 'new',
  suggested_scope: idea.suggested_scope,
  complexity_estimate: idea.complexity_hint,
  priority: 'medium', // default; CPO triages later
};

// Insert into ideas table
const { data, error } = await supabase
  .from('ideas')
  .insert(ideaRecord)
  .select('id')
  .single();
```

Update the raw record:
```typescript
await supabase
  .from('ideas_inbox_raw')
  .update({
    status: 'processed',
    idea_ids: createdIdeaIds,
  })
  .eq('id', rawId);
```

### Stage 6: Confirm to User

Send a Telegram reply summarizing what was captured:

```
Got it. Created 3 ideas from your voice note:

1. Simplify onboarding flow (feature, medium)
   "Cut onboarding to 3 screens max"

2. Competitor pricing analysis (research, small)
   "Competitor launched new pricing tier, needs investigation"

3. Session expiry during long operations (job, small)
   "Fix bug: session expires during long-running operations"

These are now in the inbox. Your CPO will triage them.
```

If processing produced zero ideas:
```
I listened to your voice note but didn't find any actionable ideas.
If you think I missed something, try sending the key points as text.
```

---

## User Identification

Map Telegram users to zazig company users. Simple lookup table.

```sql
CREATE TABLE public.telegram_users (
    id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id       uuid        NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    telegram_user_id text        NOT NULL,
    telegram_username text,
    display_name     text,
    is_active        boolean     NOT NULL DEFAULT true,
    created_at       timestamptz NOT NULL DEFAULT now(),

    UNIQUE (company_id, telegram_user_id)
);
```

**Registration flow:**
1. User messages the bot for the first time
2. Bot checks `telegram_users` for their Telegram user ID
3. Not found: "Welcome. What is your company code?" (short code or invite link)
4. User provides code, bot verifies against companies table
5. Bot creates `telegram_users` record linking Telegram ID to company
6. Subsequent messages route to that company's ideas inbox

**Multi-company support:** A Telegram user who works with multiple zazig companies can have multiple records in `telegram_users`. The bot uses the most recently active company, or asks if ambiguous: "You're linked to Acme Corp and Beta Inc. Which company is this idea for?"

---

## Architecture Options Analysis

### Option A: Supabase Edge Functions (Recommended for v1)

```
Telegram → Webhook → Supabase Edge Function → Process → Supabase DB
```

**Pros:**
- Zero additional infrastructure -- uses existing Supabase project
- Official Supabase example exists for Telegram bot webhooks with grammY
- Background tasks via `EdgeRuntime.waitUntil()` handle async processing
- Edge functions already used throughout zazigv2
- Free on Supabase Pro plan (500K invocations/month, 100 hours compute)

**Cons:**
- 400-second wall clock time limit per invocation
- 2-second CPU time limit (does not include I/O wait, so transcription API calls are fine)
- No persistent state between invocations (stateless)
- Complex voice processing (FFmpeg chunking) may be difficult in Deno runtime

**Constraint analysis:** A 10-minute voice note transcription takes ~15-30 seconds of API wait time (well within the 400-second wall clock limit). The CPU-intensive work is minimal (parsing JSON, making HTTP calls). The main risk is the Supabase edge function timeout on very long transcriptions, but `waitUntil()` allows the function to return a response immediately and continue processing in the background.

**Verdict:** Viable for v1. The constraints do not bite for the target use case.

### Option B: Dedicated Server (Node.js + grammY)

```
Telegram → Webhook → Node.js server → Process → Supabase DB
```

**Pros:**
- No execution time limits
- Full Node.js ecosystem (FFmpeg bindings, streaming libraries)
- Can run long-polling instead of webhooks (simpler local dev)
- Can hold state between messages (conversation context)

**Cons:**
- Additional infrastructure to deploy and maintain
- Need hosting (Railway, Fly.io, VPS)
- Need process management, health monitoring, restart logic
- Overkill for the message volume expected (tens of messages/day, not thousands)

**Verdict:** Better for scale, but premature for v1. The added infrastructure cost is not justified until the edge function constraints actually bite.

### Option C: Vercel AI SDK / Serverless Functions

```
Telegram → Webhook → Vercel Function → AI SDK → Process → Supabase DB
```

**Pros:**
- Vercel AI SDK provides structured output, streaming, and model abstraction
- Familiar deployment model for teams already on Vercel
- Generous free tier

**Cons:**
- Another platform to manage (zazigv2 is already on Supabase)
- Vercel serverless functions have similar time limits (60s on Hobby, 300s on Pro)
- No clear advantage over Supabase edge functions for this use case
- Adds a dependency on Vercel

**Verdict:** No clear advantage. Introduces unnecessary platform complexity.

### Option D: Zazigv2 Contractor

```
Telegram → Webhook → Edge Function → Create job → Orchestrator → Contractor processes
```

**Pros:**
- Fits the org model pattern (contractor processes incoming messages)
- Reuses existing dispatch infrastructure
- Contractor gets full prompt stack, knowledge, skills

**Cons:**
- Massive latency overhead: webhook -> DB -> orchestrator poll -> dispatch -> Claude Code launch -> process -> respond. This takes 30-60 seconds minimum for something that should take 5-10 seconds.
- Overkill: the Ideaify processing is a simple LLM call, not a complex multi-step task that needs the full contractor prompt stack
- Cost: spinning up a Claude Code session for each Telegram message is expensive compared to a single API call

**Verdict:** Architecturally elegant but practically wrong. A Telegram message needs a response in seconds, not minutes. The contractor model is designed for multi-minute complex tasks.

### Recommendation: Option A (Supabase Edge Functions)

Start with a single edge function (`telegram-ideas-webhook`) that handles the full pipeline. If voice processing becomes too complex for the Deno runtime, extract just the transcription step into a separate edge function that the webhook function calls.

---

## Technology Comparison: Speech-to-Text

### Detailed Provider Analysis

#### OpenAI gpt-4o-transcribe

- **Price:** $0.006/min ($0.36/hr). gpt-4o-mini-transcribe at $0.003/min for cost-sensitive workloads.
- **File limit:** 25 MB per request. Native `chunking_strategy: "auto"` uses VAD to find natural boundaries.
- **Accuracy:** ~6.5% WER (English). Lower error rate than original Whisper. Reduced hallucination.
- **Long audio:** With `chunking_strategy: "auto"`, the API handles long files natively. For files over 25 MB, client-side FFmpeg chunking with 5-second overlap is required.
- **Format:** OGG natively supported (no transcoding needed for Telegram voice notes).
- **Diarization:** gpt-4o-transcribe-diarize at same $0.006/min price includes speaker identification.
- **Streaming:** Not supported for Whisper-1, but gpt-4o-transcribe supports streaming responses.
- **Integration:** REST API, official OpenAI Node.js SDK.

#### Deepgram Nova-3

- **Price:** $0.0043/min pre-recorded ($0.26/hr). $200 free credits.
- **File limit:** No hard limit for pre-recorded uploads. Handles long audio natively.
- **Accuracy:** ~8.1% WER (English). Strong on noisy audio.
- **Long audio:** No chunking needed. Send the full file, get the full transcript.
- **Format:** Broad format support including OGG.
- **Diarization:** Available as add-on (additional cost ~$0.001-0.002/min).
- **Latency:** Sub-300ms for streaming. ~10-20s for 10-minute pre-recorded files.
- **Billing:** Per-second, no rounding. Efficient for short clips.
- **Integration:** REST API, official Deepgram Node.js SDK.

#### AssemblyAI Universal-2

- **Price:** $0.0025/min ($0.15/hr). $50 free credits. Cheapest per-minute.
- **File limit:** No hard limit for async transcription.
- **Accuracy:** Best-in-class. 30% reduction in hallucination vs Whisper Large-v3. 21% improvement in alphanumeric accuracy.
- **Long audio:** Native async processing. Submit URL, poll for results.
- **Format:** Broad format support.
- **Diarization:** Built-in (+$0.02/hr). Also offers sentiment analysis, PII detection, summarization.
- **Latency:** 30-minute file processed in ~23 seconds. Very fast async pipeline.
- **Billing:** Per-second, no rounding.
- **Integration:** REST API, official Node.js/Python SDKs.
- **Extra features:** Topic detection, content safety, auto-chapters. Some of these could enhance Ideaify processing (e.g., topic detection for multi-idea splitting).

### Cost Projection

Assumptions: 5 voice notes/day average, 7 minutes average duration, 30 days/month.

| Provider | Monthly Audio | Cost/month |
|----------|-------------|------------|
| OpenAI gpt-4o-transcribe | 1,050 min | $6.30 |
| OpenAI gpt-4o-mini-transcribe | 1,050 min | $3.15 |
| Deepgram Nova-3 | 1,050 min | $4.52 |
| AssemblyAI Universal-2 | 1,050 min | $2.63 |

At this volume, the cost difference between providers is under $4/month. Provider choice should be driven by accuracy, integration simplicity, and long-audio handling rather than cost.

**At 10x scale** (50 voice notes/day, 10,500 min/month):

| Provider | Cost/month |
|----------|-----------|
| OpenAI gpt-4o-transcribe | $63.00 |
| OpenAI gpt-4o-mini-transcribe | $31.50 |
| Deepgram Nova-3 | $45.15 |
| AssemblyAI Universal-2 | $26.25 |

Still modest. Transcription cost is not a scaling concern for this use case.

---

## Multi-Idea Splitting: Approaches

The multi-idea splitting problem is essentially topic segmentation on informal, stream-of-consciousness text. Research identifies three viable approaches.

### Approach 1: LLM-Based Segmentation (Recommended)

Pass the full transcript to an LLM with an extraction prompt (as described in Stage 4 above). The LLM identifies idea boundaries, consolidates related mentions, and outputs structured JSON.

**Pros:**
- Handles informal language, topic jumps, and partial references naturally
- Can consolidate ideas mentioned multiple times
- Produces structured output in one call
- No pre-processing infrastructure needed

**Cons:**
- LLM may miss subtle ideas or hallucinate ideas that were not present
- Quality depends on prompt engineering
- Context window limits apply (though a 10-minute transcript is only ~2,500 tokens -- well within any model's context)

**Mitigation:** Include the raw transcript excerpt for each idea in the output. The user sees what the LLM interpreted and can correct errors.

### Approach 2: AssemblyAI Auto-Chapters + LLM

AssemblyAI's auto-chapters feature automatically segments audio into topic-based chapters with headlines and summaries. Use this as a pre-processing step before the LLM.

**Pros:**
- Audio-level segmentation may be more accurate than text-level (uses pauses, tone shifts)
- Reduces LLM work to cleanup and structuring

**Cons:**
- Vendor lock-in to AssemblyAI
- Additional API cost
- May not align with "idea" boundaries (a chapter about one topic may contain multiple ideas)

### Approach 3: Embedding-Based Semantic Segmentation

Split the transcript into sentences, generate embeddings, and cluster by semantic similarity. Topic boundaries appear where embedding similarity drops.

**Pros:**
- No LLM call needed (just embeddings)
- Deterministic, reproducible

**Cons:**
- Significant infrastructure overhead (embedding generation, clustering logic)
- Brittle on informal text (sentence boundaries in speech are fuzzy)
- Over-engineered for the expected volume

### Recommendation: Approach 1 (LLM-based)

At the expected volume (5-10 voice notes/day), the LLM approach is the simplest, cheapest, and most accurate. The transcript fits easily in a single context window. The structured JSON output integrates directly with the ideas table. If quality issues emerge, Approach 2 (AssemblyAI auto-chapters) can be added as pre-processing without changing the pipeline.

---

## Photo/Screenshot Handling

Simpler than voice notes but still valuable. Users often screenshot competitor UIs, error messages, or whiteboard sketches.

**Pipeline:**
1. Download image via Telegram `getFile` API
2. Store in Supabase Storage: `ideas-inbox/{company_id}/{raw_id}.{ext}`
3. If caption present: use caption as `raw_text`
4. If no caption: use vision model (Claude 3.5 Haiku with vision) to describe the image
5. Process through Ideaify (with image context if available)
6. Create idea record with `file_path` reference

**Vision model prompt:**
```
Describe this image in the context of product development.
What is it showing? If it's a UI screenshot, describe the layout
and any issues visible. If it's a competitor screenshot, identify
the product and what's notable. If it's a sketch or whiteboard,
describe the concepts drawn. Keep it under 200 words.
```

**Cost:** Claude 3.5 Haiku vision: ~$0.001 per image analysis. Negligible.

---

## Telegram Bot Implementation

### Framework: grammY

grammY is the recommended TypeScript framework for the Telegram bot. It is the most modern option, has first-class TypeScript support, excellent documentation, and an official Supabase Edge Functions hosting guide.

**Key advantages for this project:**
- Native Deno support (Supabase edge functions run on Deno)
- Webhook handler works out of the box with edge functions
- File download helpers built in
- Type-safe message parsing

### Bot Commands

| Command | Description |
|---------|-------------|
| `/start` | Registration flow (link Telegram account to company) |
| `/status` | Show inbox summary ("12 ideas: 5 new, 4 triaged, 3 parked") |
| `/recent` | Show last 5 ideas with status |
| `/company` | Switch active company (multi-company users) |
| `/help` | Usage instructions |

Any non-command message (text, voice, photo) is treated as an idea submission.

### Webhook Setup

```typescript
// supabase/functions/telegram-ideas-webhook/index.ts

import { Bot, webhookCallback } from "https://deno.land/x/grammy/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const bot = new Bot(Deno.env.get("TELEGRAM_BOT_TOKEN")!);
const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

// Handle text messages
bot.on("message:text", async (ctx) => {
  const companyId = await lookupCompany(ctx.from.id);
  if (!companyId) {
    return ctx.reply("You're not linked to a company yet. Use /start to register.");
  }

  // Insert raw record
  const rawId = await insertRawRecord(companyId, ctx);

  // Process in background
  EdgeRuntime.waitUntil(processTextIdea(rawId, companyId, ctx));

  // Acknowledge immediately
  await ctx.reply("Processing your idea...");
});

// Handle voice messages
bot.on("message:voice", async (ctx) => {
  const companyId = await lookupCompany(ctx.from.id);
  if (!companyId) {
    return ctx.reply("You're not linked to a company yet. Use /start to register.");
  }

  const duration = ctx.message.voice.duration;
  const rawId = await insertRawRecord(companyId, ctx);

  // Process in background
  EdgeRuntime.waitUntil(processVoiceIdea(rawId, companyId, ctx));

  // Acknowledge with duration context
  if (duration > 300) {
    await ctx.reply(
      `Got your ${Math.round(duration / 60)}-minute voice note. ` +
      `This may take a moment to transcribe. I'll message you when it's processed.`
    );
  } else {
    await ctx.reply("Processing your voice note...");
  }
});

// Handle photos
bot.on("message:photo", async (ctx) => {
  // Similar pattern: insert raw, process in background, ack
});

// Webhook handler
Deno.serve(webhookCallback(bot, "std/http"));
```

---

## Failure Modes and Recovery

| Failure | Impact | Recovery |
|---------|--------|----------|
| **Telegram webhook down** | Messages not received | Telegram retries for up to 24 hours with increasing delays |
| **Edge function timeout** | Processing interrupted mid-way | `ideas_inbox_raw` status column shows where it stopped. Manual or cron retry. |
| **File download fails** | Cannot retrieve audio | `file_id` is preserved. `getFile` can be called again (Telegram keeps files for at least 1 hour). Retry with backoff. |
| **Transcription API down** | Audio file exists but no transcript | Audio safe in Supabase Storage. Retry transcription when API recovers. |
| **Transcription garbage** | LLM receives bad input | Heuristic check: if transcript is <10% or >200% of expected word count for the duration, flag for manual review. |
| **Ideaify LLM fails** | Transcript exists but no ideas | Transcript safe in `ideas_inbox_raw`. Create a single idea with the raw transcript as `raw_text` and let the CPO triage manually. |
| **Ideaify produces zero ideas** | User sent a non-idea voice note | Reply: "I listened but didn't find actionable ideas. Try sending the key points as text." |
| **Supabase DB write fails** | Ideas not persisted | Retry with backoff. If persistent, write to local log and alert. |
| **Telegram reply fails** | User not notified | Ideas are already saved. User can check `/status`. Non-critical failure. |

### Retry Strategy

```typescript
async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  baseDelayMs: number = 1000
): Promise<T> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (attempt === maxRetries) throw error;
      const delay = baseDelayMs * Math.pow(2, attempt); // exponential backoff
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  throw new Error("Unreachable");
}
```

### Dead Letter Queue

Messages that fail all retries get `status = 'failed'` in `ideas_inbox_raw`. A daily sweep (cron job or CPO periodic check) surfaces failed messages:

```sql
SELECT * FROM ideas_inbox_raw
WHERE status = 'failed'
  AND created_at > now() - interval '7 days'
ORDER BY created_at DESC;
```

The CPO can manually review and retry, or the user can resend the message.

---

## Security Considerations

### Bot Token Security
- Telegram bot token stored in Supabase Edge Function secrets (environment variable)
- Never exposed in client code or logs
- Webhook URL includes the bot token as a query parameter for verification (Telegram standard pattern)

### User Authentication
- Telegram user ID is verified by Telegram's webhook signing (messages come from Telegram servers)
- Company association requires a registration step (invite code or link)
- No Supabase auth tokens are exposed to the Telegram client

### Data Privacy
- Voice notes are stored in Supabase Storage with per-company bucket isolation
- Transcripts are stored in `ideas_inbox_raw` with RLS (company_id scoped)
- Audio files can be automatically deleted after successful transcription (configurable retention policy)
- Transcription via OpenAI API: audio is sent to OpenAI for processing. Their data usage policy applies. For sensitive companies, self-hosted Whisper is an alternative.

### Rate Limiting
- Per-user rate limit: 20 messages per hour (prevent abuse)
- Per-company rate limit: 100 messages per hour
- Enforced at the edge function level via a simple counter in Supabase

---

## Cost Summary

### Per-Message Cost Estimate

| Component | Text Message | 5-min Voice Note | 10-min Voice Note | Photo |
|-----------|-------------|------------------|-------------------|-------|
| Supabase Edge Function | Free (within limits) | Free | Free | Free |
| Supabase Storage | ~0 | ~$0.000002 | ~$0.000004 | ~$0.00001 |
| Transcription (gpt-4o-transcribe) | -- | $0.03 | $0.06 | -- |
| Ideaify LLM (Haiku) | ~$0.001 | ~$0.001 | ~$0.001 | ~$0.001 |
| Vision analysis (Haiku) | -- | -- | -- | ~$0.001 |
| **Total per message** | **~$0.001** | **~$0.031** | **~$0.061** | **~$0.002** |

### Monthly Cost at Expected Volume

| Scenario | Messages/month | Est. Cost |
|----------|---------------|-----------|
| Light use (1-2 ideas/day) | ~50 | $1-3 |
| Medium use (5-10 ideas/day, mix of text and voice) | ~225 | $5-10 |
| Heavy use (20+ ideas/day, mostly voice) | ~600 | $20-40 |

The dominant cost is transcription. All other components are effectively free at this scale.

---

## Implementation Sequence

| Step | What | Complexity | Depends On |
|------|------|-----------|------------|
| 1 | Create Telegram bot via BotFather, get token | Trivial | Nothing |
| 2 | Migration: `ideas_inbox_raw` table, `telegram_users` table | Simple | Ideas inbox migration (from ideas-inbox-proposal) |
| 3 | Supabase Storage bucket: `ideas-inbox` | Simple | Nothing |
| 4 | Edge function: `telegram-ideas-webhook` (text messages only) | Medium | Steps 1-3 |
| 5 | Telegram user registration flow (`/start` command) | Simple | Step 4 |
| 6 | Voice note download and storage | Medium | Steps 3-4 |
| 7 | Transcription integration (OpenAI gpt-4o-transcribe) | Medium | Step 6 |
| 8 | Ideaify processing (multi-idea extraction) | Medium | Step 7 + ideas inbox MCP tools |
| 9 | Photo handling with vision | Simple | Steps 4, 6 |
| 10 | Confirmation replies and `/status` command | Simple | Steps 4-8 |
| 11 | Rate limiting and error handling | Simple | Step 4 |
| 12 | End-to-end testing (text, voice, photo, error recovery) | Medium | All above |

**Total estimate:** 8-10 jobs. Steps 1-5 are the text-only MVP. Steps 6-8 add voice. Steps 9-11 add polish. Step 12 validates the whole pipeline.

**Critical path:** Steps 6-8 (voice download, transcription, Ideaify). Everything else is straightforward.

---

## Open Questions

### 1. Telegram Bot Token Management

Where does the bot token live? Options:
- **A) Supabase secrets** (per-company): each company could have its own bot. Complex but isolated.
- **B) Single zazig bot** with per-company routing: one bot for all zazig customers. Simpler but shared infrastructure.

Recommendation: **(B)** single bot for v1. "Zazig Ideas" bot, shared across all companies. Company routing handled by the `telegram_users` lookup table. Per-company bots are a v2 customization.

### 2. Ideaify Skill vs Inline Processing

Should the multi-idea extraction use the existing Ideaify skill (when built), or should it be a standalone prompt in the edge function?

Options:
- **A) Inline prompt** in the edge function. Simpler, no dependency on skill infrastructure.
- **B) Call the Ideaify skill** via some interface. More consistent with the skill architecture.

Recommendation: **(A)** inline for v1. The Ideaify skill is designed for the CPO's terminal context with full prompt stack. The Telegram edge function needs a lightweight, fast extraction. The prompt can be aligned with the Ideaify skill later.

### 3. Conversation Context

Should the bot maintain conversation context between messages? e.g., "add to my last idea: also consider the mobile layout."

Options:
- **A) Stateless**: each message is independent. Simpler.
- **B) Session context**: maintain a 5-minute window where follow-up messages append to the previous idea.

Recommendation: **(A)** stateless for v1. Users can send everything in one voice note. Multi-message idea building is a UX niceity for v2.

### 4. Offline/Queued Processing

What happens if the edge function cannot complete transcription within the wall clock limit?

Options:
- **A) pg_cron retry**: a scheduled function checks for `status = 'downloading'` or `status = 'transcribing'` records that are stale and retries them.
- **B) Supabase database webhooks**: a trigger on `ideas_inbox_raw` INSERT fires a separate processing function.
- **C) Accept the constraint**: the 400-second wall clock limit is generous. A 10-minute voice note transcription takes ~30 seconds. Do not over-engineer.

Recommendation: **(C)** for v1, with **(A)** as insurance. Monitor actual processing times before adding retry infrastructure.

### 5. Audio Retention Policy

How long should voice note files be kept in Supabase Storage?

Options:
- **A) Forever**: full audit trail. Storage cost is ~$0.02/GB/month. 1,000 voice notes at ~2 MB each = ~2 GB = ~$0.04/month.
- **B) 30 days**: enough for debugging. Auto-delete via Supabase lifecycle policy.
- **C) Delete after successful transcription**: minimal storage, but no recovery if transcript quality is later questioned.

Recommendation: **(A)** for now. The storage cost is trivial. Revisit if volume grows significantly.

### 6. Multi-Language Support

The user may send voice notes in languages other than English. OpenAI gpt-4o-transcribe supports 57+ languages with auto-detection.

Recommendation: auto-detection for v1, with the transcript language stored as metadata. Ideaify processing should work in any language Claude supports. No special handling needed.

### 7. Voice Note from Multiple Speakers

If two people are brainstorming together and one records a voice note, should diarization (speaker identification) be used?

Recommendation: enable gpt-4o-transcribe-diarize (same price as standard transcription). Store speaker labels in the transcript. The Ideaify prompt can attribute ideas to speakers. Low cost, potentially high value.

---

## What This Does NOT Cover

- **Two-way conversation with the CPO via Telegram.** This is a capture-only tool. If you want to talk to the CPO, use the terminal. The bot does not route messages to the CPO for real-time conversation.
- **Telegram as a notification channel.** The bot does not send proactive notifications ("Your feature shipped!"). That is a separate concern (outbound messaging). Could be added later.
- **WhatsApp, iMessage, or other platforms.** The architecture (raw table, Ideaify processing, ideas table) is platform-agnostic. Only the webhook and file download code is Telegram-specific. Adding WhatsApp would be a new edge function with the same processing pipeline.
- **Real-time streaming transcription.** Voice notes are processed after recording is complete. Live transcription during recording is not supported and not needed for the capture use case.
- **Editing ideas after submission.** Users cannot edit or delete ideas via Telegram. The CPO handles triage in the terminal. A future Telegram command (`/edit`, `/delete`) could be added.

---

## Compatibility with Existing Architecture

| Existing Component | Impact |
|-------------------|--------|
| **Ideas Inbox table** (`ideas`) | New records inserted with `source = 'telegram'`. No schema changes. |
| **Ideas MCP tools** | Not used directly. The edge function writes to the DB via Supabase client. CPO triages ideas created by the bot using existing MCP tools. |
| **CPO role prompt** | No changes. The CPO already triages `new` ideas from any source. Telegram ideas appear in the same inbox sweep. |
| **Orchestrator** | No changes. The bot does not interact with the orchestrator. |
| **Terminal-first CPO** | Compatible. The bot creates ideas; the CPO triages them in the terminal. |
| **Agent messaging** | Separate concern. The bot has its own webhook, not routed through the agent messaging system. |
| **Events table** | `idea_created` events will fire for bot-created ideas (same as any other source). |

The Telegram bot is a **leaf node** in the architecture -- it writes to the ideas table and nothing else reads from the bot-specific tables. This isolation means it cannot break existing functionality.

---

## Summary

The Telegram Ideas Bot is a mobile-first capture tool that writes to the existing Ideas Inbox via a Supabase Edge Function. It handles text, voice, and photo input. The voice pipeline is the critical path: download audio, store in Supabase Storage, transcribe with OpenAI gpt-4o-transcribe, extract discrete ideas with an LLM, and write to the ideas table. Every stage persists its output before proceeding, ensuring a 10-minute voice note is never lost.

The architecture is deliberately simple -- one edge function, one webhook, one storage bucket, two database tables (raw log + user mapping). No additional servers, no queue infrastructure, no container orchestration. The expected volume (5-50 messages/day) is well within Supabase Edge Function limits.

The estimated total cost is $5-40/month depending on voice note volume, dominated by transcription. Implementation is 8-10 jobs, with the voice pipeline (steps 6-8) as the critical path.

---

## Sources

Research conducted during proposal preparation:

- [Telegram Bot API](https://core.telegram.org/bots/api) -- file handling, voice message limits, webhook spec
- [grammY Framework](https://grammy.dev/) -- TypeScript Telegram bot framework, Supabase hosting guide
- [Supabase: Building a Telegram Bot](https://supabase.com/docs/guides/functions/examples/telegram-bot) -- official edge function example
- [Supabase: Edge Functions Limits](https://supabase.com/docs/guides/functions/limits) -- wall clock, CPU, background tasks
- [Supabase: Background Tasks](https://supabase.com/docs/guides/functions/background-tasks) -- `EdgeRuntime.waitUntil()` pattern
- [OpenAI API Pricing](https://openai.com/api/pricing/) -- gpt-4o-transcribe, whisper-1 costs
- [OpenAI Whisper API File Limits](https://community.openai.com/t/whisper-api-increase-file-limit-25-mb/566754) -- 25 MB limit, chunking strategies
- [Deepgram Pricing](https://deepgram.com/pricing) -- Nova-3 pre-recorded rates
- [AssemblyAI Pricing](https://www.assemblyai.com/pricing) -- Universal-2 rates, add-on costs
- [Deepgram STT API Comparison 2025](https://deepgram.com/learn/speech-to-text-api-pricing-breakdown-2025) -- cross-provider cost analysis
- [AssemblyAI vs Deepgram vs Whisper (2026)](https://www.index.dev/skill-vs-skill/ai-whisper-vs-assemblyai-vs-deepgram) -- accuracy benchmarks
- [Telegram Limits](https://limits.tginfo.me/en) -- file size limits, message constraints
- [Supabase: ElevenLabs Transcription Telegram Bot](https://supabase.com/docs/guides/functions/examples/elevenlabs-transcribe-speech) -- similar architecture reference
- [Document Segmentation with LLMs](https://python.useinstructor.com/examples/document_segmentation/) -- idea splitting approach
- [Automate Video Chaptering with LLMs](https://towardsdatascience.com/automate-video-chaptering-with-llms-and-tf-idf-f6569fd4d32b/) -- transcript segmentation patterns
