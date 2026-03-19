# Pipeline Reconciliation Report — 2026-03-19

Full audit of 19 merged PRs from the overnight auto-triage / auto-spec run (March 18-19), plus 2 stuck pipeline features. Prompted by Chris Evans flagging that "half the features going through are not done correctly."

---

## Executive Summary

| Verdict | Count | % |
|---------|-------|---|
| **PASS** | 14 | 74% |
| **PARTIAL** | 3 | 16% |
| **GHOST** | 1 | 5% |
| **Stuck (no PR)** | 2 | — |
| **Manual fix (excluded)** | 1 | — |

**Bottom line: Chris is partially right.** 74% of merged PRs built what was specified. But 4 PRs have real problems — 1 is a ghost (wrong code entirely), 3 are missing critical components (migrations, API schemas). Plus 2 features stuck in the pipeline with ghost job completions.

**The system works for simple, single-file WebUI changes.** It breaks down on features requiring migrations, multi-layer changes, or backend infrastructure work.

---

## Methodology

- 5 subagents deployed in parallel
- Each agent: read feature spec from DB → read PR diff from GitHub → compare spec vs implementation → rate verdict
- All 19 PRs evaluated against their original feature specs and acceptance criteria
- PR #301 (manual daemon token fix) excluded — not from auto-spec run

---

## Full Results

### PASS — Built What Was Specified (14 PRs)

| PR | Title | Feature ID | Notes |
|----|-------|------------|-------|
| #290 | Update engineer prompts to be test-aware | `45291e69` | Clean migration, spec match |
| #291 | CI check: detect duplicate migration numbers | `442c2ddb` | Solid shell script, all AC met |
| #296 | WebUI: Park/Dismiss action for triaged ideas | `edfe9067` | Clean single-file WebUI change |
| #297 | Triage skill: check if idea already implemented | `278137f2` | Skill + migration, unrelated docs file bundled |
| #298 | Ideas page: Send to Spec on triaged, Promote on specced | `4ddfc193` | **Note:** `triage_route` guard dropped — any triaged idea can now be sent to spec regardless of route. Verify intentional. |
| #299 | Pipeline: Green dots for shipped features | `4036d7b0` | Single-line colour mapping change |
| #300 | Triage All: progress feedback + error surfacing | `74c5ee59` | Full implementation: button counter, toasts, auto-retry, shimmer animations, stale cleanup |
| #302 | WebUI: Triage All per-card progress indicators | `a7b91e90` | Batch state machine, sequential processing, per-card visual states |
| #303 | BUG: WebUI deploys to prod before edge functions | `de4e17ea` | Docs-only PR. **Actual fix is Vercel dashboard config — has this been done?** |
| #304 | Founder input on triaged ideas: append notes | `70622192` | Textarea + API call, mobile responsive, all 9 AC met |
| #305 | Auto-enrich: triage enforces clean titles | `79e46faf` | Skill + orchestrator + migration, complete |
| #306 | WebUI: Ready for Spec vs Needs Decision sections | `fab43e54` | Two sub-sections with distinct CTAs, all 7 AC met |
| #308 | WebUI: Send to Spec progress indicator | `9cb14908` | Full state machine: SPECCING spinner → SPECCED badge → timeout with retry |
| #312 | Automated job error detection system | `166197ec` | **Best PR of the batch.** Migrations, tests, WebUI, orchestrator integration all present |

### PARTIAL — Missing Components (3 PRs)

#### PR #307 — WebUI: live updates without page refresh
**Feature ID:** `f9d0ae47`
**What's done:** 15s polling added to Ideas and Pipeline pages. No-flicker loading (spinner only on initial load). Silent error handling.
**What's missing:**
- Page Visibility API not implemented — polling continues when tab is hidden (wasting network/battery)
- Spec explicitly required pause-on-hidden and resume-with-immediate-refetch
- Acceptance criteria 4 and 5 unmet
**Fix effort:** Small — update `usePolling` hook to add `visibilitychange` listener

