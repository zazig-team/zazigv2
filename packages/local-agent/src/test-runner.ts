/**
 * test-runner.ts — Test Environment Recipe Runner
 *
 * Handles the `deploy_to_test` message from the orchestrator:
 *   1. Reads `zazig.test.yaml` from the repo root
 *   2. Runs the deploy via the configured provider (vercel or custom)
 *   3. Runs a healthcheck (polls URL until 200 or timeout)
 *   4. Reports success/failure back to the orchestrator
 *   5. Runs teardown after testing is complete (ephemeral envs only)
 *
 * All deploy commands are run via `doppler run --project {name} --config prd --`
 * to ensure secrets are injected from Doppler.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { spawn } from "node:child_process";
import { parse as parseYaml } from "yaml";
import type { TestRecipe } from "@zazigv2/shared";
import type { DeployToTest, AgentMessage } from "@zazigv2/shared";
import { PROTOCOL_VERSION } from "@zazigv2/shared";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const RECIPE_FILENAME = "zazig.test.yaml";
const HEALTHCHECK_POLL_INTERVAL_MS = 5_000;
const DEFAULT_HEALTHCHECK_TIMEOUT_S = 120;
const DEPLOY_TIMEOUT_MS = 5 * 60_000; // 5 minutes

/**
 * Resolves a repo path for the test runner. If the path is a URL,
 * derives the local bare clone directory from ~/.zazigv2/repos/.
 * If it's already a local path, returns it as-is.
 */
