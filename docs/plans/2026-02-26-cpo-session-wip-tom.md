# CPO Session WIP — 2026-02-26

## What we started with

The handover from the previous session identified 5 gaps in the persistent agent bootstrap path. A design doc was written, two features were created, and the first pipeline test was attempted. It failed because `update_feature` MCP tool lacked spec/AC/checklist fields — the Breakdown Specialist got null spec and created zero jobs. Tom deployed the fix. This session picked up from there.

## What we accomplished this session

1. **Wrote spec fields into d1c730fb** (Persistent Agent Bootstrap Parity) — spec, acceptance_tests, and human_checklist now in the proper DB columns (previously only in description)
2. **Specced d78a3b06** (Terminal-Mode Orchestrator Notifications) — ran a deep dive on the notification infrastructure, got a Codex second opinion, discovered two critical plumbing issues, wrote a three-layer spec incorporating all findings
3. **Set both features to `ready_for_breakdown`**
4. **Discovered a pipeline re-breakdown bug** affecting d1c730fb (see below)
5. **Confirmed d78a3b06 broke down successfully** — 5 jobs created, now in `building` status
6. **Removed errant docs/ directory** from CPO workspace
7. **Designed `features.tags` column** for initiative grouping — replaces the mid-level project grouping lost by the project definition change
8. **Wrote pipeline project definition change plan** — 9 specific edits documented in `2026-02-25-pipeline-project-definition-changes.md`
9. **Applied all 9 pipeline design doc edits** — `2026-02-24-idea-to-job-pipeline-design.md` now reflects project = repo model, tags, and updated triage/structuring language
10. **Produced 9 research proposals** — see "Research proposals" section below
11. **Unified 4 Ideas Pipeline proposals** — single five-layer design (Capture → Process → Store → Triage → Present). Archived originals. Created visual at `docs/visuals/ideas-pipeline.html`.
12. **Specced and pipelined 5 features** — Ideas Pipeline phases 1-4 + Skills Distribution CLI. All broke down successfully, now at `building`/`combining`.
13. **Dispatched 5 CTO blockers** — all committed to master (trust prompt, UUID type error, stale breakdown, skills gap, branch generation + 2 bonus fixes)
14. **Diagnosed and fixed dispatch blocker** — root cause: 3 undeployed orchestrator commits + null `features.branch` / `projects.repo_url`. CTO deployed + set data.
15. **CI/CD autodeploy shipped** — commit `c3c6396`, GitHub Action active. Auto-deploys edge functions on push to `supabase/functions/`.
16. **Null-context silent failure** — CTO discovered, specced as feature `2e9a34a6` (3 fixes, 5 ACs). Now at `breakdown`.
17. **Wrote `/drive-pipeline` skill** — CPO operational runbook at `.claude/skills/drive-pipeline/SKILL.md` in the repo. Covers inbox sweep, scope routing, notification handling, pipeline state awareness, trust boundaries.
18. **Injected Pipeline Operations into CPO role prompt** — CTO deployed migration 054 appending `## Pipeline Operations` section + updating skills array. Ensures CPO loads drive-pipeline at session start.
19. **Updated Phase 2 spec** (38a1d16e) — added drive-pipeline registration in CPO skills array + pipeline awareness/notification handling additions to CPO role prompt job.
20. **query_idea_status commissioned** — CTO commissioned as standalone job (`3c6b11f8`). One edge function + one MCP tool wrapper, traces idea → feature → jobs. Now at `breakdown`.
21. **CLI versioning prompt written** — `zazig --version`, version on start, version in status. Git hash-based (0.1.0+949cb4c). Not yet delivered to CTO.

