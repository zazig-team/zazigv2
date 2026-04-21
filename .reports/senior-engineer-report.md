status: pass
summary: Implemented ask_user MCP tool and edge function with Realtime wait/polling/timeout behavior, plus orchestrator resume detection for awaiting_response ideas transitioning back to executing with guarded resume code jobs.
files_changed:
  - packages/local-agent/src/agent-mcp-server.ts
  - packages/local-agent/src/workspace.ts
  - supabase/functions/ask-user/index.ts
  - supabase/functions/ask-user/deno.json
  - supabase/functions/_shared/prompt-layers.ts
  - packages/shared/src/prompt/universal-layer.ts
  - supabase/functions/orchestrator/index.ts
  - supabase/functions/_shared/pipeline-utils.ts
failure_reason: ""
