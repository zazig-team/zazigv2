# Research: Voice Interaction for Zazig Exec Agents
*Analyzed: 2026-02-20 | Options: PersonaPlex, Gemini Live, ElevenAgents*
*Context: Evaluating voice interaction options for exec agent onboarding/dashboard UX — not a production phone system, a premium prototype feature.*

---

## TL;DR

- **Full-duplex (PersonaPlex, Gemini Live) is probably a step too far for now** — GPU infra overhead or stability issues outweigh the naturalness gain for a prototype
- **ElevenAgents is the pragmatic path**: managed, bring-your-own-LLM (Claude), excellent TTS quality, $0.10/min, no infra to own
- **Exec personality maps cleanly**: ElevenAgents system prompt → exec coordinates → Claude model → ElevenLabs voice per exec
- Run a 15-minute free-tier test before committing to anything

---

## The Options

### Option A: NVIDIA PersonaPlex (self-hosted full-duplex)
*Repo: https://github.com/NVIDIA/personaplex | Commit: 052206ac*

**What it is:** NVIDIA fine-tune of Moshi (Kyutai), 7B bfloat16. True full-duplex — listens and speaks simultaneously, no turn model needed. Persona injected via plain text at connection time.

**Protocol:** Binary WebSocket. `0x00` handshake, `0x01+opus` audio both ways, `0x02+UTF8` streaming text. React/TypeScript client provided.

**Voice:** 18 pre-built embeddings (NATF/NATM/VARF/VARM series). One per exec, selected as filename in URL param.

**Integration fit:**
- Exec personality prompt → `?text_prompt=You are the CTO...` — near-perfect mapping, minimal glue
- Voice-per-exec via filename in `roles` table

**Hard constraints:**
- NVIDIA CUDA GPU required. ~14GB VRAM minimum, RTX 4090 (24GB) is the minimum viable card
- Single-session lock per server — one conversation at a time per GPU instance
- Cold start: HF model download (~14GB) + GPU warmup. Painful for on-demand
- No MPS (Apple Silicon) support
- NVIDIA Open Model License — commercial use allowed but has Trustworthy AI terms and guardrail requirements. Get legal review before GA
- Python inference server (fine — it's a WebSocket sidecar)

**Cost model:** ~$0.59/hr on RunPod RTX 4090. Spike test = ~$1.20 for 2 hours. Production = per-session GPU rental with warm standby overhead.

**Verdict:** Best voice personality fit. Worst ops story. Worth a one-off spike to feel the quality, but don't build infrastructure around it yet.

---

### Option B: Gemini Live (managed full-duplex)
*Tom's test result: latency acceptable, session died after 3–4 attempts*

**What it is:** Google's managed full-duplex speech model. WebSocket-based. Has explicit turn-detection and activity events (addresses PersonaPlex's missing turn signals).

**Integration fit:**
- System prompt sets persona — same pattern as PersonaPlex
- No GPU management
- Explicit turn-taking events make client logic simpler

**Hard constraints (observed):**
- Session stability is poor — died on Tom's test after 3–4 attempts
- Voice selection is limited compared to ElevenLabs
- Google dependency: pricing/API terms can change
- No BYOLLM — you get Gemini's model, not Claude

**Verdict:** Eliminated for now based on stability. Revisit in 3–6 months if Google improves reliability.

---

### Option C: ElevenAgents (managed pipeline, BYOLLM)
*Docs: https://elevenlabs.io/docs/eleven-agents/overview*

**What it is:** ElevenLabs' orchestration platform: ASR → your LLM → TTS + proprietary turn-taking model. Not full-duplex — pipeline-based with interruption handling baked in. Think of it as a managed voice layer that wraps your existing AI.

**Architecture:**
1. ElevenLabs ASR captures user speech
2. Transcript goes to **your LLM of choice** — meaning Claude Opus/Sonnet, our existing exec models
3. LLM response goes to ElevenLabs TTS
4. Proprietary turn-taking model handles interruptions and pacing

**Why this matters for zazig:** Our exec agents are already Claude models with personality prompts. ElevenAgents is literally a voice wrapper around that. We bring our own system prompt (exec personality coordinates → Claude prompt) and our own LLM. ElevenLabs just adds the voice layer.

**Voice quality:**
- `eleven_flash_v2_5` — 75ms TTS latency. Recommended for agents
- `eleven_v3_conversational` — added Feb 2026, higher quality/expressiveness, slightly higher latency. Worth testing for exec persona feel
- 5,000+ voices available; can clone or use pre-built
- Tone, expressiveness, emotional range significantly better than Gemini or PersonaPlex pre-builts

