status: pass
summary: Broke SPECCING progress indicator feature into 2 sequential jobs covering badge/state setup then polling/timeout/navigation
jobs_created: 2
dependency_depth: 2

## Jobs

### Job 1 — Add SPECCING badge with spinner to Send to Spec flow
ID: 018f9c87-a769-4410-aed5-d10f56ce2bf2
Complexity: medium
Depends on: none

Adds `BatchSpecState` type and `batchSpecStates` Map mirroring the triage pattern. Sets idea to "speccing" on click, renders SPECCING badge with `il-chip-spinner` immediately. Removes static success text.

Acceptance criteria: AC-1-1 through AC-1-4

### Job 2 — Add polling, completion transition, and timeout/error handling for SPECCING state
ID: 5e4a8aba-68f6-4d79-acec-3b7cf4fbb143
Complexity: medium
Depends on: 018f9c87-a769-4410-aed5-d10f56ce2bf2 (Job 1)

Polls Supabase every 5s while ideas are speccing. Transitions badge to SPECCED on completion. Shows error+retry after 5min timeout. Multiple simultaneous cards handled independently. Restores speccing state from `developing` status on navigation.

Acceptance criteria: AC-2-1 through AC-2-5

## Dependency Graph

Job 1 → Job 2
