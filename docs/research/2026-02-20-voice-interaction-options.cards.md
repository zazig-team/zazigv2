# Card Catalog: Voice Interaction for Zazig Exec Agents
**Source:** `docs/research/2026-02-20-voice-interaction-options.md`
**Board:** Interaction (6994c067bcac80f956c64cce)
**Generated:** 2026-02-20T00:00:00Z
**Numbering:** tier.index (T1 = spikes, T2 = build, T3 = integration)

---

## Build Sequence

**Critical path:** `T1.1 (ElevenAgents spike) → T2.1 (voice gateway) → T3.1 (voice UI)`

```
T1.1 ElevenAgents spike ─────────────────────────────────────────┐
T1.2 Qwen3-TTS concept  ─── (if Qwen wins) ──► T2.2 Personality→Voice ─► T2.3 Pipecat pipeline ─┐
T1.3 PersonaPlex baseline ── (quality bar only)                                                    │
                                                                                                    ├──► T3.1 Voice UI
                                     T2.1 Voice gateway (ElevenAgents) ───────────────────────────┘
```

**How they build on each other:**

- **T1.1 (ElevenAgents spike)** — first, no dependencies. Validates whether managed pipeline UX is acceptable. Produces: a verdict on ElevenAgents and a quality baseline.
- **T1.2 (Qwen3-TTS concept)** ← independent, parallel with T1.1. Validates whether personality→VoiceDesign translation produces distinct character. Produces: sample voice descriptions per exec + subjective quality assessment.
- **T1.3 (PersonaPlex baseline)** ← after T1.1. Uses T1.1 as comparison point. Rent GPU, feel full-duplex. Produces: quality bar to help choose path.
- **T2.1 (Voice gateway)** ← T1.1 must pass. Takes exec `roles` row schema from T1.1 exploration, produces WebSocket API matching ElevenAgents wire format.
- **T2.2 (Personality → voice description)** ← T1.2 must demonstrate viable mapping. Takes personality coordinate schema, produces deterministic voice description strings.
- **T2.3 (Pipecat pipeline)** ← T2.2 produces voice descriptions. Assembles full open-source stack, containerised, exposes WebSocket matching T2.1's interface so T3.1 works with either backend.
- **T3.1 (Voice UI)** ← T2.1 OR T2.3 (whichever path is chosen). Takes WebSocket audio API, produces browser voice interface for exec onboarding flow.

**What to ship first:** T1.1 and T1.2 run in parallel (both are free/cheap spikes). T1.3 only after T1.1. Path decision unlocks T2.x. T3.1 is blocked until at least one T2 card ships.

---

### T1.1 -- ElevenAgents exec voice spike
| Field | Value |
|-------|-------|
| Type | Research |
| Complexity | Low |
| Model | Sonnet 4.6 |
| Labels | research, needs-human |
| Depends on | -- |
| Assigned | _unassigned_ |
| Trello | _not pushed_ |

**What:** Wire up one exec agent (CPO or CTO) to ElevenLabs ElevenAgents using their existing Claude system prompt and a selected canonical voice. Run a live voice conversation. Uses ElevenLabs free tier (15 minutes).

**Why:** ElevenAgents is the lowest-effort path to exec voice interaction. It wraps our existing Claude models with managed ASR + TTS + turn-taking. This spike validates whether the UX feels right before we invest in infrastructure. It also provides a quality baseline for comparing other options.

**Files:**
- No code changes required for the spike itself
- Notes go in `docs/research/2026-02-20-voice-interaction-options.md` (Raw Notes section)

**Gotchas:**
- ElevenLabs account required — accept terms, enable ElevenAgents
- Use `eleven_v3_conversational` model, not Flash — better expressiveness despite slightly higher latency
- Test with interruptions: talk over the agent mid-sentence. This is where pipeline vs. full-duplex quality difference shows up most
- ElevenLabs is absorbing LLM costs now but will pass them through eventually — factor into production cost estimates
- Tom must run this manually — it needs a mic and a browser

