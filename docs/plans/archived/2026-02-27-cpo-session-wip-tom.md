# CPO Session WIP — 2026-02-27

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

*Updated: 2026-02-27 morning*

### Pipeline now unblocked
Chris confirmed all pipeline bugs from Wed 25th are resolved. Combiner fix landed. Features can flow end-to-end again.

**Pipeline ceiling:** `deploying_to_test` is currently the end of the line. The Test & Ship feature (automated deploy, fix agent, human approval, merge) hasn't been built yet. Everything that passes verification piles up here. Chris manually merges for now — confirming his process.

### Completed (code built & verified)

| Feature | ID | Notes |
|---|---|---|
| Pipeline Smoke Tests | 2e9f067c | Made it through the full pipeline. |
| Ideas Inbox: Table, Edge Functions & MCP Tools | ea21ee02 | **Code done.** All 7 jobs complete. Table migration run manually. Edge functions + MCP wrappers need deploying via cherry-pick — plan at `2026-02-27-ideas-inbox-deployment-plan.md`. |

### In-flight (hit pipeline ceiling at deploying_to_test)

| Feature                                  | ID       | Status                | Notes                                                      |
| ---------------------------------------- | -------- | --------------------- | ---------------------------------------------------------- |
| Telegram Ideas Bot                       | 59b8d9e5 | **deploying_to_test** | Progressed from verifying. Hit ceiling.                    |
| Terminal-Mode Orchestrator Notifications | d78a3b06 | **failed**            | Was at deploying_to_test, now failed. Needs investigation. |
| One-off: df512cdb                        | acc74e42 | **deploying_to_test** | Hit pipeline ceiling.                                      |

### Needs attention (1 failed job out of 5)

| Feature                           | ID       | Status       | Notes                                                                                                                                                                  |
| --------------------------------- | -------- | ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Persistent Agent Bootstrap Parity | d1c730fb | **building** | 4/5 code jobs complete. 1 failed: "Append Workspace Context section" (`e3f10294`). Set to `building` — needs that job re-run or investigated, not a full re-breakdown. |

### Failed — parked (don't touch pipeline infra while it's working)

| Feature | ID | Reason |
|---|---|---|
| Orchestrator lifecycle polling gaps | bc9e2a0f | May already be fixed by Chris's unblocking work. Waiting on confirmation. |
| Clean slate on re-breakdown | 33e0b29e | Same — Chris may have addressed this. |
| Fix: Null-context jobs silently rejected | 2e9a34a6 | Same — needs Chris confirmation before re-running. |

### Failed — previously dep-blocked (Ideas Inbox now complete, these can be re-run)

| Feature | ID | Notes |
|---|---|---|
| Ideaify Skill & CPO Triage Integration | 38a1d16e | Phase 2 Ideas Pipeline. Ideas Inbox is done — this can go. |
| Idea Visualiser | 33f9e3c1 | Phase 4 Ideas Pipeline. Ideas Inbox is done — this can go. |
| query-idea-status edge function + MCP tool | 3c6b11f8 | Traces idea through pipeline chain. Ideas Inbox is done — this can go. |

### Failed — need spec work before re-run

| Feature | ID | Issue |
|---|---|---|
| Skills Distribution CLI | 84e5c68a | Thin description, no ACs. Needs spec enrichment. |
| Pipeline smoke test: static health dashboard | 1d1f2974 | Null description. Needs spec or deletion. |

### Just pipelined (specced, awaiting breakdown)

| Feature | ID | Notes |
|---|---|---|
| Goals & Focus Areas: Data Model + MCP Tools | 2a4f892c | Phase 0 of Strategy Sim foundation. Migrations, MCP tools, `/set-goals` brainstorm skill. Design at `2026-02-27-goals-and-focus-areas-design.md`. Set to `ready_for_breakdown`. |

### Not started (on board, not specced)

