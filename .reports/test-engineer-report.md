status: pass

## Test Files Created

- `tests/features/startup-preflight-check.test.ts` — 38 test cases

## Summary

Written 38 test cases across 9 describe blocks covering all acceptance criteria
for the "Startup preflight check: validate required CLI tools and versions" feature.

### Test Groups

1. **AC1** — Missing tmux causes exit with code 1 (5 tests)
2. **AC2** — git version below 2.29 causes exit with message (5 tests)
3. **AC3** — All required tools present, startup proceeds normally (5 tests)
4. **AC4** — Optional tools produce warnings but don't block startup (5 tests)
5. **AC5** — Multiple missing tools reported together, collect-all pattern (4 tests)
6. **AC6** — codexInstalled boolean preserved for downstream config (4 tests)
7. **FC1** — Version parsing resilient to unexpected output formats (2 tests)
8. **FC2** — Optional tool failures do not block startup (2 tests)
9. **FC3** — Existing claude/codex check behavior not regressed (6 tests)
10. **Structural** — Preflight block at top of start(), install hints present (2 tests)

### Verification

Tests fail against current codebase (as expected — feature not yet implemented):
- 20 tests failing in the new file
- 857 existing tests still passing (no regression)

The `tests/` workspace delegates to vitest which discovers all `features/**/*.test.ts`
files recursively — no `package.json` changes were needed.