**Implementation Prompt:**
> Set up an ElevenLabs ElevenAgents agent to represent the CTO exec persona from the zazig system.
>
> 1. Create an ElevenLabs account if not already done. Navigate to ElevenAgents (formerly Conversational AI).
> 2. Create a new agent. Set the system prompt to the CTO's current system prompt from the zazig `roles` table (role: `cto`). Use Claude Sonnet as the LLM.
> 3. Select voice: browse the ElevenLabs voice library and pick a voice that feels like a technically sharp, precise male voice. Note the voice ID for later.
> 4. Set TTS model to `eleven_v3_conversational` (not Flash).
> 5. Run at least 3 conversations: (a) casual — ask the CTO what they're working on; (b) technical — ask for architecture advice on the voice pipeline options; (c) interruption test — cut across the agent mid-sentence.
> 6. Note: response latency, voice character, persona consistency, interruption handling quality.
> 7. Document findings in `docs/research/2026-02-20-voice-interaction-options.md` under a new "Spike Results" section.
>
> Source doc: `docs/research/2026-02-20-voice-interaction-options.md`

---

### T1.2 -- Qwen3-TTS VoiceDesign concept proof
| Field | Value |
|-------|-------|
| Type | Research |
| Complexity | Low |
| Model | Sonnet 4.6 |
| Labels | research, claude-ok |
| Depends on | -- |
| Assigned | _unassigned_ |
| Trello | _not pushed_ |

**What:** Spin up the Qwen3-TTS 1.7B VoiceDesign model locally or via Replicate API. For each exec role (CPO, CTO, Senior Engineer), derive a voice description string from their personality coordinates and generate sample speech. Evaluate whether distinct personalities produce meaningfully distinct voices.

**Why:** Qwen3-TTS VoiceDesign is the most architecturally interesting option for zazig — it makes exec voice a deterministic function of personality coordinates rather than a manual selection. This spike proves whether the concept works before investing in a full Pipecat pipeline. Apache 2.0 license means no ongoing legal friction.

**Files:**
- No production code changes — spike output goes in `docs/research/2026-02-20-voice-interaction-options.md`
- Optional scratch script: `scripts/voice-design-spike.py`

**Gotchas:**
- VoiceDesign needs the **1.7B** model variant — the 0.6B CustomVoice won't do it
- CUDA required for local inference. If no CUDA: use Replicate API (`replicate.com/qwen/qwen3-tts`) to avoid GPU setup
- Voice descriptions must be in natural language: "a measured, dry voice with low emotional affect and precise cadence" — not JSON coordinates. You need to translate numeric coords → English description first.
- The model may not reliably distinguish subtle personality differences — test with extremes first (high warmth CPO vs. low warmth CTO)
- DashScope API (Alibaba Cloud) has potential latency/compliance issues; prefer Replicate or self-host

**Implementation Prompt:**
> Prototype the Qwen3-TTS VoiceDesign concept for zazig exec personalities.
>
> 1. Read the personality coordinates for CPO, CTO, and Senior Engineer from the zazig Supabase `roles` table (or from `docs/plans/2026-02-20-exec-personality-system-design.md` if the coordinates are there).
> 2. For each exec, write a natural language voice description derived from their coordinates. Example mapping: high autonomy → "confident, doesn't wait for permission"; low warmth → "dry, professional tone"; high precision → "measured, deliberate cadence".
> 3. Use Replicate API to run Qwen3-TTS 1.7B VoiceDesign with each description. Generate a 20–30 second speech sample using a neutral test sentence: "I've been reviewing the latest sprint. There are a few things we should discuss before we proceed."
> 4. Listen to each sample. Are the voices meaningfully distinct? Does the CPO sound warmer than the CTO? Does the Senior Engineer sound more measured?
> 5. Document: voice description strings used, subjective quality rating (1–5), distinctiveness rating (1–5), any patterns in what worked/didn't.
> 6. Write findings to `docs/research/2026-02-20-voice-interaction-options.md` under "Spike Results".
>
> Personality system doc: `docs/plans/2026-02-20-exec-personality-system-design.md`
> Voice interaction research: `docs/research/2026-02-20-voice-interaction-options.md`
> Qwen3-TTS on Replicate: https://replicate.com/qwen/qwen3-tts