| Feature | ID | Priority | Notes |
|---|---|---|---|
| Persistent Agent Identity | 991a062c | high | May overlap with d1c730fb — needs review. Different design doc (2026-02-24). |
| Event Queue & Wake Infrastructure | f2806c36 | high | Full event backbone. Design complete (V2.2), zero implementation. |
| Build Pipeline: Execution Gates | 3443f776 | high | Job verification pipeline. |
| Scheduler, Hooks & External Triggers | 403c7a87 | medium | Depends on Event Queue. |
| Build Pipeline: Test & Ship | 5fc009e2 | medium | Depends on Execution Gates. **Also the reason deploying_to_test is a dead end.** |
| Bidirectional Messaging Unification | ee345f5d | medium | Depends on Event Queue. |
| Web UI: Pipeline Visibility | 61411262 | low | Primarily a Tom task. |
| Role Launch Order Configuration | 23a2352e | medium | Controls tmux window order on `zazig start`. |

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
| 22 | `deploy_to_test` job spam — runaway polling loop | **Active, partially mitigated.** Orchestrator creates a new `deploy_to_test` job every ~4-6 min polling cycle. Job completes as no-op (no deploy infra), feature stays at `deploying_to_test`, next poll creates another. 50+ jobs accumulated for Ideas Inbox + Bootstrap Parity. Mitigated by setting Ideas Inbox to `complete` and deleting queued jobs. **Root fix needed:** orchestrator should not create `deploy_to_test` jobs if one already exists, or should not create them at all until Test & Ship feature is built. |
| 23 | Combiner runs despite failed code jobs | **Unresolved.** Bootstrap Parity had 1/5 code jobs fail, but combiner ran and completed anyway. Should combiner check all code jobs passed before combining? |
| 24 | CPO lacks `query_jobs` and `query_features` MCP access | **Gap.** CPO was blind to job-level diagnostics — had to ask Tom to run SQL manually. One-line fix: add to CPO's `mcp_tools` array in roles table. |
| 25 | Pipeline produces branches but no PRs | **Quick fix deployed** (commit `a96bdc9`). `createGitHubPR()` added to orchestrator — creates PR after `initiateTestDeploy()`. Needs `GITHUB_TOKEN` secret set in Supabase. Chris will do a proper fix later. |

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
- [x] ~~BLOCKER: Combiner not creating jobs~~ — **RESOLVED** (Chris confirmed pipeline unblocked 2026-02-27)
- [ ] Org model review + implementation planning
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

### Open

- [ ] **BLOCKED (Tom at laptop):** Set `GITHUB_TOKEN` secret — `supabase secrets set GITHUB_TOKEN=<PAT>`. Fine-grained PAT with repo scope, read+write PRs. PR creation won't work until this is set.
- [ ] **Ideas Inbox:** Deploy 5 edge functions + MCP wrappers. Table is live, code isn't. **Plan: [2026-02-27-ideas-inbox-deployment-plan.md](2026-02-27-ideas-inbox-deployment-plan.md)** — cherry-pick 5 clean commits, manually merge MCP wrappers, add to CPO tools, smoke test. **Needs Tom at laptop.**
- [x] ~~**Discuss with Chris:** PR creation step after verification~~ — **DONE.** Chris approved. Quick fix implemented (commit `a96bdc9`), pushed to master. CI/CD will autodeploy. Needs GITHUB_TOKEN secret.
- [ ] **Discuss with Chris:** Stale branch strategy — feature branches diverge from master during build. Ideas Inbox branch is -10,919 lines stale. PR creation will surface merge conflicts early, but proper fix (rebase before PR?) still TBD.
- [ ] **Ask Chris:** Are the 3 parked pipeline fixes (polling gaps, clean slate, null-context) still needed or already addressed?
- [ ] **Ask Chris:** Review contractor dispatch routing plan v3.1 (`2026-02-26-contractor-dispatch-routing-plan.md`)
- [ ] Review overlap between d1c730fb (Bootstrap Parity) and 991a062c (Persistent Agent Identity)
- [ ] Configure Gemini API key for second-opinion workflow (GEMINI_API_KEY not set)
- [ ] Update MCP tools — add `tags` parameter to `create_feature` and `batch_create_features`
- [ ] Org model review + implementation planning
- [ ] Garry Tan "YC Engineer" archetype — added to org model, needs doctrine/personality implementation
- [ ] CPO: Spec enrichment for Skills Distribution CLI (84e5c68a)
- [ ] CPO: Decide — spec or delete static health dashboard smoke test (1d1f2974)

