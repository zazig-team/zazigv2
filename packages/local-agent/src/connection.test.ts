import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createClient } from "@supabase/supabase-js";
import type { MachineConfig } from "./config.js";
import { recoverDispatchedJobs } from "./job-recovery.js";
import { SlotTracker } from "./slots.js";
import { AgentConnection } from "./connection.js";

vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(),
}));

vi.mock("./job-recovery.js", () => ({
  recoverDispatchedJobs: vi.fn().mockResolvedValue(0),
}));

type MockClientBundle = {
  client: any;
  fromMock: ReturnType<typeof vi.fn>;
  machinesUpdateMock: ReturnType<typeof vi.fn>;
  setSessionMock: ReturnType<typeof vi.fn>;
};

const createClientMock = vi.mocked(createClient);
const recoverDispatchedJobsMock = vi.mocked(recoverDispatchedJobs);

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
  const machinesUpdateMock = vi.fn();
  const machinesUpsertMock = vi.fn().mockResolvedValue({ error: null });

  const latestVersionMaybeSingleMock = vi
    .fn()
    .mockResolvedValue({ data: null, error: null });
  const latestVersionLimitMock = vi.fn().mockReturnValue({
    maybeSingle: latestVersionMaybeSingleMock,
  });
  const latestVersionOrderMock = vi.fn().mockReturnValue({
    limit: latestVersionLimitMock,
  });
  const latestVersionEqMock = vi.fn().mockReturnValue({
    order: latestVersionOrderMock,
  });
  const latestVersionSelectMock = vi.fn().mockReturnValue({
    eq: latestVersionEqMock,
  });

  const userCompaniesSelectMock = vi.fn().mockResolvedValue({ data: [], error: null });

  const fromMock = vi.fn((table: string) => {
    if (table === "machines") {
      return {
        update: machinesUpdateMock,
        upsert: machinesUpsertMock,
      };
    }
    if (table === "agent_versions") {
      return {
        select: latestVersionSelectMock,
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
    channel: vi.fn(),
    removeChannel: vi.fn().mockResolvedValue(undefined),
  };

  return {
    client,
    fromMock,
    machinesUpdateMock,
    setSessionMock,
  };
}

describe("AgentConnection", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
    recoverDispatchedJobsMock.mockResolvedValue(0);

    fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("AC-1: heartbeat does not perform direct DB writes and still posts to agent-event", async () => {
    const supabaseMock = makeSupabaseClientMock();
    createClientMock.mockReturnValue(supabaseMock.client);

    const connection = new AgentConnection(makeConfig(), new SlotTracker(baseConfig.slots));

    await (connection as any).sendHeartbeat();

    expect(supabaseMock.machinesUpdateMock).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledWith(
      "https://example.supabase.co/functions/v1/agent-event",
      expect.objectContaining({
        method: "POST",
      }),
    );
  });

  it("AC-2: constructor throws when access_token is set without refresh_token", () => {
    createClientMock.mockReturnValue(makeSupabaseClientMock().client);

    expect(() => {
      new AgentConnection(
        makeConfig({ access_token: "access-token" }),
        new SlotTracker(baseConfig.slots),
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
    );

    await expect(connection.start()).rejects.toThrow(/bad token/i);
    expect(dbClient.setSessionMock).toHaveBeenCalledTimes(1);
  });

  it("AC-4: exits after 5 consecutive heartbeat failures", async () => {
    const supabaseMock = makeSupabaseClientMock();
    createClientMock.mockReturnValue(supabaseMock.client);

    const connection = new AgentConnection(makeConfig(), new SlotTracker(baseConfig.slots));
    vi.spyOn(connection as any, "sendToOrchestrator").mockResolvedValue(false);
    const processExitMock = vi
      .spyOn(process, "exit")
      .mockImplementation((() => undefined) as never);

    for (let i = 0; i < 5; i++) {
      await (connection as any).sendHeartbeat();
    }

    expect(processExitMock).toHaveBeenCalledWith(1);
    expect(processExitMock).toHaveBeenCalledTimes(1);
  });

  it("AC-5: resets consecutive heartbeat failure counter after a success", async () => {
    const supabaseMock = makeSupabaseClientMock();
    createClientMock.mockReturnValue(supabaseMock.client);

    const connection = new AgentConnection(makeConfig(), new SlotTracker(baseConfig.slots));
    vi.spyOn(connection as any, "sendToOrchestrator")
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false);
    const processExitMock = vi
      .spyOn(process, "exit")
      .mockImplementation((() => undefined) as never);

    await (connection as any).sendHeartbeat();
    await (connection as any).sendHeartbeat();
    await (connection as any).sendHeartbeat();
    expect((connection as any).consecutiveHeartbeatFailures).toBe(3);

    await (connection as any).sendHeartbeat();
    expect((connection as any).consecutiveHeartbeatFailures).toBe(0);
    expect(processExitMock).not.toHaveBeenCalled();

    await (connection as any).sendHeartbeat();
    expect((connection as any).consecutiveHeartbeatFailures).toBe(1);
    expect(processExitMock).not.toHaveBeenCalled();
  });
});
