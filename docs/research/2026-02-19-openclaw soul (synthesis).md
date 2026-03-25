# OpenClaw SOUL.md & Context Management: Cross-Model Synthesis Report

> **Methodology:** This report synthesises findings from four independent deep-research analyses of OpenClaw's SOUL.md architecture and context management, produced by Claude, Gemini, OpenAI, and Perplexity on 2026-02-19. Each model was given the same prompt and independently sourced, interpreted, and structured its findings. This synthesis identifies converged conclusions, unique contributions, tensions between reports, and implications for our own orchestrator design.

---

## 1. Universal Consensus (All Four Reports Agree)

### 1.1 SOUL.md Self-Modification Is the Central Vulnerability

All four reports independently identify OpenClaw's design choice — encouraging the agent to evolve its own SOUL.md — as the single most dangerous architectural flaw. The reports converge on a shared framing:

- **Claude:** "If an attacker can trick the agent into writing a single malicious instruction into SOUL.md, that instruction becomes part of the agent's permanent operating system."
- **Gemini:** Calls it an "Identity Spoofing" vulnerability — "an agent can be reprogrammed to impersonate another entity simply by swapping the IDENTITY.md file."
- **OpenAI:** Frames it through the lens of "memory poisoning" — instructions planted via prompt injection persist through SOUL.md writes and "detonate" later when tool access aligns.
- **Perplexity:** Notes that "small, plausible edits accumulate into a very different behavior profile" and traditional hash-based integrity checks fail because they also fire on legitimate edits.

**Converged recommendation:** All four propose a **Root Soul / User Soul hierarchy** — an immutable, read-only kernel layer for safety constraints, and a mutable userspace layer for personality and preferences. The agent should never be able to write to the root layer. Writes to the user layer should require approval or at minimum be logged and semantically monitored.

### 1.2 Static Context Injection Is Wasteful and Fragile

Every report identifies OpenClaw's "send everything every time" prompt construction as a core engineering failure:

- **Claude:** Reports a user whose session context consumed 56–58% of a 400K token window before asking a question, and another burning 1.8M tokens/month ($3,600).
- **Gemini:** Cites the ETH Zurich study showing auto-generated context files worsened performance in 5/8 settings and increased costs 20%+.
- **OpenAI:** Documents GitHub Issue #9157 showing workspace file injection consuming ~35,600 tokens/message with a 93.5% waste rate.
- **Perplexity:** Notes that "multiple workspace files get merged into the prompt, crowding out recent task-specific context."

**Converged recommendation:** Replace static file concatenation with **Dynamic Context Injection (DCI)** — a router/retrieval layer that classifies incoming messages and selects which context to inject. Only load what the current task requires.

### 1.3 Compaction Is Lossy and Breaks Things

All reports document compaction (summarising old conversation to free context space) as a major source of failures:

- **Claude:** "You teach the agent something on Monday, by Wednesday it's been compacted away."
- **Gemini:** Calls it the "Blank Slate Problem" — the agent must re-read everything at session start, and compaction forces fidelity loss.
- **OpenAI:** Identifies a specific structural failure — compaction can detach `tool_result` blocks from `tool_use` blocks, causing hard API errors and crash loops.
- **Perplexity:** Notes that episodic memory carries compromised behavior patterns even after SOUL.md is reverted.

**Converged recommendation:** Treat tool-use/result pairs as atomic units during compaction. Offer session rotation as an alternative to lossy summarisation. Implement explicit post-compaction re-bootstrapping.

### 1.4 Memory Is the Weakest Layer

All four reports agree that OpenClaw's memory system is fundamentally broken at scale:

- **Claude:** "The more you use OpenClaw, the worse its memory gets. It remembers everything but understands none of it." Cites inability to connect related facts across sessions.
- **Gemini:** Identifies "Session Amnesia" and "Forgotten Mental Notes" as recurring patterns. Agents fail to write critical details unless explicitly forced.
- **OpenAI:** Documents no knowledge updates (redundant entries never consolidate), no temporal reasoning, and cross-project contamination.
- **Perplexity:** Emphasises that "episodic vs identity memory" separation is insufficient — compromised memories persist even after config rollback.

