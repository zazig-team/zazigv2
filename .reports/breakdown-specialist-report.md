status: pass
summary: Broke feature "Orchestrator: suspend/resume via Realtime" into 3 sequential jobs covering migration, last_job_type tracking, and Realtime subscription with polling fallback
jobs_created: 3
dependency_depth: 2

## Jobs

1. **Migration: add last_job_type column to ideas** (`63920d2f-d3d1-4159-ad95-1f8808b0feb6`)
   - complexity: simple
   - depends_on: []
   - Adds nullable `last_job_type TEXT` column to ideas table via idempotent migration

2. **Orchestrator: populate and consume last_job_type for resume jobs** (`c8ec1f69-1eb0-45c1-9adb-2935079842fc`)
   - complexity: medium
   - depends_on: [63920d2f]
   - Write path: set last_job_type when dispatching idea-pipeline jobs
   - Read path: use last_job_type in resumeAwaitingResponseIdeas instead of hardcoded "code"
   - Adds on_hold=false filter to polling query

3. **Orchestrator: Realtime subscription on idea_messages for immediate resume** (`0645c323-d3bb-4bfa-ba74-19f71cb582b1`)
   - complexity: complex
   - depends_on: [c8ec1f69]
   - Extracts resumeSingleIdea helper from existing polling loop
   - Adds listenForIdeaMessageReplies() with postgres_changes subscription (sender=eq.user filter)
   - Tracks connection state, logs when falling back to polling
   - Polling fallback always runs after Realtime window for catch-up

## Dependency graph

```
63920d2f (migration) → c8ec1f69 (last_job_type tracking) → 0645c323 (Realtime subscription)
```

## Notes

- The existing `resumeAwaitingResponseIdeas` polling function already exists in the orchestrator; job 2 fixes its job_type and on_hold handling, job 3 refactors it to support the Realtime fast path
- Realtime timeout set to 4000ms within each 10s orchestrator cycle, leaving headroom for polling fallback
- Atomic status transition (optimistic lock on updated_at) already prevents duplicate resume jobs — no additional dedup needed
