status: pass
summary: Broke CI monitor deduplication feature into 3 jobs covering DB migration, Gate 1 dedup, and Gate 2 resolution check
jobs_created: 3
dependency_depth: 3

## Jobs

1. b409f54e-2a87-4f9c-a024-02aa5ad1cdad — DB migration: add ci_failure_signature column to features (simple, no deps)
2. ebf2c1c3-0217-4e28-9012-51f96e8f75d8 — Gate 1: dedup CI fix features by (commit_sha, step_name) (medium, depends on job 1)
3. 01505274-151e-407c-94e8-46097e0db52b — Gate 2: skip feature creation if a newer commit already fixed the step (medium, depends on job 2)

## Dependency graph

job 1 (migration) → job 2 (Gate 1 dedup) → job 3 (Gate 2 resolution check)

## Notes

- Jobs 2 and 3 both modify master-ci-monitor.js; made them sequential to avoid merge conflicts.
- Gate 2 is wired before Gate 1 in execution order but depends on Gate 1 being merged first so the file is stable.
- The production binding for queryLatestCiRunForStep is included in Job 3's spec.