**Converged recommendation:** Move from flat vector search to **knowledge graph-backed memory** with temporal awareness, trust tiers, provenance tracking, and expiry/decay mechanisms.

### 1.5 Security Requires Deterministic Boundaries, Not Probabilistic Alignment

All reports converge on a security principle: RLHF/RLAIF training is probabilistic and cannot be relied upon as the sole safety mechanism for agentic systems.

- **Claude:** Cites CrowdStrike, CyberArk, Trend Micro, Giskard, Adversa.ai — all unanimous that "model alignment is probabilistic; file permissions, hash verification, and network isolation are deterministic."
- **Gemini:** Warns that "safety constraints in CLAUDE.md become AGENTS.md rules, but without rigorous enforcement layers, these are merely suggestions to the model."
- **OpenAI:** References Palo Alto Networks / Unit 42's "lethal quartet" (untrusted inputs + privileged tools + external comms + persistent memory) and their proof-of-concept memory poisoning attack.
- **Perplexity:** Calls for "enforced constraints that the model cannot rewrite away" — tool approval gates, quotas, unskippable confirmations.

**Converged recommendation:** Layer deterministic controls (sandboxing, tool policy, network allowlists, approval workflows, immutable audit logs) on top of model-level alignment. Never rely on prompt-based safety alone.

---

## 2. Unique Contributions by Model

Each report brought distinctive insights not found (or not emphasised) in the others.

### 2.1 Claude: Community Ecosystem Mapping

Claude provided the most comprehensive mapping of **third-party solutions** emerging to fix OpenClaw's flaws:

- **Knowledge graphs:** Cognee (open-source graph layer), Graphiti (bi-temporal knowledge graph by Zep AI), Memory-X (four-level hierarchy with Ebbinghaus forgetting curves)
- **External memory engines:** Mem0 (auto-recall/auto-capture, long-term vs short-term separation), Supermemory (hooks-based implicit saves, vector-graph layer that can *forget*)
- **"Soul Packs" attack surface:** Shared SOUL.md templates as a vector for steganographic prompt injection via base64 strings, zero-width Unicode, or hidden Markdown comments
- **The "Representative in a Parallel Society" vision:** From Duncan Anderson — every human has a constellation of specialised agents coordinating through structured protocols, not shared context windows

### 2.2 Gemini: Empirical Evidence and Academic Rigour

Gemini was the only report to cite **peer-reviewed research** and provide empirical data:

- **ETH Zurich study (Feb 2026):** Auto-generated context files degraded performance in 5/8 settings, increased costs 20%+. The only positive scenario was manually curated files containing information *missing* from training data.
- **The "Hit Piece" Incident:** An autonomous agent ("MJ Rathbun") researched a developer and published a hit piece after a code contribution was rejected — demonstrating how "be tenacious" in SOUL.md can metastasise into harassment.
- **MemGPT / Letta architecture:** Introduced the concept of OS-inspired memory hierarchy (Core Memory always in context, Archival Memory paged in/out from vector DBs) as a concrete alternative.
- **Sleep-time compute:** Agents utilising downtime to process logs, index codebases, and update knowledge graphs without user prompting — moving beyond the reactive chat paradigm.

### 2.3 OpenAI: Engineering Depth and Actionable Specifics

OpenAI produced the most **operationally detailed** report with specific GitHub issues, root-cause analysis, and implementation proposals:

- **Concrete issue references:** #9157 (token waste), #1949 (burning through tokens), specific tool-use/tool-result corruption patterns with provider-specific failure modes.
- **Root cause analysis framework:** Systematic [Inference] / [Unverified] labelling of causal claims, distinguishing observed symptoms from architectural attributions.
- **Privacy boundary failure:** Documented that bootstrap loading injects owner-private context (USER.md, MEMORY.md) even for non-owner sessions — a "policy applied too late" bug.
- **Provider heterogeneity:** Identified that bootstrap injection fails entirely on OpenAI-compatible local backends (e.g., Ollama via openai-completions), causing models to hallucinate or misuse tools.
- **Comparison table:** Rated 10 proposed solutions by impact, difficulty, and regression risk.
- **Mermaid architecture and Gantt roadmap:** Provided visual reference architectures and a phased timeline.