### Resolved

- [x] ~~BLOCKER: Combiner not creating jobs~~ — **RESOLVED** (Chris confirmed 2026-02-27)
- [x] ~~Triage failed features from Wed 25th batch~~ — **Done** (2026-02-27). 2 re-submitted, 3 parked, 3 dep-blocked, 2 need specs.
- [x] ~~Delete stale jobs for d1c730fb~~ — **Done**
- [x] ~~Reset d1c730fb and re-trigger~~ — **Done** (re-submitted again 2026-02-27)
- [x] ~~Triage stuck combining features~~ — **Done**
- [x] ~~Merge stale projects~~ — **Done**
- [x] ~~Run tags migration~~ — **Done**
- [x] ~~Investigate why queued jobs aren't dispatching~~ — **Fixed**
- [x] ~~Unified 4 Ideas Pipeline proposals~~ — **Done**
- [x] ~~Spec and pipeline 5 features~~ — all failed in Wed batch, Ideas Inbox + Bootstrap Parity re-submitted
- [x] ~~Deploy orchestrator~~ — **Done**
- [x] ~~Clean up stale combine job~~ — **Done**
- [x] ~~CI/CD autodeploy~~ — **Shipped** (commit `c3c6396`)
- [x] ~~Null-context validator fix~~ — **Specced** (feature `2e9a34a6`, parked pending Chris confirmation)
- [x] ~~Drive-pipeline skill~~ — **Written** + role prompt injected (migration 054)
- [x] ~~query_idea_status~~ — failed in Wed batch, dep-blocked on Ideas Inbox
- [x] ~~Pipeline re-breakdown systemic fix~~ — failed in Wed batch, parked pending Chris confirmation
- [x] ~~CTO CLI versioning prompt~~ — **Shipped** (commit `93fcbdf`)

## Needs CPO action (this session / next)

- [ ] Monitor Goals & Focus Areas feature `2a4f892c` — just sent to `ready_for_breakdown`
- [ ] Spec enrichment: Skills Distribution CLI (84e5c68a) — thin description, no ACs
- [ ] Decide: spec or delete static health dashboard smoke test (1d1f2974) — null description
- [ ] Org model review + implementation planning — Tom wants to walk through all 6 layers
- [ ] Deep-dive brainstorms on each Ideas Pipeline layer (Tom requested)
- [ ] Consider speccing the remaining high-priority features (Event Queue, Execution Gates)
- [ ] Review remaining proposals: CPO Autonomous Execution, Zazig Terminal
- [ ] Goals & Focus Areas Phases 1-3 — design doc written, Phase 0 in pipeline, plan next phases when Phase 0 completes
- [x] ~~Triage Wed 25th failed features~~ — **Done** (2026-02-27)
- [x] ~~Write /drive-pipeline skill~~ — **Done**
- [x] ~~Inject drive-pipeline into role prompt~~ — **Done** (migration 054)
- [x] ~~Update Phase 2 spec with drive-pipeline additions~~ — **Done**
- [x] ~~Investigate dispatch~~ — **Fixed**
- [x] ~~Apply pipeline design doc edits~~ — Done (session 2)
- [x] ~~Strategy Sim deep dive~~ — **Done** (Goals & Focus Areas brainstormed and designed, `2026-02-27-goals-and-focus-areas-design.md`)

### Pipeline triage (2026-02-27)
31. **Pipeline confirmed unblocked** — Chris confirmed all Wed 25th bugs resolved. Combiner fixed.
32. **Full triage of 10 failed features** — 2 re-submitted (Bootstrap Parity, Ideas Inbox), 3 parked (pipeline fixes — don't touch while it's working), 3 dependency-blocked (Ideas Pipeline chain), 2 need spec work.
33. **Identified pipeline ceiling** — `deploying_to_test` is a dead end until Test & Ship feature is built. All verified features will pile up there. Current workaround: Chris manual merge.
34. **Re-submitted d1c730fb** (Persistent Agent Bootstrap Parity) to `ready_for_breakdown`
35. **Re-submitted ea21ee02** (Ideas Inbox) to `ready_for_breakdown`

