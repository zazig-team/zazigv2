import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createClient } from "@supabase/supabase-js";
import type { Heartbeat } from "@zazigv2/shared";
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

const createClientMock = vi.mocked(createClient);
const recoverDispatchedJobsMock = vi.mocked(recoverDispatchedJobs);

describe("AgentConnection heartbeat delivery", () => {
  const config: MachineConfig = {
    name: "test-machine",
    company_id: "company-123",
    slots: { claude_code: 2, codex: 2 },
    supabase: {
      url: "https://example.supabase.co",
      anon_key: "anon-key",
      service_role_key: "service-role-key",
    },
  };

  const heartbeatMessage: Heartbeat = {
    type: "heartbeat",
    protocolVersion: 1,
    machineId: "test-machine",
    slotsAvailable: { claude_code: 2, codex: 2 },
  };

  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();

    const getSessionMock = vi.fn().mockResolvedValue({
      data: { session: { access_token: "session-token" } },
    });

    const maybeSingleMock = vi.fn().mockResolvedValue({ data: null, error: null });
    const limitMock = vi.fn().mockReturnValue({ maybeSingle: maybeSingleMock });
    const orderMock = vi.fn().mockReturnValue({ limit: limitMock });
    const eqMock = vi.fn().mockReturnValue({ order: orderMock });
    const selectMock = vi.fn().mockReturnValue({ eq: eqMock });
    const fromMock = vi.fn().mockReturnValue({ select: selectMock });

    createClientMock.mockReturnValue({
      auth: { getSession: getSessionMock },
      from: fromMock,
    } as any);

    recoverDispatchedJobsMock.mockResolvedValue(0);

    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("returns true when agent-event POST succeeds", async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200 });
    const connection = new AgentConnection(config, new SlotTracker(config.slots));

    const ok = await (connection as any).sendToOrchestrator(heartbeatMessage);

    expect(ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://example.supabase.co/functions/v1/agent-event",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer session-token",
        }),
      }),
    );
  });

  it("returns false when all retries are exhausted", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 503 });
    vi.useFakeTimers();

    const connection = new AgentConnection(config, new SlotTracker(config.slots));
    const sendPromise = (connection as any).sendToOrchestrator(heartbeatMessage);

    await vi.runAllTimersAsync();
    const ok = await sendPromise;

    expect(ok).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it("resets the consecutive failure counter after a successful heartbeat", async () => {
    const connection = new AgentConnection(config, new SlotTracker(config.slots));
    (connection as any).consecutiveHeartbeatFailures = 3;

    vi.spyOn(connection as any, "sendToOrchestrator").mockResolvedValue(true);

    await (connection as any).sendHeartbeat();

    expect((connection as any).consecutiveHeartbeatFailures).toBe(0);
  });

  it("exits after 5 consecutive heartbeat delivery failures", async () => {
    const connection = new AgentConnection(config, new SlotTracker(config.slots));
    vi.spyOn(connection as any, "sendToOrchestrator").mockResolvedValue(false);
    vi
      .spyOn(process, "exit")
      .mockImplementation(((code?: number) => {
        throw new Error(`process.exit:${String(code)}`);
      }) as never);

    for (let i = 0; i < 4; i++) {
      await (connection as any).sendHeartbeat();
    }
    expect((connection as any).consecutiveHeartbeatFailures).toBe(4);

    await expect((connection as any).sendHeartbeat()).rejects.toThrow("process.exit:1");
  });
});
