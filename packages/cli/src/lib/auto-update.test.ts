import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  existsSync, readFileSync, mkdirSync, writeFileSync,
  chmodSync, renameSync, rmSync, cpSync,
} from "node:fs";
import {
  getLocalVersion, getRemoteVersion, downloadAndInstall, checkForUpdate,
} from "./auto-update.js";

vi.mock("node:fs", async () => {
  const actual = await vi.importActual<typeof import("node:fs")>("node:fs");
  return {
    ...actual,
    existsSync: vi.fn(),
    readFileSync: vi.fn(),
    mkdirSync: vi.fn(),
    writeFileSync: vi.fn(),
    chmodSync: vi.fn(),
    renameSync: vi.fn(),
    rmSync: vi.fn(),
    cpSync: vi.fn(),
  };
});

const existsSyncMock = vi.mocked(existsSync);
const readFileSyncMock = vi.mocked(readFileSync);
const writeFileSyncMock = vi.mocked(writeFileSync);
const chmodSyncMock = vi.mocked(chmodSync);

describe("getLocalVersion", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns null when .version file does not exist", () => {
    existsSyncMock.mockReturnValue(false);
    expect(getLocalVersion()).toBeNull();
  });

  it("returns trimmed version string when file exists", () => {
    existsSyncMock.mockReturnValue(true);
    readFileSyncMock.mockReturnValue("0.13.0\n");
    expect(getLocalVersion()).toBe("0.13.0");
  });
});

describe("getRemoteVersion", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns latest version from agent_versions", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue([
        { version: "0.14.0", commit_sha: "abc1234" },
      ]),
    });

    const result = await getRemoteVersion("https://example.supabase.co", "anon-key", "production");
    expect(result).toEqual({ version: "0.14.0", commitSha: "abc1234" });
  });

  it("returns null when no versions found", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue([]),
    });

    const result = await getRemoteVersion("https://example.supabase.co", "anon-key", "production");
    expect(result).toBeNull();
  });

  it("returns null on fetch error", async () => {
    fetchMock.mockRejectedValue(new Error("network down"));

    const result = await getRemoteVersion("https://example.supabase.co", "anon-key", "production");
    expect(result).toBeNull();
  });
});

describe("downloadAndInstall", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("downloads 3 assets and writes them to bin dir", async () => {
    const fakeBuffer = new ArrayBuffer(8);
    fetchMock.mockResolvedValue({
      ok: true,
      arrayBuffer: vi.fn().mockResolvedValue(fakeBuffer),
    });
    existsSyncMock.mockReturnValue(false);

    await downloadAndInstall("0.14.0");

    expect(fetchMock).toHaveBeenCalledTimes(3);
    for (const call of fetchMock.mock.calls) {
      expect(String(call[0])).toContain("github.com/zazig-team/zazigv2/releases/download/v0.14.0/");
    }
    expect(writeFileSyncMock).toHaveBeenCalledWith(
      expect.stringContaining(".version"),
      "0.14.0",
    );
    expect(chmodSyncMock).toHaveBeenCalledTimes(3);
  });

  it("throws on download failure", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 404, statusText: "Not Found" });
    existsSyncMock.mockReturnValue(false);

    await expect(downloadAndInstall("0.14.0")).rejects.toThrow(/download.*failed/i);
  });
});

describe("checkForUpdate", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => vi.unstubAllGlobals());

  it("returns 'up-to-date' when versions match", async () => {
    existsSyncMock.mockReturnValue(true);
    readFileSyncMock.mockReturnValue("0.13.0\n");
    fetchMock.mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue([{ version: "0.13.0", commit_sha: "abc" }]),
    });

    const result = await checkForUpdate("https://example.supabase.co", "anon-key", "production");
    expect(result).toEqual({ status: "up-to-date" });
  });

  it("returns 'update-available' when remote is newer", async () => {
    existsSyncMock.mockReturnValue(true);
    readFileSyncMock.mockReturnValue("0.12.0\n");
    fetchMock.mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue([{ version: "0.13.0", commit_sha: "abc" }]),
    });

    const result = await checkForUpdate("https://example.supabase.co", "anon-key", "production");
    expect(result).toEqual({ status: "update-available", remoteVersion: "0.13.0" });
  });

  it("returns 'no-remote' when agent_versions is empty", async () => {
    existsSyncMock.mockReturnValue(true);
    readFileSyncMock.mockReturnValue("0.12.0\n");
    fetchMock.mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue([]),
    });

    const result = await checkForUpdate("https://example.supabase.co", "anon-key", "production");
    expect(result).toEqual({ status: "no-remote" });
  });

  it("returns 'update-available' when no .version file exists (first install)", async () => {
    existsSyncMock.mockReturnValue(false);
    fetchMock.mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue([{ version: "0.13.0", commit_sha: "abc" }]),
    });

    const result = await checkForUpdate("https://example.supabase.co", "anon-key", "production");
    expect(result).toEqual({ status: "update-available", remoteVersion: "0.13.0" });
  });
});