### Pipeline investigation & cleanup (2026-02-27, later)
36. **Both re-submitted features immediately failed** — within minutes of being reset to `ready_for_breakdown`, both showed `failed` status again. Investigated via SQL.
37. **Ideas Inbox had already completed the full pipeline** — all 7 code jobs complete (migration, 5 edge functions, MCP wrappers), combine complete, verify complete. It was at `deploying_to_test` before we reset it. Resetting to `ready_for_breakdown` was a mistake — it created a new queued breakdown job alongside all the completed work, confusing the orchestrator.
38. **Bootstrap Parity had 4/5 code jobs complete, 1 failed** — "Append Workspace Context section with repo root path" (job `e3f10294`) failed. Other 4 jobs completed. Combiner ran anyway despite the failure (questionable behaviour — should it combine with a failed job?).
39. **Discovered deploy_to_test job spam** — 50+ `deploy_to_test` jobs piled up across both features. Orchestrator creates a new one every ~4-6 minutes on its polling loop. Job completes as a no-op (no deploy infrastructure exists), feature stays at `deploying_to_test`, next poll creates another. Runaway loop burning machine slots.
40. **Cleanup applied (SQL):**
    - Deleted accidental breakdown job `9ad2564e` (Ideas Inbox) — the code was already built
    - Deleted accidental breakdown job `e6c70f50` (Bootstrap Parity)
    - Set Ideas Inbox to `complete` — code is built and verified, deploy step is a no-op anyway. Stops the deploy_to_test spam loop.
    - Set Bootstrap Parity to `building` — needs the 1 failed code job investigated, not a full re-breakdown
    - Deleted all queued `deploy_to_test` jobs for both features

**For Chris:**
- Ideas Inbox code is done. It went through breakdown → 7 code jobs → combine → verify successfully. We set it to `complete` to stop the deploy spam. The code needs manual merge/review.
- Bootstrap Parity has 1 failed job (`e3f10294` — "Append Workspace Context section"). The other 4 code jobs completed. Either re-run that job or investigate why it failed.
- The `deploy_to_test` polling loop is creating dozens of no-op jobs. Needs an orchestrator fix — either don't create a new deploy job if one already exists, or don't create them at all until the Test & Ship feature is built.
- CPO `query_jobs` and `query_features` MCP access would prevent us from being blind to this in future. One-line addition to CPO's `mcp_tools` array in the roles table.

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

### Ideas Inbox deployment (2026-02-27 morning)
41. **Ideas table migration run manually** — old prototype `ideas` table (5 columns) existed, was empty. Dropped and recreated with full 31-column Phase 1 schema. Events constraint extended with 5 idea event types. All live in Supabase.
42. **Feature branch is stale** — `origin/feature/ideas-inbox-table-edge-functions-mc-ea21ee02` branched before migrations 055-065 and significant Chris work. Diff shows -10,919 lines (files added to master after branch point). Merging as-is would likely conflict in `agent-mcp-server.ts`, `executor.ts`, and orchestrator.
43. **Still needed for Ideas Inbox:** 5 edge functions deployed + MCP tool wrappers in agent-mcp-server. Options: cherry-pick clean edge function commits (self-contained directories, low risk) or nuke the branch and rebuild from current master.
44. **Pipeline gap identified: no PR creation step** — pipeline produces verified feature branches but never creates a pull request. Code accumulates on remote branches with no notification. Both Tom and Chris can merge, but nobody knows there's something to merge. Minimum fix: add a `create_pr` step after verification passes. Discuss with Chris.
45. **Contractor dispatch routing plan under review** — separate session running gap analysis against current codebase. Plan was written before Chris's overnight work (MCP access control, branch chaining, `commission_contractor` removal).

### PR creation quick fix & strategy brainstorm (2026-02-27 afternoon)
46. **PR creation quick fix implemented** — Chris approved adding a `createGitHubPR()` call after verification passes. CPO dispatched a sonnet sub-agent which committed `a96bdc9` to the orchestrator edge function. Creates a GitHub PR from the feature branch to master after `initiateTestDeploy()`. Handles 201 (success), 422 (PR already exists), errors gracefully. **Pushed to master** — CI/CD will autodeploy.
47. **GITHUB_TOKEN secret needed** — `supabase secrets set GITHUB_TOKEN=<PAT>` required for PR creation to work. Tom needs to generate a fine-grained PAT (repo scope, read+write PRs) and set it in Supabase. **Blocked until Tom is at laptop.**
48. **CPO sub-agent pattern established** — CPO can dispatch sonnet-class sub-agents to implement code changes, bypassing the "CPO doesn't write code" constraint. This works now without needing the contractor dispatch routing plan. Useful for quick fixes.
49. **Goals & Focus Areas brainstormed** — deep dive into the Strategy Sim proposal's foundation layer. One-at-a-time multi-choice brainstorm. Key decisions:
    - Two object types: **Goals** (measurable end-states: "Where are we going?") and **Focus Areas** (strategic themes: "What should we pay attention to?"). Not hierarchical levels.
    - "Goals" not "Outcomes" — founder language
    - Tiered metrics: near-term specific, long-term directional, crystallise as deadlines approach
    - Explicit linking between focus areas and goals, set conversationally during brainstorm (not forms)
    - Founder sees simple ordered list; system derives weight internally from position + actual behaviour divergence
    - Features linked via both explicit links (coverage map) and tags (lightweight association)
    - Exec alignment: single company-level list, execs inherit by domain relevance, can propose focus areas upward. One list, one priority order, no shadow priority systems.
    - Brainstorm-assisted creation: three modes (initial setup, periodic review, event-driven Civ-style prompts)
    - Interface phasing: Terminal (us, now) → Web (primary product, non-technical founders) → Slack/Telegram (convenience)
50. **Design doc written** — full design at `docs/plans/2026-02-27-goals-and-focus-areas-design.md`. Covers model, data schema (SQL for goals, focus_areas, two junction tables), exec alignment, brainstorm flow, strategic question triggers, 4 implementation phases, design decision table.
51. **Goals & Focus Areas Phase 0 pipelined** — feature `2a4f892c` created with spec, ACs, and human checklist. Set to `ready_for_breakdown`. Covers: migrations, MCP tools, `/set-goals` brainstorm skill for terminal. Pipeline will break it down.
52. **Ideas Inbox deployment plan written** — 7-step plan at `docs/plans/2026-02-27-ideas-inbox-deployment-plan.md`. Cherry-pick 5 clean edge function commits, manually merge MCP wrappers, add to CPO tools, restart session, smoke test, clean up stale branch.

### Contractor dispatch plan org model cross-check (2026-02-27 afternoon)
53. **Full cross-check against org model completed** — verified standalone dispatch is compatible with all six prompt stack layers, three worker tiers, model routing, memory, and charters. Annotated as Appendix E in the plan (now v3.4).
54. **Key finding: all compatible, no design changes needed.** Standalone jobs share `dispatchQueuedJobs()` compilation path — personality, knowledge (when built), skills, model routing all flow automatically. Five unbuilt org model systems (knowledge injection, contractor memory, rich model routing, charter enforcement, lite personality) will compose correctly when shipped.
55. **Founder doctrines folded into Goals & Focus Areas Phase 1** — captured via brainstorm, stored in Goals system, propagated to exec prompt stacks via knowledge architecture Layer 4. Added to design doc and design decision table.

### Org model implementation status (audited 2026-02-27)

