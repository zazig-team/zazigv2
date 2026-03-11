import { execSync } from "node:child_process";

// In production builds, zazig promote injects this constant into the bundled entrypoint.
// On deploy, CI upserts the resolved version into the agent_versions table (env + version + commit_sha).
declare const AGENT_BUILD_HASH: string | undefined;

function runGitCommand(command: string, cwd?: string): string | null {
  try {
    const output = execSync(command, {
      encoding: "utf8",
      stdio: "pipe",
      cwd,
    }).trim();
    return output || null;
  } catch {
    return null;
  }
}

export function resolveAgentVersion(): string {
  const env = process.env["ZAZIG_ENV"] ?? "production";
  const repoRoot = process.env["ZAZIG_REPO_PATH"] ?? process.cwd();

  if (env === "staging") {
    const localAgentHash = runGitCommand(
      "git log -1 --format=%h -- packages/local-agent/",
      repoRoot,
    );
    if (localAgentHash) return localAgentHash;
  }

  if (typeof AGENT_BUILD_HASH !== "undefined" && AGENT_BUILD_HASH) {
    return AGENT_BUILD_HASH;
  }

  const headHash = runGitCommand("git rev-parse --short HEAD", repoRoot);
  if (headHash) return headHash;

  return "dev";
}
