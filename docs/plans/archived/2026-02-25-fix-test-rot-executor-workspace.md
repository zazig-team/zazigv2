# Fix Test Rot: executor.test.ts + workspace.test.ts

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix all 11 pre-existing test failures in `workspace.test.ts` (5) and `executor.test.ts` (6) caused by production code evolving without test updates.

**Architecture:** Pure test fixes — no production code changes. Update mocks, fixtures, and assertions to match current code. Two independent test files, no shared state between them.

**Tech Stack:** vitest, vi.mock, vi.fn

---

### Task 1: Fix workspace.test.ts — generateAllowedTools assertions (4 tests)

**Files:**
- Modify: `packages/local-agent/src/workspace.test.ts:21-44`

**Root cause:** `generateAllowedTools()` now returns `[...STANDARD_TOOLS, ...mcpTools]` where `STANDARD_TOOLS = ["Read", "Write", "Edit", "Bash", "Glob", "Grep"]`. Tests were written before STANDARD_TOOLS existed and only expect MCP tool names.

**Step 1: Update the 4 failing assertions**

Replace lines 21-44 with:

```typescript
describe("generateAllowedTools", () => {
  it("returns prefixed tool names for cpo role", () => {
    expect(generateAllowedTools("cpo")).toEqual([
      "Read", "Write", "Edit", "Bash", "Glob", "Grep",
      "mcp__zazig-messaging__query_projects",
      "mcp__zazig-messaging__create_feature",
      "mcp__zazig-messaging__update_feature",
      "mcp__zazig-messaging__commission_contractor",
    ]);
  });

  it("returns prefixed tool names for breakdown-specialist", () => {
    expect(generateAllowedTools("breakdown-specialist")).toEqual([
      "Read", "Write", "Edit", "Bash", "Glob", "Grep",
      "mcp__zazig-messaging__query_features",
      "mcp__zazig-messaging__batch_create_jobs",
    ]);
  });

  it("returns standard tools only for job-combiner", () => {
    expect(generateAllowedTools("job-combiner")).toEqual([
      "Read", "Write", "Edit", "Bash", "Glob", "Grep",
    ]);
  });

  it("returns standard tools only for unknown role", () => {
    expect(generateAllowedTools("nonexistent-role")).toEqual([
      "Read", "Write", "Edit", "Bash", "Glob", "Grep",
    ]);
  });
});
```

**Step 2: Run tests to verify the 4 pass**

Run: `cd ~/Documents/GitHub/zazigv2 && npx vitest run packages/local-agent/src/workspace.test.ts 2>&1 | tail -20`

Expected: 4 generateAllowedTools tests PASS, 1 still failing (copies skill files).

**Step 3: Commit**

```bash
git add packages/local-agent/src/workspace.test.ts
git commit -m "test(workspace): update generateAllowedTools assertions for STANDARD_TOOLS"
```

---

### Task 2: Fix workspace.test.ts — skill copy test (1 test)

**Files:**
- Modify: `packages/local-agent/src/workspace.test.ts:7-12`

**Root cause:** `setupJobWorkspace()` now has a gitignore block (step 7) that calls `readFileSync` and `appendFileSync` when `existsSync` returns true for the `.git` marker. The mock sets `existsSync(() => false)` globally, but the skill-copy test overrides it with `mockReturnValue(true)` — making ALL `existsSync` calls return true including the `.git` marker check. This triggers `readFileSync` which is not in the mock.

**Step 1: Add `readFileSync` and `appendFileSync` to the fs mock**

Replace lines 7-12:

```typescript
vi.mock("node:fs", () => ({
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn(),
  existsSync: vi.fn(() => false),
  copyFileSync: vi.fn(),
  readFileSync: vi.fn(() => ""),
  appendFileSync: vi.fn(),
}));
```

**Step 2: Make the skill-copy test mock `existsSync` selectively**

The test at line 122 needs `existsSync` to return `true` for skill files but `false` for the `.git` marker. Replace lines 122-143:

```typescript
  it("copies skill files when skills and repoSkillsDir are provided", () => {
    const existsSyncMock = fsModule.existsSync as unknown as ReturnType<typeof vi.fn>;
    const copyFileSyncMock = fsModule.copyFileSync as unknown as ReturnType<typeof vi.fn>;
    // Return true for skill file checks, false for .git marker
    existsSyncMock.mockImplementation((p: string) =>
      typeof p === "string" && p.endsWith(".md"),
    );

    setupJobWorkspace({
      workspaceDir: "/tmp/test-workspace",
      mcpServerPath: "/path/to/server.js",
      supabaseUrl: "https://test.supabase.co",
      supabaseAnonKey: "test-key",
      jobId: "job-789",
      role: "breakdown-specialist",
      claudeMdContent: "# Test",
      skills: ["jobify"],
      repoSkillsDir: "/repo/projects/skills",
    });

    expect(copyFileSyncMock).toHaveBeenCalledWith(
      "/repo/projects/skills/jobify.md",
      "/tmp/test-workspace/.claude/skills/jobify/SKILL.md",
    );
  });
```

**Step 3: Run all workspace tests**

Run: `cd ~/Documents/GitHub/zazigv2 && npx vitest run packages/local-agent/src/workspace.test.ts 2>&1 | tail -10`

Expected: 9 tests, 0 failures.

**Step 4: Commit**

```bash
git add packages/local-agent/src/workspace.test.ts
git commit -m "test(workspace): add missing fs mocks and fix skill-copy existsSync"
```

---

### Task 3: Fix executor.test.ts — mock supabase and makeStartJob (6 tests)

