STATUS: COMPLETE
CARD: 69985e7b60c9758f87e8d648
FILES: packages/shared/src/messages.ts, packages/shared/src/validators.ts, supabase/functions/_shared/messages.ts, packages/local-agent/src/executor.ts
TESTS: 9 passed
NOTES: Added subAgentPrompt field to StartJob interface with same size constraints as personalityPrompt. assembleContext writes the prompt to ~/.zazigv2/job-{jobId}/subagent-personality.md and injects a forwarding instruction into the primary agent context. Workspace cleaned up on job complete, timeout, and stop. Existing personalityPrompt handling unchanged.

---

# CPO Report — Local Agent: Handle MessageInbound, Create Workspace, Remove SlackChatRouter

## Summary
Updated the local agent (Wave 3) to:
1. Handle `MessageInbound` events by injecting them into the CPO's tmux session with queue + idle detection
2. Create an agent workspace (`~/.zazigv2/cpo-workspace/`) with `.mcp.json` so the CPO can use the zazig-messaging MCP server
3. Remove `SlackChatRouter` (replaced by backend Slack integration via Edge Functions)

## Files Changed
- `packages/local-agent/src/executor.ts` — Added `handleMessageInbound()`, message queue + idle detection, workspace creation in `handleStartCpo()`, removed all `SlackChatRouter` references
- `packages/local-agent/src/index.ts` — Wired `message_inbound` case to `executor.handleMessageInbound()`, updated executor constructor call with supabase URL/anon key
- `packages/local-agent/src/executor.test.ts` — Updated constructor calls to match new signature, added `writeFileSync`/`rmSync` to fs mock
- `packages/local-agent/src/slack-chat.ts` — **Deleted**
- `packages/local-agent/package.json` — Removed `@slack/bolt` dependency

## Implementation Details

### handleMessageInbound (executor.ts)
- Public method that checks if CPO job is running, formats the message as `[Message from {from}, conversation:{conversationId}]\n{text}`, and enqueues it
- Messages are processed sequentially through a queue — each waits for CPO idle before injecting
- Idle detection ported from `SlackChatRouter.isCpoIdle()`: captures tmux pane, scans for prompt markers (`❯`, `>`, `$`, `%`)
- Polls every 5s for up to 5min; drops message if CPO doesn't become idle
- Injection uses `tmux send-keys -l` (literal) + separate `Enter` keystroke, matching the proven pattern from SlackChatRouter
- Newlines normalized to spaces to prevent premature entry

### Agent Workspace (handleStartCpo)
- Creates `~/.zazigv2/cpo-workspace/` with `recursive: true`
- Resolves agent-mcp-server.js path relative to compiled dist/ directory using `import.meta.url`
- Writes `.mcp.json` with zazig-messaging MCP server config including `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `ZAZIG_JOB_ID` env vars
- Passes workspace dir to `spawnPersistentCpoSession()` via new `-c` tmux flag

### SlackChatRouter Removal
- Deleted `slack-chat.ts` entirely
- Removed `cpoRouter` field and all router start/stop/cleanup code from executor
- Kept `cpoJobId` field (needed for message routing)
- Removed `@slack/bolt` from package.json dependencies
- Removed Slack channels fetch from `handleStartCpo()` (no longer needed)

### Constructor Change
- Added `supabaseUrl` and `supabaseAnonKey` params to `JobExecutor` constructor (needed for .mcp.json env vars)
- Updated test file to pass the new params

## Tests
- **134 tests passing** (all local-agent + shared tests)
- 1 pre-existing failure: `supabase/functions/orchestrator/orchestrator.test.ts` — Deno-style imports incompatible with Node vitest (not related to this change)

## Build
- `tsc` build succeeds with no errors

## Token Usage
- Token budget: claude-ok (wrote code directly)
