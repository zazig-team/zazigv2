# CPO Report — Autonomous Triage & Proposal System

## Summary
Built the full Autonomous Triage & Proposal system (Phases 0, 2, 3, 4, 5, 6) using a 3-agent team. The system replaces pipeline-based triage with headless expert sessions that run autonomously, consume no engineering slots, and support batch processing. Two new expert roles (triage-analyst, spec-writer) evaluate and spec ideas before they enter the pipeline. The WebUI was rewired to dispatch headless experts, added a Developing tab, and the Pipeline Proposal column now shows ideas being specced.

## Agent Team Summary
- **Team composition**: 3 agents (data-agent, service-agent, ui-agent) — all general-purpose
- **Contract chain**: data-agent (upstream: migrations + types) → service-agent + ui-agent (parallel downstream)
- **Files per teammate**:
  - data-agent: 6 migration files (144-149), messages.ts, expert-session-manager.ts
  - service-agent: promote-idea/index.ts, orchestrator/index.ts
  - ui-agent: queries.ts, Ideas.tsx, usePipelineSnapshot.ts, Pipeline.tsx
- **Agent Teams value assessment**: Strong parallel value — service and UI agents ran concurrently after data contracts delivered. No integration issues due to clean contract boundaries. Total wall time ~5 min vs estimated ~15 min sequential.

## Changes

### New Files (6 migrations)
- `supabase/migrations/144_headless_expert_sessions.sql` — headless/batch_id/items columns on expert_sessions + expert_session_items table
- `supabase/migrations/145_triage_and_proposal_statuses.sql` — developing/specced statuses + spec/triage_route/acceptance_tests/human_checklist/complexity columns on ideas
- `supabase/migrations/146_triage_analyst_expert_role.sql` — triage-analyst expert role
- `supabase/migrations/147_spec_writer_expert_role.sql` — spec-writer expert role
- `supabase/migrations/148_company_triage_settings.sql` — triage_batch_size/triage_max_concurrent/triage_delay_minutes on companies
- `supabase/migrations/149_remove_triage_from_pipeline.sql` — triage-analyst removed from request_standalone_work

### Modified Files (8)
- `packages/shared/src/messages.ts` — added headless?, batch_id?, auto_exit? to StartExpertMessage
- `packages/local-agent/src/expert-session-manager.ts` — removed type cast, uses msg.headless directly
- `supabase/functions/promote-idea/index.ts` — accepts 'specced' status, copies spec/acceptance_tests/human_checklist to feature
- `supabase/functions/orchestrator/index.ts` — autoTriageNewIdeas rewritten for headless experts, recoverStaleTriagingIdeas checks expert sessions, triage-analyst removed from NO_CODE_CONTEXT_ROLES
- `packages/webui/src/lib/queries.ts` — requestHeadlessTriage() + requestHeadlessSpec() functions
- `packages/webui/src/pages/Ideas.tsx` — triage button rewired, Triage All button, Developing tab, Write Spec button, promote from specced
- `packages/webui/src/hooks/usePipelineSnapshot.ts` — developing/specced ideas injected into Proposal column
- `packages/webui/src/pages/Pipeline.tsx` — Proposal column renders idea-based cards with status badges

## Testing
- **TypeScript compilation**: All 3 packages compile cleanly (shared, webui, local-agent)
- **Pre-existing errors**: 13 connection.test.ts errors in local-agent (unrelated, known issue)
- **Contract verification**: All downstream agents correctly use schemas/types defined by upstream agent
- **Needs manual verification**:
  - Apply migrations 144-149 to staging/prod via Management API
  - Deploy promote-idea and orchestrator edge functions
  - Test end-to-end: create idea → triage via headless expert → spec → promote to feature
  - Verify Pipeline Proposal column renders correctly with live data

## Decisions Made
- Kept old `requestTriageJob` function in queries.ts for backward compatibility
- Proposal column in Pipeline renders ideas (not features) with distinct status badges
- triage-analyst completely removed from pipeline slot system (both NO_CODE_CONTEXT_ROLES and request_standalone_work)
- recoverStaleTriagingIdeas now checks both pipeline jobs AND headless expert sessions before reverting