function resolveRepoPath(repoPathOrUrl: string): string {
  if (repoPathOrUrl.startsWith("/")) return repoPathOrUrl;
  const repoName = repoPathOrUrl
    .replace(/\.git$/, "")
    .split("/")
    .pop() ?? "unknown";
  return join(homedir(), ".zazigv2", "repos", repoName);
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SendFn = (msg: AgentMessage) => Promise<void>;

export interface SpawnResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

/** Inject-able spawn function for testing. */
export type SpawnFn = (
  cmd: string,
  args: string[],
  opts: { cwd: string; timeout: number },
) => Promise<SpawnResult>;

/** Inject-able fetch function for testing. */
export type FetchFn = (url: string) => Promise<{ ok: boolean; status: number }>;

// ---------------------------------------------------------------------------
// TestRunner
// ---------------------------------------------------------------------------

export class TestRunner {
  private readonly machineId: string;
  private readonly send: SendFn;
  private readonly spawnCmd: SpawnFn;
  private readonly fetchUrl: FetchFn;

  constructor(
    machineId: string,
    send: SendFn,
    spawnCmd?: SpawnFn,
    fetchUrl?: FetchFn,
  ) {
    this.machineId = machineId;
    this.send = send;
    this.spawnCmd = spawnCmd ?? defaultSpawn;
    this.fetchUrl = fetchUrl ?? defaultFetch;
  }

  /**
   * Handle a deploy_to_test message end-to-end:
   * read recipe → deploy → healthcheck → report result.
   */
  async handleDeployToTest(msg: DeployToTest): Promise<void> {
    const repoPath = msg.repoPath ? resolveRepoPath(msg.repoPath) : process.cwd();
    const featureId = msg.featureId ?? "";

    // 1. Read recipe
    const recipe = readTestRecipe(repoPath);
    if (!recipe) {
      console.warn(`[test-runner] No ${RECIPE_FILENAME} found at ${repoPath}`);
      await this.send({
        type: "deploy_needs_config",
        protocolVersion: PROTOCOL_VERSION,
        featureId,
        machineId: this.machineId,
      });
      return;
    }

    console.log(`[test-runner] Recipe loaded: ${recipe.name} (${recipe.deploy.provider}, ${recipe.type})`);

    // 2. Deploy
    let deployUrl: string;
    try {
      deployUrl = await this.runDeploy(recipe, repoPath);
    } catch (err) {
      console.error(`[test-runner] Deploy failed for feature ${featureId}:`, err);
      await this.send({
        type: "deploy_failed",
        protocolVersion: PROTOCOL_VERSION,
        featureId,
        machineId: this.machineId,
        error: String(err instanceof Error ? err.message : err),
      });
      return;
    }

    console.log(`[test-runner] Deploy succeeded: ${deployUrl}`);

    // 3. Healthcheck
    if (recipe.healthcheck) {
      try {
        await this.runHealthcheck(deployUrl, recipe);
      } catch (err) {
        console.error(`[test-runner] Healthcheck failed for feature ${featureId}:`, err);
        await this.send({
          type: "deploy_failed",
          protocolVersion: PROTOCOL_VERSION,
          featureId,
          machineId: this.machineId,
          error: `Healthcheck failed: ${String(err instanceof Error ? err.message : err)}`,
        });
        return;
      }
      console.log(`[test-runner] Healthcheck passed for ${deployUrl}`);
    }

    // 4. Report success
    await this.send({
      type: "deploy_complete",
      protocolVersion: PROTOCOL_VERSION,
      featureId,
      machineId: this.machineId,
      testUrl: deployUrl,
      ephemeral: recipe.type === "ephemeral",
    });
  }

  /**
   * Run teardown for the test environment. Called after approve/reject.
   * No-op for persistent environments or missing teardown config.
   */
  async runTeardown(repoPath: string): Promise<void> {
    const recipe = readTestRecipe(repoPath);
    if (!recipe) return;
    if (recipe.type !== "ephemeral") return;
    if (!recipe.teardown?.script) return;

    console.log(`[test-runner] Running teardown: ${recipe.teardown.script}`);
    const result = await this.spawnCmd(
      "doppler",
      ["run", "--project", recipe.name, "--config", "prd", "--", "bash", "-c", recipe.teardown.script],
      { cwd: repoPath, timeout: DEPLOY_TIMEOUT_MS },
    );

    if (result.exitCode !== 0) {
      console.warn(`[test-runner] Teardown exited with code ${result.exitCode}: ${result.stderr}`);
    } else {
      console.log("[test-runner] Teardown complete");
    }
  }

  // ---------------------------------------------------------------------------
  // Private: Deploy
  // ---------------------------------------------------------------------------

  private async runDeploy(recipe: TestRecipe, repoPath: string): Promise<string> {
    switch (recipe.deploy.provider) {
      case "vercel":
        return this.deployVercel(recipe, repoPath);
      case "custom":
        return this.deployCustom(recipe, repoPath);
      default:
        throw new Error(`Unsupported provider: ${recipe.deploy.provider}`);
    }
  }

  private async deployVercel(recipe: TestRecipe, repoPath: string): Promise<string> {
    const args = ["run", "--project", recipe.name, "--config", "prd", "--"];
    args.push("vercel", "deploy", "--yes");

    if (recipe.deploy.project_id) {
      args.push(`--project-id=${recipe.deploy.project_id}`);
    }
    if (recipe.deploy.team_id) {
      args.push(`--scope=${recipe.deploy.team_id}`);
    }

    const result = await this.spawnCmd("doppler", args, {
      cwd: repoPath,
      timeout: DEPLOY_TIMEOUT_MS,
    });

    if (result.exitCode !== 0) {
      throw new Error(`Vercel deploy failed (exit ${result.exitCode}): ${result.stderr}`);
    }

    // Vercel outputs the deploy URL on the last non-empty line of stdout
    const url = extractUrl(result.stdout);
    if (!url) {
      throw new Error("Could not extract deploy URL from Vercel output");
    }
    return url;
  }

  private async deployCustom(recipe: TestRecipe, repoPath: string): Promise<string> {
    if (!recipe.deploy.script) {
      throw new Error("Custom provider requires deploy.script in zazig.test.yaml");
    }

    const result = await this.spawnCmd(
      "doppler",
      ["run", "--project", recipe.name, "--config", "prd", "--", "bash", "-c", recipe.deploy.script],
      { cwd: repoPath, timeout: DEPLOY_TIMEOUT_MS },
    );

    if (result.exitCode !== 0) {
      throw new Error(`Custom deploy script failed (exit ${result.exitCode}): ${result.stderr}`);
    }

    // Custom scripts output the URL to stdout
    const url = extractUrl(result.stdout);
    if (!url) {
      throw new Error("Custom deploy script did not output a URL on stdout");
    }
    return url;
  }

  // ---------------------------------------------------------------------------
  // Private: Healthcheck
  // ---------------------------------------------------------------------------

  private async runHealthcheck(deployUrl: string, recipe: TestRecipe): Promise<void> {
    if (!recipe.healthcheck) return;

    const healthUrl = `${deployUrl.replace(/\/+$/, "")}${recipe.healthcheck.path}`;
    const timeoutMs = (recipe.healthcheck.timeout ?? DEFAULT_HEALTHCHECK_TIMEOUT_S) * 1000;
    const deadline = Date.now() + timeoutMs;

    console.log(`[test-runner] Polling healthcheck: ${healthUrl} (timeout: ${timeoutMs / 1000}s)`);

    while (Date.now() < deadline) {
      try {
        const res = await this.fetchUrl(healthUrl);
        if (res.ok) return;
        console.log(`[test-runner] Healthcheck returned ${res.status}, retrying...`);
      } catch (err) {
        console.log(`[test-runner] Healthcheck fetch error: ${String(err)}, retrying...`);
      }
      await sleep(HEALTHCHECK_POLL_INTERVAL_MS);
    }

    throw new Error(`Healthcheck timed out after ${timeoutMs / 1000}s: ${healthUrl}`);
  }
}

// ---------------------------------------------------------------------------
// Recipe reader
// ---------------------------------------------------------------------------

/**
 * Read and parse zazig.test.yaml from the given repo root.
 * Returns null if the file doesn't exist.
 */
export function readTestRecipe(repoPath: string): TestRecipe | null {
  const filePath = join(repoPath, RECIPE_FILENAME);
  let raw: string;
  try {
    raw = readFileSync(filePath, "utf-8");
  } catch {
    return null;
  }

  const parsed = parseYaml(raw) as TestRecipe;

  // Basic validation
  if (!parsed.name || !parsed.deploy?.provider) {
    console.warn(`[test-runner] Invalid ${RECIPE_FILENAME}: missing name or deploy.provider`);
    return null;
  }

  if (!["ephemeral", "persistent"].includes(parsed.type)) {
    console.warn(`[test-runner] Invalid ${RECIPE_FILENAME}: type must be ephemeral or persistent`);
    return null;
  }

  if (!["vercel", "custom"].includes(parsed.deploy.provider)) {
    console.warn(`[test-runner] Unsupported provider: ${parsed.deploy.provider}`);
    return null;
  }

  return parsed;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Extract a URL from command output. Looks for the last line containing http(s)://.
 */
export function extractUrl(output: string): string | null {
  const lines = output.trim().split("\n").reverse();
  for (const line of lines) {
    const match = line.match(/(https?:\/\/\S+)/);
    if (match) return match[1];
  }
  return null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Default spawn implementation using child_process.spawn.
 * Captures stdout/stderr and resolves when the process exits.
 */
function defaultSpawn(
  cmd: string,
  args: string[],
  opts: { cwd: string; timeout: number },
): Promise<SpawnResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      cwd: opts.cwd,
      stdio: ["ignore", "pipe", "pipe"],
      timeout: opts.timeout,
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (data: Buffer) => {
      stdout += data.toString();
    });

    child.stderr.on("data", (data: Buffer) => {
      stderr += data.toString();
    });

    child.on("error", (err) => reject(err));

    child.on("close", (code) => {
      resolve({ stdout, stderr, exitCode: code ?? 1 });
    });
  });
}

async function defaultFetch(url: string): Promise<{ ok: boolean; status: number }> {
  const res = await fetch(url);
  return { ok: res.ok, status: res.status };
}