| Layer | Design Doc | Built? | Notes |
|---|---|---|---|
| **1. Personality** | `exec-personality-system-design.md` | Partial | Exec compilation works (`compiled_prompt`). Values-only mode exists (`compile_personality_prompt_sub_agent()`). Non-exec roles not seeded with personality records. |
| **2. Role prompt** | `role-prompts-and-skills-design.md` | Built | `roles.prompt` column, injected via `rolePrompt` in StartJob, assembled into CLAUDE.md by executor. All roles have prompts. |
| **3. Skills** | `role-prompts-and-skills-design.md` | Built | `roles.skills[]` column, loaded from `~/.claude/skills/`. Persistent agents have skills gap (drops at `handlePersistentJob`). |
| **4. Doctrines** | `exec-knowledge-architecture-v5.md` | Not built | Zero code. v5 approved and implementation-ready. Needs `knowledgeContext` field on StartJob + doctrine tables + retrieval pipeline. |
| **5. Canons** | `exec-knowledge-architecture-v5.md` | Not built | Zero code. Same design doc as doctrines. Separate ingestion/retrieval from doctrines. |
| **6. Memory** | Org model + persistent agent identity design | Partial | Exec memory via workspace persistence. Contractor memory (job-scoped + shared) unbuilt. Supabase-backed, not filesystem. |
| **Model routing** | Org model (Model Routing section) | Basic | `default_model` + `slot_type` per role works. Rich `model_config` (investigation, review_by, fallback, local_eligible) not built. |
| **Charters** | Org model (Charters section) | Not built | Zero code. Mandate/interdiction JSON designed, governance validation designed, no tables or enforcement. |
| **Prompt assembly** | Persistent agent identity design | Built | `assembleContext()` in executor concatenates personality → role → skills → task. Orchestrator compiles + sends via StartJob. |

### Ideas to capture (once Ideas Inbox MCP tools are live)
- **Founder Doctrines** — extend exec doctrine/archetype mechanism to capture founder strategic beliefs (e.g. "platform-first, integrate with best-in-class specialists"). Captured during Goals & Focus Areas brainstorm, referenced by execs, challenged during periodic review when behaviour drifts. Doctrine drift = another strategic question trigger. Directly extends the Goals & Focus Areas design.

### Stale branch problem (systemic)
The Ideas Inbox branch is the first concrete example of a systemic issue: the pipeline creates feature branches from whatever master was at breakdown time, but by the time code jobs complete and combine, master has moved on. The longer a feature takes to build, the more stale its branch becomes. The PR-creation step would surface this early (GitHub shows merge conflicts on the PR). Without it, stale branches accumulate silently.

## Today's plan (2026-02-27)

Pipeline unblocked. Ideas table migrated. PR creation quick fix pushed. Goals & Focus Areas designed and pipelined.

### Done today
- [x] Ideas table migration — live in Supabase (31-column schema)
- [x] PR creation quick fix — commit `a96bdc9` pushed to master, CI/CD will autodeploy
- [x] Chris alignment on PR creation — approved as short-term fix
- [x] Goals & Focus Areas brainstorm — full design doc written
- [x] Goals & Focus Areas Phase 0 — feature `2a4f892c` set to `ready_for_breakdown`
- [x] Ideas Inbox deployment plan — 7-step cherry-pick plan written
- [x] Founder doctrines — folded into Goals & Focus Areas Phase 1 spec
- [x] Contractor dispatch routing plan org model cross-check — Appendix E added (v3.4), all layers compatible
- [x] Org model implementation status audit — full layer-by-layer status mapped
- [x] GITHUB_TOKEN secret set — PAT configured in Supabase
- [x] Ideas Inbox deployed — 5 edge functions + MCP wrappers cherry-picked to master, CI/CD deploying
- [x] Telegram Ideas Bot PR #116 created and merged
- [x] Supabase CLI installed (`brew install supabase/tap/supabase`)
- [x] Tom-WIP Trello board populated — 12 cards added from WIP (5 driving, 7 backlog)
- [x] CPO `mcp_tools` updated — 5 ideas tools added, `commission_contractor` removed

### Needs Tom at laptop
- [x] ~~Set `GITHUB_TOKEN` secret~~ — **Done.** PAT set in Supabase via dashboard.
- [x] ~~Ideas Inbox cherry-pick~~ — **Done.** All 5 edge functions + MCP wrappers cherry-picked to master and pushed. CI/CD deploying. CPO `mcp_tools` array updated (5 ideas tools added, `commission_contractor` removed). Needs session restart to pick up new tools.

