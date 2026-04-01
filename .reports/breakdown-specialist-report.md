status: pass
summary: Broke "Desktop: sidebar should list all permanent agents with switching" into 2 jobs
jobs_created: 2
dependency_depth: 2

## Jobs

### Job 1 — Extend pipeline data to surface all persistent agent sessions
- ID: 5c64db83-d1dc-4935-bf84-135fe6dd5024
- Complexity: medium
- Role: senior-engineer
- Depends on: none (root)
- Files: packages/desktop/src/renderer/components/PipelineColumn.tsx
- Summary: Add PersistentAgent type, getPermanentAgents() parser, update PipelineViewData and PLACEHOLDER_PIPELINE to expose all persistent agent sessions with tmux session matching.

### Job 2 — Add permanent agents section to sidebar with terminal switching
- ID: b7435c17-b183-4458-ba2e-1aad17785bb5
- Complexity: medium
- Role: senior-engineer
- Depends on: Job 1 (5c64db83)
- Files: packages/desktop/src/renderer/components/PipelineColumn.tsx, packages/desktop/src/renderer/App.tsx
- Summary: Render a Permanent Agents section in the sidebar listing each agent with status dot and click-to-switch behaviour; wire onAgentClick in App.tsx using the serialized transition queue.

## Dependency graph

Job 1 → Job 2
