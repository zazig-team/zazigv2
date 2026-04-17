status: failed
failing_checks:
  - name: build-and-test
    conclusion: failure
    url: https://github.com/zazig-team/zazigv2/actions/runs/24541991426/job/71749604589
failure_summary: 1 check(s) failed: build-and-test (failure) — 5 tests timed out in src/executor.test.ts (JobExecutor — slot reconciliation)
failure_type: code
fix_attempts: 0

## Diagnosis

Five tests in `packages/local-agent/src/executor.test.ts` timed out at 5000ms:

1. `skips reconciliation query when only persistent jobs are active` (line 623)
2. `creates persistent workspace repo symlinks from company projects` (line 636)
3. `continues linking other persistent repos when one project fails` (line 685)
4. `writes heartbeat config into the persistent workspace and SessionStart hooks` (line 729)
5. `resets an idle persistent agent by replaying the stored StartJob` (line 770)

**Root cause**: All failing tests call `await executor.handleStartJob(...)` with `cardType: "persistent_agent"` inside a `vi.useFakeTimers()` context. The `handlePersistentJob` implementation (executor.ts ~line 2159) contains:

```typescript
await sleep(2_000);
const sessionAlive = await isTmuxSessionAlive(sessionName);
```

`sleep()` uses `setTimeout`, which is replaced by vitest's fake timer. With fake timers active, `await sleep(2_000)` never resolves unless `vi.advanceTimersByTimeAsync(2000+)` is called. Since the tests await `handleStartJob` directly without concurrently advancing timers, the function blocks indefinitely.

**Fix needed**: Either (a) restructure the tests to advance timers concurrently with `handleStartJob` (e.g. `Promise.all([executor.handleStartJob(...), vi.advanceTimersByTimeAsync(3_000)])`), or (b) make the post-spawn sleep/health-check in `handlePersistentJob` fire-and-forget so `handleStartJob` returns before the sleep.
