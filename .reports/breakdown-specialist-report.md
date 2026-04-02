status: pass
summary: Broke the desktop persistent-agent sidebar feature into 3 executable jobs with a single critical-path chain for safe switching behavior.
jobs_created: 3
dependency_depth: 3
failure_reason: n/a

jobs:
- id: 4acee689-d460-4f08-9adf-f41a266ad05b
  title: App.tsx: Build persistent-agent session mapping and queued switch handler
  complexity: medium
  role: senior-engineer
  depends_on: []
- id: 351499a1-0717-4d44-890f-5bb10b1bec45
  title: PipelineColumn.tsx: Replace hardcoded CPO button with dynamic Agents section
  complexity: medium
  role: senior-engineer
  depends_on:
    - 4acee689-d460-4f08-9adf-f41a266ad05b
- id: 62913dea-9c9c-41d0-be00-b15034a2c057
  title: Desktop tests: Cover persistent-agent rendering, disabled state, and queued switch flow
  complexity: medium
  role: senior-engineer
  depends_on:
    - 4acee689-d460-4f08-9adf-f41a266ad05b
    - 351499a1-0717-4d44-890f-5bb10b1bec45

dependency_graph:
- 4acee689-d460-4f08-9adf-f41a266ad05b -> 351499a1-0717-4d44-890f-5bb10b1bec45
- 4acee689-d460-4f08-9adf-f41a266ad05b -> 62913dea-9c9c-41d0-be00-b15034a2c057
- 351499a1-0717-4d44-890f-5bb10b1bec45 -> 62913dea-9c9c-41d0-be00-b15034a2c057

notes:
- Jobs were created via `zazig batch-create-jobs` using feature `434544fa-bf57-4b11-91d8-ba45b054f9e4`.
- API response returned status `created` for inserted jobs.
