/**
 * hotfix.ts — Quick fix that commits directly to master.
 *
 * Opens an interactive Claude session scoped to a hotfix.
 * After the agent makes changes, commits to master.
 * CI then auto-deploys to staging.
 */

import { execSync, spawnSync } from "node:child_process";

export async function hotfix(args: string[]): Promise<void> {
  const description = args.join(" ");

  if (!description) {
    console.error("Usage: zazig hotfix \"description of the fix\"");
    process.exitCode = 1;
    return;
  }

  // Safety: must be on master and clean
  try {
    const branch = execSync("git rev-parse --abbrev-ref HEAD", { encoding: "utf-8" }).trim();
    if (branch !== "master" && branch !== "main") {
      console.error(`Must be on master/main for hotfix. Currently on: ${branch}`);
      process.exitCode = 1;
      return;
    }

    const status = execSync("git status --porcelain", { encoding: "utf-8" }).trim();
    if (status) {
      console.error("Working tree is dirty. Commit or stash changes first.");
      process.exitCode = 1;
      return;
    }

    // Pull latest
    execSync("git pull origin " + branch, { stdio: "inherit" });
  } catch (err) {
    console.error(`Git check failed: ${String(err)}`);
    process.exitCode = 1;
    return;
  }

  console.log(`\nStarting hotfix session: ${description}`);
  console.log("Make your changes. When you're done, the agent will commit to master.\n");

  // Launch interactive Claude session with hotfix context
  const prompt = [
    `You are performing a hotfix. The task: ${description}`,
    "",
    "Rules:",
    "- Make the minimal change needed to fix the issue",
    "- When done, commit your changes with a message starting with 'hotfix:'",
    "- Do NOT create a feature branch — commit directly to master",
    "- Run npm run build after changes to verify it compiles",
  ].join("\n");

  const result = spawnSync("claude", ["--model", "claude-sonnet-4-6", "-p", prompt], {
    stdio: "inherit",
    cwd: process.cwd(),
  });

  if (result.status !== 0) {
    console.error("Hotfix session failed.");
    process.exitCode = 1;
    return;
  }

  console.log("\nHotfix committed. CI will deploy to staging automatically.");
  console.log("Test on staging, then run: zazig promote");
}
