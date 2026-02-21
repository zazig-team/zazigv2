# Card Catalog: Exec Personality System — Phase 1
**Source:** docs/plans/2026-02-20-exec-personality-system-design.md
**Board:** personality (69983c1bfc662b3b1cfd2441)
**Generated:** 2026-02-20T19:30:00Z
**Numbering:** tier.index (Phase 1 only — Phase 2+ cardified separately)

## Build Sequence

**Critical path:** `1.1 → 1.2 → 1.5` (schema → seed → dispatch hook)

```
1.1 ──┬── 1.2 (seed) ──────┐
      ├── 1.3 (compile) ───┤
      └── 1.7 (CLI)        ├── 1.5 (dispatch hook)
                            │
1.4 (StartJob) ────────────┤
                            └── 1.6 (local agent)
```

Ship 1.1 first, then 1.2 + 1.3 + 1.4 + 1.7 in parallel, then 1.5 and 1.6 close it out.

**How they build on each other:**

- **1.1 (Schema)** — Foundation. Creates the 4 tables and extends `roles` with `root_constraints`. Everything reads from or writes to these tables.
- **1.2 (Seed data)** ← 1.1 — Populates `exec_archetypes` with 6 archetype definitions. Without seed data, the compilation module has no rows to read and dispatch has nothing to compile.
- **1.3 (Compilation)** ← 1.1 — Pure TypeScript engine. Takes dimensions + voice_notes + philosophy + constraints + overlay → deterministic prompt string. Both the orchestrator (1.5) and CLI (1.7) call this.
- **1.4 (StartJob field)** ← independent — Adds `personalityPrompt?: string` to the message protocol. The wire through which compiled prompts travel between orchestrator and local agent.
- **1.5 (Dispatch hook)** ← 1.1 + 1.2 + 1.3 + 1.4 — The convergence point. At dispatch time: reads personality from DB (1.1 + 1.2), compiles (1.3), attaches to StartJob (1.4). Bottleneck card — needs all four predecessors.
- **1.6 (Local agent)** ← 1.4 — Receiving end. Reads `personalityPrompt` from StartJob and prepends to system prompt. Implements sub-agent soul stripping. Doesn't need DB or compilation — just receives a string.
- **1.7 (CLI)** ← 1.1 — Founder-facing inspection tool. Reads from `exec_archetypes` and `exec_personalities` directly. Independent of the dispatch pipeline (1.4–1.6).

Pipeline Tasks 1-3 (vitest, schema infra, protocol types) — all landed.

---

### 1.1 -- Migration 009: Personality system schema
| Field | Value |
|-------|-------|
| Type | Feature |
| Complexity | Medium |
| Model | Codex |
| Labels | codex-first |
| Depends on | -- |
| Assigned | _unassigned_ |
| Trello | https://trello.com/c/KBWqAZun |

**What:** Create Supabase migration `009_personality_system.sql` that extends the `roles` table with `root_constraints` + `root_constraints_version` columns, and creates four new tables: `exec_archetypes`, `exec_personalities`, `personality_watchdog`, and `personality_evolution_log`. Includes RLS policies, Realtime publication, append-only enforcement on the evolution log, and seed root constraints for CPO/CTO roles.

**Why:** This is the foundational schema for the entire personality system. Every other Phase 1 card depends on this. The migration follows the existing pattern (008 was pipeline) and reuses the `roles` table as Layer 1 instead of creating a separate `exec_roles` table.

**Files:**
- `supabase/migrations/009_personality_system.sql` (new)

**Gotchas:**
- The `exec_archetypes` table has `voice_notes TEXT`, `contextual_overlays JSONB`, `anti_patterns JSONB`, `productive_flaw TEXT`, and `domain_boundaries JSONB` columns — don't miss these (voice/overlays from expressiveness round, anti-patterns/flaw/boundaries from Tolibear gap analysis)
- `exec_personalities` uses `company_id` (not `org_id`) to match existing multi-tenant pattern
- Append-only enforcement on `personality_evolution_log` uses `REVOKE UPDATE, DELETE` — not a row-level policy
- `ALTER PUBLICATION supabase_realtime ADD TABLE public.exec_personalities;` must be included for local agent cache invalidation
- The `update_updated_at_column()` trigger function must already exist (created in migration 003)

