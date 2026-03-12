# Auto-Spec: Orchestrator-Driven Spec Writing for Triaged Ideas

## Problem

**Today:** When the triage-analyst finishes triaging an idea and routes it to `develop`, the idea sits in `triaged` status until a human clicks "Write Spec" in the WebUI or CPO manually dispatches a spec-writer session. The pipeline downstream is fully automated — features auto-enter `breaking_down` on creation — but the spec step is a manual bottleneck.

**Which is a problem, because:** The Full Loop stalls at the spec gate. 19 ideas sit untriaged right now, and once auto-triage processes them, the `triaged` → `specced` transition will be the next dead zone. Every hour an idea sits unspecced is an hour the pipeline's 12 slots sit idle. We just shipped auto-triage (PR #260) — if we don't wire up auto-spec, we've automated half the intake and left a manual gap in the middle.

**What if?:** Triaged ideas with `triage_route = 'develop'` automatically get specced by a headless spec-writer expert session, the same way new ideas automatically get triaged. The human only intervenes at the promote gate (specced → feature).

## Hypothesis

The spec-writer expert role (migration 147) already produces good specs when triggered manually via the WebUI. If we wire it into the orchestrator heartbeat using the same pattern as `autoTriageNewIdeas()`, ideas will flow from triaged → specced without human intervention, and the specs will be good enough to promote directly to features.

## Therefore

Wire `autoSpecTriagedIdeas()` into the orchestrator heartbeat — same batching, atomic claim, and safety patterns as auto-triage — so triaged ideas with `triage_route = 'develop'` auto-dispatch spec-writer headless sessions.

## How this would work

### What already exists (from PR #260)

- `spec-writer` expert role with full prompt (migration 147)
- WebUI "Write Spec" button dispatching headless spec-writer sessions (queries.ts:1051)
- `start-expert-session` edge function supporting headless dispatch
- Idea statuses: `developing` (spec in progress), `specced` (spec complete)
- `autoTriageNewIdeas()` in orchestrator — the pattern to copy
- Company-level settings: `triage_batch_size`, `triage_max_concurrent`, `triage_delay_minutes`

### What needs building

**1. Company settings columns (migration)**

Add to `companies` table:
- `auto_spec BOOLEAN DEFAULT false` — toggle, same as `auto_triage`
- `spec_batch_size INT DEFAULT 3` — ideas per spec-writer session
- `spec_max_concurrent INT DEFAULT 2` — max concurrent spec sessions
- `spec_delay_minutes INT DEFAULT 5` — min age before auto-spec kicks in

**2. `autoSpecTriagedIdeas()` in orchestrator (~80 lines)**

Clone the `autoTriageNewIdeas()` pattern:
- Query companies where `auto_spec = true`
- Cooldown check (same `AUTO_TRIAGE_COOLDOWN_MS` or a separate constant)
- Count active spec-writer headless sessions (same join pattern through `expert_sessions` + `expert_role`)
- Fetch ideas where `status = 'triaged'` AND `triage_route = 'develop'`, ordered by priority then created_at
- Partition into batches
- Atomic claim: update status `triaged` → `developing` where still `triaged`
- Dispatch headless spec-writer session via `start-expert-session` with claimed idea IDs
- On failure: revert to `triaged`

**3. `recoverStaleDevelopingIdeas()` (~30 lines)**

Same pattern as `recoverStaleTriagingIdeas()`:
- Ideas stuck at `developing` for >15 min with no active spec-writer session → revert to `triaged`
- Check `expert_session_items` and `expert_sessions` tables before reverting

**4. Wire into orchestrator tick loop**

Add as step 4c (after auto-triage at 4b):
```typescript
// Step 4c: Auto-spec triaged ideas
await recoverStaleDevelopingIdeas(supabase);
await autoSpecTriagedIdeas(supabase);
```

**5. WebUI toggle**

Add "Auto-Spec" toggle next to "Auto-Triage" toggle on Ideas page. Reads/writes `companies.auto_spec`.

### What we're NOT building

- Auto-promote (specced → feature). That stays manual — human reviews spec before promoting.
- Auto-generate (CPO creates ideas from goals). That's Stage 3 of the auto-scheduling design.
- Health gates. Keep it simple for v1 — toggle on/off is sufficient. Health gates can come later if needed.

### Safety

- Toggle off by default — opt-in per company
- Atomic claim prevents duplicate dispatch (same pattern as auto-triage)
- Staleness recovery handles crashed sessions
- Max concurrent limit prevents slot exhaustion
- Delay ensures ideas aren't specced before triage output is reviewed
- Human still controls the promote gate (specced → feature)

### Verification

- Deploy to staging, toggle on
- Submit a new idea → auto-triage picks it up → routes to `develop` → auto-spec picks it up → idea reaches `specced` with spec, acceptance_tests, human_checklist populated
- Verify staleness recovery: kill a spec session mid-run → idea reverts to `triaged` → re-dispatched
- Verify toggle: turn off → no new spec sessions dispatched
- Verify concurrent limit: flood with 10 triaged ideas → only `spec_max_concurrent` sessions spawn

## We propose

