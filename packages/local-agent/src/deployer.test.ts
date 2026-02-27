import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ExecFn } from "./deployer.js";
import {
  TestEnvDeployer,
  NetlifyAdapter,
  SupabaseAdapter,
  type DeployAdapter,
  type DeployResult,
} from "./deployer.js";

describe("TestEnvDeployer", () => {
  it("returns error when no adapter for projectType", async () => {
    const deployer = new TestEnvDeployer(new Map());

    const result = await deployer.deploy("feat/auth", "proj-1", "unknown");

    expect(result).toEqual({
      success: false,
      error: "No deploy adapter for unknown",
    });
  });

  it("delegates to adapter and returns its result", async () => {
    const mockAdapter: DeployAdapter = {
      deploy: vi.fn().mockResolvedValue({
        success: true,
        url: "https://example.com",
      } satisfies DeployResult),
    };

    const deployer = new TestEnvDeployer(
      new Map([["netlify", mockAdapter]]),
    );

    const result = await deployer.deploy("feat/auth", "proj-1", "netlify");

    expect(result).toEqual({ success: true, url: "https://example.com" });
    expect(mockAdapter.deploy).toHaveBeenCalledWith("feat/auth", "proj-1");
  });
});

describe("NetlifyAdapter", () => {
  let exec: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    exec = vi.fn().mockResolvedValue({ stdout: "", stderr: "" });
  });

  it("calls execFile with correct netlify args and returns success with url", async () => {
    exec.mockResolvedValue({ stdout: "Deploy complete", stderr: "" });

    const adapter = new NetlifyAdapter(exec as unknown as ExecFn, "my-site-id");
    const result = await adapter.deploy("feat/auth", "proj-1");

    expect(exec).toHaveBeenCalledWith(
      "netlify",
      ["deploy", "--branch=feat/auth", "--site=my-site-id", "--prod"],
      expect.any(Object),
    );
    expect(result).toEqual({
      success: true,
      url: "https://feat/auth--my-site-id.netlify.app",
    });
  });

  it("falls back to projectId when no siteId provided", async () => {
    exec.mockResolvedValue({ stdout: "", stderr: "" });

    const adapter = new NetlifyAdapter(exec as unknown as ExecFn);
    const result = await adapter.deploy("feat/auth", "proj-1");

    expect(exec).toHaveBeenCalledWith(
      "netlify",
      ["deploy", "--branch=feat/auth", "--site=proj-1", "--prod"],
      expect.any(Object),
    );
    expect(result).toEqual({
      success: true,
      url: "https://feat/auth--proj-1.netlify.app",
    });
  });

  it("returns failure result when execFile throws", async () => {
    exec.mockRejectedValue({ stdout: "", stderr: "Auth failed" });

    const adapter = new NetlifyAdapter(exec as unknown as ExecFn, "my-site-id");
    const result = await adapter.deploy("feat/auth", "proj-1");

    expect(result).toEqual({
      success: false,
      error: "Auth failed",
    });
  });
});

describe("SupabaseAdapter", () => {
  let exec: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    exec = vi.fn().mockResolvedValue({ stdout: "", stderr: "" });
  });

  it("calls execFile with correct supabase args and returns success", async () => {
    exec.mockResolvedValue({ stdout: "Deployed", stderr: "" });

    const adapter = new SupabaseAdapter(exec as unknown as ExecFn);
    const result = await adapter.deploy("feat/auth", "proj-ref-123");

    expect(exec).toHaveBeenCalledWith(
      "supabase",
      ["functions", "deploy", "--project-ref=proj-ref-123"],
      expect.any(Object),
    );
    expect(result).toEqual({
      success: true,
      url: "https://proj-ref-123.supabase.co",
    });
  });

  it("returns failure result when execFile throws", async () => {
    exec.mockRejectedValue({ stdout: "", stderr: "Connection refused" });

    const adapter = new SupabaseAdapter(exec as unknown as ExecFn);
    const result = await adapter.deploy("feat/auth", "proj-ref-123");

    expect(result).toEqual({
      success: false,
      error: "Connection refused",
    });
  });
});