### Overnight CTO work (2026-02-26)
22. **MCP tool access control** — migration 056 adds `mcp_tools TEXT[]` to roles table. Server-side enforcement via `ZAZIG_ALLOWED_TOOLS` env var. Each role gets only its allowed tools. Replaces hardcoded map.
23. **Dependency branch chaining** — jobs that depend on other jobs now inherit predecessor code via branch chaining. Combiner only merges leaf branches. Full pipeline (cards 1-5).
24. **Feature `failed` status** — migration 055 adds `failed` status + `error TEXT` column. Orchestrator can now mark features as failed instead of leaving them stuck.
25. **Edge function auth fix** — persistent agent discovery was using ES256 JWT which gateway rejects. Switched to anon key.
26. **`commission_contractor` removed** — MCP tool gone. Work goes through the pipeline now.
27. **CLI versioning shipped** — commit `93fcbdf`. `zazig --version`, version on start, version in status.

## Feature status board

*Updated: 2026-02-26 morning*

### In the pipeline (active)

| Feature | ID | Status | Notes |
|---|---|---|---|
| Ideas Inbox: Table, Edge Functions & MCP Tools | ea21ee02 | **combining** | STUCK — no combine job. Phase 1 Ideas Pipeline. |
| Ideaify Skill & CPO Triage Integration | 38a1d16e | **combining** | STUCK — no combine job. Phase 2 Ideas Pipeline. |
| Telegram Ideas Bot | 59b8d9e5 | **combining** | STUCK — no combine job. Phase 3 Ideas Pipeline. |
| Idea Visualiser | 33f9e3c1 | **combining** | STUCK — no combine job. Phase 4 Ideas Pipeline. |
| Skills Distribution CLI | 84e5c68a | **combining** | STUCK — no combine job. |
| Persistent Agent Bootstrap Parity | d1c730fb | **combining** | STUCK — no combine job. |
| query-idea-status edge function + MCP tool | 3c6b11f8 | **combining** | STUCK — no combine job. |
| Lifecycle polling gaps | bc9e2a0f | **combining** | STUCK — no combine job. Ironic: this feature would fix the problem it's stuck on. |
| One-off: df512cdb | acc74e42 | **combining** | STUCK — no combine job. Mystery one-off. |
| Terminal-Mode Orchestrator Notifications | d78a3b06 | **verifying** | Made it through combining overnight. |
| Pipeline Smoke Tests | 2e9f067c | **verifying** | Active verification. |
| Fix: Null-context jobs silently rejected | 2e9a34a6 | **building** | Progressed from breakdown overnight. |
| Clean slate on re-breakdown | 33e0b29e | **building** | Progressed from breakdown overnight. |

### Combiner blocker (9 features stuck)

9 features in `combining` with zero combine-agent jobs. Orchestrator transitions status but never creates the combine job. Chris is working on the combiner fix. Once fixed, CPO to reset stuck features back to `building` so the orchestrator re-triggers combining properly.

### Not started (on board, not specced)

| Feature | ID | Priority | Notes |
|---|---|---|---|
| Persistent Agent Identity | 991a062c | high | May overlap with d1c730fb — needs review. Different design doc (2026-02-24). |
| Event Queue & Wake Infrastructure | f2806c36 | high | Full event backbone. Design complete (V2.2), zero implementation. |
| Build Pipeline: Execution Gates | 3443f776 | high | Job verification pipeline. |
| Scheduler, Hooks & External Triggers | 403c7a87 | medium | Depends on Event Queue. |
| Build Pipeline: Test & Ship | 5fc009e2 | medium | Depends on Execution Gates. |
| Bidirectional Messaging Unification | ee345f5d | medium | Depends on Event Queue. |
| Web UI: Pipeline Visibility | 61411262 | low | Primarily a Tom task. |

### Stuck combining features — RESOLVED
Previously 7+ features stuck in `combining`. All cleaned up — no longer visible in zazigv2 project. Role Launch Order Configuration (23a2352e) reset to `created`.

---

## Pipeline bug: stale breakdown prevents re-breakdown

**Severity:** Blocks any feature that needs re-breakdown after a failed first attempt.

**What happens:**
1. Feature set to `ready_for_breakdown`, breakdown specialist runs, creates zero jobs (e.g. null spec)
2. Feature manually reset to `created`
3. Feature set to `ready_for_breakdown` again (with proper spec this time)
4. Orchestrator finds the old completed breakdown job, concludes "all jobs done", skips breakdown entirely
5. Combiner dispatched on empty job set

