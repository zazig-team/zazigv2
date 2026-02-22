# CPO Report — Agent MCP Server

## Summary
Created `agent-mcp-server.ts` — a minimal stdio MCP server that gives agents a `send_message` tool to reply to external platform messages. The MCP server runs as a subprocess configured via `.mcp.json` in the agent workspace directory.

## Discovery
- Read plan doc Section 5 — confirmed tool spec: `send_message(conversation_id, text)`, HTTP POST to Edge Function
- Read `packages/local-agent/package.json` — ESM module, Node >=20, no existing bin entries
- Read `packages/local-agent/tsconfig.json` — target ES2022, NodeNext module resolution, build outputs to `./dist`
- Confirmed `@modelcontextprotocol/sdk` not present in any package.json — installed v1.26.0
- Pre-existing build error: `MessageInbound` added to `OrchestratorMessage` union (Wave 1) but not handled in `index.ts` switch — added placeholder case to unblock build

## Files Changed
- `packages/local-agent/src/agent-mcp-server.ts` — **new file**, MCP server with `send_message` tool
- `packages/local-agent/package.json` — added `@modelcontextprotocol/sdk` dependency, added `bin.zazig-agent-mcp` entry
- `packages/local-agent/src/index.ts` — added `message_inbound` case to exhaustive switch (placeholder for Wave 2 Task 6)

## Acceptance Criteria
- [x] `packages/local-agent/src/agent-mcp-server.ts` created
- [x] File has shebang: `#!/usr/bin/env node`
- [x] Uses `@modelcontextprotocol/sdk` with stdio transport (`StdioServerTransport`)
- [x] Registers `send_message` tool with schema: `conversation_id` (string, required), `text` (string, required)
- [x] Tool implementation: HTTP POST to `${process.env.SUPABASE_URL}/functions/v1/agent-message`
- [x] Body: `{ conversationId: conversation_id, text, jobId: process.env.ZAZIG_JOB_ID ?? "" }`
- [x] Header: `Authorization: Bearer ${process.env.SUPABASE_ANON_KEY}`
- [x] Tool returns success message string on 200, error description on non-200
- [x] `@modelcontextprotocol/sdk` added to `packages/local-agent/package.json` dependencies
- [x] Bin entry added: `"zazig-agent-mcp": "./dist/agent-mcp-server.js"`
- [x] Build succeeds: `npm run build --workspace=packages/local-agent`
- [x] No broken imports or TypeScript errors

## Test Results
- Build: passes cleanly
- Tests: 37 passed, 5 failed (pre-existing failures in `executor.test.ts` — `supabase.from()` undefined mock issue, unrelated to this change)

## Issues Encountered
- Pre-existing exhaustiveness error in `index.ts` — `MessageInbound` was added to the `OrchestratorMessage` union type in Wave 1 but the switch statement in `index.ts` didn't handle it. Added a placeholder `case "message_inbound"` with a TODO for Wave 2 Task 6.

## Token Usage
- Token budget routing: `claude-ok` — wrote code directly