**Implementation Prompt:**
> Create file `supabase/migrations/009_personality_system.sql`. The full SQL is already written in the design doc at `docs/plans/2026-02-20-exec-personality-system-design.md` under the "What Needs Adding (Migration 009)" section. Copy it verbatim — it has been reviewed by three models and the project owner. The SQL includes:
>
> 1. ALTER TABLE `public.roles` — add `root_constraints JSONB DEFAULT '[]'` and `root_constraints_version INTEGER DEFAULT 1` with COMMENT ON COLUMN for both
> 2. UPDATE `public.roles` — seed root constraints for CPO and CTO
> 3. CREATE TABLE `public.exec_archetypes` — with dimensions, correlations, philosophy, `voice_notes TEXT DEFAULT ''`, `contextual_overlays JSONB DEFAULT '[]'`, `anti_patterns JSONB DEFAULT '[]'`, `productive_flaw TEXT DEFAULT ''`, `domain_boundaries JSONB DEFAULT '[]'`, prompt_template. UNIQUE(role_id, name). RLS: service_role full access, authenticated read.
> 4. CREATE TABLE `public.exec_personalities` — with company_id, role_id, archetype_id, user_overrides, evolved_state, compiled_prompt, is_frozen, frozen_until, frozen_reason, version. UNIQUE(company_id, role_id). Trigger on updated_at. RLS: service_role full, authenticated read own company.
> 5. CREATE TABLE `public.personality_watchdog` — with personality_id (unique FK), resets_in_window, window_start, last_reset_at, last_reset_reason. RLS: service_role only.
> 6. CREATE TABLE `public.personality_evolution_log` — with personality_id, timestamp, trigger_signal, dimension, old_value, new_value, was_clamped, clamped_to, watchdog_action, session_id, card_id. Indexes on personality_id and timestamp. REVOKE UPDATE, DELETE from authenticated and anon.
> 7. ALTER PUBLICATION supabase_realtime ADD TABLE public.exec_personalities
>
> Acceptance criteria: Migration runs cleanly against current schema (post-008). All tables have RLS enabled. Evolution log is append-only. exec_personalities is published to Realtime.
>
> Reference: Design doc section "Supabase Implementation Assessment" → "What Needs Adding (Migration 009)"

---

### 1.2 -- Migration 010: Archetype seed data
| Field | Value |
|-------|-------|
| Type | Feature |
| Complexity | Medium |
| Model | Sonnet 4.6 |
| Labels | claude-ok |
| Depends on | 1.1 |
| Assigned | _unassigned_ |
| Trello | https://trello.com/c/Jp1KD1Na |

