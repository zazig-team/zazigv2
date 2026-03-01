# Card Catalog: Role Prompts and Skills
**Source:** docs/plans/2026-02-20-role-prompts-and-skills-design.md
**Board:** Exec Team (698f3d4dac52e8cd3a0de148)
**Generated:** 2026-02-20T00:00:00Z
**Numbering:** sequential

## Build Sequence

**Critical path:** `1 → 2 → 3` (migration → orchestrator → local agent)

```
1 (migration) ──┬── 2 (orchestrator) ──┐
                └── 3 (local agent) ───┘
                        both close out independently
```

**How they build on each other:**

- **1 (Migration)** — Foundation. Adds the `skills` column and seeds all 7 role prompts and skill arrays. Without this, there's nothing for the orchestrator to read or the executor to use. Must ship first.
- **2 (Orchestrator)** ← 1 — Reads `roles.prompt` and `roles.skills` from Supabase at dispatch time. Adds `rolePrompt` and `roleSkills` fields to the `StartJob` message. The local agent receives these fields but ignores them until card 3 lands.
- **3 (Local agent)** ← 1 — Reads `rolePrompt` and `roleSkills` from `StartJob`, loads skill file content from `~/.claude/skills/`, assembles the 4-layer context, passes to `claude -p`. Can run in parallel with 2 once migration is done.

Ship 1 first. 2 and 3 can be worked in parallel.

---

### 1 -- Migration: role prompts, skills column, and seed data
| Field | Value |
|-------|-------|
| Type | Feature |
| Complexity | Medium |
| Model | Codex |
| Labels | codex-first |
| Depends on | -- |
| Assigned | _unassigned_ |
| Trello | https://trello.com/c/6998dcd9c61e94d722d45dee |

**What:** Create Supabase migration `011_role_prompts_and_skills.sql` that: (1) adds a `skills text[] NOT NULL DEFAULT '{}'` column to the `roles` table, (2) updates the 5 existing roles (cpo, cto, senior-engineer, reviewer, junior-engineer) with their prompts and skill arrays, and (3) inserts 2 new roles (researcher, product_manager) with their prompts and skill arrays.

**Why:** The `roles.prompt` column is currently NULL for all roles and there's no `skills` column. Without this migration, every agent spawned by the executor is generic — no operational scope, no output contract, no skills. This is the foundation for everything else in this design.

**Files:**
- `supabase/migrations/011_role_prompts_and_skills.sql` (new)

