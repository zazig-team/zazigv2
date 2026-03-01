# Pipeline Fix — Execution Prompts

Run these in Claude Code sessions pointed at `~/Documents/GitHub/zazigv2`.

---

## Session A: Unblock Pipeline (Task 0 + Task 1)

```
I need you to modify `supabase/functions/orchestrator/index.ts` to fix stuck pipeline features.

Read the full plan at `docs/plans/2026-02-26-pipeline-lifecycle-fix-plan.md` — specifically Task 0 and Task 1.

Summary of what to do:

1. **Task 0 — Central failed-job catch-up.** Insert a new block at the TOP of `processFeatureLifecycle` (currently at line 2228), BEFORE the existing "--- 1. breakdown → building ---" block. This block queries all active features (not complete/failed/cancelled/created/ready_for_breakdown), checks if any have a failed job, and if so marks the feature as failed with a CAS guard. See plan for exact code.

2. **Task 1 — combining→verifying catch-up.** Insert a new block AFTER the existing "--- 2. building → combining ---" block (which ends around line 2349). This block queries features in 'combining' status, checks if their latest combine job (by created_at) is complete, and if so calls triggerFeatureVerification(). See plan for exact code.

3. Update the JSDoc comment above processFeatureLifecycle to document both new blocks.

4. Commit each task separately:
   - Task 0: "fix: add central failed-job catch-up to processFeatureLifecycle"
   - Task 1: "fix: add combining→verifying catch-up poller to processFeatureLifecycle"

IMPORTANT RULES:
- Read the existing code before editing. Line numbers in the plan may have drifted — find the right insertion points by looking for the comment markers ("--- 1. breakdown → building ---" etc.)
- All job queries MUST use `.order("created_at", { ascending: false }).limit(1)` to get the latest job only
- Do NOT modify any existing code — only INSERT new blocks
- Do NOT touch any other files
```

### After Session A: Deploy + Test

```bash
# Deploy the updated edge function
supabase functions deploy orchestrator

# Then create a test feature via CPO or directly in DB and watch it flow through
# Check logs: tail -f ~/.zazigv2/local-agent.log
```

---

## Session B: Harden Pipeline (Tasks 2-4)

Only run this AFTER Session A is deployed and you've confirmed combining→verifying works.

```
I need you to add three more catch-up pollers to `processFeatureLifecycle` in `supabase/functions/orchestrator/index.ts`.

Read the full plan at `docs/plans/2026-02-26-pipeline-lifecycle-fix-plan.md` — specifically Tasks 2, 3, and 4.

Summary of what to do:

1. **Task 2 — verifying→deploying_to_test.** Insert after the combining→verifying block (Task 1). Queries features in 'verifying' status, checks if their latest verify job is complete. For active verification, only proceeds if result starts with "PASSED". For passive verification, always proceeds. Calls initiateTestDeploy(). Does NOT call notifyCPO — failed jobs are handled by the central catch-up (Task 0). See plan for exact code.

2. **Task 3 — deploying_to_test stuck recovery.** Insert after Task 2's block. Queries features stuck in 'deploying_to_test' for over 5 minutes (uses updated_at timestamp). Counts deploy attempts in the last hour. If >= 3 attempts, marks feature as failed. Otherwise rolls back to 'verifying' for retry. Notifies CPO on rollback (max 3 times). See plan for exact code.

3. **Task 4 — deploying_to_prod→complete.** Insert after Task 3's block. Queries features in 'deploying_to_prod' status, checks if their latest deploy job is complete AND has context.target === "prod". Calls handleProdDeployComplete(). See plan for exact code.

4. Update the JSDoc comment above processFeatureLifecycle to list ALL transitions (0-6).

5. Commit each task separately:
   - Task 2: "fix: add verifying→deploying_to_test catch-up poller"
   - Task 3: "fix: add deploying_to_test stuck recovery with retry cap"
   - Task 4: "fix: add deploying_to_prod→complete catch-up poller"

IMPORTANT RULES:
- Read the existing code before editing. Find insertion points by looking for the comment markers from Tasks 0 and 1.
- All job queries MUST use `.order("created_at", { ascending: false }).limit(1)` to get the latest job only
- Task 3 needs `company_id` from the features query (for notifyCPO)
- Task 3's retry count uses deploy job count in the last hour, NOT a counter column
- Do NOT call notifyCPO in Task 2 — it runs every 60s and notifyCPO is non-idempotent
- Do NOT modify any existing code — only INSERT new blocks
- Do NOT touch any other files
```

### After Session B: Deploy

```bash
supabase functions deploy orchestrator
```
