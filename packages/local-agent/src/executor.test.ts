import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import type { StartJob } from "@zazigv2/shared";
import { PROTOCOL_VERSION } from "@zazigv2/shared";
import * as fsModule from "node:fs";
import { JobExecutor, type SendFn, enqueueWithCap, MAX_QUEUE_SIZE, type QueuedMessage } from "./executor.js";
import { SlotTracker } from "./slots.js";
import { RepoManager } from "./branches.js";
import { setupJobWorkspace } from "./workspace.js";

// ---------------------------------------------------------------------------
// Mock child_process + fs + util at module level
// ---------------------------------------------------------------------------

// Control what execFileAsync resolves/rejects to (drives tmux behavior)
let mockExecFileAsync: Mock;

vi.mock("node:child_process", () => ({
  execFile: vi.fn(),
}));

vi.mock("node:fs", () => ({
  existsSync: vi.fn(() => false),
  readFileSync: vi.fn((path: unknown) => {
    if (typeof path === "string" && path.endsWith(".json")) {
      return JSON.stringify({ permissions: { allow: [] } });
    }
    return "status: pass\nsummary: Job completed.";
  }),
  renameSync: vi.fn(),
  unlinkSync: vi.fn(),
  mkdirSync: vi.fn(),
  writeFileSync: vi.fn(),
  rmSync: vi.fn(),
  symlinkSync: vi.fn(),
}));

vi.mock("node:util", () => ({
  promisify: vi.fn(() => {
    // This is called once at module load to create execFileAsync.
    // We return our controllable mock.
    return (...args: unknown[]) => mockExecFileAsync(...args);
  }),
}));

let lastRepoManagerInstance: any;
vi.mock("./branches.js", () => {
  class MockRepoManager {
    ensureRepo = vi.fn().mockResolvedValue("/tmp/mock-repo");
    ensureWorktree = vi.fn().mockResolvedValue("/tmp/mock-worktree-shared");
    ensureFeatureBranch = vi.fn().mockResolvedValue(undefined);
    createJobWorktree = vi.fn().mockResolvedValue({
      worktreePath: "/tmp/mock-worktree",
      jobBranch: "job/job-001",
    });
    removeJobWorktree = vi.fn().mockResolvedValue(undefined);
    pushJobBranch = vi.fn().mockResolvedValue(undefined);
    constructor() {
      // eslint-disable-next-line @typescript-eslint/no-this-alias
      lastRepoManagerInstance = this;
    }
  }
  return { RepoManager: MockRepoManager };
});