**What:** Create Supabase migration `010_personality_archetypes_seed.sql` that inserts 6 archetype definitions: 3 for CPO (The Strategist, The Founder's Instinct, The Operator) and 3 for CTO (The Pragmatist, The Architect, The Translator). Each archetype includes all 9 dimension configs (default, bounds, rate), philosophy statements (experiential voice), voice_notes prose, contextual_overlays, anti-patterns (3-5 per archetype), productive flaw, and domain boundaries.

**Why:** Archetypes are the read-only personality bundles that founders select during onboarding. Without seed data, the personality system has no personalities to offer. This follows the pattern of `005_persistent_jobs_seed.sql`.

**Files:**
- `supabase/migrations/010_personality_archetypes_seed.sql` (new)

**Gotchas:**
- Must resolve `role_id` from `roles.name` (CPO, CTO) via subquery — don't hardcode UUIDs
- `voice_notes` must be max 500 chars, style-only (no policy verbs). Lint before committing.
- `contextual_overlays` should include at least 2-3 overlays per archetype (1on1, code_review, crisis as applicable)
- Philosophy statements must use `type: "core_belief" | "operating_hypothesis"` (not the old `weight: "core" | "preference"`)
- **Philosophy `rationale` must be written in first-person experiential voice** — use formula: "I've learned that [insight] because [experience that taught it]." NOT third-person rules. See Enhancement 10a for examples.
- `anti_patterns` — 3-5 per archetype, written as specific catchable behaviors (not traits). Use `{ "behavior": "...", "why": "..." }` format. See Enhancement 10b for CTO Pragmatist example.
- `productive_flaw` — max 300 chars, first-person, names the cost of the archetype's core strength. See Enhancement 10c for all 6 examples.
- `domain_boundaries` — 3-5 explicit deferral statements per archetype. See Enhancement 10d for CTO Pragmatist example.
- Correlations JSONB should default to `'[]'` (populated in Phase 3)
- All dimension defaults must be within their bounds; all bounds must be within [0, 100]

**Implementation Prompt:**
> Create file `supabase/migrations/010_personality_archetypes_seed.sql`. Insert 6 archetype rows into `exec_archetypes`.
>
> For each archetype, the design doc (`docs/plans/2026-02-20-exec-personality-system-design.md`) provides the full dimension tables (defaults, bounds, rates) and philosophy statements under the "Exec Archetypes" section. Use those values exactly.
>
> You must ALSO write:
> 1. `voice_notes` — a 300-500 char prose description of how each archetype *sounds*. See Enhancement 7 section for examples (CTO Pragmatist and CPO Strategist). Write the remaining 4 in the same style.
> 2. `contextual_overlays` — 2-3 situational overlays per archetype. Style-plane offsets only (verbosity, technicality, formality, proactivity, directness). See "Contextual Adaptation via Archetype Overlays" section for the CTO Pragmatist example. Write overlays for the other 5 archetypes following the same pattern.
> 3. Philosophy statements with `type` field: "core_belief" or "operating_hypothesis" (the design doc marks these as "core" or "preference" — map accordingly). **CRITICAL: All `rationale` values must be written in first-person experiential voice** — "I've learned..." / "I've watched..." / "I've shipped..." — not third-person rules. See Enhancement 10a.
> 4. `anti_patterns` — 3-5 per archetype as `[{"behavior": "...", "why": "..."}]`. Written as specific catchable behaviors in first person. See Enhancement 10b for CTO Pragmatist example. Write the remaining 5 archetypes following the same pattern.
> 5. `productive_flaw` — single paragraph, max 300 chars, first-person. The weakness that is the direct cost of the core strength. See Enhancement 10c for all 6 examples — use those verbatim or improve them.
> 6. `domain_boundaries` — 3-5 strings per archetype as `["domain — defer to X", ...]`. See Enhancement 10d for CTO Pragmatist example. Write domain boundaries for all 6 archetypes.
>
> SQL pattern:
> ```sql
> INSERT INTO public.exec_archetypes (role_id, name, display_name, tagline, dimensions, correlations, philosophy, voice_notes, contextual_overlays)
> VALUES (
>   (SELECT id FROM public.roles WHERE name = 'cpo'),
>   'strategist', 'The Strategist', 'Data-driven, methodical, speaks in frameworks...',
>   '{"verbosity": {"default": 60, "bounds": [40, 80], "rate": 3}, ...}'::jsonb,
>   '[]'::jsonb,
>   '[{"principle": "...", "rationale": "I''ve learned that...", "applies_when": "...", "type": "core_belief"}, ...]'::jsonb,
>   'Frames everything as hypotheses...',
>   '[{"trigger": "1on1_nontechnical", "dimension_offsets": {"technicality": -10}, "voice_modifier": "..."}]'::jsonb,
>   '[{"behavior": "I don''t...", "why": "Because I''ve seen..."}]'::jsonb,
>   'I sometimes delay action waiting for signal that won''t come...',
>   '["Marketing strategy — defer to CMO", "Engineering architecture — defer to CTO"]'::jsonb
> );
> ```
>
> Acceptance criteria: 6 rows inserted (3 CPO + 3 CTO). All dimension defaults within bounds. voice_notes < 500 chars. productive_flaw < 300 chars. No policy verbs in voice_notes or voice_modifiers. All philosophy rationales in first-person experiential voice. 3-5 anti-patterns per archetype as specific catchable behaviors. 3-5 domain boundaries per archetype.
>
> Reference: Design doc sections "Exec Archetypes", "Enhancement 7: Voice Layer", "Contextual Adaptation via Archetype Overlays", "Enhancement 10: Tolibear-Informed Soul Depth"

---

### 1.3 -- Prompt compilation module
| Field | Value |
|-------|-------|
| Type | Feature |
| Complexity | High |
| Model | Sonnet 4.6 |
| Labels | claude-ok, tech-review |
| Depends on | 1.1 |
| Assigned | _unassigned_ |
| Trello | https://trello.com/c/x9QUz8It |

**What:** Implement the personality prompt compilation module at `packages/shared/src/personality/`. This is the deterministic function that transforms numeric dimension values + voice_notes + philosophy + root_constraints + contextual overlay + anti-patterns + productive flaw + domain boundaries into a compiled system prompt fragment. Supports two modes: `full` (primary exec agents) and `sub_agent` (value inheritance only). No LLM involved — pure TypeScript template logic.

**Why:** This is the core of the personality system. Every dispatch compiles personality into a prompt fragment that the agent receives. It must be deterministic (same inputs = same output), secure (no raw config exposed), and expressive (voice layer + dimensions working together).

**Files:**
- `packages/shared/src/personality/index.ts` (new — barrel export)
- `packages/shared/src/personality/compile.ts` (new — compilation function)
- `packages/shared/src/personality/dimensions.ts` (new — per-dimension compilation)
- `packages/shared/src/personality/overlays.ts` (new — contextual overlay resolution)
- `packages/shared/src/personality/types.ts` (new — TypeScript interfaces)
- `packages/shared/src/index.ts` (updated — re-export personality module)

**Gotchas:**
- Prompt section precedence: Constraints > Not Your Domain > Policy plane > What You Refuse > Voice > Style directives > Blind Spot
- `mode: "sub_agent"` strips voice, style, flaw, domain boundaries; keeps root_constraints + core_beliefs (as "Standards") + anti_patterns (as "Patterns to Reject"). No persona framing.
- Overlay offsets must be clamped to archetype bounds AFTER application
- Style plane overlays are free; policy plane overlays require explicit allowlist in archetype
- Activation directive must be first: "Embody the persona defined below..."
- The `compileVerbosity()` etc. functions use 5 threshold buckets (0-20, 21-40, 41-60, 61-80, 81-100)
- voice_notes injected verbatim — no interpolation, no template processing
- Must handle missing/empty voice_notes and contextual_overlays gracefully

**Implementation Prompt:**
> Create the personality compilation module at `packages/shared/src/personality/`.
>
> Core function signature (from design doc):
> ```typescript
> function compilePersonalityPrompt(personality: CompiledPersonality): string
> ```
>
> The design doc (`docs/plans/2026-02-20-exec-personality-system-design.md`) provides:
> - The full template structure under "Prompt Compilation" → "Template Structure" (updated with voice layer, activation directive, overlay resolution)
> - The dimension-to-directive compilation example under "Dimension-to-Directive Compilation"
> - The contextual overlay interface under "Contextual Adaptation via Archetype Overlays"
> - The merge logic under "Merge Logic": `user_overrides ?? evolved_state ?? archetype.defaults`, all clamped to bounds
>
> Implement:
> 1. `types.ts` — interfaces: `CompiledPersonality`, `ArchetypeDefinition`, `PersonalityDimension`, `ContextualOverlay`, `BeliefStatement`, `AntiPattern`, `CompiledPromptManifest`
> 2. `dimensions.ts` — 9 compilation functions (verbosity, technicality, formality, proactivity, directness, risk_tolerance, autonomy, analysis_depth, speed_bias) each with 5 threshold buckets
> 3. `overlays.ts` — `resolveContextualOverlay(archetype, context)` and `applyOverlay(dims, overlay)` with style-plane-only default enforcement
> 4. `compile.ts` — `compilePersonalityPrompt(personality, mode)` that merges values, resolves overlay, compiles dimensions, assembles template. In `sub_agent` mode: outputs Standards (core_beliefs) + Patterns to Reject (anti_patterns) + Constraints only — no voice, style, flaw, or domain boundaries.
> 5. `index.ts` — barrel exports
>
> Acceptance criteria: Deterministic (same inputs = same output). All dimension values clamped. Overlay offsets clamped. Policy-plane overlays rejected unless allowlisted. Empty voice_notes/anti_patterns/productive_flaw/domain_boundaries handled gracefully. `sub_agent` mode outputs only Standards + Patterns to Reject + Constraints (no persona). Unit-testable pure functions.
>
> Reference: Design doc sections "Prompt Compilation", "Enhancement 7: Voice Layer", "Contextual Adaptation via Archetype Overlays", "Enhancement 10: Tolibear-Informed Soul Depth", "Merge Logic"

---

### 1.4 -- Add personalityPrompt to StartJob message type
| Field | Value |
|-------|-------|
| Type | Feature |
| Complexity | Low |
| Model | Codex |
| Labels | codex-first |
| Depends on | -- |
| Assigned | _unassigned_ |
| Trello | https://trello.com/c/NweUo7f1 |

**What:** Add an optional `personalityPrompt?: string` field to the `StartJob` interface in the shared message protocol. Update the validator to accept the new field. This is an additive, non-breaking change.

**Why:** The orchestrator needs to send the compiled personality prompt to the local agent as part of the dispatch payload. This field carries the compiled prompt fragment — the local agent just prepends it to the agent's system prompt.

**Files:**
- `packages/shared/src/messages.ts` (modify — add field to `StartJob` interface)
- `packages/shared/src/validators.ts` (modify — update `isStartJob` validator)
- `supabase/functions/_shared/messages.ts` (modify — mirror the change)

**Gotchas:**
- Field must be optional (`personalityPrompt?: string`) — existing agents that don't use personality ignore it
- The validator should accept both with and without the field (backward compatible)
- The field is a compiled prompt string, not raw personality config — no JSON, no dimension values
- Also in the Edge Functions copy at `supabase/functions/_shared/messages.ts`

**Implementation Prompt:**
> Add `personalityPrompt?: string` to the `StartJob` interface in `packages/shared/src/messages.ts` (currently at line 82). This is an optional string field containing the compiled personality prompt fragment.
>
> Update the `isStartJob` validator in `packages/shared/src/validators.ts` to accept the new optional field (it should pass validation both with and without the field).
>
> Mirror the same change in `supabase/functions/_shared/messages.ts` (the Edge Functions copy of the message types).
>
> Acceptance criteria: `StartJob` interface has `personalityPrompt?: string`. Validator passes with and without the field. Both copies (packages/shared and supabase/functions/_shared) are updated. No breaking changes to existing message handling.
>
> Reference: Design doc section "Pipeline Dovetailing" → point 5

---

### 1.5 -- Orchestrator dispatch hook: compile + inject personality
| Field | Value |
|-------|-------|
| Type | Feature |
| Complexity | High |
| Model | Sonnet 4.6 |
| Labels | claude-ok, tech-review |
| Depends on | 1.1, 1.2, 1.3, 1.4 |
| Assigned | _unassigned_ |
| Trello | https://trello.com/c/NoHqPkkJ |

**What:** Modify the orchestrator's `dispatchQueuedJobs` function to compile and inject personality prompts at dispatch time. Between "resolve role" and "send StartJob", the orchestrator reads the company's personality for the target role, compiles it (using the module from 1.3), and attaches the result to `StartJob.personalityPrompt`.

**Why:** This is where personality meets the pipeline. The orchestrator is the sole compilation authority — it reads personality state from Supabase, compiles deterministically, and sends the result to the local agent. The local agent never sees raw config.

**Files:**
- `supabase/functions/orchestrator/index.ts` (modify — `dispatchQueuedJobs` function, around line 329)
- `supabase/functions/_shared/personality.ts` (new — server-side personality helpers)

**Gotchas:**
- Must read `exec_personalities` joined with `exec_archetypes` and `roles` for the company + role
- If no personality exists for this company/role, skip personality injection (graceful degradation)
- Context detection for overlays: use `job.job_type` for code_review/planning, channel context for 1on1/group
- Policy plane enforcement: map `analysis_depth` → model override, `autonomy` → approval gates (future, not Phase 1)
- Server-side compilation only — never send raw personality state over Realtime
- The orchestrator Edge Function runs in Deno (Supabase Edge Functions) — ensure the personality module is compatible

**Implementation Prompt:**
> Modify `supabase/functions/orchestrator/index.ts`, specifically the `dispatchQueuedJobs` function (line 329+). Currently it builds a `StartJob` message at line 461. Add personality compilation between role resolution and StartJob construction.
>
> Flow:
> 1. After resolving the job's role, query `exec_personalities` joined with `exec_archetypes` and `roles` for `company_id` + `role_id`
> 2. If personality exists: merge values (user_overrides ?? evolved_state ?? archetype.defaults), resolve contextual overlay, compile prompt using the personality module
> 3. Attach compiled prompt to `startJobMsg.personalityPrompt`
> 4. If no personality exists: leave `personalityPrompt` undefined (graceful skip)
>
> Create `supabase/functions/_shared/personality.ts` with helper functions for the server-side personality read + compile.
>
> Acceptance criteria: Jobs for roles with personalities receive a compiled `personalityPrompt`. Jobs for roles without personalities dispatch normally. No raw personality config in the StartJob message. Graceful handling of missing archetypes.
>
> Reference: Design doc sections "Injection Flow", "Pipeline Dovetailing" → "Integration Points" → point 1, "Prompt Compilation"

---

### 1.6 -- Local agent: receive and inject personality prompt
| Field | Value |
|-------|-------|
| Type | Feature |
| Complexity | Medium |
| Model | Codex |
| Labels | codex-first |
| Depends on | 1.4 |
| Assigned | _unassigned_ |
| Trello | https://trello.com/c/RKmSLFRi |

**What:** Modify the local agent's `handleStartJob` to read `personalityPrompt` from the StartJob message and prepend it to the agent's system prompt when spawning the tmux session. Also implement sub-agent value inheritance: primary exec agents get the full personality prompt, but sub-agents spawned within the session get the `sub_agent` mode prompt (core beliefs as standards + anti-patterns as rejection criteria + root constraints only — no persona, voice, style, or domain boundaries).

**Why:** The local agent is the last mile — it receives the compiled personality from the orchestrator and injects it into the agent's context. The agent never knows about the personality system; it just receives a richer system prompt.

**Files:**
- `packages/local-agent/src/executor.ts` (modify — `handleStartJob` method, line 85)

**Gotchas:**
- `personalityPrompt` is optional — if missing, proceed without personality (backward compat)
- Personality prompt goes at the TOP of the system prompt (highest privilege position)
- For sub-agents: use `sub_agent` mode prompt (values inherit, identity does not). The orchestrator sends both `personalityPrompt` (full) and `subAgentPrompt` (sub_agent mode) in StartJob, OR the local agent calls `compilePersonalityPrompt(personality, "sub_agent")` locally. Prefer the former (server-authoritative compilation).
- Cache the compiled prompt for the session duration — if Realtime pushes an update mid-session, use the updated version on the next turn (Phase 2 hot-reload)

**Implementation Prompt:**
> Modify `packages/local-agent/src/executor.ts`, specifically `handleStartJob` (line 85). When `msg.personalityPrompt` is present:
>
> 1. Extract the personality prompt string
> 2. When spawning the primary tmux session, prepend the personality prompt to the system prompt (before any other instructions)
> 3. For any sub-agent sessions spawned within this job: pass the `sub_agent` mode prompt instead of the full personality. This carries core beliefs (as "Standards"), anti-patterns (as "Patterns to Reject"), and root constraints — but strips voice, style, persona framing, productive flaw, and domain boundaries. Values inherit, identity does not.
>
> Acceptance criteria: Primary exec agents receive full personality in their system prompt. Sub-agents receive value-inheritance prompt (Standards + Patterns to Reject + Constraints). Missing `personalityPrompt` is handled gracefully (no personality, no error). Personality prompt is positioned at the top of the system prompt.
>
> Reference: Design doc sections "Injection Flow", "Enhancement 9: Sub-Agent Soul Stripping", "Enhancement 10e: Value Inheritance for Sub-Agents"

---

### 1.7 -- CLI: zazig personality commands
| Field | Value |
|-------|-------|
| Type | Feature |
| Complexity | Medium |
| Model | Sonnet 4.6 |
| Labels | claude-ok |
| Depends on | 1.1 |
| Assigned | _unassigned_ |
| Trello | https://trello.com/c/UlLABihT |

**What:** Implement the `zazig personality` CLI subcommand with `--show` and `--archetype` flags. `--show` displays the current personality state for a role (dimensions, archetype, voice, overrides). `--archetype` lists available archetypes or switches to a different one.

**Why:** Founders need a way to inspect and select personalities from the command line during onboarding and debugging. This is the primary interface before the dashboard is built.

**Files:**
- CLI module (new — location TBD based on existing CLI structure)
- Reads from Supabase `exec_personalities` and `exec_archetypes` tables

**Gotchas:**
- Must authenticate against Supabase (needs service role key or authenticated user token)
- `--show` should display: archetype name, all 9 dimension values (current vs default vs bounds), voice_notes preview, active overlays, frozen status
- `--archetype` without value lists available archetypes; with value switches to that archetype
- Archetype switch resets evolved_state and user_overrides (fresh start with new archetype)
- Radar chart display (ASCII) would be nice but not required for v1 — table format is fine

**Implementation Prompt:**
> Implement the `zazig personality` CLI subcommand. Exact CLI framework and file location depends on existing CLI structure — check the codebase for existing CLI commands first.
>
> Commands:
> - `zazig personality <role> --show` — display current personality state as a formatted table (archetype name, tagline, each dimension with current/default/bounds, voice_notes excerpt, frozen status)
> - `zazig personality <role> --archetype` — list available archetypes for this role with taglines
> - `zazig personality <role> --archetype <name>` — switch to a different archetype (resets evolved_state and user_overrides)
>
> Reads from Supabase using the service role key (from Doppler `zazig/prd`). Writes to `exec_personalities` for archetype switch.
>
> Acceptance criteria: `--show` displays readable personality state. `--archetype` lists options. Archetype switch works and resets state. Handles "no personality yet" by offering archetype selection.
>
> Reference: Design doc section "User Experience" → "Onboarding" and "Runtime Commands"
