# CPO Report: Shared Message Protocol

**Card:** 69963ee0822673f5b4634803
**Branch:** zazig/shared-message-protocol
**Completed:** 2026-02-19

## Summary

Defined the TypeScript shared message protocol for orchestrator ↔ local agent communication in `packages/shared/src/messages.ts`. All messages are discriminated unions on the `type` field, matching the shapes specified in the acceptance criteria.

The scaffold agent had already created `packages/shared/package.json`, `packages/shared/tsconfig.json`, and a skeleton `packages/shared/src/index.ts`. The `index.ts` was updated to export from the new `messages.ts`.

One TypeScript naming collision was handled: the acceptance criteria names both the job status enum (`JobStatus`) and the message interface (`JobStatus`) identically. Since TypeScript cannot have both a `type` alias and an `interface` with the same name in the same scope, the enum type was named `JobStatusValue` and the message interface was kept as `JobStatus`. This is documented in a code comment in `messages.ts`.

TypeScript type check (`tsc --noEmit`) passed with zero errors.

## Files Created / Modified

**Created:**
- `packages/shared/src/messages.ts` — Full message protocol definition (enums, interfaces, union types)

**Modified:**
- `packages/shared/src/index.ts` — Updated to re-export everything from `messages.ts`, uses `JobStatusValue` instead of the now-conflicted `JobStatus` in the `Job` record interface

## What Is Defined

### Enums / Value Types (in messages.ts)
- `SlotType`: `"claude_code" | "codex"`
- `Complexity`: `"simple" | "medium" | "complex"`
- `CardType`: `"code" | "infra" | "design" | "research" | "docs"`
- `JobStatusValue`: `"queued" | "dispatched" | "executing" | "reviewing" | "complete" | "failed"` (named `JobStatusValue` to avoid conflict — see note above)

### Orchestrator → Local Agent
- `StartJob` — dispatch a card for execution (jobId, cardId, cardType, complexity, slotType, model, context)
- `StopJob` — terminate a running job (jobId, reason)
- `HealthCheck` — liveness probe (no fields beyond type)
- `OrchestratorMessage` — discriminated union of the above three

### Local Agent → Orchestrator
- `Heartbeat` — periodic liveness + slot availability report (machineId, slotsAvailable, cpoAlive)
- `JobStatus` — job progress update (jobId, status: JobStatusValue, output?)
- `JobComplete` — job finished successfully (jobId, result, pr?, report?)
- `JobFailed` — job failed unrecoverably (jobId, error)
- `AgentMessage` — discriminated union of the above four

## Issues Encountered

- **Naming collision:** `JobStatus` as both enum type and message interface name. Resolved by naming the enum `JobStatusValue` with a comment explaining the decision. The message interface is `JobStatus` as specified.
- No other issues. TypeScript compiled cleanly.
