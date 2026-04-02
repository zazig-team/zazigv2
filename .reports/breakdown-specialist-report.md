status: pass
summary: Broke feature 5b40e4e1 into 4 sequential jobs covering IPC channel setup, poller routing, App.tsx transition queue wiring, and PipelineColumn highlight/callback
jobs_created: 4
dependency_depth: 4

## Jobs

1. **Add expert-session:auto-switch IPC channel and preload bridge** (simple)
   - id: 00e44a66-c892-4199-87ea-859593d53428
   - depends_on: []

2. **Route expert auto-switch through IPC in poller.ts and reset on company switch** (medium)
   - id: 55ea79b9-5f12-47e5-8775-9e0feb5b7320
   - depends_on: [00e44a66-c892-4199-87ea-859593d53428]

3. **Handle expert auto-switch IPC in App.tsx and add onExpertClick prop** (medium)
   - id: 5ffd56d8-c876-4201-b1fb-949caa6f745e
   - depends_on: [55ea79b9-5f12-47e5-8775-9e0feb5b7320]

4. **Replace inline terminalAttach and add active highlight for expert cards in PipelineColumn.tsx** (simple)
   - id: 855665e1-a23c-4f12-9dc6-63028c010edd
   - depends_on: [5ffd56d8-c876-4201-b1fb-949caa6f745e]

## Dependency Graph

```
Job 1 (IPC channel) → Job 2 (poller routing) → Job 3 (App.tsx handler) → Job 4 (PipelineColumn)
```

## Notes

- Jobs are strictly sequential because each builds on the IPC contract established by the prior job
- Company switch reset (resetExpertSessionTracking on SELECT_COMPANY) is included in Job 2 as it is a main process concern alongside the poller change
- Job 4 covers both the callback prop replacement and the active highlight — they are co-located in PipelineColumn.tsx and sized for a single session