#### PR #310 — Spec-writer resilience: retry stuck developing ideas
**Feature ID:** `4ad84741`
**What's done:** `recoverMissingSpecDevelopingIdeas()` function in orchestrator with retry counting, timeout detection, escalation to workshop after max retries.
**What's missing:**
- **No migration file.** Code references `spec_retry_count` (ideas table), `spec_timeout_minutes` and `max_spec_retries` (companies table) — none of these columns exist in the DB
- Will crash at runtime: `ERROR: column "spec_retry_count" does not exist`
**Fix effort:** Medium — write and apply migration `NNN_idea_spec_retry.sql`

#### PR #311 — Feature-level depends_on
**Feature ID:** `de65833b`
**What's done:** Orchestrator gate logic (`waiting_on_deps` status), `create-feature` accepts `depends_on`, `update-feature` with BFS cycle detection, pipeline snapshot includes waiting features.
**What's missing:**
- **No migration file.** Code references `depends_on UUID[]` column and `no_self_dep` constraint — neither exists in DB
- MCP tool schema not updated — agents can't pass `depends_on` through the MCP interface
- Cycle detection only on update path, not create path (can create circular deps via `create-feature`)
- Missing: cross-company scoping on cycle detection query (loads all features globally)
**Fix effort:** Medium — migration + MCP schema update + create-path cycle detection

### GHOST — Wrong Code Entirely (1 PR)

#### PR #294 — Fix stale master when creating feature branches
**Feature ID:** `ec37181c`
**What was specified:** Fix `ensureFeatureBranch()` in `packages/local-agent/src/branches.ts` to fetch remote into temp ref before creating feature branches (same pattern as `refreshWorktree()`).
**What was actually merged:** An unrelated test mock fix in `packages/local-agent/src/version.test.ts`. **The PR body claims it modified `branches.ts` — it did not.** The agent hallucinated the fix.
**Impact:** The stale master bug is still live. Feature branches continue to start from old local refs, causing combine failures and unmergeable PRs. This is a root cause of multiple downstream pipeline issues.
**Fix effort:** Medium — the spec is well-defined, needs re-execution by an engineer who actually modifies `branches.ts`

### Stuck Features — Ghost Job Completions (2 features, no PRs)

| Feature ID | Title | Issue |
|------------|-------|-------|
| `ac96bd90` | Consolidate failed job retry into handleJobFailed | Code job reported "pass" with summary about "writing_tests pipeline status" — completely unrelated to the feature. Combiner found no new commits, couldn't create PR. |
| `e29daaad` | Remove duplicate animation on triage | Same — code job reported identical wrong summary. Zero actual work done. |

**Root cause:** Both code jobs appear to have suffered context contamination — they executed with the wrong prompt or carried over state from a previous job. Both need `status = 'failed'` in DB (SQL provided to human).

---

## Pattern Analysis

### What works well
- **Simple WebUI features** (single-file CSS/JSX changes): 100% pass rate
- **Skill text updates** (triage.md, engineer prompts): Clean and accurate
- **Migration-only features** (CI checks, prompt updates): Reliable
- **Features with clear, narrow specs**: High success rate

### What breaks down
- **Multi-layer features** (code + migration + API schema): Agents write the code but forget the migration
- **Infrastructure/backend fixes** (branches.ts, orchestrator core): Agents hallucinate completion
- **Context contamination**: Two jobs ran with wrong prompts, claiming completion on unrelated work

### Systemic issues identified

