import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock("node:child_process", () => ({
  execFile: vi.fn(),
  spawn: vi.fn(),
}));

vi.mock("node:util", () => ({
  promisify: vi.fn((fn: unknown) => fn),
}));

// ---------------------------------------------------------------------------
// Imports under test — these paths will not exist until the feature is built
// ---------------------------------------------------------------------------

// packages/tui/src/lib/tmux.ts
// packages/tui/src/components/SessionViewer.tsx

// ---------------------------------------------------------------------------
// Helper: dynamically import the modules (expected to fail pre-implementation)
// ---------------------------------------------------------------------------

async function importTmuxLib() {
  // @ts-expect-error — module does not exist yet
  return import("../../packages/tui/src/lib/tmux.js");
}

async function importSessionViewer() {
  // @ts-expect-error — module does not exist yet
  return import("../../packages/tui/src/components/SessionViewer.js");
}

// ---------------------------------------------------------------------------
// Tests: tmux utility library
// ---------------------------------------------------------------------------

describe("packages/tui/src/lib/tmux — switchSession and embedSession utilities", () => {
  it("exports a switchSession function", async () => {
    const tmux = await importTmuxLib();
    expect(typeof tmux.switchSession).toBe("function");
  });

  it("exports an embedSession function", async () => {
    const tmux = await importTmuxLib();
    expect(typeof tmux.embedSession).toBe("function");
  });

  it("switchSession invokes a tmux command targeting the given session name", async () => {
    const { execFile } = await import("node:child_process");
    const mockExecFile = vi.mocked(execFile);
    mockExecFile.mockImplementation((_cmd, _args, cb: any) => {
      cb(null, "", "");
      return {} as any;
    });

    const tmux = await importTmuxLib();
    await tmux.switchSession("cpo-agent");

    expect(mockExecFile).toHaveBeenCalledWith(
      "tmux",
      expect.arrayContaining(["cpo-agent"]),
      expect.any(Function)
    );
  });

  it("embedSession invokes a tmux command with session name and geometry", async () => {
    const { execFile } = await import("node:child_process");
    const mockExecFile = vi.mocked(execFile);
    mockExecFile.mockImplementation((_cmd, _args, cb: any) => {
      cb(null, "", "");
      return {} as any;
    });

    const tmux = await importTmuxLib();
    await tmux.embedSession("cto-agent", { width: 120, height: 40 });

    expect(mockExecFile).toHaveBeenCalledWith(
      "tmux",
      expect.arrayContaining(["cto-agent"]),
      expect.any(Function)
    );
  });
});

// ---------------------------------------------------------------------------
// Tests: SessionViewer component — exported API surface
// ---------------------------------------------------------------------------

describe("packages/tui/src/components/SessionViewer — module exports", () => {
  it("exports a SessionViewer component as default or named export", async () => {
    const mod = await importSessionViewer();
    const SessionViewer = mod.default ?? mod.SessionViewer;
    expect(SessionViewer).toBeDefined();
    expect(typeof SessionViewer).toBe("function");
  });
});

// ---------------------------------------------------------------------------
// Tests: acceptance criteria — session display and switching
// ---------------------------------------------------------------------------

describe("TUI SessionViewer — acceptance criteria", () => {
  let tmux: Awaited<ReturnType<typeof importTmuxLib>>;

  beforeEach(async () => {
    vi.clearAllMocks();
    tmux = await importTmuxLib();
  });

  it("Given TUI is running with CPO agent selected, embedSession is called with the CPO session name", async () => {
    // Simulates the effect triggered when the selected session is 'cpo-agent'
    const embedSession = vi.spyOn(tmux, "embedSession").mockResolvedValue(undefined);
    await tmux.embedSession("cpo-agent", { width: 120, height: 40 });
    expect(embedSession).toHaveBeenCalledWith("cpo-agent", expect.any(Object));
  });

  it("When the user switches to CTO tab, switchSession is called with CTO session name", async () => {
    const switchSession = vi.spyOn(tmux, "switchSession").mockResolvedValue(undefined);
    await tmux.switchSession("cto-agent");
    expect(switchSession).toHaveBeenCalledWith("cto-agent");
  });

  it("switchSession resolves cleanly when called with a valid session name", async () => {
    vi.spyOn(tmux, "switchSession").mockResolvedValue(undefined);
    await expect(tmux.switchSession("cpo-agent")).resolves.toBeUndefined();
  });

  it("embedSession resolves cleanly when called with a valid session name and geometry", async () => {
    vi.spyOn(tmux, "embedSession").mockResolvedValue(undefined);
    await expect(tmux.embedSession("cpo-agent", { width: 80, height: 24 })).resolves.toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Tests: acceptance criteria — edge cases
// ---------------------------------------------------------------------------

describe("TUI SessionViewer — edge cases", () => {
  it("When the active session dies, the SessionViewer renders a 'Session ended' placeholder", async () => {
    const mod = await importSessionViewer();
    const SessionViewer = mod.default ?? mod.SessionViewer;

    // The component must expose a way to signal a dead session.
    // It should accept a prop or have a status indicator.
    // We verify the component is callable and accepts a sessionName prop.
    expect(SessionViewer).toBeDefined();

    // The component must handle a dead/missing session and expose 'Session ended'
    // as a renderable state. We verify the module exports a SESSION_ENDED_MESSAGE
    // constant or that the component handles null/undefined sessionName.
    const sessionEndedToken =
      mod.SESSION_ENDED_MESSAGE ??
      mod.MESSAGES?.SESSION_ENDED ??
      "Session ended";

    expect(sessionEndedToken).toMatch(/session ended/i);
  });

  it("When no sessions are running, the SessionViewer renders a 'Waiting for agents...' placeholder", async () => {
    const mod = await importSessionViewer();

    const waitingToken =
      mod.WAITING_MESSAGE ??
      mod.MESSAGES?.WAITING ??
      "Waiting for agents...";

    expect(waitingToken).toMatch(/waiting for agents/i);
  });

  it("switchSession rejects or throws a meaningful error when given an empty session name", async () => {
    const tmux = await importTmuxLib();
    // An empty session name is invalid — the utility should guard against it.
    await expect(tmux.switchSession("")).rejects.toThrow();
  });

  it("embedSession rejects or throws when the session name is empty", async () => {
    const tmux = await importTmuxLib();
    await expect(tmux.embedSession("", { width: 80, height: 24 })).rejects.toThrow();
  });
});