---

### T1.3 -- PersonaPlex full-duplex quality baseline
| Field | Value |
|-------|-------|
| Type | Research |
| Complexity | Low |
| Model | Sonnet 4.6 |
| Labels | research, needs-human |
| Depends on | T1.1 |
| Assigned | _unassigned_ |
| Trello | _not pushed_ |

**What:** Rent an RTX 4090 on RunPod (~$0.59/hr), spin up the PersonaPlex Docker container, run a 30-minute test conversation with an exec persona prompt. Purpose is purely to feel whether full-duplex naturalness is worth the GPU ops overhead — not to build anything.

**Why:** PersonaPlex is the only true full-duplex option in the set. The quality difference (simultaneous listening + speaking, natural interruption) may be significant enough to justify the infra complexity. This spike answers that question for ~$1.20. Do it after T1.1 so there's a ElevenAgents baseline to compare against.

**Files:**
- No code changes — spike results go in `docs/research/2026-02-20-voice-interaction-options.md`

**Gotchas:**
- Needs NVIDIA GPU: RTX 4090 (24GB VRAM). Not an A10 or T4 — too marginal for real-time
- HuggingFace account required; accept NVIDIA Open Model License at `huggingface.co/nvidia/personaplex-7b-v1`
- Set `HF_TOKEN` env var before running
- Model download is ~14GB — happens first time only if you use the volume mount in docker-compose
- SSL is required for browser mic access: the server generates a temp cert with `--ssl $(mktemp -d)`, accept the self-signed cert warning in browser
- One session at a time — don't try to open two browser tabs
- Tom runs this; Claude can set up the Docker compose and RunPod instance

**Implementation Prompt:**
> Set up and run the NVIDIA PersonaPlex voice model on a RunPod GPU instance.
>
> 1. On RunPod, create a pod with RTX 4090 (24GB VRAM). Use the NVIDIA CUDA 12.4 template. Open ports 8998.
> 2. SSH into the pod. Clone the repo: `git clone https://github.com/NVIDIA/personaplex`
> 3. Set `HF_TOKEN` from your HuggingFace account (must have accepted the model license).
> 4. Run: `docker-compose up` from the repo root. First run downloads ~14GB — wait for "Access the Web UI" message.
> 5. Visit the server URL in browser (accept self-signed cert). Select voice `NATM1.pt`.
> 6. Set text prompt: "You are the CTO of a startup called zazig. You are direct, technically rigorous, and have strong opinions about architecture. Your name is Alex. You push back on vague requirements and ask clarifying questions."
> 7. Have a 15-minute conversation. Test: interrupting mid-sentence, long pauses, back-and-forth technical discussion.
> 8. Compare directly to T1.1 ElevenAgents result: latency, naturalness, interruption handling, persona consistency.
> 9. Record findings in `docs/research/2026-02-20-voice-interaction-options.md`.
> 10. **Shut down the RunPod instance when done** — billed by the second.
>
> PersonaPlex repo: https://github.com/NVIDIA/personaplex
> Research doc: `docs/research/2026-02-20-voice-interaction-options.md`

---

### T2.1 -- Voice gateway service (ElevenAgents path)
| Field | Value |
|-------|-------|
| Type | Feature |
| Complexity | Medium |
| Model | Sonnet 4.6 |
| Labels | claude-ok, blocked |
| Depends on | T1.1 |
| Assigned | _unassigned_ |
| Trello | _not pushed_ |

**What:** TypeScript service that translates a zazig exec `roles` row into an ElevenAgents session. Given an exec role ID, it formats the personality prompt + selects the canonical voice ID + opens an ElevenAgents WebSocket session. Proxies audio between the browser client and ElevenAgents. Stores voice ID per exec in the `roles` table.

**Why:** ElevenAgents is a managed service but needs a thin translation layer to connect zazig's exec model (personality coordinates, Claude prompts) to ElevenLabs' API (system prompt string, voice ID, session lifecycle). This service is the bridge. It keeps ElevenLabs as an opaque sidecar — if we switch to Qwen3-TTS later, only this service changes.