**Integration fit:**
- System prompt = exec personality prompt already used for Claude → zero new work
- Assign a canonical ElevenLabs voice ID per exec, store in `roles` table
- SDK: React, TypeScript, React Native — fits our stack directly
- Dynamic variables allow per-conversation context injection (e.g., user name, current card)
- Knowledge base: RAG from document uploads (could feed exec with product context)
- Tool calling: agents can call external APIs (could trigger zazig orchestrator actions mid-call)

**Extras worth noting:**
- Telephony support (Twilio, SIP) — future phone/mobile path
- A/B testing via Experiments — could test exec personalities
- Conversation analytics — could inform personality tuning
- Auth for protected agent access — needed before exposing to users

**Pricing:**
- Free: 15 minutes (spike test at zero cost)
- Creator plan: 250 min included, $0.10/min overage
- Pro: 1,100 min included, $0.10/min
- Business (annual): $0.08/min
- LLM costs not currently included (ElevenLabs absorbing) but will be passed through eventually

**Cost model for a prototype:** 15 minutes free → then $0.10/min. A 30-minute demo session costs $3. No GPU, no cold starts, no infra.

**Hard constraints:**
- Pipeline latency: ASR + LLM + TTS in sequence. End-to-end ~400–800ms total response latency (vs. PersonaPlex's near-real-time). Acceptable for exec-style conversation, noticeable vs. true full-duplex.
- Not full-duplex: interruptions are handled by the turn-taking model but it's not as seamless as PersonaPlex
- LLM cost will eventually appear on the bill
- Vendor dependency: pricing, API terms, model versions all controlled by ElevenLabs

**Verdict:** Strongest option for a prototype. Brings Claude's exec personality into voice with minimal integration work, no infra overhead, and the best TTS quality in class.

---

### Option D: Qwen3-TTS (open-source TTS engine, self-host or API)
*Repo: https://github.com/QwenLM/Qwen3-TTS | License: Apache 2.0*

**What it is:** Alibaba's open-source TTS model suite, released Jan 2026. 0.6B and 1.7B variants. Pure TTS — not a conversational agent platform. You'd use it as the synthesis layer in a pipeline you build (or integrate into ElevenAgents-style architecture yourself). Apache 2.0 means fully free for commercial use.

**The standout capability — VoiceDesign:**
The 1.7B VoiceDesign model lets you describe a voice in natural language and generate consistent speech from that description:
> *"A confident, measured female voice with warm authority and slight urgency"* → CPO voice
> *"A precise, dry male voice with low affect and technical cadence"* → CTO voice

This maps directly to exec personality coordinates in a way no other option offers. You could derive the voice description from the same personality data that drives the text prompt. The exec's voice style becomes a function of their personality, not a manual assignment.

**Voice cloning:** 3 seconds of reference audio → consistent cloned voice. If we ever record exec voice samples, this is the path to truly unique per-exec voices.

**Model sizes and hardware:**
- 0.6B — very lightweight, runs on modest GPU (4–8GB VRAM). Suitable for always-on TTS sidecar
- 1.7B — better quality, still small. ~4GB VRAM in float16

Compare: PersonaPlex needs 14GB+ VRAM for a 7B model. Qwen3-TTS needs 2–4GB for higher quality output.

**Latency:** 97ms first-packet (streaming). 5× faster than real-time on standard cloud GPU. Competitive with ElevenLabs Flash.

**Languages:** 10 (Chinese, English, Japanese, Korean, German, French, Russian, Portuguese, Spanish, Italian) + Chinese dialects.

**Built-in voices:** 9 named speakers (Vivian, Serena, Ryan, Aiden, etc.) for the 1.7B CustomVoice model.

**API access:** DashScope (Alibaba's cloud API) — or self-host. Third-party wrappers available on AIMLAPI, WaveSpeed, Replicate.

**Integration fit for zazig:**
- VoiceDesign model = exec personality coordinates → voice description string → consistent TTS voice. Elegant, programmatic.
- Small model size means it could run alongside the main orchestrator on a modest GPU, or cheaply on a dedicated TTS sidecar
- Apache 2.0: no license friction for commercial use
- **But:** pure TTS only. No ASR, no turn-taking, no agent pipeline. You'd need to build the conversation layer yourself — or use it as the TTS engine inside a custom Pipecat/LiveKit stack

**Hard constraints:**
- TTS-only — no conversational agent platform. Build-your-own pipeline required
- CUDA required (same as PersonaPlex, but far less VRAM)
- No managed service equivalent to ElevenAgents — you own the infra
- No built-in turn-taking, interruption handling, or session management
- DashScope API is Alibaba Cloud — potential latency/compliance concerns for non-CN markets

**Cost model:** Self-hosted on a small GPU (RTX 3060 12GB ~$0.20/hr on RunPod) covers TTS only. Full pipeline needs ASR and LLM on top. DashScope pricing unclear but likely per-character.

**Verdict:** Technically the most interesting option for zazig's long-term direction — VoiceDesign from personality coordinates is genuinely novel. But it's a component, not a solution. Best path: validate ElevenAgents first, then prototype the VoiceDesign concept in parallel as a longer-term investment. If the voice character matters more than shipping speed, this is the one to build toward.

---

## Comparison Matrix

| | PersonaPlex | Gemini Live | ElevenAgents | Qwen3-TTS |
|---|---|---|---|---|
| **Model type** | Full-duplex | Full-duplex | Pipeline (ASR→LLM→TTS) | TTS only |
| **LLM** | Baked in (Moshi 7B) | Gemini | Your choice (Claude) | None (bring your own) |
| **TTS quality** | Good (neural codec) | Average | Excellent (v3/Flash) | Excellent (Apache 2.0) |
| **Interruption handling** | Native | Native + events | Turn-taking model | None (DIY) |
| **Infra** | Self-hosted GPU (14GB) | Managed | Managed | Self-hosted (2–4GB) |
| **Cold start** | High (14GB model) | None | None | Low (small model) |
| **Cost unit** | ~$0.59/hr (GPU) | Per-token (varies) | $0.10/min | Self-host (~$0.10/hr) |
| **TypeScript SDK** | No (WebSocket only) | Yes | Yes | No (build it) |
| **Personality control** | Text prompt at connect | System prompt | System prompt + dynamic vars | **VoiceDesign from description** |
| **Voice selection** | 18 pre-built | Limited | 5,000+ / cloneable | 9 built-in + design + clone |
| **Stability (tested)** | Untested | Poor (Tom's test) | Untested | Untested |
| **Zazig LLM fit** | None (own model) | None (Gemini) | Direct (Claude BYOLLM) | Direct (Claude + Qwen TTS) |
| **License** | NVIDIA Open Model | Google ToS | ElevenLabs ToS | **Apache 2.0** |
| **Build effort** | Medium (Docker sidecar) | Low | **Lowest** | High (full pipeline) |

---

## Recommendation

**Tier 1 — Do now: ElevenAgents spike (free)**
Use the 15 free minutes to wire up one exec with their existing Claude system prompt and a canonical ElevenLabs voice. Integration is: existing exec prompt → ElevenAgents system prompt, `roles` row → voice ID. If the UX feels right, this is the path forward.

**Tier 2 — Do in parallel: Qwen3-TTS VoiceDesign prototype**
The VoiceDesign capability is genuinely novel for zazig — deriving a voice description from exec personality coordinates is a concept worth proving out. Spin up a 1.7B VoiceDesign instance (tiny GPU, cheap), pass exec personality → voice description string, and see how well it characterises each exec. This is a longer-term investment, not a shortcut to a working product.

**Tier 3 — One-off test: PersonaPlex spike ($1.20)**
Once ElevenAgents is validated, rent an A10G for 2 hours and feel whether full-duplex naturalness is worth the GPU ops overhead. Use it as a quality bar, not a production plan.

**Eliminated: Gemini Live** — don't revisit until stability improves.

---

## The Open Source Pipeline Stack

If Qwen3-TTS wins on voice quality, the full pipeline can be assembled from open source components. All layers exist, are well-tested, and come pre-assembled in two frameworks.

### Building blocks

| Layer | What it does | Best open source option | License |
|---|---|---|---|
| **VAD** | Detects speech start/stop | [Silero VAD](https://github.com/snakers4/silero-vad) — tiny, runs locally | MIT |
| **ASR** | Speech → text | [faster-whisper](https://github.com/SYSTRAN/faster-whisper) — optimized Whisper, CPU or GPU | MIT |
| **Turn detection** | "Did they finish their thought or just pause?" | [Pipecat Smart Turn](https://github.com/pipecat-ai/smart-turn) — small transformer model, ~65ms | BSD |
| **LLM** | Generate exec response | Claude Sonnet/Opus — already our exec models | API |
| **TTS** | Text → exec voice | Qwen3-TTS VoiceDesign | Apache 2.0 |
| **Session / transport** | Real-time audio, lifecycle | Pipecat or LiveKit Agents | Apache 2.0 |

### Pre-assembled frameworks

**[Pipecat](https://github.com/pipecat-ai/pipecat)** (Python, by Daily.co, Apache 2.0)
Orchestration framework: plug in your ASR, LLM, and TTS, it handles everything else. Has VAD with Silero, pluggable ASR/TTS providers, and the Smart Turn model for intelligent turn detection (runs in parallel with ASR, triggers on 200ms pause, completes in ~65ms). NVIDIA published a Pipecat voice agent blueprint this year using Nemotron models — the Qwen3-TTS integration would follow the same pattern.

**[LiveKit Agents](https://github.com/livekit/agents)** (Python + Node.js, Apache 2.0)
More production-oriented. WebRTC-native, has telephony built in, open-weights turn-detector model (semantic transformer, not just VAD-based). Better choice if you eventually want phone/mobile. Larger surface area than Pipecat.

### Full Qwen3-TTS stack

```
Pipecat (orchestration + session management)
  ├── Silero VAD          — detects when user starts/stops speaking
  ├── faster-whisper      — speech → text (ASR)
  ├── Pipecat Smart Turn  — decides "done thinking" vs "done speaking"
  ├── Claude API          — exec LLM (existing personality prompts)
  └── Qwen3-TTS 1.7B      — VoiceDesign TTS (voice derived from personality)
```

Everything here is Apache 2.0 or MIT except Claude (API). The only novel integration is Qwen3-TTS — Pipecat's TTS interface is pluggable by design.

**Build effort vs ElevenAgents:** ElevenAgents gives this pre-assembled and managed for $0.10/min. Pipecat + Qwen3-TTS gives full ownership, VoiceDesign, and Apache 2.0 throughout — at the cost of infra to run and a week of integration work. Validate ElevenAgents first; only invest in the Pipecat path if voice character becomes a genuine product differentiator.

---

## Raw Notes

- ElevenLabs added `eleven_v3_conversational` to agents in Feb 2026 — specifically for exec-style conversations with high expressiveness. Test this model first, not Flash, despite Flash being faster.
- PersonaPlex commit: 052206ac (cloned 2026-02-20). Voices: 18 total (not 12 as README states).
- PersonaPlex NVIDIA Open Model License: commercial use allowed, but Trustworthy AI terms apply. Get legal review before GA.
- Gemini Live has explicit activity events that PersonaPlex lacks — if you do revisit full-duplex, Gemini's protocol is cleaner for client-side turn management.
- ElevenLabs telephony path (Twilio/SIP) opens mobile/phone use case without rebuilding anything.
- LiveKit Agents + Pipecat mentioned by Codex as provider-agnostic TS voice layer — worth investigating if we want to hedge against ElevenLabs vendor lock-in.
- Qwen3-TTS VoiceDesign model accepts natural language voice descriptions — could generate description from exec personality JSON automatically. Example: high autonomy + low warmth + high precision → "a measured, dry, technically precise voice with low emotional affect".
- Qwen3-TTS self-hosted on a small GPU (RTX 3060 12GB) would be dramatically cheaper than PersonaPlex — 2–4GB VRAM vs 14GB.
- DashScope API (Alibaba Cloud) is the managed path for Qwen3-TTS — may have latency/compliance issues for EU/US users. Self-host avoids this.
- Cartesia Sonic-3 was mentioned in benchmarks as fastest TTS at 40ms (vs Qwen's 97ms, ElevenLabs Flash at 75ms) — not researched here but worth a note if latency becomes the primary concern.

---

## Sources
- [NVIDIA PersonaPlex paper](https://arxiv.org/abs/2602.06053)
- [ElevenAgents overview](https://elevenlabs.io/docs/eleven-agents/overview)
- [ElevenLabs models](https://elevenlabs.io/docs/overview/models)
- [ElevenLabs Conversational AI pricing cut](https://elevenlabs.io/blog/we-cut-our-pricing-for-conversational-ai)
- [ElevenLabs agents pricing FAQ](https://help.elevenlabs.io/hc/en-us/articles/29298065878929-How-much-does-ElevenLabs-Agents-formerly-Conversational-AI-cost)
- [Eleven v3 launch post](https://elevenlabs.io/blog/eleven-v3)
- [Qwen3-TTS blog post](https://qwen.ai/blog?id=qwen3tts-0115)
- [Qwen3-TTS GitHub](https://github.com/QwenLM/Qwen3-TTS)
- [Qwen3-TTS on Replicate](https://replicate.com/qwen/qwen3-tts)
