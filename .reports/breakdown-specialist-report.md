status: pass
summary: Broke "Chat Typing Indicator" feature into 4 jobs covering shared protocol, agent emit, webui component, and desktop integration
jobs_created: 4
dependency_depth: 3

## Jobs

| # | ID | Title | Complexity | Role | Depends On |
|---|-----|-------|------------|------|------------|
| 0 | d539c7ff-7436-459d-99f5-5f83dde4dc77 | Typing Indicator Protocol — Shared Types & Channel Contract | simple | junior-engineer | — |
| 1 | b65c6d05-acf7-4e0f-9e71-8360720b2ce8 | Agent — Emit Typing Events When Composing Chat Replies | medium | senior-engineer | temp:0 |
| 2 | dae72edc-5830-4083-ae8b-0cadf9d37d3c | Web UI — Typing Indicator Component and Realtime Subscription | medium | senior-engineer | temp:0, temp:1 |
| 3 | 1436133d-b5d4-4147-b058-f73065e68521 | Desktop App — Typing Indicator Integration | simple | junior-engineer | temp:0, temp:1 |

## Dependency Graph

```
[0] Typing Indicator Protocol (simple)
  └── [1] Agent — Emit Typing Events (medium)
        ├── [2] Web UI — Typing Indicator (medium)
        └── [3] Desktop App — Typing Indicator (simple)
```

Max dependency chain: 3 (0 → 1 → 2 or 0 → 1 → 3)

## Architecture Notes

- The codebase uses Supabase Realtime with two modes: postgres_changes (used by webui dashboard) and broadcast channels (used for agent coordination). Typing indicator will use the broadcast channel pattern on `typing:{company_id}:{session_id}`.
- No typing indicator or presence system exists today. This is a net-new feature.
- The existing "Agent is thinking" banner (for tool-driven work) is explicitly out of scope — it must remain unchanged.
- Jobs 2 and 3 (webui + desktop) can be executed in parallel once Jobs 0 and 1 are complete.
