status: pass
summary: Broke CI monitor log extraction feature into 4 jobs — shared utility, executor.ts integration, master-ci-monitor.js integration, and unit tests
jobs_created: 4
dependency_depth: 2

## Jobs

1. **02871bfb** — Implement extractFailureSummary() shared utility
   - Creates `ci-log-extractor.ts` with ANSI stripping, vitest/jest block extraction, npm error extraction, 200-line fallback, 8KB cap
   - complexity: medium | depends_on: []

2. **9b394671** — Apply extractFailureSummary() in executor.ts
   - Updates `fetchCIFailureLogs()` return value and spec assembly block with new template
   - complexity: medium | depends_on: [02871bfb]

3. **01b49f63** — Apply extractFailureSummary() in master-ci-monitor.js
   - Updates `fetchFailureDetails()` and spec assembly to use same extraction logic
   - complexity: simple | depends_on: [02871bfb]

4. **ac2ce23d** — Unit tests for extractFailureSummary()
   - Covers vitest output, jest output, build errors, empty log, oversized truncation, ANSI stripping
   - complexity: medium | depends_on: [02871bfb]

## Dependency Graph

```
02871bfb (shared utility)
├── 9b394671 (executor.ts)
├── 01b49f63 (master-ci-monitor.js)
└── ac2ce23d (unit tests)
```

Max chain depth: 2