**Root cause:** `triggerBreakdown()` or `processReadyForBreakdown()` does not check whether existing breakdown jobs predate the current `ready_for_breakdown` transition.

**Immediate fix for d1c730fb:** ~~Delete the two stale jobs (breakdown `94aea3db` and combiner `f87b0951`) from the DB, reset feature to `created`, then set `ready_for_breakdown` again.~~ **DONE** — stale jobs cleaned up, fresh breakdown job `fdf9ff99` created and queued.

**Proper fix:** `triggerBreakdown()` should either:
- Delete existing breakdown/combine jobs when transitioning to `ready_for_breakdown`
- Or check `started_at` vs the feature's latest status transition timestamp

**Systemic fix still needed** — the workaround was applied manually for d1c730fb but the bug remains for any future re-breakdown scenario.

---

## ~~New issue: queued jobs not dispatching~~ — RESOLVED

Root cause: 3 orchestrator commits not deployed to Supabase + `features.branch` and `projects.repo_url` were null. CTO deployed edge functions, set missing data via SQL, manually invoked orchestrator. Pipeline flowing — all features progressed through breakdown into building/combining. CI/CD autodeploy (commit `c3c6396`) now prevents committed-but-not-deployed class of issues.

---

## Pipeline findings (cumulative across all sessions)

| # | Finding | Status |
|---|---|---|
| 1 | `update_feature` MCP tool lacked spec/AC/checklist fields | **Fixed** (deployed 2026-02-25) |
| 2 | Skills not copied to persistent workspace | Specced (d1c730fb) — breakdown queued, awaiting dispatch |
| 3 | No terminal-mode notifications | Specced (d78a3b06) — all 5 jobs **complete**, combiner queued |
| 4 | Stale breakdown job prevents re-breakdown | **Workaround applied** for d1c730fb. Systemic fix still needed. |
| 5 | CPO can't commission code fix contractors | Gap — no `senior-engineer` role in `commission_contractor` |
| 6 | CPO can't create standalone jobs (Entry Point B) | Gap — no `create_job` MCP tool |
| 7 | Event name mismatch (`message_inbound` vs `message`) | **Job complete** — fix landed in d78a3b06 Job 4 (dafd87cf) |
| 8 | Daemon tracks single persistent target (no multi-role routing) | **Job complete** — refactored in d78a3b06 Job 5 (bc0a2e93) |
| 9 | 7+ features stuck in `combining` status | **Resolved** — cleaned up, no longer in project |
| 10 | Queued jobs not dispatching | **Fixed** — root cause: 3 orchestrator commits not deployed + features.branch and projects.repo_url null. CTO deployed edge functions, set missing data, pipeline flowing. |
| 11 | `execute-sql` quoted identifier bypass | **Fixed** — regex now matches `"quoted"` identifiers + rejects zero-extraction evasion (deployed 2026-02-25) |
| 12 | `execute-sql` DO/COPY/CALL block bypass | **Fixed** — added DO, COPY, CALL to syntax blocklist (deployed 2026-02-25) |
| 13 | `execute-sql` no audit trail | **Fixed** — `sql_executed` events now logged to `agent_events` after each execution (deployed 2026-02-25) |
| 17 | Null-context jobs silently consume machine slots | **Specced & in pipeline** — feature `2e9a34a6` created with full spec (root cause chain, 3 defense-in-depth fixes, 5 ACs). Now at `breakdown`. Primary fix: `undefined` → `"{}"`. |
| 18 | Committed-but-not-deployed edge functions | **Fixed** — CI/CD autodeploy shipped (commit `c3c6396`). GitHub Action auto-deploys on push to `supabase/functions/`. Secrets from Doppler. |
| 19 | CPO not loading drive-pipeline skill at session start | **Fixed** — CTO deployed migration 054: `## Pipeline Operations` section appended to CPO role prompt (Position 2), skills array updated. Ensures behavioral triggers at high-attention prompt position. |
| 20 | Re-breakdown blocked by stale jobs | **Queued** — feature `33e0b29e`. Fix: DELETE old breakdown/combine jobs before creating new ones on `ready_for_breakdown` transition. |
| 21 | Lifecycle polling gaps | **Queued** — feature `bc9e2a0f`. Missing transition fallbacks in orchestrator polling loop. |
| 14 | `zazig status` reads wrong PID file | **Fixed** — `status.ts` called `isDaemonRunning()` which reads legacy `daemon.pid`, but `start.ts` now uses `startDaemonForCompany()` which writes to `{companyId}.pid` (e.g. `00000000-...pid`). Daemon was alive the whole time but status reported "not running". Fix: `findRunningDaemon()` scans `~/.zazigv2/` for UUID-pattern `.pid` files first, falls back to legacy. Commit `117c141`. |
| 15 | Persistent agent trust prompt blocks headless CTO/CPO sessions | **Not fixed** — `executor.ts` spawns Claude Code with `claude --model claude-opus-4-6` but no `--dangerously-skip-permissions` flag. Claude Code shows an interactive "Do you trust this folder?" dialog the first time it encounters a workspace with no trust record in `~/.claude/projects/`. For CPO this was accepted in a prior session so it works. CTO had never been trusted, so it sat stuck at the prompt indefinitely. The workspace `.claude/settings.json` already scopes tool permissions per role, so adding `--dangerously-skip-permissions` to the spawn command just skips the interactive trust UI without losing safety. Fix location: `packages/local-agent/src/executor.ts` line ~632, the `shellCmd` construction for persistent agents. |
| 16 | Persistent agent jobId is not a valid UUID — DB writes silently fail | **Not fixed** — `spawnPersistentAgent()` calls `handlePersistentJob()` with `persistent-${job.role}` (e.g. `"persistent-cto"`) as the jobId parameter. `handlePersistentJob` then tries to write to the `jobs` table using `.eq("id", jobId)`, but the `jobs.id` column is type UUID. Postgres rejects `"persistent-cto"` with `invalid input syntax for type uuid`. This means `prompt_stack` is never persisted and `sendJobStatus` DB writes fail silently. The agent spawns and runs fine — the errors are non-fatal — but observability is broken. Fix: either pass the full synthetic jobId (`persistent-${job.role}-${companyId}`) which is still not a UUID, or skip `jobs` table writes entirely for persistent agents since they don't have real job rows. Location: `packages/local-agent/src/executor.ts` lines 451-456. |