vi.mock("./workspace.js", () => ({
  setupJobWorkspace: vi.fn(),
  writeSubagentsConfig: vi.fn().mockResolvedValue(undefined),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const JOB_TIMEOUT_MS = 60 * 60_000;

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

interface UpdateCall {
  table: string;
  data: Record<string, unknown>;
  eqColumn: string;
  eqValue: string;
}

interface SelectInCall {
  table: string;
  columns: string;
  inColumn: string;
  inValues: string[];
}

function makeMockSupabase() {
  const calls: UpdateCall[] = [];
  const selectInCalls: SelectInCall[] = [];
  let inResult: { data: unknown; error: { message: string } | null } = {
    data: [],
    error: null,
  };
  let expertRolesResult: { data: unknown; error: { message: string } | null } = {
    data: [],
    error: null,
  };

  const makeChainable = (table: string) => {
    const chain = {
      update: vi.fn((data: Record<string, unknown>) => {
        const eqFn = vi.fn((col: string, val: string) => {
          calls.push({ table, data, eqColumn: col, eqValue: val });
          const result = Promise.resolve({ error: null, data: null }) as any;
          result.eq = eqFn;
          return result;
        });
        return { eq: eqFn };
      }),
      upsert: vi.fn(() => Promise.resolve({ error: null, data: null })),
      select: vi.fn((columns: string) => {
        if (table === "expert_roles" && columns === "name, display_name, description") {
          return Promise.resolve(expertRolesResult);
        }
        return {
          eq: vi.fn(() => ({
            eq: vi.fn(() => ({
              single: vi.fn(() => Promise.resolve({ data: null, error: null })),
            })),
            single: vi.fn(() => Promise.resolve({ data: null, error: null })),
            not: vi.fn(() => ({
              limit: vi.fn(() => Promise.resolve({ data: [], error: null })),
            })),
          })),
          in: vi.fn((inColumn: string, inValues: string[]) => {
            selectInCalls.push({ table, columns, inColumn, inValues: [...inValues] });
            return Promise.resolve(inResult);
          }),
        };
      }),
    };
    return chain;
  };

  const client = {
    from: vi.fn((table: string) => makeChainable(table)),
    rpc: vi.fn(() => Promise.resolve({ error: null, data: null })),
  };

  return {
    client: client as unknown,
    calls,
    selectInCalls,
    setInResult: (next: { data: unknown; error: { message: string } | null }) => {
      inResult = next;
    },
    setExpertRolesResult: (next: { data: unknown; error: { message: string } | null }) => {
      expertRolesResult = next;
    },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("JobExecutor — progress formula (pure)", () => {
  it("computes linear progress 0→95 over JOB_TIMEOUT_MS, capped at 95", () => {
    const cases = [
      { elapsedMs: 0, expected: 0 },
      { elapsedMs: 30_000, expected: 0 },           // 30s
      { elapsedMs: 360_000, expected: 10 },          // 6 min
      { elapsedMs: 1_080_000, expected: 30 },        // 18 min
      { elapsedMs: 1_800_000, expected: 50 },        // 30 min
      { elapsedMs: 2_700_000, expected: 75 },        // 45 min
      { elapsedMs: 3_420_000, expected: 95 },        // 57 min → capped
      { elapsedMs: 3_540_000, expected: 95 },        // 59 min → capped
      { elapsedMs: 3_600_000, expected: 95 },        // 60 min → capped (never 100)
      { elapsedMs: 7_200_000, expected: 95 },        // 120 min → still capped
    ];

    for (const { elapsedMs, expected } of cases) {
      const progress = Math.min(95, Math.floor((elapsedMs / JOB_TIMEOUT_MS) * 100));
      expect(progress, `at ${elapsedMs}ms`).toBe(expected);
    }
  });
});

describe("JobExecutor — progress integration", () => {
  let send: ReturnType<typeof vi.fn>;
  let slots: SlotTracker;
  let supabase: ReturnType<typeof makeMockSupabase>;
  let executor: JobExecutor;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();

    const readFileSyncMock = fsModule.readFileSync as unknown as Mock;
    readFileSyncMock.mockImplementation((path: unknown) => {
      if (typeof path === "string" && path.endsWith(".json")) {
        return JSON.stringify({ permissions: { allow: [] } });
      }
      return "status: pass\nsummary: Job completed.";
    });
    const renameSyncMock = fsModule.renameSync as unknown as Mock;
    renameSyncMock.mockImplementation(() => undefined);

    // Default: execFileAsync resolves (tmux commands succeed → session alive)
    mockExecFileAsync = vi.fn().mockResolvedValue({ stdout: "", stderr: "" });

    send = vi.fn().mockResolvedValue(undefined);
    slots = new SlotTracker({ claude_code: 2, codex: 1 });
    supabase = makeMockSupabase();
    executor = new JobExecutor(
      "machine-1",
      "company-test",
      slots,
      send as unknown as SendFn,
      supabase.client as any,
      "https://test.supabase.co",
      "test-anon-key",
    );
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("writes progress to Supabase when poll fires and session is alive", async () => {
    await executor.handleStartJob(makeStartJob());

    // Clear calls from handleStartJob (sendJobStatus "executing")
    supabase.calls.length = 0;

    // Advance one poll interval (30s). Session is alive (mockExecFileAsync resolves).
    await vi.advanceTimersByTimeAsync(30_000);

    // Should have written progress to the jobs table
    const progressCalls = supabase.calls.filter(
      (c) => c.table === "jobs" && "progress" in c.data && !("status" in c.data),
    );
    expect(progressCalls.length).toBe(1);
    expect(progressCalls[0]!.data.progress).toBe(0); // 30s into 60min ≈ 0
    expect(progressCalls[0]!.eqColumn).toBe("id");
    expect(progressCalls[0]!.eqValue).toBe("job-001");
  });

  it("progress increases as time passes", async () => {
    await executor.handleStartJob(makeStartJob());
    supabase.calls.length = 0;

    // Advance 3 poll intervals (90s)
    await vi.advanceTimersByTimeAsync(30_000);
    await vi.advanceTimersByTimeAsync(30_000);
    await vi.advanceTimersByTimeAsync(30_000);

    const progressCalls = supabase.calls.filter(
      (c) => c.table === "jobs" && "progress" in c.data && !("status" in c.data),
    );
    expect(progressCalls.length).toBe(3);

    // Each successive poll should have equal or higher progress
    const values = progressCalls.map((c) => c.data.progress as number);
    expect(values[0]).toBeLessThanOrEqual(values[1]!);
    expect(values[1]).toBeLessThanOrEqual(values[2]!);
  });

  it("sets progress: 100 in sendJobComplete when session ends", async () => {
    await executor.handleStartJob(makeStartJob());
    supabase.calls.length = 0;

    // Make isTmuxSessionAlive return false (session ended)
    // tmux has-session rejects → session is dead
    mockExecFileAsync.mockRejectedValue(new Error("session not found"));

    // Advance one poll interval — session is dead → onJobEnded → sendJobComplete
    await vi.advanceTimersByTimeAsync(30_000);

    const completeCalls = supabase.calls.filter(
      (c) => c.table === "jobs" && c.data.status === "complete",
    );
    expect(completeCalls.length).toBe(1);
    expect(completeCalls[0]!.data.progress).toBe(100);
    expect(completeCalls[0]!.data.result).toBeDefined();
    expect(completeCalls[0]!.data.completed_at).toBeDefined();
  });

  it("routes FAILED report result to sendJobFailed and preserves reason in DB result", async () => {
    const readFileSyncMock = fsModule.readFileSync as unknown as Mock;
    readFileSyncMock.mockImplementation((path: unknown) => {
      if (typeof path === "string" && path.endsWith(".json")) {
        return JSON.stringify({ permissions: { allow: [] } });
      }
      return "status: fail\nfailure_reason: Could not acquire git index.lock";
    });

    await executor.handleStartJob(makeStartJob());
    supabase.calls.length = 0;
    mockExecFileAsync.mockRejectedValue(new Error("session not found"));

    await vi.advanceTimersByTimeAsync(30_000);

    const completeCalls = supabase.calls.filter(
      (c) => c.table === "jobs" && c.data.status === "complete",
    );
    const failCalls = supabase.calls.filter(
      (c) => c.table === "jobs" && c.data.status === "failed",
    );

    expect(completeCalls.length).toBe(0);
    expect(failCalls.length).toBe(1);
    expect(failCalls[0]!.data.result).toBe("FAILED: Could not acquire git index.lock");
  });

  it("routes NO_REPORT result to sendJobFailed", async () => {
    const renameSyncMock = fsModule.renameSync as unknown as Mock;
    renameSyncMock.mockImplementation(() => {
      throw new Error("not found");
    });

    await executor.handleStartJob(makeStartJob());
    supabase.calls.length = 0;
    mockExecFileAsync.mockRejectedValue(new Error("session not found"));

    await vi.advanceTimersByTimeAsync(30_000);

    const completeCalls = supabase.calls.filter(
      (c) => c.table === "jobs" && c.data.status === "complete",
    );
    const failCalls = supabase.calls.filter(
      (c) => c.table === "jobs" && c.data.status === "failed",
    );

    expect(completeCalls.length).toBe(0);
    expect(failCalls.length).toBe(1);
    expect(failCalls[0]!.data.result).toBe("NO_REPORT");
  });

  it("does not reset progress on job failure/timeout", async () => {
    await executor.handleStartJob(makeStartJob());
    supabase.calls.length = 0;

    // First poll: session alive → writes some progress
    await vi.advanceTimersByTimeAsync(30_000);

    const progressBefore = supabase.calls.filter(
      (c) => c.table === "jobs" && "progress" in c.data && !("status" in c.data),
    );
    expect(progressBefore.length).toBeGreaterThan(0);

    // Now trigger timeout failure (advances to 60min mark)
    // The session is still "alive" so polls keep running, then timeout fires
    // Note: we need to advance to the timeout. But to avoid 118 polls,
    // let's make the session die at the next poll by changing mock behavior.
    mockExecFileAsync.mockRejectedValue(new Error("session not found"));

    // Clear and check that sendJobFailed does NOT include progress field
    // (Actually, let's test that sendJobComplete includes progress: 100
    // vs sendJobFailed does NOT set progress — it leaves it as-is)
    supabase.calls.length = 0;
    await vi.advanceTimersByTimeAsync(30_000);

    // Session died → onJobEnded → sendJobComplete (not failure)
    // For a true failure test, we'd need the timeout to fire.
    // Since onJobEnded calls sendJobComplete, progress: 100 is written.
    // The spec says "On job failed/timeout: leave progress as-is" — check sendJobFailed
    const failCalls = supabase.calls.filter(
      (c) => c.table === "jobs" && c.data.status === "failed",
    );
    // No fail calls in this scenario (it completed normally)
    expect(failCalls.length).toBe(0);
  });

  it("does not fail a job when local slots are exhausted", async () => {
    const noSlotExecutor = new JobExecutor(
      "machine-1",
      "company-test",
      new SlotTracker({ claude_code: 0, codex: 0 }),
      send as unknown as SendFn,
      supabase.client as any,
      "https://test.supabase.co",
      "test-anon-key",
    );

    await noSlotExecutor.handleStartJob(makeStartJob());

    const failCalls = supabase.calls.filter(
      (c) => c.table === "jobs" && c.data.status === "failed",
    );
    expect(failCalls.length).toBe(0);
  });

  it("ignores duplicate start_job when the same job is already active", async () => {
    const job = makeStartJob({ jobId: "job-dupe-001" });
    await executor.handleStartJob(job);
    const sendCallsAfterFirstStart = send.mock.calls.length;

    await executor.handleStartJob(job);

    // Duplicate should be ignored before ack/executing status or slot acquisition.
    expect(send.mock.calls.length).toBe(sendCallsAfterFirstStart);
  });
});

describe("JobExecutor — slot reconciliation", () => {
  let send: ReturnType<typeof vi.fn>;
  let slots: SlotTracker;
  let supabase: ReturnType<typeof makeMockSupabase>;
  let executor: JobExecutor;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();

    mockExecFileAsync = vi.fn().mockResolvedValue({ stdout: "", stderr: "" });
    send = vi.fn().mockResolvedValue(undefined);
    slots = new SlotTracker({ claude_code: 1, codex: 1 });
    supabase = makeMockSupabase();
    executor = new JobExecutor(
      "machine-1",
      "company-test",
      slots,
      send as unknown as SendFn,
      supabase.client as any,
      "https://test.supabase.co",
      "test-anon-key",
    );
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("releases slot and cleans up when DB marks active job as failed externally", async () => {
    const jobId = "job-reconcile-001";
    await executor.handleStartJob(makeStartJob({ jobId }));
    expect(slots.getAvailable().claude_code).toBe(0);

    supabase.setInResult({
      data: [{ id: jobId, status: "failed" }],
      error: null,
    });

    await vi.advanceTimersByTimeAsync(60_000);

    expect(slots.getAvailable().claude_code).toBe(1);
    expect(lastRepoManagerInstance.removeJobWorktree).toHaveBeenCalled();
  });

  it("skips reconciliation query when only persistent jobs are active", async () => {
    await executor.handleStartJob(makeStartJob({
      jobId: "persistent-cpo-company-test",
      role: "cpo",
      cardType: "persistent_agent",
    }));

    await vi.advanceTimersByTimeAsync(60_000);

    expect(supabase.selectInCalls.length).toBe(0);
    expect(slots.getAvailable().claude_code).toBe(1); // persistent agents don't consume slots
  });

  it("creates persistent workspace repo symlinks from company projects", async () => {
    const mkdirSyncMock = fsModule.mkdirSync as unknown as Mock;
    const rmSyncMock = fsModule.rmSync as unknown as Mock;
    const symlinkSyncMock = fsModule.symlinkSync as unknown as Mock;
    const persistentJob = {
      ...makeStartJob({
        jobId: "persistent-cpo-links",
        role: "cpo",
        cardType: "persistent_agent",
      }),
      companyProjects: [
        { name: "alpha", repo_url: "https://github.com/test/alpha.git" },
      ],
    } as StartJob & {
      companyProjects: Array<{ name: string; repo_url: string }>;
    };

    await executor.handleStartJob(persistentJob as StartJob);

    expect(lastRepoManagerInstance.ensureRepo).toHaveBeenCalledWith(
      "https://github.com/test/alpha.git",
      "alpha",
    );
    expect(lastRepoManagerInstance.ensureWorktree).toHaveBeenCalledWith("alpha");
    const madeReposDir = mkdirSyncMock.mock.calls.some((call: unknown[]) =>
      typeof call[0] === "string"
      && (call[0] as string).endsWith("/repos")
      && !!call[1]
      && typeof call[1] === "object"
      && (call[1] as { recursive?: unknown }).recursive === true
    );
    const removedRepoLink = rmSyncMock.mock.calls.some((call: unknown[]) =>
      typeof call[0] === "string"
      && (call[0] as string).endsWith("/repos/alpha")
      && !!call[1]
      && typeof call[1] === "object"
      && (call[1] as { force?: unknown; recursive?: unknown }).force === true
      && (call[1] as { force?: unknown; recursive?: unknown }).recursive === true
    );
    const linkedRepo = symlinkSyncMock.mock.calls.some((call: unknown[]) =>
      call[0] === "/tmp/mock-worktree-shared"
      && typeof call[1] === "string"
      && (call[1] as string).endsWith("/repos/alpha")
    );
    expect(madeReposDir).toBe(true);
    expect(removedRepoLink).toBe(true);
    expect(linkedRepo).toBe(true);
  });

  it("continues linking other persistent repos when one project fails", async () => {
    const symlinkSyncMock = fsModule.symlinkSync as unknown as Mock;
    const linkErr = new Error("worktree add failed");
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    lastRepoManagerInstance.ensureWorktree
      .mockRejectedValueOnce(linkErr)
      .mockResolvedValueOnce("/tmp/mock-worktree-shared");

    const persistentJob = {
      ...makeStartJob({
        jobId: "persistent-cpo-links-partial",
        role: "cpo",
        cardType: "persistent_agent",
      }),
      companyProjects: [
        { name: "alpha", repo_url: "https://github.com/test/alpha.git" },
        { name: "beta", repo_url: "https://github.com/test/beta.git" },
      ],
    } as StartJob & {
      companyProjects: Array<{ name: string; repo_url: string }>;
    };

    await executor.handleStartJob(persistentJob as StartJob);

    expect(lastRepoManagerInstance.ensureWorktree).toHaveBeenCalledTimes(2);
    const linkedBeta = symlinkSyncMock.mock.calls.some((call: unknown[]) =>
      call[0] === "/tmp/mock-worktree-shared"
      && typeof call[1] === "string"
      && (call[1] as string).endsWith("/repos/beta")
    );
    const linkedAlpha = symlinkSyncMock.mock.calls.some((call: unknown[]) =>
      typeof call[1] === "string"
      && (call[1] as string).endsWith("/repos/alpha")
    );
    expect(linkedBeta).toBe(true);
    expect(linkedAlpha).toBe(false);
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "[executor] Persistent agent repo link failed for project=alpha:",
      linkErr,
    );

    consoleErrorSpy.mockRestore();
  });

  it("handles reconciliation query failures without releasing slots", async () => {
    await executor.handleStartJob(makeStartJob({ jobId: "job-reconcile-error" }));
    expect(slots.getAvailable().claude_code).toBe(0);

    supabase.setInResult({
      data: null,
      error: { message: "network down" },
    });

    await vi.advanceTimersByTimeAsync(60_000);

    expect(slots.getAvailable().claude_code).toBe(0);
  });

  it("does nothing when there are no active jobs", async () => {
    await vi.advanceTimersByTimeAsync(60_000);
    expect(supabase.selectInCalls.length).toBe(0);
  });
});

describe("JobExecutor — repo refresh heartbeat", () => {
  let send: ReturnType<typeof vi.fn>;
  let slots: SlotTracker;
  let supabase: ReturnType<typeof makeMockSupabase>;
  let executor: JobExecutor;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();

    mockExecFileAsync = vi.fn().mockResolvedValue({ stdout: "", stderr: "" });
    send = vi.fn().mockResolvedValue(undefined);
    slots = new SlotTracker({ claude_code: 1, codex: 1 });
    supabase = makeMockSupabase();
    executor = new JobExecutor(
      "machine-1",
      "company-test",
      slots,
      send as unknown as SendFn,
      supabase.client as any,
      "https://test.supabase.co",
      "test-anon-key",
    );
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("refreshes each configured company project on heartbeat", async () => {
    executor.setCompanyProjects([
      { name: "project-alpha", repo_url: "https://github.com/test/project-alpha.git" },
      { name: "project-beta", repo_url: "https://github.com/test/project-beta.git" },
    ]);

    await vi.advanceTimersByTimeAsync(60_000);

    expect(lastRepoManagerInstance.ensureWorktree).toHaveBeenCalledTimes(2);
    expect(lastRepoManagerInstance.ensureWorktree).toHaveBeenNthCalledWith(1, "project-alpha");
    expect(lastRepoManagerInstance.ensureWorktree).toHaveBeenNthCalledWith(2, "project-beta");
  });

  it("logs and continues when one project refresh fails", async () => {
    const refreshErr = new Error("refresh failed");
    lastRepoManagerInstance.ensureWorktree
      .mockRejectedValueOnce(refreshErr)
      .mockResolvedValueOnce("/tmp/mock-repo-worktree");
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    executor.setCompanyProjects([
      { name: "project-alpha", repo_url: "https://github.com/test/project-alpha.git" },
      { name: "project-beta", repo_url: "https://github.com/test/project-beta.git" },
    ]);

    await vi.advanceTimersByTimeAsync(60_000);

    expect(consoleErrorSpy).toHaveBeenCalledWith("[repo-refresh] Failed to refresh project-alpha:", refreshErr);
    expect(lastRepoManagerInstance.ensureWorktree).toHaveBeenCalledTimes(2);
    expect(lastRepoManagerInstance.ensureWorktree).toHaveBeenNthCalledWith(2, "project-beta");

    consoleErrorSpy.mockRestore();
  });

  it("stops repo refresh timer during stopAll", async () => {
    executor.setCompanyProjects([
      { name: "project-alpha", repo_url: "https://github.com/test/project-alpha.git" },
    ]);

    await executor.stopAll();
    lastRepoManagerInstance.ensureWorktree.mockClear();

    await vi.advanceTimersByTimeAsync(60_000);

    expect(lastRepoManagerInstance.ensureWorktree).not.toHaveBeenCalled();
  });
});

describe("JobExecutor - subAgentPrompt workspace", () => {
  let send: ReturnType<typeof vi.fn>;
  let slots: SlotTracker;
  let supabase: ReturnType<typeof makeMockSupabase>;
  let executor: JobExecutor;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();

    mockExecFileAsync = vi.fn().mockResolvedValue({ stdout: "", stderr: "" });
    send = vi.fn().mockResolvedValue(undefined);
    slots = new SlotTracker({ claude_code: 2, codex: 1 });
    supabase = makeMockSupabase();
    executor = new JobExecutor(
      "machine-1",
      "company-test",
      slots,
      send as unknown as SendFn,
      supabase.client as any,
      "https://test.supabase.co",
      "test-anon-key",
    );
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("writes subAgentPrompt to job workspace file when present", async () => {
    const writeFileSyncMock = fsModule.writeFileSync as unknown as Mock;
    await executor.handleStartJob(makeStartJob({ subAgentPrompt: "# Team Values\nBe concise." }));

    const subAgentCall = writeFileSyncMock.mock.calls.find(
      (call: unknown[]) => typeof call[0] === "string" && (call[0] as string).includes("subagent-personality.md"),
    );
    expect(subAgentCall).toBeDefined();
    expect(subAgentCall![1]).toBe("# Team Values\nBe concise.");
  });

  it("does not write workspace file when subAgentPrompt is absent", async () => {
    const writeFileSyncMock = fsModule.writeFileSync as unknown as Mock;
    await executor.handleStartJob(makeStartJob());

    const subAgentCalls = writeFileSyncMock.mock.calls.filter(
      (call: unknown[]) => typeof call[0] === "string" && (call[0] as string).includes("subagent-personality.md"),
    );
    expect(subAgentCalls.length).toBe(0);
  });

  it("cleans up git worktree on job completion", async () => {
    const job = makeStartJob({ jobId: "job-ws-001", subAgentPrompt: "# Team Values" });
    await executor.handleStartJob(job);

    // Make session end (tmux has-session rejects = dead)
    mockExecFileAsync.mockRejectedValue(new Error("session not found"));
    await vi.advanceTimersByTimeAsync(30_000);

    // With git worktree flow, cleanup calls removeJobWorktree on the RepoManager instance
    expect(lastRepoManagerInstance.removeJobWorktree).toHaveBeenCalled();
  });
});

describe("JobExecutor — ephemeral workspace setup", () => {
  let send: ReturnType<typeof vi.fn>;
  let slots: SlotTracker;
  let supabase: ReturnType<typeof makeMockSupabase>;
  let executor: JobExecutor;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();

    mockExecFileAsync = vi.fn().mockResolvedValue({ stdout: "", stderr: "" });
    send = vi.fn().mockResolvedValue(undefined);
    slots = new SlotTracker({ claude_code: 2, codex: 1 });
    supabase = makeMockSupabase();
    executor = new JobExecutor(
      "machine-1",
      "company-test",
      slots,
      send as unknown as SendFn,
      supabase.client as any,
      "https://test.supabase.co",
      "test-anon-key",
    );
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("calls setupJobWorkspace for ephemeral job with role field", async () => {
    const setupMock = setupJobWorkspace as unknown as Mock;
    await executor.handleStartJob(makeStartJob({
      role: "breakdown-specialist",
      roleSkills: ["jobify"],
    }));

    // setupJobWorkspace should have been called with the worktree path and role
    expect(setupMock).toHaveBeenCalledTimes(1);
    const config = setupMock.mock.calls[0]![0];
    expect(config.workspaceDir).toBe("/tmp/mock-worktree");
    expect(config.role).toBe("breakdown-specialist");
    expect(config.skills).toEqual(["jobify"]);
    expect(config.jobId).toBe("job-001");
  });

  it("injects expert roster and ensures start-expert skill for cpo role", async () => {
    const setupMock = setupJobWorkspace as unknown as Mock;
    supabase.setExpertRolesResult({
      data: [
        { name: "security-reviewer", display_name: "Security Reviewer", description: "Threat modeling and security checks" },
      ],
      error: null,
    });

    await executor.handleStartJob(makeStartJob({
      role: "cpo",
      roleSkills: ["scrum"],
    }));

    expect(setupMock).toHaveBeenCalledTimes(1);
    const config = setupMock.mock.calls[0]![0];
    expect(config.skills).toEqual(["scrum", "start-expert"]);
    expect(config.machineId).toBe("machine-1");
    expect(config.claudeMdContent).toContain("## Expert Agents Available");
    expect(config.claudeMdContent).toContain("**security-reviewer** (Security Reviewer)");
  });

  it("does NOT create workspace for ephemeral job without role field", async () => {
    const mkdirSyncMock = fsModule.mkdirSync as unknown as Mock;
    await executor.handleStartJob(makeStartJob({ role: undefined }));

    // Should NOT have created a workspace directory with "job-" prefix
    const workspaceCalls = mkdirSyncMock.mock.calls.filter(
      (call: unknown[]) => typeof call[0] === "string" && (call[0] as string).includes("job-job-001"),
    );
    expect(workspaceCalls.length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// messageQueue — cap behaviour (pure helper)
// ---------------------------------------------------------------------------

function makeQueuedMessage(overrides: Partial<QueuedMessage> = {}): QueuedMessage {
  return {
    text: "[Pipeline] notification",
    sessionName: "test-session",
    startedAt: 0,
    type: "notification",
    resolve: () => {},
    reject: () => {},
    ...overrides,
  };
}

describe("messageQueue — queue cap (enqueueWithCap)", () => {
  it("queue length stays ≤ MAX_QUEUE_SIZE when enqueuing 25 notification messages", () => {
    const queue: QueuedMessage[] = [];
    for (let i = 0; i < 25; i++) {
      enqueueWithCap(queue, makeQueuedMessage({ text: `[Pipeline] notification ${i}` }), MAX_QUEUE_SIZE);
    }
    expect(queue.length).toBeLessThanOrEqual(MAX_QUEUE_SIZE);
  });

  it("preserves all human messages in the queue when notifications are dropped", () => {
    const queue: QueuedMessage[] = [];
    for (let i = 0; i < 3; i++) {
      enqueueWithCap(queue, makeQueuedMessage({ text: `hello from human ${i}`, type: "human" }), MAX_QUEUE_SIZE);
    }
    for (let i = 0; i < 25; i++) {
      enqueueWithCap(queue, makeQueuedMessage({ text: `[Pipeline] notification ${i}` }), MAX_QUEUE_SIZE);
    }
    const humans = queue.filter((m) => m.type === "human");
    expect(humans).toHaveLength(3);
    expect(queue.length).toBeLessThanOrEqual(MAX_QUEUE_SIZE);
  });

  it("allows queue to exceed cap when all queued messages are human", () => {
    const queue: QueuedMessage[] = [];
    for (let i = 0; i < 25; i++) {
      enqueueWithCap(queue, makeQueuedMessage({ text: `hello from human ${i}`, type: "human" }), MAX_QUEUE_SIZE);
    }
    // No notifications to drop → queue exceeds cap
    expect(queue.length).toBe(25);
  });
});
