status: pass
summary: Broke "Company project setup" into 3 sequential jobs covering GitHub repo creation, DB record + company linkage, and triager lookup verification
jobs_created: 3
dependency_depth: 3

## Jobs

| # | ID | Title | Complexity | Depends On |
|---|-----|-------|------------|------------|
| 0 | 9c4bc544-c67a-48cc-8a6b-3e4ad79c8b89 | Create GitHub company project repo | simple | — |
| 1 | 4a47e366-e150-434d-b9ab-ca968c095da0 | Create project DB record and set company_project_id | simple | job 0 |
| 2 | c9eb1c42-a1b3-4c9c-85a9-e83bd400df94 | Verify and document company project lookup pattern | simple | job 1 |

## Dependency Graph

```
[0] Create GitHub company project repo
       ↓
[1] Create project DB record and set company_project_id
       ↓
[2] Verify and document company project lookup pattern
```

## Notes

- All jobs are `simple` complexity — each is a contained, single-session task with no ambiguity.
- The chain is strictly sequential: job 1 needs the repo URL from job 0; job 2 needs the DB records from job 1.
- Job 2 covers both verification and the utility helper so downstream jobs can resolve company project repos without hardcoding.