**Files:**
- New: `services/voice-gateway/` (TypeScript, Node)
- `services/voice-gateway/index.ts` — HTTP + WebSocket server
- `services/voice-gateway/elevenlabs.ts` — ElevenAgents session management
- `services/voice-gateway/prompt-builder.ts` — exec personality → system prompt string
- Schema change: add `voice_id` column to `roles` table (new migration `009_voice_ids.sql` or add to pending migration)

**Gotchas:**
- ElevenAgents uses their own WebSocket protocol — don't assume it matches the zazig wire format
- Voice ID per exec must be stored somewhere persistent — `roles` table is the right place
- The system prompt passed to ElevenAgents should be the full Claude system prompt for that exec, not just a summary
- ElevenLabs API key must go through Doppler (project: zazig, config: prd)
- Session auth: the ElevenAgents WebSocket endpoint is unauthenticated by default — wrap with a short-lived token

**Implementation Prompt:**
> Build a TypeScript voice gateway service that bridges zazig exec agents to ElevenLabs ElevenAgents.
>
> The service exposes a WebSocket endpoint: `ws://localhost:PORT/voice/:roleId`
>
> On connection:
> 1. Fetch the exec role from Supabase by `roleId` (use service role key from Doppler)
> 2. Load the exec's system prompt and `voice_id` from the `roles` table
> 3. Open an ElevenAgents WebSocket session (ElevenLabs API), passing: system prompt, voice ID, TTS model `eleven_v3_conversational`, LLM = Claude Sonnet 4.6
> 4. Proxy audio frames bidirectionally between the browser client and ElevenAgents
> 5. On disconnect: gracefully close ElevenAgents session
>
> Also add `voice_id VARCHAR` column to the `roles` table (migration file: `supabase/migrations/009_voice_ids.sql`).
>
> Config via Doppler:
> - `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (already in zazig/prd)
> - `ELEVENLABS_API_KEY` (new secret — add to Doppler)
>
> Exec personality system: `docs/plans/2026-02-20-exec-personality-system-design.md`
> ElevenAgents docs: https://elevenlabs.io/docs/eleven-agents/overview
> Supabase URL: https://jmussmwglgbwncgygzbz.supabase.co

---

### T2.2 -- Exec personality → voice description (Qwen3-TTS path)
| Field | Value |
|-------|-------|
| Type | Feature |
| Complexity | Medium |
| Model | Opus 4.6 |
| Labels | claude-ok, blocked |
| Depends on | T1.2 |
| Assigned | _unassigned_ |
| Trello | _not pushed_ |

**What:** Algorithm that converts exec personality coordinates (numeric, from the `roles` table) into a natural language VoiceDesign description string for Qwen3-TTS. The mapping should be deterministic — same coordinates always produce the same voice description. Includes a lookup/cache layer so we don't re-describe the same exec repeatedly.

**Why:** This is the conceptual heart of the Qwen3-TTS path. If we can make exec voice a function of personality coordinates, every new exec automatically gets an appropriate voice without manual selection. It also means voice character evolves if personality is fine-tuned. Depends on T1.2 validating that the VoiceDesign concept actually produces distinct voices for distinct personalities.

**Files:**
- New: `services/voice-gateway/personality-to-voice.ts` — coordinate → description mapping
- Unit tests: `services/voice-gateway/personality-to-voice.test.ts`
- Schema change: add `voice_description VARCHAR` to `roles` table (generated + cached)

**Gotchas:**
- The mapping from numeric coordinates to English description requires careful dimension-by-dimension prose — treat each personality axis as a contributing factor to tone, pacing, warmth, register
- Don't over-specify the description — Qwen3-TTS responds to broad character strokes, not fine-grained instructions
- Descriptions should be 1–3 sentences max; longer prompts don't improve quality
- Test with edge cases: identical coordinates, min/max values, mixed profiles

**Implementation Prompt:**
> Build a TypeScript function that converts zazig exec personality coordinates to a Qwen3-TTS VoiceDesign description string.
>
> Input: exec personality object from `roles` table (numeric coordinates per dimension)
> Output: natural language string, 1–3 sentences, suitable for passing to Qwen3-TTS VoiceDesign model
>
> Approach:
> 1. Read the personality dimension definitions from `docs/plans/2026-02-20-exec-personality-system-design.md`
> 2. Map each dimension to a voice characteristic. Examples: high autonomy → "speaks with conviction, doesn't hedge"; high precision → "measured cadence, deliberate word choice"; low warmth → "professional, minimal small talk"; high energy → "brisk pace, dynamic range"
> 3. Combine dimension contributions into a coherent description (avoid contradiction — e.g. don't combine "fast pace" and "measured deliberation")
> 4. Return the description string
>
> Write unit tests covering: CPO coordinates, CTO coordinates, extreme values (all min, all max), and two execs with a single differing dimension (verify different output).
>
> Personality design doc: `docs/plans/2026-02-20-exec-personality-system-design.md`
> Spike results: `docs/research/2026-02-20-voice-interaction-options.md` (Spike Results section, from T1.2)

---

### T2.3 -- Pipecat voice pipeline (Qwen3-TTS path)
| Field | Value |
|-------|-------|
| Type | Architecture |
| Complexity | High |
| Model | Sonnet 4.6 |
| Labels | claude-ok, blocked, tech-review |
| Depends on | T2.2 |
| Assigned | _unassigned_ |
| Trello | _not pushed_ |

**What:** Full open-source voice pipeline using Pipecat as the orchestration framework: Silero VAD → faster-whisper ASR → Pipecat Smart Turn → Claude API (exec LLM) → Qwen3-TTS VoiceDesign. Containerised. Exposes a WebSocket API that matches the T2.1 interface so T3.1 (voice UI) works with either backend.

**Why:** If spike results show Qwen3-TTS + personality-derived voices outperform ElevenAgents on exec character, this is the build path. Everything is Apache 2.0 / MIT, no per-minute billing, voice character is programmatic. More complex to run but gives full ownership of the voice stack.

**Files:**
- New: `services/voice-pipeline/` (Python, Pipecat)
- `services/voice-pipeline/main.py` — Pipecat pipeline definition
- `services/voice-pipeline/qwen_tts.py` — Pipecat TTS plugin for Qwen3-TTS
- `services/voice-pipeline/Dockerfile`
- `services/voice-pipeline/requirements.txt`
- Shared interface: ensure WebSocket protocol matches `services/voice-gateway/` from T2.1

**Gotchas:**
- Pipecat is Python — this is a Python sidecar in a TypeScript project. Keep it isolated in `services/voice-pipeline/`
- Qwen3-TTS needs a custom Pipecat TTS plugin — Pipecat's plugin interface is documented but this is new code
- CUDA still required for Qwen3-TTS inference — needs GPU in production; can run on a small GPU (4–8GB)
- Smart Turn model needs 16kHz mono PCM audio — ensure Silero VAD output matches
- WebSocket interface must match T2.1's protocol so T3.1 voice UI requires no changes

**Implementation Prompt:**
> Build a Pipecat voice pipeline that implements full ASR→LLM→TTS flow for zazig exec agents, using Qwen3-TTS VoiceDesign for synthesis.
>
> Stack:
> - Pipecat (orchestration) — `pip install pipecat-ai`
> - Silero VAD (speech detection) — built into Pipecat
> - faster-whisper (ASR) — Pipecat has a faster-whisper integration
> - Pipecat Smart Turn (turn detection) — `pip install pipecat-ai[smart-turn]`
> - Claude API (LLM) — exec system prompt from `roles` table via Supabase
> - Qwen3-TTS 1.7B VoiceDesign (TTS) — custom plugin required
>
> Build in this order:
> 1. Set up basic Pipecat pipeline with Silero VAD + faster-whisper + Claude API + a placeholder TTS (pyttsx3 or similar)
> 2. Verify end-to-end audio in/text out/audio back before adding Qwen3-TTS
> 3. Write `qwen_tts.py`: a Pipecat TTS processor that takes text + voice description string, calls Qwen3-TTS locally, returns audio bytes
> 4. Integrate `qwen_tts.py` into the pipeline. Voice description comes from the exec's `voice_description` field in `roles` table (populated by T2.2)
> 5. Add WebSocket transport layer using Pipecat's WebSocket support, matching the protocol from `services/voice-gateway/` (T2.1)
> 6. Containerise with Dockerfile. Base image: `nvidia/cuda:12.4.1-runtime-ubuntu22.04` (same as PersonaPlex)
>
> Pipecat docs: https://docs.pipecat.ai
> Pipecat Smart Turn: https://github.com/pipecat-ai/smart-turn
> Qwen3-TTS: https://github.com/QwenLM/Qwen3-TTS
> Personality→voice description: `services/voice-gateway/personality-to-voice.ts` (from T2.2)
> Supabase URL: https://jmussmwglgbwncgygzbz.supabase.co

---

### T3.1 -- Voice UI for exec onboarding
| Field | Value |
|-------|-------|
| Type | Feature |
| Complexity | Medium |
| Model | Sonnet 4.6 |
| Labels | claude-ok, blocked |
| Depends on | T2.1 or T2.3 |
| Assigned | _unassigned_ |
| Trello | _not pushed_ |

**What:** Browser voice interface for the exec onboarding flow. Mic capture → audio stream to voice gateway → response audio + streaming text transcript displayed in the UI. Matches the onboarding/dashboard mockup aesthetic. Works with either T2.1 (ElevenAgents) or T2.3 (Pipecat) via the shared WebSocket protocol.

**Why:** This is the user-facing surface. Once the backend is validated, the UI is what Tom and early users will actually experience. The onboarding context is: user meets each exec for the first time, has a brief voice conversation to get a sense of their personality and role. Sets expectations before the exec starts doing real work on cards.

**Files:**
- Location TBD — depends on web UI structure (see web UI mockups)
- `components/VoiceChat.tsx` — main voice UI component
- `hooks/useVoiceSession.ts` — WebSocket audio session hook
- `components/AudioVisualizer.tsx` — waveform display (can adapt PersonaPlex client pattern)
- `components/TranscriptDisplay.tsx` — streaming text display

**Gotchas:**
- Browser mic access requires HTTPS in production (localhost is OK)
- Opus codec for audio encoding in browser: use `opus-recorder` npm package (same as PersonaPlex client)
- Mobile mic access needs explicit permission handling
- Design: voice UI should feel like meeting someone, not operating a tool — minimal chrome, exec avatar/name prominent, waveform subtle

**Implementation Prompt:**
> Build a React voice chat UI component for the zazig exec onboarding flow.
>
> The component connects to the voice gateway WebSocket at `ws://localhost:PORT/voice/:roleId` and handles full audio session lifecycle.
>
> Wire protocol (shared with voice gateway):
> - `0x00` — handshake (server → client, signals ready)
> - `0x01` + opus bytes — audio (bidirectional)
> - `0x02` + UTF-8 text — streaming transcript (server → client)
>
> Components to build:
> 1. `useVoiceSession(roleId)` hook: manages WebSocket connection, mic capture via `opus-recorder`, sends audio frames, receives audio + text
> 2. `VoiceChat` component: full-screen or modal. Shows exec name + role, audio visualizer (waveform or simple amplitude bars), streaming transcript, start/stop button
> 3. `AudioVisualizer`: displays real-time mic input level and model output level separately
>
> Reference implementation (adapt, don't copy): PersonaPlex client at `~/.cache/repo-recon/NVIDIA-personaplex/client/src/`
> — `hooks/useSocket.ts`, `hooks/useUserAudio.ts`, `hooks/useServerAudio.ts`, `components/AudioVisualizer/`
>
> Design constraint: minimal UI. Exec name + avatar dominant. No settings panel on first use. Waveform subtle. Should feel like a phone call, not a dev tool.
