/**
 * builds.ts — Pinned build management
 *
 * Manages the ~/.zazigv2/builds/ directory:
 *   current/   — the active production build
 *   previous/  — the last build (for rollback)
 */

import { execSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync, cpSync, renameSync, rmSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

const BUILDS_DIR = join(homedir(), ".zazigv2", "builds");
const CURRENT = join(BUILDS_DIR, "current");
const PREVIOUS = join(BUILDS_DIR, "previous");

export function getCurrentBuildSha(): string | null {
  const versionFile = join(CURRENT, ".version");
  if (!existsSync(versionFile)) return null;
  return readFileSync(versionFile, "utf-8").trim();
}

export function hasPinnedBuild(): boolean {
  return existsSync(join(CURRENT, "packages", "local-agent", "releases", "zazig-agent.mjs"));
}

export function pinCurrentBuild(repoRoot: string): void {
  const sha = execSync("git rev-parse HEAD", { cwd: repoRoot, encoding: "utf-8" }).trim();

  // Move current → previous
  if (existsSync(CURRENT)) {
    if (existsSync(PREVIOUS)) {
      rmSync(PREVIOUS, { recursive: true, force: true });
    }
    renameSync(CURRENT, PREVIOUS);
  }

  mkdirSync(CURRENT, { recursive: true });

  // Copy bundled agent artifacts (self-contained, no node_modules needed)
  const toCopy = [
    "packages/local-agent/releases/zazig-agent.mjs",
    "packages/local-agent/releases/agent-mcp-server.mjs",
  ];

  for (const rel of toCopy) {
    const src = join(repoRoot, rel);
    const dest = join(CURRENT, rel);
    if (existsSync(src)) {
      mkdirSync(join(dest, ".."), { recursive: true });
      cpSync(src, dest);
    }
  }

  // Copy project skills and config
  const extras = [
    "projects/skills",
    "zazig.environments.yaml",
  ];
  for (const rel of extras) {
    const src = join(repoRoot, rel);
    const dest = join(CURRENT, rel);
    if (existsSync(src)) {
      mkdirSync(join(dest, ".."), { recursive: true });
      cpSync(src, dest, { recursive: true });
    }
  }

  // Write version marker
  writeFileSync(join(CURRENT, ".version"), sha);
  console.log(`Build pinned: ${sha}`);
}

export function rollback(): boolean {
  if (!existsSync(PREVIOUS)) {
    console.error("No previous build to rollback to.");
    return false;
  }

  const tempDir = join(BUILDS_DIR, "swap-temp");
  if (existsSync(tempDir)) rmSync(tempDir, { recursive: true, force: true });

  renameSync(CURRENT, tempDir);
  renameSync(PREVIOUS, CURRENT);
  renameSync(tempDir, PREVIOUS);

  const sha = getCurrentBuildSha();
  console.log(`Rolled back to: ${sha ?? "unknown"}`);
  return true;
}