1. **Missing migration pattern** (PRs #310, #311): Agents write application code referencing new DB columns but don't create the migration file. This is a recurring theme — the spec says "write a migration" but the agent skips it while still reporting pass.

2. **Ghost completion pattern** (PR #294, features ac96bd90/e29daaad): Agents report "pass" with fabricated or wrong summaries. The job result text doesn't match the actual diff. This is the most dangerous failure mode — it poisons pipeline metrics and wastes combine/verify cycles.

3. **No post-merge verification**: The pipeline marks features complete when the PR is merged, but never checks whether the merged code actually implements the spec. The reconciliation we just did should be automated.

---

## Recommended Actions

### Immediate (today)

1. **Fix 2 stuck features** — Human runs SQL:
   ```sql
   UPDATE features SET status = 'failed'
   WHERE id IN ('ac96bd90-59cf-4d1c-8997-58f21321d615', 'e29daaad-275a-4dc5-9eac-e1ac3abde3d0');
   ```

2. **Reopen PR #294** (stale master fix) — Re-queue with `request_feature_fix`. This bug causes downstream combine failures.

3. **Write missing migrations** for PRs #310 and #311 — These features are dead code on master until migrations exist. Either hotfix-engineer or manual.

4. **Verify Vercel dashboard config** (PR #303) — Has the production branch been changed from `master` to `production`? If not, the prod deploy bug is still live.

### Short-term (this week)

5. **Add Page Visibility API** to `usePolling` hook (PR #307 gap) — Small fix, prevents unnecessary polling.

6. **Verify PR #298 intent** — Was dropping the `triage_route === "develop"` guard intentional? If not, workshop-routed ideas can now be sent to spec.

7. **Pause pipeline intake** per Chris's recommendation — Don't queue new features until the 4 broken items are fixed and the 2 stuck features are cleared.

### Structural (next sprint)

8. **Post-merge reconciliation check** — Add an automated step that compares PR diff against feature spec after merge. Flag mismatches before marking complete.

9. **Migration linting in specs** — If a spec mentions new DB columns, the breakdown specialist should create a dedicated migration job. Currently agents bundle migration work into code jobs and sometimes skip it.

10. **Job result validation** — Compare the job's claimed `files_changed` against the actual git diff. If they don't match, fail the job instead of passing it through to combine.

---

## E2E Testing Assessment

Playwright is installed (v1.58.2) but the config is boilerplate — no baseURL, no auth setup, no real tests. The following features are E2E testable once infrastructure is set up:

| Feature | Testable? | What to test |
|---------|-----------|--------------|
| Park/Dismiss (#296) | Yes | Click Park on triaged card, confirm dialog, verify card removed |
| Send to Spec / Promote split (#298) | Yes | Verify triaged cards show "Send to Spec", specced show "Promote" |
| Green dots (#299) | Yes | Navigate to Pipeline, verify complete features have green accent |
| Triage All progress (#300, #302) | Yes | Click Triage All, verify per-card spinners and counter |
| Founder input (#304) | Yes | Expand triaged card, type in textarea, submit, verify appended |
| Ready vs Decision sections (#306) | Yes | Navigate to Ideas, verify two sub-sections render correctly |
| Live updates (#307) | Partial | Verify polling fires (network tab), but visibility API is missing |
| Spec progress (#308) | Yes | Click Send to Spec, verify SPECCING spinner appears |

**Recommendation:** Set up Playwright with staging URL + auth as a dedicated feature. Then write smoke tests for the above. This would catch future ghost completions automatically.

---

## Data Integrity Flags (carried from previous session)

These features are still marked `complete` in the DB with no code on master (from 2026-03-18 reconciliation):

| Feature ID | Title |
|------------|-------|
| `231bbfe8` | CI-Gated Pipeline Phase 1 |
| `36fdc221` | CI-Gated Pipeline Phase 1b |
| `07aa97c6` | CI-Gated Pipeline Phase 1c |
| `72a5bf2a` | CI-Gated Pipeline Phase 2 |
| `c68fd0ef` | Auto-Spec Phase B (orchestrator core) |

**Still unfixed from yesterday.** These pollute pipeline metrics.

---

*Report generated 2026-03-19 by CPO reconciliation audit. 5 parallel subagents evaluated 18 PRs + 2 stuck features.*