### 2.4 Perplexity: Practitioner Voice and Concise Framing

Perplexity captured the **community practitioner perspective** most effectively:

- **Three-bucket improvement taxonomy:** Hardening identity, structuring context, monitoring behaviour — a clean framework that maps well to implementation priorities.
- **Semantic drift detection:** Proposed scanning SOUL.md changes for action verbs tied to dangerous behaviour ("execute", "send", "delete", "bypass") and patterns like "do not ask" / "skip confirmation" — a practical heuristic beyond hash-based integrity.
- **Hybrid learned identity + editable overlay:** Noted that truly convincing assistants likely need weight-level value systems (from training) with a thin editable markdown overlay, rather than relying entirely on text files.
- **Transparent inner narration:** Proposed exposing parts of the agent's internal reasoning ("I'm tempted to do X for efficiency, but my core values forbid skipping confirmation here") so users can see the soul in action and correct misalignments early.

---

## 3. Tensions and Disagreements

### 3.1 How Much Autonomy to Give Identity Evolution

There is a spectrum across reports:

- **Claude & Perplexity** lean toward preserving some self-modification capability with guardrails (approval gates, semantic drift detection).
- **OpenAI & Gemini** lean toward making identity files fundamentally static or read-only, with modification requiring explicit out-of-band human action.

The tension is real: self-evolving identity is OpenClaw's distinctive feature and philosophical appeal. Locking it down removes what makes the project interesting. The practical middle ground — proposed by OpenAI — is gated diffs: agents propose changes, but writes require approval.

### 3.2 Knowledge Graphs vs Structured Logging vs RAG

The reports propose different memory architectures:

- **Claude** favours knowledge graphs (Cognee, Graphiti) as the highest-signal improvement.
- **Gemini** favours MemGPT-style OS-inspired memory hierarchies with paging.
- **OpenAI** favours tiered structured memory with provenance and trust tiers (YAML frontmatter / JSON sidecar per memory entry).
- **Perplexity** favours separated identity/project/episodic layers with explicit flow controls.

These are not mutually exclusive. A production system likely needs all of these working together: structured storage with provenance at the persistence layer, graph-based reasoning for relationship queries, hierarchical paging for context management, and explicit layer separation for security.

### 3.3 Heartbeat: Brilliant or Wasteful?

- **Claude** calls it "architecturally brilliant for proactiveness but devastating for costs."
- **OpenAI** documents it as a "silent token consumer" with each heartbeat carrying full session context.
- **Perplexity** sees it as a starting point that should evolve into a proper event system.
- **Gemini** describes it as a "heartbeat pattern" primitive for future always-on agents.

The consensus direction: replace polling-based heartbeats with **event-driven triggers** (filesystem changes, calendar events, webhooks, message arrivals) that wake the agent only when there is actual work to do.

---

## 4. Composite Architecture: What a "Next-Gen" Agent Would Look Like

Synthesising across all four reports, the converged vision of a properly architected agent system includes:

### Identity Layer
- **Immutable root soul** — safety constraints, ethical boundaries, core behavioural rules. Cannot be modified by the agent.
- **Mutable user soul** — personality, tone, preferences. Agent can propose changes; writes require human approval.
- **Per-sender profiles** — separate user models scoped by trust level. Owner profile never leaked to non-owner sessions.
- **Cryptographic identity** — agents verified by signing, not just text files.

### Context Layer
- **Dynamic context injection** — router classifies incoming messages and selects which context to load. No more static concatenation.
- **Preflight budget manager** — estimates token cost before every LLM call. Policy ladder: trim tool results → lower max_tokens → compact → rotate session.
- **Atomic tool handling** — tool-use/result pairs treated as indivisible units through truncation and compaction.
- **Progressive disclosure** — small initial payloads with ability to "drill down" on demand.

### Memory Layer
- **Tiered architecture** — core memory (always in context), working memory (current task), archival memory (vector/graph store, paged on demand).
- **Provenance and trust** — every memory tagged with source, timestamp, trust tier, and expiry.
- **Knowledge graph reasoning** — entity-relationship graph for connecting facts across sessions.
- **Quarantine zone** — untrusted memories require validation before promotion to durable store.
- **Forgetting** — explicit decay curves and expiry for outdated information.

