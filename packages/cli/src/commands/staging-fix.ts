/**
 * staging-fix.ts — Interactive agent session for fixing staging issues.
 *
 * Opens an interactive Claude session pre-loaded with staging context.
 * Agent can read staging DB, deploy to staging, and commit fixes to master.
 */

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

export async function stagingFix(): Promise<void> {
  const repoRoot = process.cwd();

  // Build staging context
  const contextParts: string[] = [
    "# Staging Fix Session",
    "",
    "You are an interactive agent for fixing issues found during staging testing.",
    "You have access to the staging environment.",
    "",
    "## What you can do:",
    "- Read and query the staging database",
    "- Edit code to fix bugs",
    "- Run npm run build to verify changes compile",
    "- Commit fixes to master",
    "- Deploy edge functions to staging for immediate testing",
    "",
    "## Rules:",
    "- Make minimal, focused fixes",
    "- Always run npm run build after changes",
    "- Commit with message starting with 'fix:' or 'hotfix:'",
    "- Do NOT modify production — only staging",
    "- After committing, CI will auto-deploy to staging",
  ];

  // Add environments.yaml context if present
  const envPath = resolve(repoRoot, "zazig.environments.yaml");
  if (existsSync(envPath)) {
    contextParts.push("");
    contextParts.push("## Environment Config:");
    contextParts.push("```yaml");
    contextParts.push(readFileSync(envPath, "utf-8"));
    contextParts.push("```");
  }

  console.log("Starting staging fix session...");
  console.log("Describe the issue you found on staging. Type /exit when done.\n");

  const result = spawnSync("claude", ["--model", "claude-sonnet-4-6", "--system-prompt", contextParts.join("\n")], {
    stdio: "inherit",
    cwd: repoRoot,
    env: {
      ...process.env,
      ZAZIG_ENV: "staging",
    },
  });

  if (result.status !== 0 && result.status !== null) {
    console.error("Staging fix session ended with errors.");
    process.exitCode = 1;
  }

  console.log("\nStaging fix session ended.");
}
