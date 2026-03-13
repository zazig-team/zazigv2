# Review: Auto-Spec Orchestrator Proposal (v6)
Reviewed: 2026-03-12
Source: `docs/plans/2026-03-12-auto-spec-orchestrator-proposal.md`

## Verdict

Ready to execute. v6 resolves the contract mismatches that v5 left implicit: the spec-writer no longer self-promotes, the reviewer verdict has a defined storage location (`expert_session_items.route`), specs dual-write to repo + DB for UI compatibility, and `spec_batch_size` is locked to 1 as an architectural invariant. All original Codex review points (8), plan review gaps (5), Codex v4 findings (4), and Codex v5 findings (4) are addressed. The one prerequisite (expert session `failed` status gap, step 8) must be fixed before shipping.

## One-Way Doors

| Decision | Section | Severity | Notes |
|----------|---------|----------|-------|
| State machine: develop stays at `triaged` | Key design decision | HARD TO REVERSE | Once auto-spec is running, changing the claim state cascades across triage analyst, orchestrator, stale recovery, WebUI. Correct call — mirrors triage exactly. |
| Specs in repo (`docs/specs/`) | Review loop | HARD TO REVERSE | Once agents are writing spec files, changing the location means migrating existing files. Right choice — version-controlled, auditable. |
| Session chain (Approach 3) over explicit statuses (Approach 2) | Approaches | Reversible | Can upgrade to Approach 2 later if visibility demands it. Clean upgrade path documented. |
| `project_id` required for auto-spec | Project selection | Reversible | Can relax later to allow fallback inference. |
| `spec_batch_size = 1` invariant | Session chain | HARD TO REVERSE | Batching requires per-idea chain identifier. Correct for v1 — recovery is cleaner. |
| Orchestrator owns status transitions | Spec-writer contract | HARD TO REVERSE | Once shipped, all spec-writers (auto and manual) rely on orchestrator for status. Correct — enables the review loop. |
| Cooldown 120s | Orchestrator | Reversible | Tunable constant. |

## Dependency Map

| This plan needs... | Which comes from... | Status |
|-------------------|---------------------|--------|
| `spec-writer` expert role | Migration 147 | Shipped |
| `autoTriageNewIdeas()` pattern | PR #260 | Shipped |
| `start-expert-session` edge function | Existing | Shipped |
| Headless expert session infrastructure | Migrations 120, 144 | Shipped |
| Triage-analyst prompt (migration 146) | Existing | Shipped — needs update (status + project_id) |
| Triage-analyst `query_projects` MCP tool | Migration 146 | Shipped — already in `mcp_tools.allowed` |
| `auto_triage` company column | Migration 135 | Shipped |
| `batch_id` on expert sessions | Migration 144 | Shipped |
| Expert session `failed` status fix | Step 8 | NOT STARTED — prerequisite |
| Spec-reviewer expert role | Step 2 | NOT STARTED — new |
| Settings page | Step 11 | NOT STARTED — new |
| Orchestrator test harness (Deno) | Existing | Type-check broken — separate follow-up |

## Key Trade-offs

- **Chose iterative review over single-pass**: gains spec quality proportional to complexity, catches gaps before build; costs more sessions/tokens per complex idea. Justified by "slow down to speed up" — failed features are far more expensive than extra review passes.
- **Chose "keep at triaged" over "add speccing status"**: gains consistency with triage pattern; loses status-level distinction between develop-routed and other triaged ideas. Mitigated by `triage_route` field and UI section split.
- **Chose session chain over explicit statuses**: gains simplicity (no new statuses); loses direct visibility of review phase in status field. Mitigated by batch_id grouping and UI session chain display.
- **Chose "require project_id" over "infer project"**: gains safety; loses auto-eligibility for unassigned ideas. Mitigated by triage analyst prompt update.
- **Chose `spec_batch_size = 1`**: gains cleaner recovery, smaller blast radius; loses throughput. Tunable.
- **Chose Settings page over Ideas page toggles**: gains scalable UI for growing settings; costs building a new page. Justified by accumulating company-level settings.

## Open Questions

All previous open questions resolved. No new blockers identified.

## Revisions Applied

### v2-v4 (Codex review, plan review, Codex verification)
1-11. See Appendix C in the proposal for full version history.

### v5 (brainstorming session)
12. **Iterative review loop** — spec-writer drafts, spec-reviewer challenges, orchestrator manages revision rounds. Complexity-proportional: simple skips, medium gets 1 pass, complex iterates until clean.
13. **Spec-reviewer expert role** — new role with gap analysis, assumption checking, codebase verification. Same model as base, cross-model as upgrade path.
14. **Specs in the repo** — `docs/specs/idea-{id}-spec.md`, not DB columns or workspace dirs. Non-negotiable.
15. **Approach comparison** — three approaches documented (Maturity Ladder, Pipeline Stage, Session Chain). Chose Session Chain for minimal invasiveness with clean upgrade path.
16. **Settings page** — company automation settings move to `/settings` route. Removes hidden toggle from Ideas page.
17. **`spec_url` column** — ideas table gets a pointer to the spec file path.
18. **Chain-aware stale recovery** — re-dispatches next session if orchestrator crashed mid-chain, instead of blindly reverting.
19. **Hard cap at 5 rounds** — escalates to `workshop` to prevent infinite loops.
20. **CPO workspace correction** — napkin updated: agents must write to repo, not workspace directories.

### v6 (Codex v5 verification)
21. **Spec-writer stops self-promoting** — prompt updated to leave ideas at `developing`. Orchestrator owns all status transitions. Manual dispatch helper also updated.
22. **Reviewer verdict contract** — uses `expert_session_items.route` field (`approve`/`revise`/`workshop`/`hardening`). No new columns needed.
23. **Dual-write for v1** — spec-writer writes full spec to repo AND populates DB summary fields (`spec`, `acceptance_tests`, `human_checklist`). UI reads DB for now, adds "View full spec" link. `update-idea` and MCP tool updated to accept `spec_url`.
24. **`spec_batch_size` locked to 1** — removed from company settings. Session chain model requires 1:1 idea-to-batch. Architectural invariant, not tunable. Batching would require per-idea chain identifier.
