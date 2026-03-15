import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const execSyncMock = vi.hoisted(() => vi.fn());
const readFileSyncMock = vi.hoisted(() => vi.fn().mockImplementation(() => { throw new Error("no file"); }));

vi.mock("node:child_process", () => ({
  execSync: execSyncMock,
}));
vi.mock("node:fs", () => ({ readFileSync: readFileSyncMock }));

import { resolveAgentVersion } from "./version.js";

type GlobalWithBuildHash = typeof globalThis & { AGENT_BUILD_HASH?: string };

const originalEnv = {
  ZAZIG_ENV: process.env["ZAZIG_ENV"],
  ZAZIG_REPO_PATH: process.env["ZAZIG_REPO_PATH"],
};
const originalBuildHash = (globalThis as GlobalWithBuildHash).AGENT_BUILD_HASH;

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env["ZAZIG_ENV"];
  delete process.env["ZAZIG_REPO_PATH"];
  delete (globalThis as GlobalWithBuildHash).AGENT_BUILD_HASH;
});

afterEach(() => {
  if (originalEnv.ZAZIG_ENV === undefined) {
    delete process.env["ZAZIG_ENV"];
  } else {
    process.env["ZAZIG_ENV"] = originalEnv.ZAZIG_ENV;
  }

  if (originalEnv.ZAZIG_REPO_PATH === undefined) {
    delete process.env["ZAZIG_REPO_PATH"];
  } else {
    process.env["ZAZIG_REPO_PATH"] = originalEnv.ZAZIG_REPO_PATH;
  }

  if (originalBuildHash === undefined) {
    delete (globalThis as GlobalWithBuildHash).AGENT_BUILD_HASH;
  } else {
    (globalThis as GlobalWithBuildHash).AGENT_BUILD_HASH = originalBuildHash;
  }
});

describe("resolveAgentVersion", () => {
  it("uses local-agent git hash in staging", () => {
    process.env["ZAZIG_ENV"] = "staging";
    process.env["ZAZIG_REPO_PATH"] = "/tmp/staging-repo";
    execSyncMock.mockReturnValueOnce("abc1234\n");

    const version = resolveAgentVersion();

    expect(version).toBe("abc1234");
    expect(execSyncMock).toHaveBeenCalledTimes(1);
    expect(execSyncMock).toHaveBeenCalledWith(
      "git log -1 --format=%h -- packages/local-agent/",
      {
        encoding: "utf8",
        stdio: "pipe",
        cwd: "/tmp/staging-repo",
      },
    );
  });

  it("falls back to short HEAD hash when staging git log fails", () => {
    process.env["ZAZIG_ENV"] = "staging";
    process.env["ZAZIG_REPO_PATH"] = "/tmp/staging-repo";
    execSyncMock
      .mockImplementationOnce(() => {
        throw new Error("git log unavailable");
      })
      .mockReturnValueOnce("def5678\n");

    const version = resolveAgentVersion();

    expect(version).toBe("def5678");
    expect(execSyncMock).toHaveBeenCalledTimes(2);
    expect(execSyncMock).toHaveBeenNthCalledWith(
      2,
      "git rev-parse --short HEAD",
      {
        encoding: "utf8",
        stdio: "pipe",
        cwd: "/tmp/staging-repo",
      },
    );
  });

  it("uses AGENT_BUILD_HASH in production when injected", () => {
    process.env["ZAZIG_ENV"] = "production";
    (globalThis as GlobalWithBuildHash).AGENT_BUILD_HASH = "bead123";

    const version = resolveAgentVersion();

    expect(version).toBe("bead123");
    expect(execSyncMock).not.toHaveBeenCalled();
  });

  it("returns dev when no version source resolves", () => {
    execSyncMock.mockImplementation(() => {
      throw new Error("git unavailable");
    });

    const version = resolveAgentVersion();

    expect(version).toBe("dev");
  });
});
