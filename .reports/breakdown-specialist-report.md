status: pass
summary: Broke “Orchestrator: idea job dispatch and routing” into 5 queued executable jobs with a shared safety foundation and integration tail job.
jobs_created: 5
dependency_depth: 3
failure_reason: 

jobs:
- 5d6fad5b-1ba2-4a07-b477-d09ecf8de5c1 | Add idea orchestration guardrails and limits | complexity: medium | depends_on: []
- 58eb2e3d-91eb-40b3-97c6-cb19449dafbd | Dispatch new ideas to idea-triage jobs | complexity: complex | depends_on: [5d6fad5b-1ba2-4a07-b477-d09ecf8de5c1]
- 900b47ae-dda6-4249-b54c-b3b793669832 | Route enriched ideas by type | complexity: complex | depends_on: [5d6fad5b-1ba2-4a07-b477-d09ecf8de5c1]
- e60293ad-e999-4bb9-871a-2558ade50787 | Advance ideas from completed stage jobs | complexity: medium | depends_on: [5d6fad5b-1ba2-4a07-b477-d09ecf8de5c1]
- 8b8a71bd-b271-4291-860e-b54a05bd246c | Integrate idea loops into orchestrator cycle and verify no feature-loop regression | complexity: complex | depends_on: [58eb2e3d-91eb-40b3-97c6-cb19449dafbd, 900b47ae-dda6-4249-b54c-b3b793669832, e60293ad-e999-4bb9-871a-2558ade50787]

dependency_graph:
- root: 5d6fad5b-1ba2-4a07-b477-d09ecf8de5c1
- level_2: 58eb2e3d-91eb-40b3-97c6-cb19449dafbd, 900b47ae-dda6-4249-b54c-b3b793669832, e60293ad-e999-4bb9-871a-2558ade50787
- level_3: 8b8a71bd-b271-4291-860e-b54a05bd246c

notes:
- Jobs were created via `zazig batch-create-jobs` against company `00000000-0000-0000-0000-000000000001` and feature `31f97497-73f1-44bf-80d0-ad6bdd2f7e4d`.
- All jobs include Gherkin acceptance criteria with criterion IDs and were created directly in queued workflow via the batch endpoint.
