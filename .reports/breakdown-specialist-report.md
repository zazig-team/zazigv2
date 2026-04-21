status: pass
summary: Broke platform chat system feature into 4 jobs covering RLS, CRUD endpoint, ask_user tool, and orchestrator resume trigger
jobs_created: 4
dependency_depth: 3

## Jobs

1. **RLS policies for idea_messages table** (simple) — `c2e90904-b9f3-4447-a1ee-4094530569b2`
   - Migration 251: enable RLS and add user-facing read/write policies
   - No dependencies

2. **idea-messages CRUD edge function** (medium) — `bc250e20-648c-4847-983b-990eab258ac8`
   - POST /idea-messages and GET /idea-messages?idea_id=X
   - Depends on: temp:0 (RLS policies)

3. **ask_user MCP tool for job agents** (complex) — `d9dbf19d-008e-4398-8dc5-dcf4d1b1ecb1`
   - Edge function with Realtime subscription + polling fallback + 10-min timeout
   - Sets idea status to awaiting_response on timeout
   - Depends on: temp:1 (CRUD endpoint)

4. **Orchestrator resume trigger for awaiting_response ideas** (medium) — `ee84a4f9-c2e9-4c79-af34-f04f84f024c2`
   - Detects user replies in orchestrator tick, creates resume job with conversation history
   - Depends on: temp:1 (CRUD endpoint)

## Dependency Graph

```
RLS (c2e90904) → CRUD (bc250e20) → ask_user (d9dbf19d)
                               ↘ orchestrator resume (ee84a4f9)
```

Max chain depth: 3 (RLS → CRUD → ask_user or orchestrator resume)