**Gotchas:**
- Prompts contain single quotes — use dollar-quoting (`$$`) in the SQL to avoid escaping hell
- INSERT new rows for `researcher` and `product_manager` (they don't exist in the current seed)
- The 5 existing roles need UPDATE (not INSERT) — match on `name` column, not UUID
- Skill names must exactly match the directory names in `~/.claude/skills/` — e.g. `commit-commands:commit` uses a colon separator
- `researcher` has an empty skills array `'{}'` — tool-driven, no Claude Code skills
- Test the migration locally against current schema (post-010 if personality schema is in)

**Implementation Prompt:**
> Create `supabase/migrations/011_role_prompts_and_skills.sql`.
>
> Step 1: Add column
> ```sql
> ALTER TABLE public.roles ADD COLUMN skills text[] NOT NULL DEFAULT '{}';
> ```
>
> Step 2: UPDATE existing 5 roles. Use dollar-quoting for prompts. The full prompt text for each role is in the design doc at `docs/plans/2026-02-20-role-prompts-and-skills-design.md` under "Role Prompts". Copy verbatim.
>
> Skill arrays:
> - cpo: `'{standup,cardify,review-plan,cpo,scrum,brainstorming}'`
> - cto: `'{cto,multi-agent-review}'`
> - senior-engineer: `'{commit-commands:commit}'`
> - reviewer: `'{multi-agent-review}'`
> - junior-engineer: `'{}'`
>
> Step 3: INSERT 2 new roles:
> - researcher: is_persistent=false, default_model='claude-sonnet-4-6', slot_type='claude_code', skills=`'{}'`
> - product_manager: is_persistent=false, default_model='claude-opus-4-6', slot_type='claude_code', skills=`'{deep-research,second-opinion,repo-recon,review-plan,brainstorming,cardify}'`
>
> Acceptance criteria: Migration runs cleanly against current schema. All 7 roles have non-null prompts. `skills` column exists with correct arrays. `researcher` and `product_manager` rows exist in the roles table.
>
> Reference: Design doc sections "Role Prompts", "Skills Per Role", "Schema Changes"

---

### 2 -- Orchestrator: pass rolePrompt and roleSkills in StartJob
| Field | Value |
|-------|-------|
| Type | Feature |
| Complexity | Low |
| Model | Codex |
| Labels | codex-first |
| Depends on | 1 |
| Assigned | _unassigned_ |
| Trello | https://trello.com/c/6998dceaf71bf091441a2096 |

**What:** Add optional `rolePrompt?: string` and `roleSkills?: string[]` fields to the `StartJob` message type. At dispatch time in the orchestrator, read `roles.prompt` and `roles.skills` from Supabase and include them in the `StartJob` payload sent to the local agent via Realtime.

**Why:** The local agent needs to know the role's operational prompt and skill list to assemble the correct context before spawning `claude -p`. The orchestrator is already reading the `roles` table (for `default_model` and `slot_type`) — this extends that read to include `prompt` and `skills`.

**Files:**
- `packages/shared/src/messages.ts` — add fields to `StartJob` interface
- `packages/shared/src/validators.ts` — update `isStartJob` validator
- `supabase/functions/_shared/messages.ts` — mirror the change
- `supabase/functions/orchestrator/index.ts` — populate fields at dispatch time (around line 329, `dispatchQueuedJobs` function)

**Gotchas:**
- Both fields are optional (`rolePrompt?: string`, `roleSkills?: string[]`) — backward compatible
- The orchestrator already joins `roles` via `complexity_routing` to get `default_model` + `slot_type`. Extend that select to also fetch `prompt` and `skills`
- Don't send role prompt or skills for Codex slot jobs — they don't support it
- Mirror the message type change in both `packages/shared/src/messages.ts` AND `supabase/functions/_shared/messages.ts` (two copies)

**Implementation Prompt:**
> Add `rolePrompt?: string` and `roleSkills?: string[]` to the `StartJob` interface in `packages/shared/src/messages.ts`. Update the `isStartJob` validator in `packages/shared/src/validators.ts` to accept the new optional fields. Mirror both changes in `supabase/functions/_shared/messages.ts`.
>
> In `supabase/functions/orchestrator/index.ts`, find `loadRouting()` (currently selects `roles:role_id(default_model, slot_type)`). Extend the select to also fetch `prompt` and `skills`. In `dispatchQueuedJobs()`, when building the `startJobMsg`, add:
> - `rolePrompt: routingEntry.roles.prompt ?? undefined`
> - `roleSkills: routingEntry.roles.skills ?? undefined`
>
> Skip for codex slot_type jobs.
>
> Acceptance criteria: `StartJob` interface has both new optional fields. Validator passes with and without them. Orchestrator populates both fields from the roles table at dispatch time. Both message type copies updated. No breaking changes.
>
> Reference: Design doc section "Implementation" → step 2. See also personality system design card 1.4 (`packages/shared/src/messages.ts` line 82) for the pattern — `personalityPrompt` was added the same way.

---

### 3 -- Local agent: inject role prompt and skill content
| Field | Value |
|-------|-------|
| Type | Feature |
| Complexity | Medium |
| Model | Sonnet 4.6 |
| Labels | claude-ok |
| Depends on | 1 |
| Assigned | _unassigned_ |
| Trello | https://trello.com/c/6998dcfadc088d96fc1620fd |

**What:** Modify `executor.ts` to read `rolePrompt` and `roleSkills` from the `StartJob` message. For each skill name in `roleSkills`, read the skill file content from `~/.claude/skills/{name}/SKILL.md`. Assemble the 4-layer context in order: `personalityPrompt` → `rolePrompt` → skill content → `jobs.context`. Pass the assembled context to `claude -p`.

**Why:** Currently the executor passes raw `jobs.context` directly to `claude -p` with no role guidance. After this card, every agent session starts with its personality (if present), its operational scope, its full skill toolbox, and then the specific task — in that exact order.

**Files:**
- `packages/local-agent/src/executor.ts` — modify `buildCommand` and context assembly (around line 473)

**Gotchas:**
- Skill file path: `~/.claude/skills/{name}/SKILL.md` — this is a symlinked directory. Use `path.join(os.homedir(), '.claude', 'skills', name, 'SKILL.md')`
- Skill names with colons (e.g. `commit-commands:commit`) — colon is a valid directory name on macOS/Linux. Path becomes `~/.claude/skills/commit-commands:commit/SKILL.md`
- If a skill file is missing: log a warning and continue — don't fail the job
- `personalityPrompt` is already handled (or will be after personality card 1.6) — check if it exists before prepending, don't duplicate if already wired
- If both `rolePrompt` and `roleSkills` are absent, fall back to passing `jobs.context` directly (current behaviour — preserve backward compat)
- Context assembly order matters per Tolibear research: personality first (highest LLM attention), then role, then skills, then task

**Implementation Prompt:**
> Modify `packages/local-agent/src/executor.ts`. In the context assembly before `buildCommand()` is called:
>
> 1. Start with an empty `contextParts: string[]` array
> 2. If `msg.personalityPrompt` is present, push it first
> 3. If `msg.rolePrompt` is present, push it second
> 4. If `msg.roleSkills` is present and non-empty:
>    - For each skill name, attempt to read `~/.claude/skills/{name}/SKILL.md`
>    - Use `fs.readFileSync(path, 'utf8')` — if file doesn't exist, `console.warn` and skip
>    - Push each skill file content as a separate element
> 5. Push `msg.context` (the task) last
> 6. Join all parts with `\n\n---\n\n` as separator
> 7. Pass joined string as the context to `buildCommand()`
>
> If `contextParts` ends up empty (no personality, no role, no skills, no context), fall back to empty string.
>
> Skill file path helper:
> ```typescript
> function skillFilePath(name: string): string {
>   return path.join(os.homedir(), '.claude', 'skills', name, 'SKILL.md');
> }
> ```
>
> Acceptance criteria: Agents receive assembled context in correct order. Missing skill files are warned and skipped. Backward compat preserved (no-op if rolePrompt/roleSkills absent). personalityPrompt still works if present.
>
> Reference: Design doc section "Implementation" → step 3. See executor.ts `buildCommand()` at line 473 for current context handling.
