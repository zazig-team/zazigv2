/**
 * promote.ts — Push tested staging build to production.
 *
 * Flow: authenticate → pick company → pick project → resolve repo →
 * create temp worktree → build → bundle CLI → commit → fast-forward
 * production → pin build → cleanup.
 *
 * Supabase migrations and edge functions are deployed by GitHub Actions
 * when the production branch is pushed.
 */

import { execSync } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { createInterface } from "node:readline/promises";
import { getValidCredentials } from "../lib/credentials.js";
import { fetchUserCompanies, pickCompany } from "../lib/company-picker.js";
import { DEFAULT_SUPABASE_ANON_KEY } from "../lib/constants.js";
import { pinCurrentBuild, rollback as rollbackBuild } from "../lib/builds.js";

const REPOS_BASE = join(homedir(), ".zazigv2", "repos");

interface Project {
  id: string;
  name: string;
  repo_url: string;
}

async function fetchProjects(
  supabaseUrl: string,
  anonKey: string,
  accessToken: string,
  companyId: string
): Promise<Project[]> {
  const res = await fetch(
    `${supabaseUrl}/rest/v1/projects?select=id,name,repo_url&company_id=eq.${companyId}`,
    {
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${accessToken}`,
      },
    }
  );
  if (!res.ok) throw new Error(`Failed to fetch projects: HTTP ${res.status}`);
  return (await res.json()) as Project[];
}

async function pickProject(projects: Project[]): Promise<Project> {
  if (projects.length === 0) {
    throw new Error("No projects found for this company.");
  }
  if (projects.length === 1) {
    return projects[0]!;
  }

  console.log("\nWhich project?\n");
  for (let i = 0; i < projects.length; i++) {
    console.log(`  ${i + 1}. ${projects[i]!.name}`);
  }

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const ans = await rl.question(`\nChoice [1]: `);
    const idx = (parseInt(ans.trim(), 10) || 1) - 1;
    if (idx < 0 || idx >= projects.length) {
      throw new Error("Invalid choice.");
    }
    return projects[idx]!;
  } finally {
    rl.close();
  }
}

/**
 * Resolve the default branch in a bare repo (main or master).
 */
function resolveDefaultBranch(repoDir: string): string {
  try {
    const ref = execSync("git symbolic-ref HEAD", { encoding: "utf-8", cwd: repoDir }).trim();
    return ref.replace(/^refs\/heads\//, "");
  } catch { /* fallback */ }
  for (const name of ["main", "master"]) {
    try {
      execSync(`git rev-parse --verify refs/heads/${name}`, { cwd: repoDir, stdio: "pipe" });
      return name;
    } catch { continue; }
  }
  throw new Error(`Cannot resolve default branch in ${repoDir}`);
}

export async function promote(args: string[]): Promise<void> {
  // Handle --rollback (doesn't need company/project)
  if (args.includes("--rollback")) {
    const ok = rollbackBuild();
    process.exitCode = ok ? 0 : 1;
    return;
  }

  // 1. Authenticate
  let creds;
  try {
    creds = await getValidCredentials();
  } catch {
    console.error("Not logged in. Run 'zazig login' first.");
    process.exitCode = 1;
    return;
  }

  const anonKey = process.env["SUPABASE_ANON_KEY"] ?? DEFAULT_SUPABASE_ANON_KEY;

  // 2. Pick company
  let companies;
  try {
    companies = await fetchUserCompanies(creds.supabaseUrl, anonKey, creds.accessToken);
  } catch (err) {
    console.error(`Failed to fetch companies: ${String(err)}`);
    console.error("Your session may have expired. Run 'zazig login' and try again.");
    process.exitCode = 1;
    return;
  }
  const company = await pickCompany(companies);
  console.log(`\nCompany: ${company.name}`);

  // 3. Pick project
  const projects = await fetchProjects(creds.supabaseUrl, anonKey, creds.accessToken, company.id);
  const project = await pickProject(projects);
  console.log(`Project: ${project.name}`);

  // 4. Find the bare repo clone
  const bareRepoDir = join(REPOS_BASE, project.name);
  if (!existsSync(bareRepoDir)) {
    console.error(`No local repo clone found at ${bareRepoDir}.`);
    console.error("Run 'zazig start' first to clone the project repo.");
    process.exitCode = 1;
    return;
  }

  // 5. Fetch latest from origin
  console.log("\nFetching latest from origin...");
  try {
    execSync("git fetch origin", { cwd: bareRepoDir, stdio: "pipe" });
  } catch (err) {
    console.warn(`Fetch warning (non-fatal): ${String(err)}`);
  }

  // 6. Create a temporary worktree from the bare clone on master/main
  const defaultBranch = resolveDefaultBranch(bareRepoDir);
  const worktreePath = join(homedir(), ".zazigv2", "worktrees", "promote-tmp");

  // Clean up any stale promote worktree
  try { execSync(`git worktree remove --force "${worktreePath}"`, { cwd: bareRepoDir, stdio: "pipe" }); } catch { /* */ }
  try { rmSync(worktreePath, { recursive: true, force: true }); } catch { /* */ }
  try { execSync("git worktree prune", { cwd: bareRepoDir, stdio: "pipe" }); } catch { /* */ }

  console.log(`Creating worktree on ${defaultBranch}...`);
  try {
    execSync(`git worktree add "${worktreePath}" ${defaultBranch}`, { cwd: bareRepoDir, stdio: "pipe" });
  } catch (err) {
    console.error(`Failed to create worktree: ${String(err)}`);
    process.exitCode = 1;
    return;
  }

  const repoRoot = worktreePath;

  try {
    await runPromote(repoRoot, defaultBranch);
  } finally {
    // Cleanup worktree
    console.log("\nCleaning up temporary worktree...");
    try { execSync(`git worktree remove --force "${worktreePath}"`, { cwd: bareRepoDir, stdio: "pipe" }); } catch { /* */ }
    try { rmSync(worktreePath, { recursive: true, force: true }); } catch { /* */ }
    try { execSync("git worktree prune", { cwd: bareRepoDir, stdio: "pipe" }); } catch { /* */ }
  }
}

async function runPromote(repoRoot: string, defaultBranch: string): Promise<void> {
  // 1. Safety checks — verify worktree is on the default branch
  try {
    const branch = execSync("git rev-parse --abbrev-ref HEAD", { encoding: "utf-8", cwd: repoRoot }).trim();
    if (branch !== defaultBranch) {
      console.error(`Worktree is on ${branch}, expected ${defaultBranch}.`);
      process.exitCode = 1;
      return;
    }

    // In a bare-repo worktree, origin/* refs don't exist — the fetch already
    // updated refs/heads/master directly, so the worktree is up-to-date.
    // Only compare if origin/<branch> actually resolves.
    try {
      const local = execSync("git rev-parse HEAD", { encoding: "utf-8", cwd: repoRoot }).trim();
      const remote = execSync(`git rev-parse origin/${branch}`, { encoding: "utf-8", cwd: repoRoot, stdio: ["pipe", "pipe", "pipe"] }).trim();
      if (local !== remote) {
        console.error(`Local ${branch} (${local.slice(0, 7)}) differs from origin (${remote.slice(0, 7)}).`);
        process.exitCode = 1;
        return;
      }
    } catch {
      // No origin/<branch> ref — bare repo, already up to date from fetch.
    }
  } catch (err) {
    console.error(`Git check failed: ${String(err)}`);
    process.exitCode = 1;
    return;
  }

  // 2. Install dependencies and build
  console.log("\nInstalling dependencies...");
  try {
    execSync("npm ci", { cwd: repoRoot, stdio: "inherit" });
  } catch {
    console.error("npm ci failed.");
    process.exitCode = 1;
    return;
  }

  console.log("\nRunning build...");
  try {
    execSync("npm run build", { cwd: repoRoot, stdio: "inherit" });
  } catch {
    console.error("Build failed. Fix build errors before promoting.");
    process.exitCode = 1;
    return;
  }

  // 3. Bundle CLI
  console.log("\nBundling CLI...");
  try {
    execSync("node packages/cli/scripts/bundle.js", { cwd: repoRoot, stdio: "inherit" });
  } catch {
    console.error("Bundle failed.");
    process.exitCode = 1;
    return;
  }

  // 4. Commit bundle to master if changed, push
  console.log("\nCommitting bundle...");
  try {
    execSync("git add packages/cli/releases/zazig.mjs", { cwd: repoRoot, stdio: "pipe" });
    const diff = execSync("git diff --cached --name-only", { encoding: "utf-8", cwd: repoRoot }).trim();
    if (diff) {
      execSync('git commit -m "chore: update production CLI bundle"', { cwd: repoRoot, stdio: "pipe" });
      execSync(`git push origin ${defaultBranch}`, { cwd: repoRoot, stdio: "pipe" });
      console.log("Bundle committed and pushed.");
    } else {
      console.log("Bundle unchanged, skipping commit.");
    }
  } catch (err) {
    console.error(`Bundle commit/push failed: ${String(err)}`);
    process.exitCode = 1;
    return;
  }

  // 5. Fast-forward production branch (triggers production CI)
  console.log("\nUpdating production branch...");
  try {
    // Ensure production branch exists locally
    try {
      execSync("git rev-parse --verify production", { cwd: repoRoot, stdio: "pipe" });
    } catch {
      try {
        execSync("git branch production origin/production", { cwd: repoRoot, stdio: "pipe" });
      } catch {
        execSync("git branch production", { cwd: repoRoot, stdio: "pipe" });
      }
    }

    // Checkout production branch, fast-forward merge, push, return
    execSync("git checkout production", { cwd: repoRoot, stdio: "pipe" });
    try {
      execSync(`git merge ${defaultBranch} --ff-only`, { cwd: repoRoot, stdio: "pipe" });
    } catch {
      execSync(`git checkout ${defaultBranch}`, { cwd: repoRoot, stdio: "pipe" });
      console.error(
        "Fast-forward merge into production failed. The production branch has diverged from master.\n" +
        "To fix: git checkout production && git reset --hard master && git push --force-with-lease origin production"
      );
      process.exitCode = 1;
      return;
    }
    execSync("git push origin production", { cwd: repoRoot, stdio: "pipe" });
    execSync(`git checkout ${defaultBranch}`, { cwd: repoRoot, stdio: "pipe" });
    console.log("Production branch updated and pushed (triggers CI for Supabase deployment).");
  } catch (err) {
    try { execSync(`git checkout ${defaultBranch}`, { cwd: repoRoot, stdio: "pipe" }); } catch { /* best-effort */ }
    console.error(`Production branch update failed: ${String(err)}`);
    process.exitCode = 1;
    return;
  }

  // 6. Pin local agent build
  console.log("\nPinning local agent build...");
  pinCurrentBuild(repoRoot);

  const sha = execSync("git rev-parse --short HEAD", { encoding: "utf-8", cwd: repoRoot }).trim();
  console.log(`\nPromoted to production (${sha}).`);
  console.log("CI will deploy Supabase migrations and edge functions.");
  console.log("Restart your production agent to use the new build: zazig stop && zazig start");
}