**Files:**
- Modify: `packages/local-agent/src/executor.test.ts:43-80`

**Root cause:** `handleStartJob` now:
1. Calls `sendJobAck` which calls `this.send()` (already mocked)
2. Calls `this.supabase.from("jobs").update().eq().then()` (assembled_context persist) — the mock `.eq()` returns a Promise so `.then()` works
3. Calls `msg.repoUrl.split("/")` — `makeStartJob()` doesn't include `repoUrl` → crashes with `Cannot read properties of undefined (reading 'split')`
4. Calls `this.repoManager.ensureRepo()` etc. which use `execFileAsync` (mocked)

The fix: add required git fields to `makeStartJob`, and mock `RepoManager` so git operations don't fail on the mocked `execFileAsync`.

**Step 1: Add `branches.js` mock at the top of the file (after the existing mocks)**

After line 35 (end of `vi.mock("node:util", ...)`), add:

```typescript
vi.mock("./branches.js", () => ({
  RepoManager: vi.fn().mockImplementation(() => ({
    ensureRepo: vi.fn().mockResolvedValue("/tmp/mock-repo"),
    ensureFeatureBranch: vi.fn().mockResolvedValue(undefined),
    createJobWorktree: vi.fn().mockResolvedValue({
      worktreePath: "/tmp/mock-worktree",
      jobBranch: "job/job-001",
    }),
    removeJobWorktree: vi.fn().mockResolvedValue(undefined),
    pushJobBranch: vi.fn().mockResolvedValue(undefined),
  })),
}));
```

**Step 2: Add required fields to `makeStartJob`**

Replace lines 43-56:

```typescript
function makeStartJob(overrides?: Partial<StartJob>): StartJob {
  return {
    type: "start_job",
    protocolVersion: PROTOCOL_VERSION,
    jobId: "job-001",
    cardId: "card-001",
    cardType: "code",
    complexity: "medium",
    slotType: "claude_code",
    model: "claude-opus-4-6",
    context: "Implement the feature.",
    projectId: "proj-001",
    repoUrl: "https://github.com/test/repo.git",
    featureBranch: "feature/test-branch",
    ...overrides,
  };
}
```

**Step 3: Fix the mock supabase to handle chained `.eq().eq()` calls**

The `sendJobStatus` and `sendJobComplete` methods use `.update().eq("id", jobId)` (single eq). But `sendJobAck` only calls `this.send()`. The assembled_context persist uses `.update().eq().then()`. The mock's `.eq()` returns `Promise.resolve({ error: null })` which has `.then()` — that works.

However, `handleStartJob` at line 352 calls `isTmuxSessionAlive` which calls `execFileAsync("tmux", ...)`. The mock resolves, meaning the session is "alive". Then `killTmuxSession` is called. Then `spawnTmuxSession` is called. These all use `execFileAsync` which resolves — fine.

But there's a subtlety: `startPipePane` at line 373 also calls `execFileAsync`. And `jobLogPath` creates a path. These should all work with the mock.

The real issue is that `createJobWorktree` returns `{ worktreePath, jobBranch }` and the mock needs to return a consistent path. Already handled in Step 1.

Replace the `makeMockSupabase` function (lines 65-80):

```typescript
function makeMockSupabase() {
  const calls: UpdateCall[] = [];

  const makeChainable = (table: string) => {
    const chain = {
      update: vi.fn((data: Record<string, unknown>) => {
        const eqFn = vi.fn((col: string, val: string) => {
          calls.push({ table, data, eqColumn: col, eqValue: val });
          // Return thenable that also supports further .eq() chaining
          const result = Promise.resolve({ error: null, data: null }) as any;
          result.eq = eqFn;
          return result;
        });
        return { eq: eqFn };
      }),
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          eq: vi.fn(() => ({
            single: vi.fn(() => Promise.resolve({ data: null, error: null })),
          })),
          single: vi.fn(() => Promise.resolve({ data: null, error: null })),
        })),
      })),
    };
    return chain;
  };

  const client = {
    from: vi.fn((table: string) => makeChainable(table)),
  };

  return { client: client as unknown, calls };
}
```

**Step 4: Run tests to verify all pass**

Run: `cd ~/Documents/GitHub/zazigv2 && npx vitest run packages/local-agent/src/executor.test.ts 2>&1 | tail -15`

Expected: 14 tests, 0 failures.

If any tests still fail, check the error output and adjust. Common issues:
- `workspace.ts` being called from within the worktree mock path — may need to adjust `existsSync` mock in the executor test to return `false` for `.git` checks
- `fileURLToPath` may throw on the `import.meta.url` in the test environment — the `dirname` call at executor.ts:316 may need the existing `node:fs` mock to handle the path

**Step 5: Commit**

```bash
git add packages/local-agent/src/executor.test.ts
git commit -m "test(executor): fix mocks for git worktree flow and missing StartJob fields"
```

---

### Task 4: Run full test suite and verify green

**Files:** None (verification only)

**Step 1: Run both test files together**

Run: `cd ~/Documents/GitHub/zazigv2 && npx vitest run packages/local-agent/src/executor.test.ts packages/local-agent/src/workspace.test.ts 2>&1 | tail -10`

Expected: `2 passed (2)` test files, 23 tests, 0 failures.

**Step 2: Run the full local-agent test suite to check for regressions**

Run: `cd ~/Documents/GitHub/zazigv2 && npx vitest run packages/local-agent/src/ 2>&1 | tail -15`

Expected: No new failures introduced.

**Step 3: If all green, push**

```bash
git push origin master
```
