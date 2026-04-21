status: pass
summary: Implemented ask_user across local MCP tooling and a new Supabase edge function with Realtime wait, polling fallback, and timeout-to-awaiting_response behavior.
files_changed:
  - packages/local-agent/src/agent-mcp-server.ts
  - packages/local-agent/src/workspace.ts
  - supabase/functions/ask-user/index.ts
  - supabase/functions/ask-user/deno.json
  - supabase/functions/_shared/prompt-layers.ts
  - packages/shared/src/prompt/universal-layer.ts
failure_reason:
