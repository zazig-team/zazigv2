import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createClient } from "@supabase/supabase-js";
import type { MachineConfig } from "./config.js";
import { SlotTracker } from "./slots.js";
import { AgentConnection } from "./connection.js";

vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(),
}));

type MockClientBundle = {
  client: any;
  fromMock: ReturnType<typeof vi.fn>;
  setSessionMock: ReturnType<typeof vi.fn>;
};

const createClientMock = vi.mocked(createClient);

const baseConfig: MachineConfig = {
  name: "test-machine",
  company_id: "company-123",
  slots: { claude_code: 2, codex: 2 },
  supabase: {
    url: "https://example.supabase.co",
    anon_key: "anon-key",
  },
};

function makeConfig(
  supabaseOverrides: Partial<MachineConfig["supabase"]> = {},
): MachineConfig {
  return {
    ...baseConfig,
    supabase: {
      ...baseConfig.supabase,
      ...supabaseOverrides,
    },
  };
}

function makeSupabaseClientMock(options: { setSessionError?: string } = {}): MockClientBundle {
  const machinesUpsertMock = vi.fn().mockResolvedValue({ error: null });
  const userCompaniesSelectMock = vi.fn().mockResolvedValue({ data: [], error: null });

  const fromMock = vi.fn((table: string) => {
    if (table === "machines") {
      return {
        upsert: machinesUpsertMock,
      };
    }
    if (table === "user_companies") {
      return {
        select: userCompaniesSelectMock,
      };
    }
    return {
      select: vi.fn(),
      update: vi.fn(),
      upsert: vi.fn().mockResolvedValue({ error: null }),
    };
  });

  const setSessionMock = vi.fn().mockResolvedValue(
    options.setSessionError
      ? { error: { message: options.setSessionError } }
      : { error: null },
  );

  const client = {
    auth: {
      getSession: vi.fn().mockResolvedValue({
        data: { session: { access_token: "session-token" } },
      }),
      setSession: setSessionMock,
      onAuthStateChange: vi.fn(),
    },
    from: fromMock,
    channel: vi.fn().mockReturnValue({
      on: vi.fn().mockReturnThis(),
      subscribe: vi.fn().mockReturnThis(),
      unsubscribe: vi.fn().mockResolvedValue(undefined),
    }),
    removeChannel: vi.fn().mockResolvedValue(undefined),
  };

  return {
    client,
    fromMock,
    setSessionMock,
  };
}