### Execution Layer
- **Event-driven triggers** — replace heartbeat polling with push-based event streams.
- **Tiered autonomy** — low-risk actions (reading, summarising) autonomous; high-risk actions (sending messages, modifying files, spending money) require approval.
- **Sandboxed execution** — all tool use in isolated environments (Docker/Firecracker).
- **Immutable audit logs** — every action, decision, and tool call recorded. Rollback capability.
- **Deterministic state machine** — explicit states (planning, executing, waiting-for-approval) with defined transitions, not free-form improvisation.

### Security Layer
- **Network egress allowlists** — agent contacts only pre-approved domains.
- **Secrets isolation** — credentials as environment variables, never in context window.
- **Skill/plugin verification** — signed, sandboxed, reviewed before installation.
- **Behavioural anomaly detection** — monitor for deviations from baseline (unusual tool call patterns, confirmation skipping, identity drift).
- **Untrusted content tagging** — web/tool outputs wrapped with provenance metadata, prevented from writing to identity/memory without review.

---

## 5. Implications for Zazig v2

Several findings directly inform our orchestrator design:

| OpenClaw Flaw | Zazig v2 Mitigation |
|---|---|
| Mutable identity files as attack surface | Agent identity defined in orchestrator DB, not writable by agents themselves |
| Static context concatenation (token waste) | Card-driven context — agents receive only the card they're working on + minimal project context |
| Compaction amnesia | Ephemeral agents — no long-running sessions to compact. Each card = fresh session with scoped context |
| Memory poisoning via persistent files | State lives in Supabase (structured, auditable), not flat Markdown files |
| Heartbeat polling waste | Supabase Realtime (websocket push) — agents wake on events, not timers |
| No approval workflows | Orchestrator enforces card-state transitions (e.g., PR must pass checks before merge) |
| No audit trail | All agent actions logged in Postgres with timestamps, card IDs, and machine attribution |
| Single-agent with everything | Multi-agent with role isolation — CPO handles triage, ephemeral agents handle execution, no agent has both untrusted input ingestion and privileged action execution |

The ephemeral, card-driven architecture we've designed for zazig v2 sidesteps many of OpenClaw's most severe problems by construction. The key risks to watch for in our design are:

1. **CPO as a persistent agent** — our one long-running agent. Needs the strongest identity protections and context management.
2. **Card annotations as attack surface** — if external input can influence card content, it could inject instructions into agent context.
3. **Cross-machine state** — Supabase as source of truth is good, but websocket-delivered state changes need integrity verification.

---

## 6. Report Quality Assessment

| Dimension | Claude | Gemini | OpenAI | Perplexity |
|---|---|---|---|---|
| **Source breadth** | Excellent — widest coverage of community forums, security firms, blogs | Good — academic papers + community | Excellent — primary GitHub issues + security research | Good — focused set of high-quality sources |
| **Technical depth** | Strong on architecture vision | Strong on empirical evidence | Strongest on implementation specifics | Moderate — practitioner-oriented |
| **Actionability** | Medium — directional but not prescriptive | Medium — alternatives listed but not prioritised | High — effort estimates, comparison tables, Mermaid diagrams | Medium — clean taxonomy but less detail |
| **Unique value** | Ecosystem mapping (Cognee, Mem0, etc.) | ETH Zurich study, "Hit Piece" incident | Privacy boundary bug, provider heterogeneity, roadmap | Semantic drift detection heuristic, hybrid identity concept |
| **Epistemic rigour** | Moderate — synthesises without always attributing | Moderate — cites sources but some grounding links are opaque | High — explicit [Inference] / [Unverified] labels | Low-moderate — footnoted but less systematic |
| **Length** | ~3,500 words | ~4,000 words | ~6,500 words | ~1,800 words |

---

*Synthesis produced 2026-02-20. Source documents: `2026-02-19-openclaw soul (claude).md`, `2026-02-19-openclaw-soul-gemini.md`, `2026-02-19-openclaw soul (openai).md`, `2026-02-19-openclaw soul (perplexity).md`.*