## Codex second opinion (key findings)

- Layer 1 approach (add more notifyCPO calls) is correct minimal intervention
- Event name mismatch between orchestrator broadcast and daemon subscription is a real risk
- Daemon's single `persistentJobId` blocks multi-role routing
- Queue is unbounded — needs cap before expanding notifications
- Sanitize error output before injection to prevent prompt corruption

## Needs human action

- [x] ~~Delete stale jobs for d1c730fb~~ — **Done** (stale jobs removed, fresh breakdown job queued)
- [x] ~~Reset d1c730fb and re-trigger~~ — **Done** (feature at `ready_for_breakdown`, job `fdf9ff99` queued)
- [x] ~~Triage stuck combining features~~ — **Done** (cleaned up, no longer in project)
- [x] ~~Merge stale projects~~ — **Done** (Pipeline Infrastructure and Pipeline Integration Test merged into zazigv2, deleted)
- [x] ~~Run tags migration~~ — **Done** (`features.tags TEXT[]` + GIN index applied)
- [x] ~~Investigate why queued jobs aren't dispatching~~ — **Fixed** (undeployed orchestrator + null data)
- [x] ~~Unified 4 Ideas Pipeline proposals~~ — single design doc at `docs/plans/2026-02-25-ideas-pipeline-unified-design.md`
- [x] ~~Spec and pipeline Ideas Pipeline (4 phases)~~ — all at `building`
- [x] ~~Spec and pipeline Skills Distribution CLI~~ — at `building`
- [x] ~~Deploy orchestrator edge function~~ — CTO deployed, 3 commits now live
- [x] ~~Clean up stale combine job `7fd2c92d`~~ — null-context bug, slot freed
- [ ] Review overlap between d1c730fb (Bootstrap Parity) and 991a062c (Persistent Agent Identity)
- [ ] Configure Gemini API key for second-opinion workflow (GEMINI_API_KEY not set)
- [x] ~~Pipeline re-breakdown systemic fix~~ — **Queued** — feature `33e0b29e` (clean slate on re-breakdown)
- [ ] NEW: Lifecycle polling gaps — feature `bc9e2a0f` (missing transition fallbacks) — queued
- [ ] Update MCP tools — add `tags` parameter to `create_feature` and `batch_create_features` edge functions
- [x] ~~Review CI/CD autodeploy proposal~~ — **Done** — shipped, commit `c3c6396`, GitHub Action active
- [x] ~~Null-context validator fix~~ — **Specced** — feature `2e9a34a6` at `breakdown`
- [x] ~~Drive-pipeline skill~~ — **Done** — written to repo, role prompt injected via migration 054
- [x] ~~query_idea_status~~ — **In pipeline** — commissioned by CTO as standalone job `3c6b11f8`, at `breakdown`
- [x] ~~CTO CLI versioning prompt~~ — **Shipped** (commit `93fcbdf`)
- [ ] **BLOCKER: Combiner not creating jobs** — 9 features stuck in `combining` with no combine-agent jobs. Chris fixing. Once fixed, reset 9 features to `building` so orchestrator re-triggers.
- [ ] Org model review + implementation planning (contingent on combiner fix)
- [ ] Garry Tan "YC Engineer" archetype — added to org model as reference material, needs implementation as CTO doctrine/personality

