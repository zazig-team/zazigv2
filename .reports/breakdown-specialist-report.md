status: pass
summary: Broke feature ec75e316 into 3 jobs covering CLI status output, desktop sidebar, and poller auto-attach
jobs_created: 3
dependency_depth: 3

## Jobs

1. **CLI: add expert_sessions key to status --json output** (6efd4a07-9d17-4031-8858-bfa01e229dc1)
   - Complexity: medium
   - depends_on: []
   - File: packages/cli/src/commands/status.ts

2. **Desktop sidebar: Expert Sessions section in PipelineColumn** (6e5faa5b-9c04-45c2-b23b-fdba0091ebe5)
   - Complexity: medium
   - depends_on: [6efd4a07-9d17-4031-8858-bfa01e229dc1]
   - File: packages/desktop/src/renderer/components/PipelineColumn.tsx

3. **Desktop poller: auto-attach terminal on new expert session detection** (b454f08c-e1a1-43f8-a184-231f156b8563)
   - Complexity: complex
   - depends_on: [6e5faa5b-9c04-45c2-b23b-fdba0091ebe5]
   - Files: packages/desktop/src/main/poller.ts, packages/desktop/src/main/index.ts

## Dependency Graph

```
Job 1 (CLI status) → Job 2 (sidebar UI) → Job 3 (poller auto-attach)
```

Max chain length: 3