Wire `autoSpecTriagedIdeas()` into the orchestrator heartbeat using the proven auto-triage pattern from PR #260, so triaged ideas with `triage_route = 'develop'` automatically get specced by headless spec-writer sessions — closing the last automated gap between idea intake and pipeline entry.

---

## Repo Gap Review (2026-03-12)

Cross-checking this proposal against the current repo surfaces a few important gaps and mismatches:

### 1. Current state machine does not match the proposal

The biggest mismatch is the target state. This doc assumes ideas routed to `develop` sit at `status = 'triaged'` until a spec session claims them. That is not how the repo currently works.

- The triage-analyst prompt already sets `develop` ideas to `status=developing, triage_route=develop` in `supabase/migrations/146_triage_analyst_expert_role.sql`.
- The manual "Write Spec" button in the WebUI only appears for `status === 'developing'` in `packages/webui/src/pages/Ideas.tsx`.
- The Ideas page treats `triaged` and `developing` as separate buckets, with `developing` already representing the spec-writing lane.

So an orchestrator query of `status = 'triaged' AND triage_route = 'develop'` would miss the actual candidates. Before implementing auto-spec, we need to decide one of:

- keep `develop` ideas at `triaged` until spec is claimed, or
- keep the current flow and have auto-spec operate on `developing`, or
- add a distinct `speccing` lock state so `developing` is not doing double duty as both "needs spec" and "spec in progress".

### 2. Stale recovery is underspecified against current semantics

The proposed `recoverStaleDevelopingIdeas()` would revert stale `developing -> triaged`. In the current repo, `developing` is not just a transient claim state; it is the normal pre-spec state exposed to the operator. Reverting it automatically would blur "waiting for spec" with "spec session crashed" unless we introduce a distinct in-progress state or change the triage prompt.

### 3. Headless expert-session failure handling is leakier than the proposal assumes

`start-expert-session` creates the `expert_sessions` row before broadcasting to the machine. If broadcast fails, it returns an error but leaves the session row in `requested`.

That means "on failure: revert to triaged" is not enough on its own. A copied auto-spec flow could:

- revert the idea because the HTTP call failed, but
- still leave a `requested` spec session that the local agent later picks up.

If we implement auto-spec, we should either cancel orphaned requested expert sessions on dispatch failure or make concurrency/recovery logic treat `requested` as active.

### 4. Concurrency limits do not yet fully protect machine capacity

This proposal says `spec_max_concurrent` prevents slot exhaustion. That is only partially true with the current plumbing.

- The orchestrator's existing auto-triage concurrency check counts only `expert_sessions.status = 'running'`.
- Requested-but-not-yet-started sessions are invisible to that cap.
- `agent-inbound-poll` enforces slot limits for pipeline jobs, but requested expert sessions are returned separately without slot accounting.
- The local agent starts headless expert sessions immediately once received.

So we can cap concurrent running spec sessions, but we cannot yet honestly claim that this protects machine slot capacity end-to-end.

### 5. The WebUI work is larger than "add a toggle next to Auto-Triage"

This doc assumes there is already a visible Auto-Triage toggle to place Auto-Spec beside. In the repo:

- the Ideas page has `autoTriage` state and handlers, but
- the header currently renders only a comment saying the Auto-Triage toggle is hidden, and
- the query layer only has helpers for `companies.auto_triage`, not `auto_spec`.

So the frontend work is not just "add another toggle". It also includes actually surfacing the automation control block on the Ideas page and adding read/write helpers for `auto_spec`.

### 6. Auto-spec escalations are not fully represented in the UI

The `spec-writer` expert role can already escalate an idea to `workshop` or `hardening` if it discovers ambiguity or capability-level scope. The Ideas page already has a Workshop tab, but it does not currently expose a Hardening tab/status lane. If auto-spec is enabled, those escalations will become more common and the UI should surface them cleanly.

### 7. Project selection for unattended specing needs an explicit rule

Manual spec dispatch already carries a chosen `project_id` from the Ideas UI. The orchestrator auto-triage pattern this doc wants to copy just grabs the first active project for the company.

That may be acceptable for single-project companies, but for multi-project companies it is too loose. Auto-spec should define how repo/project selection works:

- use `ideas.project_id` if already set,
- otherwise infer from triage output,
- otherwise hold for human review rather than specing against the first active repo.

### 8. Tests should be called out explicitly

The proposal currently lists manual verification only. Given the repo already has an orchestrator test harness, the implementation should add automated coverage for:

- candidate selection,
- atomic claim behavior,
- stale recovery,
- dispatch failure with orphaned `requested` sessions,
- concurrency counting across both `requested` and `running` expert sessions.

### Bottom line

Most of the raw plumbing already exists:

- `spec-writer` role exists,
- manual headless spec dispatch exists,
- headless expert-session infrastructure exists,
- idea fields/statuses for spec output already exist.

But the proposal is not aligned with the repo's current state machine. The main prerequisite is deciding whether `develop` should remain `developing`, move back to `triaged` until claimed, or gain a new dedicated `speccing` state. Without that, copying the auto-triage pattern verbatim will produce the wrong selector, ambiguous stale recovery, and misleading safety guarantees.