## Design decisions made this session

### Breakdown complexity: no differentiation in v1

Chris asked whether complex features should get a different breakdown path. Currently all features — simple or complex — follow the same flow: CPO + Human spec it, set `ready_for_breakdown`, Breakdown Specialist decomposes alone.

Options considered:
1. Status quo — spec quality is the lever (current)
2. CPO reviews breakdown output before dispatch (adds `breakdown_review` step)
3. CPO participates in breakdown (not possible — different sessions)
4. Complexity-tiered breakdown (higher model or extra review for complex features)

**Decision: stick with option 1 for v1.** The spec is the quality gate. If breakdown produces bad results, the fix is a better spec, not a more complex breakdown process. Revisit if breakdown quality becomes a recurring issue.

### Project definition: align with Chris's model

Chris clarified: a "project" = a repository-level product. Not a mid-level grouping for initiatives. The pipeline design doc currently treats projects as something you create frequently (e.g. "User Authentication" becomes a project with 3 features). This contradicts Chris's model where zazigv2 is THE project and everything is features within it.

**Changes to pipeline design doc:** All 9 edits from `2026-02-25-pipeline-project-definition-changes.md` have been applied to `2026-02-24-idea-to-job-pipeline-design.md`.

**Changes needed in DB:** ~~"Pipeline Infrastructure" and "Pipeline Integration Test" projects probably shouldn't exist as separate projects — their features (if any) belong under zazigv2.~~ **DONE** — merged and deleted.

### Tags field: lightweight initiative grouping

With projects now meaning repo-level products, we lose mid-level grouping. Solution: `features.tags TEXT[]` column. Free-form labels that group related features for reporting/filtering. E.g. all "User Authentication" features get `['user-auth']`. Project Architect assigns tags when creating feature outlines. Spec and migration details in `2026-02-25-pipeline-project-definition-changes.md`, section 9.

---

## Needs human action (second copy — kept in sync)

