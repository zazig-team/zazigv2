# Review: Exec Personality System Design
Reviewed: 2026-02-20
Source: `docs/plans/2026-02-20-exec-personality-system-design.md`

## Verdict

Ready to execute with minor revisions. The core architecture is sound — three-layer stack, two-plane enforcement, bounded numeric dimensions, deterministic compilation, and behavioral watchdog are all well-designed and novel. The Codex and Gemini review rounds already caught the critical bugs. The remaining items are implementation details (threshold tuning, seed data strategy, Realtime publication) and sequencing clarifications, not architectural changes. Proceed to cardify after applying the revisions below.

## One-Way Doors

| Decision | Section | Severity | Notes |
|----------|---------|----------|-------|
| Server-side prompt compilation (orchestrator, not local agent) | Architecture | ONE-WAY DOOR | Once deployed, moving compilation to client requires updating every local agent. Current choice is correct. |
| `UNIQUE (company_id, role_id)` on exec_personalities | Data Model | HARD TO REVERSE | One personality per company per role. Prevents "CTO for product" vs "CTO for infra" profiles. Fine for v1, would require migration to relax. |
| Archetype definitions (names, defaults, philosophy) | Archetypes | HARD TO REVERSE | Once orgs select archetypes, changing the options affects their experience. Ship as immutable rows; new versions = new rows, old orgs keep old version until opt-in. |
| 5-bucket compilation thresholds | Prompt Compilation | LOW RISK | Compilation functions are in code, not DB. Changing thresholds changes every org's compiled prompt. Acceptable for now; flag for Phase 3 when stability matters more. |

## Dependency Map

| This plan needs... | Which comes from... | Status |
|-------------------|---------------------|--------|
| Test framework (vitest) | Pipeline Task 1 | Landed (migration 008 deployed) |
| Schema migration infrastructure | Pipeline Task 2 | Landed |
| Protocol types (`StartJob` message) | Pipeline Task 3 | Landed — needs `personalityPrompt` field added |
| Orchestrator dispatch function | Pipeline Tasks 5–6 | In progress — personality hooks into same function |
| Supabase Realtime publication | Migration 003 | Deployed — needs `exec_personalities` added in 009 |
| HMAC signing key | Doppler | GAP — needs `PERSONALITY_HMAC_KEY` secret created |

## Key Trade-offs

- **Numeric coordinates over prose:** Gains determinism, measurability, and safety. Loses nuance and expressiveness. Right trade for v1.
- **Tier 1 structured signals only (no NL auto-evolution):** Gains injection immunity. Loses "magical learning" feel — evolution may be slow. Mitigated by Tier 2 dashboard suggestions.
- **Server-side compilation:** Gains authoritative control, dumb local agents. Loses offline compilation capability (local agent can't generate personality prompts without cached data).
- **Inter-dimensional correlations deferred to Phase 3:** Gains simplicity in Phase 1–2. Loses coherent co-evolution early on. Right call — tune coefficients from real data, not guesses.

## Open Questions Resolved During Review

| Question | Answer |
|----------|--------|
| 5 compilation buckets sufficient? | Yes for v1. Test with real usage, refine later. |
| Add `exec_personalities` to Realtime? | Yes, in migration 009. |
| Archetype seed data: inline or separate migration? | Separate migration (010_personality_archetypes_seed.sql), matching pattern of 005. |
| Root constraints versioning? | Yes — add `root_constraints_version INTEGER DEFAULT 1` to roles. Trivial. |
| Inter-dimensional correlations in Phase 1? | No — defer to Phase 3. Ship without, observe real co-variance, then set coefficients from data. |
| Evolution retry on version conflict? | Re-read latest state, reapply same signals, cap at one retry. If still fails, log and move on. |
| Watchdog window rotation? | Rolling 24h. On each cycle, if `window_start` > 24h ago, reset counter and update `window_start`. |
| Per-user context detection? | DM = 1-on-1, channel = group. Defer thread-level detection. |
| HMAC key for prompt manifests? | Dedicated `PERSONALITY_HMAC_KEY` in Doppler. Don't derive from service role key. |

## Suggested Revisions

1. **Migration 009:** Add `ALTER PUBLICATION supabase_realtime ADD TABLE public.exec_personalities;`
2. **Migration 009:** Add `root_constraints_version INTEGER DEFAULT 1` column to `roles` ALTER statement
3. **Migration 010 (new):** Separate seed migration for 6 archetype definitions (matching 005 pattern)
4. **Design doc:** Note that inter-dimensional correlations are Phase 3 only, not Phase 1
5. **Design doc:** Specify rolling 24h window for watchdog counter reset
6. **Design doc:** Specify evolution retry policy: re-read + reapply, max 1 retry
7. **Design doc:** Specify 1-on-1 detection heuristic (DM = 1-on-1, channel = group)
8. **Design doc:** Specify `PERSONALITY_HMAC_KEY` as dedicated Doppler secret
9. **Pipeline plan:** Add `personalityPrompt?: string` to `StartJob` type in Task 3 scope (or as a follow-up task)
10. **Cardify note:** Personality Phase 1 cards should be blocked-by Pipeline Tasks 1–3

## Phase 1 Implementation Sequence

```
1. Migration 009 (schema: roles extension + 4 new tables + Realtime)
2. Migration 010 (seed: 6 archetypes with dimensions, philosophy, prompt templates)
3. Prompt compilation module (packages/shared/src/personality/)
4. Add personalityPrompt to StartJob message type
5. Orchestrator dispatch hook (compile + inject at dispatch time)
6. Local agent: read personalityPrompt from StartJob, prepend to system prompt
7. CLI: zazig personality <role> --show / --archetype
```

---

*Review conducted 2026-02-20 using the review-plan skill. All decisions confirmed with project owner during interactive walkthrough.*
