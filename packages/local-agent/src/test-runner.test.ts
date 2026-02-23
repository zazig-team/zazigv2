import { beforeEach, describe, expect, it, vi } from "vitest";
import { TestRunner, readTestRecipe, extractUrl } from "./test-runner.js";
import type { SpawnResult, SpawnFn, FetchFn } from "./test-runner.js";
import type { DeployToTest, AgentMessage } from "@zazigv2/shared";
import { PROTOCOL_VERSION } from "@zazigv2/shared";
import { writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeDeployMsg(overrides: Partial<DeployToTest> = {}): DeployToTest {
  return {
    type: "deploy_to_test",
    protocolVersion: PROTOCOL_VERSION,
    featureId: "feat-123",
    jobType: "feature",
    featureBranch: "feat/my-feature",
    projectId: "proj-abc",
    ...overrides,
  };
}

function createTempRepo(recipe?: Record<string, unknown>): string {
  const dir = join(tmpdir(), `test-runner-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(dir, { recursive: true });
  if (recipe) {
    // Write YAML manually to avoid import issues
    const yaml = Object.entries(recipe)
      .map(([k, v]) => {
        if (typeof v === "object" && v !== null) {
          const inner = Object.entries(v as Record<string, unknown>)
            .map(([ik, iv]) => `  ${ik}: ${iv}`)
            .join("\n");
          return `${k}:\n${inner}`;
        }
        return `${k}: ${v}`;
      })
      .join("\n");
    writeFileSync(join(dir, "zazig.test.yaml"), yaml);
  }
  return dir;
}

function cleanTempRepo(dir: string): void {
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    // best-effort
  }
}

// ---------------------------------------------------------------------------
// Tests: extractUrl
// ---------------------------------------------------------------------------

describe("extractUrl", () => {
  it("extracts URL from stdout with prefix text", () => {
    const output = "Deploying...\nReady\nhttps://my-app-abc123.vercel.app\n";
    expect(extractUrl(output)).toBe("https://my-app-abc123.vercel.app");
  });

  it("extracts URL from the last line containing http", () => {
    const output = "https://old-url.com\nhttps://new-url.com\n";
    expect(extractUrl(output)).toBe("https://new-url.com");
  });

  it("returns null for no URL", () => {
    expect(extractUrl("no urls here\njust text")).toBeNull();
  });

  it("handles HTTP URLs", () => {
    expect(extractUrl("http://localhost:3000")).toBe("http://localhost:3000");
  });
});

// ---------------------------------------------------------------------------
// Tests: readTestRecipe
// ---------------------------------------------------------------------------

describe("readTestRecipe", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = "";
  });

  it("returns null when file does not exist", () => {
    tempDir = createTempRepo();
    expect(readTestRecipe(tempDir)).toBeNull();
    cleanTempRepo(tempDir);
  });

  it("parses a valid vercel recipe", () => {
    tempDir = createTempRepo();
    writeFileSync(
      join(tempDir, "zazig.test.yaml"),
      [
        "name: my-project",
        "type: ephemeral",
        "deploy:",
        "  provider: vercel",
        "  project_id: prj_123",
        "healthcheck:",
        "  path: /api/health",
        "  timeout: 60",
      ].join("\n"),
    );

    const recipe = readTestRecipe(tempDir);
    expect(recipe).not.toBeNull();
    expect(recipe!.name).toBe("my-project");
    expect(recipe!.type).toBe("ephemeral");
    expect(recipe!.deploy.provider).toBe("vercel");
    expect(recipe!.deploy.project_id).toBe("prj_123");
    expect(recipe!.healthcheck?.path).toBe("/api/health");
    expect(recipe!.healthcheck?.timeout).toBe(60);
    cleanTempRepo(tempDir);
  });

  it("parses a valid custom recipe", () => {
    tempDir = createTempRepo();
    writeFileSync(
      join(tempDir, "zazig.test.yaml"),
      [
        "name: custom-app",
        "type: persistent",
        "deploy:",
        "  provider: custom",
        "  script: ./deploy.sh",
        "  url_output: stdout",
      ].join("\n"),
    );

    const recipe = readTestRecipe(tempDir);
    expect(recipe).not.toBeNull();
    expect(recipe!.name).toBe("custom-app");
    expect(recipe!.type).toBe("persistent");
    expect(recipe!.deploy.provider).toBe("custom");
    expect(recipe!.deploy.script).toBe("./deploy.sh");
    cleanTempRepo(tempDir);
  });

  it("returns null for unsupported provider", () => {
    tempDir = createTempRepo();
    writeFileSync(
      join(tempDir, "zazig.test.yaml"),
      ["name: bad", "type: ephemeral", "deploy:", "  provider: docker"].join("\n"),
    );

    expect(readTestRecipe(tempDir)).toBeNull();
    cleanTempRepo(tempDir);
  });
});

// ---------------------------------------------------------------------------
// Tests: TestRunner
// ---------------------------------------------------------------------------

describe("TestRunner", () => {
  let sentMessages: AgentMessage[];
  let mockSpawn: ReturnType<typeof vi.fn>;
  let mockFetch: ReturnType<typeof vi.fn>;
  let runner: TestRunner;

  beforeEach(() => {
    sentMessages = [];
    mockSpawn = vi.fn<SpawnFn>().mockResolvedValue({
      stdout: "https://preview.example.com\n",
      stderr: "",
      exitCode: 0,
    } satisfies SpawnResult);
    mockFetch = vi.fn<FetchFn>().mockResolvedValue({ ok: true, status: 200 });
    runner = new TestRunner(
      "machine-1",
      async (msg) => { sentMessages.push(msg); },
      mockSpawn as unknown as SpawnFn,
      mockFetch as unknown as FetchFn,
    );
  });

  it("sends deploy_needs_config when no recipe file exists", async () => {
    const tempDir = createTempRepo(); // no recipe file
    const msg = makeDeployMsg({ repoPath: tempDir });

    await runner.handleDeployToTest(msg);

    expect(sentMessages).toHaveLength(1);
    expect(sentMessages[0].type).toBe("deploy_needs_config");
    cleanTempRepo(tempDir);
  });

  it("deploys with vercel provider and sends deploy_complete", async () => {
    const tempDir = createTempRepo();
    writeFileSync(
      join(tempDir, "zazig.test.yaml"),
      [
        "name: my-app",
        "type: ephemeral",
        "deploy:",
        "  provider: vercel",
        "  project_id: prj_test",
      ].join("\n"),
    );

    const msg = makeDeployMsg({ repoPath: tempDir });
    await runner.handleDeployToTest(msg);

    expect(mockSpawn).toHaveBeenCalledTimes(1);
    const [cmd, args] = mockSpawn.mock.calls[0];
    expect(cmd).toBe("doppler");
    expect(args).toContain("vercel");
    expect(args).toContain("deploy");

    expect(sentMessages).toHaveLength(1);
    expect(sentMessages[0].type).toBe("deploy_complete");
    const complete = sentMessages[0] as { testUrl: string; ephemeral: boolean };
    expect(complete.testUrl).toBe("https://preview.example.com");
    expect(complete.ephemeral).toBe(true);
    cleanTempRepo(tempDir);
  });

  it("deploys with custom provider and sends deploy_complete", async () => {
    const tempDir = createTempRepo();
    writeFileSync(
      join(tempDir, "zazig.test.yaml"),
      [
        "name: custom-app",
        "type: persistent",
        "deploy:",
        "  provider: custom",
        "  script: ./deploy.sh",
      ].join("\n"),
    );

    const msg = makeDeployMsg({ repoPath: tempDir });
    await runner.handleDeployToTest(msg);

    expect(mockSpawn).toHaveBeenCalledTimes(1);
    const [cmd, args] = mockSpawn.mock.calls[0];
    expect(cmd).toBe("doppler");
    expect(args).toContain("bash");

    expect(sentMessages).toHaveLength(1);
    expect(sentMessages[0].type).toBe("deploy_complete");
    const complete = sentMessages[0] as { ephemeral: boolean };
    expect(complete.ephemeral).toBe(false);
    cleanTempRepo(tempDir);
  });

  it("sends deploy_failed when deploy command fails", async () => {
    mockSpawn.mockResolvedValue({ stdout: "", stderr: "auth error", exitCode: 1 });

    const tempDir = createTempRepo();
    writeFileSync(
      join(tempDir, "zazig.test.yaml"),
      [
        "name: fail-app",
        "type: ephemeral",
        "deploy:",
        "  provider: vercel",
      ].join("\n"),
    );

    const msg = makeDeployMsg({ repoPath: tempDir });
    await runner.handleDeployToTest(msg);

    expect(sentMessages).toHaveLength(1);
    expect(sentMessages[0].type).toBe("deploy_failed");
    cleanTempRepo(tempDir);
  });

  it("sends deploy_failed when healthcheck times out", async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 503 });

    const tempDir = createTempRepo();
    writeFileSync(
      join(tempDir, "zazig.test.yaml"),
      [
        "name: health-app",
        "type: ephemeral",
        "deploy:",
        "  provider: vercel",
        "healthcheck:",
        "  path: /health",
        "  timeout: 0",
      ].join("\n"),
    );

    const msg = makeDeployMsg({ repoPath: tempDir });
    await runner.handleDeployToTest(msg);

    expect(sentMessages).toHaveLength(1);
    expect(sentMessages[0].type).toBe("deploy_failed");
    const failed = sentMessages[0] as { error: string };
    expect(failed.error).toContain("Healthcheck");
    cleanTempRepo(tempDir);
  });

  it("passes healthcheck when fetch returns 200", async () => {
    const tempDir = createTempRepo();
    writeFileSync(
      join(tempDir, "zazig.test.yaml"),
      [
        "name: healthy-app",
        "type: ephemeral",
        "deploy:",
        "  provider: vercel",
        "healthcheck:",
        "  path: /api/health",
        "  timeout: 30",
      ].join("\n"),
    );

    const msg = makeDeployMsg({ repoPath: tempDir });
    await runner.handleDeployToTest(msg);

    expect(mockFetch).toHaveBeenCalledWith("https://preview.example.com/api/health");
    expect(sentMessages).toHaveLength(1);
    expect(sentMessages[0].type).toBe("deploy_complete");
    cleanTempRepo(tempDir);
  });

  it("runs teardown for ephemeral envs", async () => {
    const tempDir = createTempRepo();
    writeFileSync(
      join(tempDir, "zazig.test.yaml"),
      [
        "name: teardown-app",
        "type: ephemeral",
        "deploy:",
        "  provider: custom",
        "  script: ./deploy.sh",
        "teardown:",
        "  script: ./teardown.sh",
      ].join("\n"),
    );

    await runner.runTeardown(tempDir);

    expect(mockSpawn).toHaveBeenCalledTimes(1);
    const [cmd, args] = mockSpawn.mock.calls[0];
    expect(cmd).toBe("doppler");
    expect(args).toContain("./teardown.sh");
    cleanTempRepo(tempDir);
  });

  it("skips teardown for persistent envs", async () => {
    const tempDir = createTempRepo();
    writeFileSync(
      join(tempDir, "zazig.test.yaml"),
      [
        "name: persist-app",
        "type: persistent",
        "deploy:",
        "  provider: vercel",
        "teardown:",
        "  script: ./teardown.sh",
      ].join("\n"),
    );

    await runner.runTeardown(tempDir);
    expect(mockSpawn).not.toHaveBeenCalled();
    cleanTempRepo(tempDir);
  });
});