- [x] ~~Delete stale jobs for d1c730fb~~ — **Done**
- [x] ~~Reset d1c730fb and re-trigger~~ — **Done**
- [x] ~~Triage stuck combining features~~ — **Done**
- [x] ~~Merge stale projects~~ — **Done**
- [x] ~~Run tags migration~~ — **Done**
- [x] ~~Investigate why queued jobs aren't dispatching~~ — **Fixed**
- [x] ~~Unified 4 Ideas Pipeline proposals~~ — **Done**
- [x] ~~Spec and pipeline 5 features~~ — moving through pipeline (combining/building)
- [x] ~~Deploy orchestrator~~ — **Done**
- [x] ~~Clean up stale combine job~~ — **Done**
- [x] ~~CI/CD autodeploy~~ — **Shipped** (commit `c3c6396`)
- [x] ~~Null-context validator fix~~ — **Specced** (feature `2e9a34a6` at `breakdown`)
- [x] ~~Drive-pipeline skill~~ — **Written** + role prompt injected (migration 054)
- [x] ~~query_idea_status~~ — **In pipeline** (`3c6b11f8` at `breakdown`)
- [ ] Review overlap between d1c730fb (Bootstrap Parity) and 991a062c (Persistent Agent Identity)
- [ ] Configure Gemini API key for second-opinion workflow (GEMINI_API_KEY not set)
- [x] ~~Pipeline re-breakdown systemic fix~~ — **Queued** (`33e0b29e`)
- [ ] Lifecycle polling gaps — feature `bc9e2a0f` queued
- [ ] Update MCP tools — add `tags` parameter to `create_feature` and `batch_create_features`
- [x] ~~CTO CLI versioning prompt~~ — **Shipped** (commit `93fcbdf`)
- [ ] **BLOCKER: Combiner not creating jobs** — 9 features stuck. Chris fixing. Once fixed, reset to `building`.
- [ ] Org model review + implementation planning
- [ ] Garry Tan "YC Engineer" archetype — added to org model, needs doctrine/personality implementation

## Needs CPO action (next session)

- [ ] Monitor 10 active features — 5 combining, 2 building, 2 breaking down, 1 verifying
- [ ] Org model review + implementation planning (contingent on combinator fix) — Tom wants to walk through all 6 layers and plan implementation
- [ ] Deep-dive brainstorms on each Ideas Pipeline layer (Tom requested)
- [ ] Consider speccing the remaining high-priority features (Event Queue, Execution Gates)
- [ ] Create a Pipeline Infrastructure feature for the re-breakdown bug if Tom prefers pipeline fix over quick patch
- [ ] Review CTO's work — 10+ commits landed this session, consider multi-agent review
- [ ] Review remaining proposals: CPO Autonomous Execution, Zazig Terminal, Strategy Sim
- [x] ~~Write /drive-pipeline skill~~ — **Done**
- [x] ~~Inject drive-pipeline into role prompt~~ — **Done** (migration 054)
- [x] ~~Update Phase 2 spec with drive-pipeline additions~~ — **Done**
- [x] ~~Investigate dispatch~~ — **Fixed**
- [x] ~~Apply pipeline design doc edits~~ — Done (session 2)

### Contractor dispatch routing plan (2026-02-26 afternoon)
28. **Contractor dispatch routing plan v3.1** — deep dive into why `commission_contractor` was removed, root cause analysis, 4 rounds of review (v1 self → v2 Codex+Gemini → v3 CPO gap analysis → v3.1 Codex+Gemini). Final design: dedicated `request-work` edge function + Postgres function for atomic validation. Replaces `commission_contractor`. Plan at `2026-02-26-contractor-dispatch-routing-plan.md`. Ready for Chris review.
29. **Key design decisions in routing plan:**
    - Standalone dispatch restricted to operational roles only (pipeline-technician, monitoring-agent, verification-specialist, project-architect)
    - Engineering quick fixes go through the pipeline as single-job features
    - `request_standalone_work()` Postgres function does feature lock + role check + idempotency in one transaction
    - `source` column on jobs table distinguishes standalone from pipeline jobs
    - Orchestrator skips all pipeline behaviour (combine, verify, wrapper features) for standalone jobs
    - Executor needs a NO_CODE_CONTEXT path for roles that don't need git worktrees
30. **Autonomous execution plan unblocked** — contractor dispatch design resolved. Phase 2 complex-spec review can use `request_work(role: 'verification-specialist')` once implemented.

## Today's plan (2026-02-26)

Pipeline is blocked on combiner fix. Focusing on non-pipeline work:

