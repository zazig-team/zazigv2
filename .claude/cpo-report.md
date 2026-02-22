# CPO Report — Add MessageInbound + MessageOutbound to shared package

## Summary
Added two new message types to the shared wire protocol for bidirectional agent messaging. `MessageInbound` (orchestrator -> agent) delivers external platform messages to agents. `MessageOutbound` (agent -> orchestrator) lets agents reply via an opaque `conversationId` without knowledge of the underlying platform (Slack, Discord, etc.).

## Files Changed
- `packages/shared/src/messages.ts` — Added `MessageInbound` interface, `MessageOutbound` interface, updated `OrchestratorMessage` and `AgentMessage` union types
- `packages/shared/src/validators.ts` — Added `isMessageInbound()` and `isMessageOutbound()` validators, updated `isOrchestratorMessage()` and `isAgentMessage()` switch cases
- `packages/shared/src/index.ts` — Exported new types and validators
- `packages/shared/src/messages.test.ts` — Added tests for both validators (valid messages, missing/empty fields, wrong protocolVersion) and union validator acceptance tests

## Tests
- 92 tests pass (vitest), including 18 new tests for MessageInbound/MessageOutbound
- `tsc --noEmit` clean
- `npm run build` succeeds

## Acceptance Criteria
- [x] `MessageInbound` interface added with type, protocolVersion, conversationId, from, text
- [x] `MessageOutbound` interface added with type, protocolVersion, jobId, machineId, conversationId, text
- [x] `MessageInbound` added to `OrchestratorMessage` union
- [x] `MessageOutbound` added to `AgentMessage` union
- [x] `isMessageInbound(msg)` validator added
- [x] `isMessageOutbound(msg)` validator added
- [x] `isOrchestratorMessage()` handles `"message_inbound"` case
- [x] `isAgentMessage()` handles `"message_outbound"` case
- [x] Existing tests still pass
- [x] Build succeeds

## Token Usage
- Routing: claude-ok
- All code written directly by Claude (no codex delegation)