describe("AgentConnection", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();

    fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "OK",
      json: vi.fn().mockResolvedValue({ jobs: [] }),
    });
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("AC-2: constructor throws when access_token is set without refresh_token", () => {
    createClientMock.mockReturnValue(makeSupabaseClientMock().client);

    expect(() => {
      new AgentConnection(
        makeConfig({ access_token: "access-token" }),
        new SlotTracker(baseConfig.slots),
        "1.0.0",
      );
    }).toThrow(/refresh_token is required/i);
  });

  it("AC-3: start() throws when auth.setSession fails", async () => {
    const supabaseClient = makeSupabaseClientMock();
    const dbClient = makeSupabaseClientMock({ setSessionError: "bad token" });

    createClientMock
      .mockReturnValueOnce(supabaseClient.client)
      .mockReturnValueOnce(dbClient.client);

    const connection = new AgentConnection(
      makeConfig({
        access_token: "access-token",
        refresh_token: "refresh-token",
      }),
      new SlotTracker(baseConfig.slots),
      "1.0.0",
    );

    await expect(connection.start()).rejects.toThrow(/bad token/i);
    expect(dbClient.setSessionMock).toHaveBeenCalledTimes(1);
  });

  it("AC-3-1: no heartbeat event is sent while daemon runs poll loop", async () => {
    vi.useFakeTimers();
    const supabaseMock = makeSupabaseClientMock();
    createClientMock.mockReturnValue(supabaseMock.client);

    const connection = new AgentConnection(makeConfig(), new SlotTracker(baseConfig.slots), "1.0.0");
    vi.spyOn(connection as any, "registerMachine").mockResolvedValue(undefined);
    vi.spyOn(connection as any, "getCompanyIds").mockResolvedValue([]);

    await connection.start();
    await vi.advanceTimersByTimeAsync(30_000);

    const urls = fetchMock.mock.calls.map(([url]) => String(url));
    expect(urls.some((url) => url.includes("/functions/v1/agent-event"))).toBe(false);
    expect(urls.filter((url) => url.includes("/functions/v1/agent-inbound-poll")).length).toBeGreaterThanOrEqual(4);

    await connection.stop();
  });

  it("AC-3-2: poll triggers outdated shutdown path when response marks agent outdated", async () => {
    const supabaseMock = makeSupabaseClientMock();
    createClientMock.mockReturnValue(supabaseMock.client);
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "OK",
      json: vi.fn().mockResolvedValue({
        jobs: [],
        outdated: true,
        required_version: "2.0.0",
      }),
    });

    const connection = new AgentConnection(makeConfig(), new SlotTracker(baseConfig.slots), "1.0.0");
    const outdatedSpy = vi
      .spyOn(connection as any, "onOutdatedDetected")
      .mockImplementation(() => undefined);

    await (connection as any).poll();

    expect(outdatedSpy).toHaveBeenCalledWith("1.0.0", "2.0.0");
    expect(outdatedSpy).toHaveBeenCalledTimes(1);
  });

  it("AC-3-3: sendMessage still posts job events via agent-event", async () => {
    const supabaseMock = makeSupabaseClientMock();
    createClientMock.mockReturnValue(supabaseMock.client);

    const connection = new AgentConnection(makeConfig(), new SlotTracker(baseConfig.slots), "1.0.0");

    await connection.sendMessage({
      type: "job_ack",
      protocolVersion: 1,
      jobId: "job-123",
      machineId: "test-machine",
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://example.supabase.co/functions/v1/agent-event",
      expect.objectContaining({
        method: "POST",
      }),
    );
  });

  it("logs mismatch and exits non-zero when local agent version is outdated", async () => {
    const supabaseMock = makeSupabaseClientMock();
    createClientMock.mockReturnValue(supabaseMock.client);

    const connection = new AgentConnection(makeConfig(), new SlotTracker(baseConfig.slots), "80d28cf");
    const closeSessionsMock = vi
      .spyOn(connection as any, "closeOutdatedInteractiveSessions")
      .mockResolvedValue(undefined);
    const stopMock = vi
      .spyOn(connection, "stop")
      .mockResolvedValue(undefined);
    const processExitMock = vi
      .spyOn(process, "exit")
      .mockImplementation((() => undefined) as never);
    const consoleErrorMock = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const stderrWriteMock = vi
      .spyOn(process.stderr, "write")
      .mockImplementation(() => true);

    (connection as any).onOutdatedDetected("80d28cf", "abc1234");
    await Promise.resolve();
    await Promise.resolve();

    expect(closeSessionsMock).toHaveBeenCalledTimes(1);
    expect(stopMock).toHaveBeenCalledTimes(1);
    expect(processExitMock).toHaveBeenCalledWith(1);
    expect(consoleErrorMock).toHaveBeenCalledWith(
      "[local-agent] ERROR: Agent version mismatch — local: 80d28cf, backend: abc1234. Shutting down. Restart with updated code.",
    );
    expect(stderrWriteMock).toHaveBeenCalledWith(
      "ERROR: Agent version mismatch — local: 80d28cf, backend: abc1234. Shutting down. Restart with updated code.\n",
    );
  });

  it("calls poll immediately on start", async () => {
    const supabaseMock = makeSupabaseClientMock();
    createClientMock.mockReturnValue(supabaseMock.client);

    const connection = new AgentConnection(makeConfig(), new SlotTracker(baseConfig.slots), "1.0.0");
    vi.spyOn(connection as any, "registerMachine").mockResolvedValue(undefined);
    vi.spyOn(connection as any, "getCompanyIds").mockResolvedValue([]);
    const pollSpy = vi.spyOn(connection as any, "poll").mockResolvedValue(undefined);

    await connection.start();

    expect(pollSpy).toHaveBeenCalledTimes(1);
    await connection.stop();
  });

  it("poll skips when a previous poll is still running", async () => {
    const supabaseMock = makeSupabaseClientMock();
    createClientMock.mockReturnValue(supabaseMock.client);

    const connection = new AgentConnection(makeConfig(), new SlotTracker(baseConfig.slots), "1.0.0");
    (connection as any).isPolling = true;

    await (connection as any).poll();

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("warns when poll endpoint returns non-ok status", async () => {
    const supabaseMock = makeSupabaseClientMock();
    createClientMock.mockReturnValue(supabaseMock.client);
    fetchMock.mockResolvedValue({
      ok: false,
      status: 503,
      statusText: "Service Unavailable",
    });
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    const connection = new AgentConnection(makeConfig(), new SlotTracker(baseConfig.slots), "1.0.0");
    await (connection as any).poll();

    expect(warnSpy).toHaveBeenCalledWith("[Connection] Poll failed: 503 Service Unavailable");
  });

  it("warns when poll endpoint is unreachable", async () => {
    const supabaseMock = makeSupabaseClientMock();
    createClientMock.mockReturnValue(supabaseMock.client);
    fetchMock.mockRejectedValue(new Error("network down"));
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    const connection = new AgentConnection(makeConfig(), new SlotTracker(baseConfig.slots), "1.0.0");
    await (connection as any).poll();

    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("[Connection] Poll unreachable:"));
  });

  it("passes poll items to handleIncomingPayload", async () => {
    const supabaseMock = makeSupabaseClientMock();
    createClientMock.mockReturnValue(supabaseMock.client);
    const items = [{ type: "start_job" }, { type: "message_inbound" }];
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "OK",
      json: vi.fn().mockResolvedValue({ jobs: items }),
    });

    const connection = new AgentConnection(makeConfig(), new SlotTracker(baseConfig.slots), "1.0.0");
    const handlerSpy = vi.spyOn(connection as any, "handleIncomingPayload").mockImplementation(() => undefined);
    await (connection as any).poll();

    expect(handlerSpy).toHaveBeenCalledTimes(2);
    expect(handlerSpy).toHaveBeenNthCalledWith(1, items[0]);
    expect(handlerSpy).toHaveBeenNthCalledWith(2, items[1]);
  });

  it("stop clears poll interval", async () => {
    const supabaseMock = makeSupabaseClientMock();
    createClientMock.mockReturnValue(supabaseMock.client);
    vi.useFakeTimers();
    const clearIntervalSpy = vi.spyOn(global, "clearInterval");

    const connection = new AgentConnection(makeConfig(), new SlotTracker(baseConfig.slots), "1.0.0");
    vi.spyOn(connection as any, "poll").mockResolvedValue(undefined);
    (connection as any).startPollLoop();
    expect((connection as any).pollInterval).not.toBeNull();

    await connection.stop();

    expect(clearIntervalSpy).toHaveBeenCalled();
    expect((connection as any).pollInterval).toBeNull();
  });
});