1. **CPO Autonomous Execution** — brainstormed and validated. Plan written at `2026-02-26-cpo-autonomous-execution-plan.md`. ~~Blocked on contractor dispatch design.~~ Unblocked — routing plan v3.1 resolves contractor dispatch.
2. **Contractor Dispatch Routing Plan** — deep dive, 4 rounds of review, v3.1 ready for Chris. `2026-02-26-contractor-dispatch-routing-plan.md`.
3. **Strategy Sim deep dive** — brainstorm the Civ-style decision interface. Not started yet.
4. **Web UI / Founder Goals** — brainstorm what Tom wants to see as a founder. Not started yet.

When combiner is fixed:
5. Reset 9 stuck features to `building`
6. Resume pipeline monitoring

## Current priority order

1. **BLOCKER: Combiner fix** — Chris working on it. 9 features stuck.
2. **Contractor dispatch routing plan** — v3.1 ready for Chris review. `2026-02-26-contractor-dispatch-routing-plan.md`.
3. **Model optimisation** — URGENT. Audit agent workloads and implement tiered model selection. See details below.
4. **CPO Autonomous Execution implementation** — Phase 1 (role prompt) + Phase 2 (skill edits) are unblocked. Phase 2 complex-spec contractor path unblocked by routing plan.
5. **Strategy Sim deep dive** — brainstorm → design doc
6. **Web UI / Founder Goals** — brainstorm → prototype visual
7. **Update MCP tools** — add `tags` parameter to `create_feature` and `batch_create_features`
8. **Review d1c730fb vs 991a062c overlap** — are these redundant or complementary?
9. **Deep-dive brainstorms** — individual Ideas Pipeline layer sessions with Tom
10. **Gemini API key** — set `GEMINI_API_KEY` for second-opinion workflow

### Model optimisation (urgent)

