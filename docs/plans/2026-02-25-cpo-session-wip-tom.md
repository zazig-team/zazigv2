# CPO Session WIP — 2026-02-25

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

## Feature status board

*Updated: session 3 reconciliation (2026-02-25)*

### In the pipeline (active)

| Feature | ID | Status | Notes |
|---|---|---|---|
| Terminal-Mode Orchestrator Notifications | d78a3b06 | **combining** | All 5 code jobs **complete**. Combiner job queued but not yet dispatched. See "Dispatch investigation" below. |
| Persistent Agent Bootstrap Parity | d1c730fb | **ready_for_breakdown** | Stale jobs cleaned up. Fresh breakdown job `fdf9ff99` queued but not yet dispatched. Same dispatch question as above. |
| Pipeline Smoke Tests | 2e9f067c | **verifying** | Active verification of dispatch, DAG execution, contractor commissioning. |

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

## New issue: queued jobs not dispatching

**Severity:** Potentially blocking both active features.

**What's happening:**
- d78a3b06 combiner job `7fd2c92d` is `queued` with no `started_at` — all 5 code jobs completed, but the combiner hasn't been picked up
- d1c730fb breakdown job `fdf9ff99` is `queued` with no `started_at` — the stale job blocker is cleared but the new breakdown hasn't dispatched

**Possible causes:**
1. Orchestrator dispatch loop not running (server down or paused?)
2. No machine with available slots online
3. Job type routing issue — combiner/breakdown roles may need specific dispatch handling
4. Dispatch cycle timing — may just need a trigger or a poll cycle to fire

**Action needed:** Investigate whether the orchestrator is actively dispatching. Check machine heartbeats and slot availability.

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
| 10 | Queued jobs not dispatching | **New** — both d78a3b06 combiner and d1c730fb breakdown sitting queued with no started_at |
| 11 | `execute-sql` quoted identifier bypass | **Fixed** — regex now matches `"quoted"` identifiers + rejects zero-extraction evasion (deployed 2026-02-25) |
| 12 | `execute-sql` DO/COPY/CALL block bypass | **Fixed** — added DO, COPY, CALL to syntax blocklist (deployed 2026-02-25) |
| 13 | `execute-sql` no audit trail | **Fixed** — `sql_executed` events now logged to `agent_events` after each execution (deployed 2026-02-25) |

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
- [ ] **Investigate why queued jobs aren't dispatching** — both d78a3b06 combiner and d1c730fb breakdown stuck in `queued`
- [ ] Review overlap between d1c730fb (Bootstrap Parity) and 991a062c (Persistent Agent Identity)
- [ ] Configure Gemini API key for second-opinion workflow (GEMINI_API_KEY not set)
- [ ] Pipeline bug: decide whether to create a feature for the re-breakdown systemic fix or handle as a quick patch
- [ ] Update MCP tools — add `tags` parameter to `create_feature` and `batch_create_features` edge functions
- [ ] Review 9 research proposals (see below)

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
- [ ] **Investigate why queued jobs aren't dispatching** — top priority
- [ ] Review overlap between d1c730fb (Bootstrap Parity) and 991a062c (Persistent Agent Identity)
- [ ] Configure Gemini API key for second-opinion workflow (GEMINI_API_KEY not set)
- [ ] Pipeline re-breakdown systemic fix — quick patch or feature?
- [ ] Update MCP tools — add `tags` parameter to `create_feature` and `batch_create_features`
- [ ] Review 9 research proposals

## Needs CPO action (this session)

- [ ] Investigate dispatch — why are d1c730fb breakdown and d78a3b06 combiner stuck in `queued`?
- [ ] After dispatch is resolved: monitor d1c730fb breakdown, confirm jobs are created
- [ ] After dispatch is resolved: confirm d78a3b06 combiner runs and feature moves to `verifying`
- [ ] Consider speccing the remaining high-priority features (Event Queue, Execution Gates)
- [ ] Create a Pipeline Infrastructure feature for the re-breakdown bug if Tom prefers pipeline fix over quick patch
- [x] ~~Apply pipeline design doc edits per the project definition change plan~~ — Done (session 2)

## Current priority order

1. **Investigate dispatch** — why are queued jobs (d78a3b06 combiner, d1c730fb breakdown) not being picked up? Check orchestrator status, machine heartbeats, slot availability.
2. **Update MCP tools** — add `tags` parameter to `create_feature` and `batch_create_features` edge functions
3. **Pipeline re-breakdown systemic fix** — quick patch or feature through the pipeline?
4. **Review d1c730fb vs 991a062c overlap** — are these redundant or complementary?
5. **Gemini API key** — set `GEMINI_API_KEY` for second-opinion workflow
6. **Review 9 research proposals** — see below

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

### Suggested implementation order

1. **Skills Distribution Phase 1** (~20 lines) — unblocks everything else
2. **CPO Autonomous Execution** (role prompt + skill edits) — zero code, immediate CPO improvement
3. **Ideas Inbox** (migration + edge functions + MCP tools) — foundation for 2, 3, 6
4. **Ideaify Skill** (skill file) — processes input for inbox
5. **CPO Pipeline Orchestration** (`/drive-pipeline` skill) — CPO knows how to run the pipeline
6. **Telegram Ideas Bot** — mobile capture into inbox
7. **Spec Visualiser** — approval workflow
8. **Zazig Terminal Phase 0** — enhanced TUI + web dashboard
9. **Strategy Sim Phase 1** — decision infrastructure + Command Board (could subsume parts of Spec Visualiser and Zazig Terminal dashboard)
