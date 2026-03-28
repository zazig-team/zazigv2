status: pass

## Test Files Created

- `tests/features/serialise-merge-jobs-per-project.test.ts` — 27 test cases

## Summary

Written 27 test cases across 10 describe blocks covering all acceptance criteria
and failure cases for the "Serialise feature-to-master merge jobs per project" feature.

### Test Groups

1. **Structural** — dispatchQueuedJobs contains merge serialisation gate (8 tests)
2. **AC1** — Only one merge job per project enriched to queued (3 tests)
3. **AC2** — Gate unblocks when in-flight merge job is no longer active (2 tests)
4. **AC3** — Failed merge unblocks queue (1 test)
5. **AC4** — Gate is per project_id — different projects unaffected (2 tests)
6. **AC5** — FIFO ordering preserved (2 tests)
7. **AC6** — Gate is in orchestrator only — daemon/executor/merge agent unchanged (4 tests)
8. **FC1** — No false positive blocks (2 tests)
9. **FC2** — Gate only applies to merge job type — other types unaffected (4 tests)
10. **FC3** — Overlapping orchestrator runs do not double-queue (2 tests)
11. **Logging** — Gate produces expected log message (4 tests)

### Notes

- All tests written to FAIL against current codebase (no merge gate exists in dispatchQueuedJobs yet)
- `tests/vitest.config.ts` uses `features/**/*.test.ts` — no `package.json` changes needed