### Still open
- [x] ~~Contractor dispatch routing plan org model cross-check~~ — **Done** (Appendix E, v3.4). Plan is compatible with all org model layers.
- [ ] **Chris review needed:** Contractor dispatch routing plan v3.4 (`2026-02-26-contractor-dispatch-routing-plan.md`) — ready to implement
- [ ] Spec work — Skills Distribution CLI needs enrichment, static health dashboard needs spec or deletion
- [ ] Chris alignment — parked pipeline fixes, stale branch strategy

### Backlog (ready when pipeline settles)

- **CPO Autonomous Execution** — plan written at `2026-02-26-cpo-autonomous-execution-plan.md`. Phase 1 (role prompt) + Phase 2 (skill edits) unblocked.
- **Contractor dispatch routing plan** — v3.4 (org model cross-checked). Ready for Chris review + implementation. `2026-02-26-contractor-dispatch-routing-plan.md`.
- **Model optimisation** — audit agent workloads, implement tiered model selection. See details below.
- **Goals & Focus Areas Phases 1-3** — exec alignment, web interface, strategic questions. Depend on Phase 0 completing.
- **Web UI / Founder Goals** — brainstorm → prototype visual

## Current priority order

1. ~~**GITHUB_TOKEN secret**~~ — **Done.**
2. ~~**Ideas Inbox edge functions + MCP wrappers**~~ — **Done.** Cherry-picked, pushed, CPO tools updated. Restart session to activate.
3. **Goals & Focus Areas Phase 0** — in pipeline (`2a4f892c`, `ready_for_breakdown`). Watch for breakdown results.
4. **Chris alignment** — stale branch strategy, parked pipeline fixes, contractor dispatch routing plan review
5. **Spec enrichment** — Skills Distribution CLI, static health dashboard
6. **Model optimisation** — URGENT. Audit agent workloads and implement tiered model selection. See details below.
7. **CPO Autonomous Execution implementation** — Phase 1 (role prompt) + Phase 2 (skill edits) are unblocked. Phase 2 complex-spec contractor path unblocked by routing plan.
8. **Goals & Focus Areas Phases 1-3** — exec alignment, web interface, strategic questions. Design doc at `2026-02-27-goals-and-focus-areas-design.md`.
9. **Update MCP tools** — add `tags` parameter to `create_feature` and `batch_create_features`
10. **Review d1c730fb vs 991a062c overlap** — are these redundant or complementary?
11. **Deep-dive brainstorms** — individual Ideas Pipeline layer sessions with Tom
12. **Gemini API key** — set `GEMINI_API_KEY` for second-opinion workflow

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

### Suggested implementation order (updated 2026-02-27 afternoon)

1. ~~**Skills Distribution Phase 1**~~ — **failed** (84e5c68a). Needs spec enrichment before re-run.
2. **CPO Autonomous Execution** (role prompt + skill edits) — zero code, immediate CPO improvement. Not yet started.
3. **Ideas Inbox** — **complete** (ea21ee02). Code built & verified. Edge functions + MCP wrappers need deploying (cherry-pick plan ready).
4. **Ideaify Skill** — **dep-blocked** (38a1d16e). Waiting on Ideas Inbox deployment.
5. ~~**CPO Pipeline Orchestration**~~ — **Done** — skill written, role prompt injected, Phase 2 spec updated
6. **Telegram Ideas Bot** — **deploying_to_test** (59b8d9e5). Hit pipeline ceiling.
7. **Goals & Focus Areas Phase 0** — **in pipeline** (2a4f892c, `ready_for_breakdown`). Foundation layer of Strategy Sim. Design at `2026-02-27-goals-and-focus-areas-design.md`.
8. **Spec Visualiser** — not started. Approval workflow.
9. **Zazig Terminal Phase 0** — not started. Enhanced TUI + web dashboard.
10. **Goals & Focus Areas Phases 1-3** — exec alignment, web interface, strategic questions. Depends on Phase 0.