Inspired by [Claude model optimisation article](https://thoughts.jock.pl/p/claude-model-optimization-opus-haiku-ai-agent-costs-2026). The author ran everything on Opus, hit 70-80% of weekly usage limits by Friday. After auditing and tiering, dropped to ~40% usage — 60% cost reduction.

**The insight:** Most autonomous agent tasks are structured execution, not creative reasoning. Cheaper models execute without overthinking.

**Three-tier strategy (from article):**
- **Haiku (95% of tasks)** — execution, automation, file operations, scheduled tasks. "Doesn't overthink."
- **Sonnet (4%)** — content creation, research synthesis, building new features
- **Opus (1%)** — architecture decisions, debugging cascading failures, multi-agent coordination

**How this maps to zazig:**
- Pipeline-technician running SQL → Haiku
- Breakdown specialist decomposing features → Sonnet
- Monitoring agent investigating anomalies → Sonnet
- Senior engineer implementing jobs → Sonnet (most), Opus (complex)
- CPO speccing features and making strategy decisions → Opus
- CTO architecture review → Opus
- Verification specialist reviewing code → Sonnet
- Code reviewer → Haiku or Sonnet

**What we already have:** The `complexity` field on jobs (`simple`, `medium`, `complex`) maps to model tiers. The orchestrator dispatch already has slot types. The infrastructure for tiered dispatch exists — we need to audit the actual workloads and set the right defaults per role.

**Needs:** Deep dive brainstorm to map every role to its default model tier, identify which tasks within each role warrant upgrading, and implement the routing. This is a cost and capacity multiplier — doing more with the same API limits.

---

## Research proposals (produced this session)

All in `docs/plans/2026-02-25-*-proposal.md`:

| # | Proposal | File | Summary | Key recommendation |
|---|----------|------|---------|-------------------|
| 1 | Ideas Inbox | `ideas-inbox-proposal.md` | Pre-pipeline Supabase table for raw ideas. Schema, lifecycle (new→triaged→promoted), 4 MCP tools, autonomous CPO sweep. | "Always ask" trust boundary for v1 — CPO triages but doesn't promote without human approval. |
| 2 | Ideaify Skill | `ideaify-skill-proposal.md` | Skill that cleans raw input into structured ideas. Multi-idea splitting, scope/complexity/domain triage, full skill prompt draft. | Skill first, contractor role later. Clean and categorise only — don't analyse (that's CPO's job). |
| 3 | Telegram Ideas Bot | `telegram-ideas-bot-proposal.md` | Telegram bot for capturing ideas on the go. 6-stage voice pipeline (capture→transcribe→store→process→save→confirm). | OpenAI gpt-4o-transcribe for STT. Supabase Edge Functions for v1. Capture before processing — never lose a voice note. |
| 4 | Zazig Terminal | `zazig-terminal-proposal.md` | Custom terminal for multi-agent interaction. Session sidebar, multi-thread per exec, pipeline status bar, quick action buttons. | Don't fork Ghostty — phased approach: enhanced TUI (2-3wk) → Electron prototype (6-8wk) → native macOS if validated. |
| 5 | Skills Distribution | `skills-distribution-proposal.md` | CLI-based skills sync from repo to workspaces. Found the exact persistent agent gap (~20 lines to fix). | Hybrid symlinks with CLI management. Phase 1 (close the wiring gap) is ~20 lines of code. |
| 6 | CPO Pipeline Orchestration | `cpo-pipeline-orchestration-proposal.md` | Meta-skill teaching CPO to drive the full pipeline. Decision trees, inbox triage, promotion procedures, notification handling. | `/drive-pipeline` as a reference skill. Inbox sweep at session start. v1 ships with "Always Ask" trust level. |
| 7 | CPO Autonomous Execution | `cpo-autonomous-execution-proposal.md` | "Forgiveness not permission" framework. Self-assessment, Ralph loops, inform-and-proceed patterns. | Root cause found: `spec-feature` Step 7 and `plan-capability` Step 7 explicitly force human confirmation. Fix those lines. |
| 8 | Spec Visualiser & Approval UI | `spec-visualiser-proposal.md` | Visual rendering of markdown proposals with interactive approval. Private Netlify hosting, common template. Deep-link back to CPO for discussion. Auto-regen on spec update. | Vanilla HTML + Mermaid.js + Supabase. `/visualise-spec` skill generates and deploys. Netlify with Basic Auth. |
| 9 | Strategy Sim | `strategy-sim-proposal.md` | Civ-style decision interface for AI execs. Multiple choice decisions, recommendations, consequence tracking, autopilot modes. | Command Board UI, 4 decision categories, 3 autopilot modes per exec, time-pressured expiry, cross-exec tension detection. 28-37 jobs, 8-12 weeks. |

### Cross-proposal dependencies

```
Ideas Inbox ← Ideaify Skill (processes input for inbox)
Ideas Inbox ← Telegram Bot (captures ideas into inbox)
Ideas Inbox ← CPO Pipeline Orchestration (CPO sweeps inbox)
CPO Pipeline Orchestration ← CPO Autonomous Execution (how aggressively CPO proceeds)
Skills Distribution ← CPO Pipeline Orchestration (CPO needs skills available)
Spec Visualiser ← CPO Autonomous Execution (auto-deploy after spec)
Zazig Terminal — independent (long-term, phased)
Strategy Sim ← CPO Autonomous Execution (autopilot = autonomy levels made visual)
Strategy Sim ← Ideas Inbox (ideas become decision points)
Strategy Sim ← Spec Visualiser (shared approval UI patterns)
```

### Suggested implementation order (updated)

1. ~~**Skills Distribution Phase 1**~~ — **in pipeline** (84e5c68a, combining)
2. **CPO Autonomous Execution** (role prompt + skill edits) — zero code, immediate CPO improvement. Not yet started.
3. ~~**Ideas Inbox**~~ — **in pipeline** (ea21ee02, combining)
4. ~~**Ideaify Skill**~~ — **in pipeline** (38a1d16e, combining)
5. ~~**CPO Pipeline Orchestration**~~ — **Done** — skill written, role prompt injected, Phase 2 spec updated
6. ~~**Telegram Ideas Bot**~~ — **in pipeline** (59b8d9e5, building)
7. **Spec Visualiser** — not started. Approval workflow.
8. **Zazig Terminal Phase 0** — not started. Enhanced TUI + web dashboard.
9. **Strategy Sim Phase 1** — not started. Decision infrastructure + Command Board.
