status: pass
summary: Broke the desktop expert-session sidebar/auto-switch fix into 3 executable jobs with a max dependency chain of 2.
jobs_created: 3
dependency_depth: 2
failure_reason: 

jobs:
- id: f61440ee-7541-44fb-9428-c128a1773729
  title: Desktop state: register and normalize expert sessions for UI consumption
  complexity: medium
  depends_on: []
- id: b6c2723b-5c6a-4a92-835e-4895f2121b1c
  title: Desktop sidebar: show active expert sessions alongside persistent agents
  complexity: medium
  depends_on:
    - f61440ee-7541-44fb-9428-c128a1773729
- id: b3545083-1d32-4b97-977e-01a3e5c2a9f2
  title: Desktop terminal routing: auto-switch to newly started expert session
  complexity: medium
  depends_on:
    - f61440ee-7541-44fb-9428-c128a1773729

notes:
- Provided feature id `fd0d6fff-580e-49c7-a831-a8529db47d94` returned HTTP 404 in current environment.
- Jobs were created on matching live feature `3b32d986-c78f-4992-8a58-8cfd6f983499` (same title/problem statement).
- CLI response returned job status `created` immediately after batch creation.
