/**
 * promote.ts — Push tested staging build to production.
 *
 * Flow: authenticate → pick company → pick project → resolve repo →
 * create temp worktree → build → bump versions → bundle CLI + agent → commit → fast-forward
 * production → pin build → cleanup.
 *
 * Supabase migrations and edge functions are deployed by GitHub Actions
 * when the production branch is pushed.
 */

import { execSync } from "node:child_process";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { createInterface } from "node:readline/promises";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getValidCredentials, type Credentials } from "../lib/credentials.js";
import { fetchUserCompanies, pickCompany } from "../lib/company-picker.js";
import { DEFAULT_SUPABASE_ANON_KEY } from "../lib/constants.js";
import { rollbackBinaries } from "../lib/builds.js";

const REPOS_BASE = join(homedir(), ".zazigv2", "repos");

interface Project {
  id: string;
  name: string;
  repo_url: string;
}

interface PackageJson {
  version?: string;
  [key: string]: unknown;
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

function readJsonFile<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf-8")) as T;
}

function writeJsonFile(path: string, data: unknown): void {
  writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`);
}

function bumpMinorVersion(version: string): string {
  const parts = version.split(".");
  if (parts.length !== 3) {
    throw new Error(`Invalid semver '${version}'. Expected format major.minor.patch.`);
  }

  const major = Number.parseInt(parts[0]!, 10);
  const minor = Number.parseInt(parts[1]!, 10);
  const patch = Number.parseInt(parts[2]!, 10);

  if (
    Number.isNaN(major) ||
    Number.isNaN(minor) ||
    Number.isNaN(patch) ||
    major < 0 ||
    minor < 0 ||
    patch < 0
  ) {
    throw new Error(`Invalid semver '${version}'. Expected numeric major.minor.patch.`);
  }

  return `${major}.${minor + 1}.0`;
}

function bumpAgentPackageVersions(repoRoot: string): string {
  const cliPackagePath = join(repoRoot, "packages", "cli", "package.json");
  const localAgentPackagePath = join(repoRoot, "packages", "local-agent", "package.json");

  const cliPackage = readJsonFile<PackageJson>(cliPackagePath);
  if (typeof cliPackage.version !== "string") {
    throw new Error("packages/cli/package.json is missing a valid version field.");
  }

  const newVersion = bumpMinorVersion(cliPackage.version);
  const localAgentPackage = readJsonFile<PackageJson>(localAgentPackagePath);

  cliPackage.version = newVersion;
  localAgentPackage.version = newVersion;

  writeJsonFile(cliPackagePath, cliPackage);
  writeJsonFile(localAgentPackagePath, localAgentPackage);

  return newVersion;
}

function resolveAgentBuildHash(repoRoot: string): string {
  let agentBuildHash = "";
  try {
    agentBuildHash = execSync("git log -1 --format=%h -- packages/local-agent/", {
      encoding: "utf-8",
      cwd: repoRoot,
      stdio: "pipe",
    }).trim();
  } catch {
    // Fall through to HEAD fallback.
  }

  if (agentBuildHash) {
    return agentBuildHash;
  }

  const headHash = execSync("git rev-parse --short HEAD", {
    encoding: "utf-8",
    cwd: repoRoot,
    stdio: "pipe",
  }).trim();

  if (!headHash) {
    throw new Error("Unable to resolve an agent build hash.");
  }

  return headHash;
}

function injectAgentBuildHash(repoRoot: string, agentBuildHash: string): void {
  const bundlePath = join(repoRoot, "packages", "local-agent", "releases", "zazig-agent.mjs");
  const bundleContent = readFileSync(bundlePath, "utf-8");
  const injected = `const AGENT_BUILD_HASH = "${agentBuildHash}";\n${bundleContent}`;
  writeFileSync(bundlePath, injected);
}

async function registerAgentVersion(
  supabase: SupabaseClient,
  env: "production" | "staging",
  version: string,
  commitSha: string
): Promise<void> {
  const { error } = await supabase.from("agent_versions").insert({
    env,
    version,
    commit_sha: commitSha,
  });

  if (error) {
    throw new Error(error.message);
  }
}

export async function promote(args: string[]): Promise<void> {
  // Handle --rollback (doesn't need company/project)
  if (args.includes("--rollback")) {
    const ok = rollbackBinaries();
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
  const supabase = createClient(creds.supabaseUrl, anonKey);
  const { error: sessionError } = await supabase.auth.setSession({
    access_token: creds.accessToken,
    refresh_token: creds.refreshToken,
  });
  if (sessionError) {
    console.error(`Authentication failed: ${sessionError.message}`);
    process.exitCode = 1;
    return;
  }

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

  // 5. Fetch latest from origin.
  // The bare repo uses refs/heads/*:refs/heads/* fetch refspec, so `git fetch`
  // updates local branches directly but NOT refs/remotes/origin/*.
  // We also update origin/* explicitly so the promote safety check can compare them.
  console.log("\nFetching latest from origin...");
  try {
    execSync("git fetch origin", { cwd: bareRepoDir, stdio: "pipe" });
  } catch (err) {
    console.warn(`Fetch warning (non-fatal): ${String(err)}`);
  }
  // 6. Create a temporary worktree from the bare clone on master/main
  const defaultBranch = resolveDefaultBranch(bareRepoDir);

  // Sync refs/remotes/origin/<branch> to match refs/heads/<branch> for comparison.
  // The bare repo uses refs/heads/*:refs/heads/* fetch refspec, so origin/* refs
  // are never updated by fetch — we do it manually here.
  try {
    execSync(`git update-ref refs/remotes/origin/${defaultBranch} refs/heads/${defaultBranch}`, { cwd: bareRepoDir, stdio: "pipe" });
  } catch { /* non-fatal */ }
  const worktreePath = join(homedir(), ".zazigv2", "worktrees", "promote-tmp");

  // Clean up any stale promote worktree
  try { execSync(`git worktree remove --force "${worktreePath}"`, { cwd: bareRepoDir, stdio: "pipe" }); } catch { /* */ }
  try { rmSync(worktreePath, { recursive: true, force: true }); } catch { /* */ }
  try { execSync("git worktree prune", { cwd: bareRepoDir, stdio: "pipe" }); } catch { /* */ }

  console.log(`Creating worktree on ${defaultBranch}...`);
  try {
    execSync(`git worktree add --force "${worktreePath}" ${defaultBranch}`, { cwd: bareRepoDir, stdio: "pipe" });
  } catch (err) {
    console.error(`Failed to create worktree: ${String(err)}`);
    process.exitCode = 1;
    return;
  }

  const repoRoot = worktreePath;

  try {
    await runPromote(repoRoot, defaultBranch, creds, anonKey);
  } finally {
    // Cleanup worktree
    console.log("\nCleaning up temporary worktree...");
    try { execSync(`git worktree remove --force "${worktreePath}"`, { cwd: bareRepoDir, stdio: "pipe" }); } catch { /* */ }
    try { rmSync(worktreePath, { recursive: true, force: true }); } catch { /* */ }
    try { execSync("git worktree prune", { cwd: bareRepoDir, stdio: "pipe" }); } catch { /* */ }
  }
}

async function runPromote(
  repoRoot: string,
  defaultBranch: string,
  creds: Credentials,
  anonKey: string
): Promise<void> {
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

  // 3. Bump package versions before bundle so bundled artifacts embed the new version
  console.log("\nBumping package versions...");
  let newVersion: string;
  try {
    newVersion = bumpAgentPackageVersions(repoRoot);
    console.log(`Bumped packages/cli and packages/local-agent to ${newVersion}.`);
  } catch (err) {
    console.error(`Version bump failed: ${String(err)}`);
    process.exitCode = 1;
    return;
  }

  // 4. Resolve local-agent scoped build hash before bundling
  console.log("\nResolving agent build hash...");
  let agentBuildHash: string;
  try {
    agentBuildHash = resolveAgentBuildHash(repoRoot);
    console.log(`Using agent build hash ${agentBuildHash}.`);
  } catch (err) {
    console.error(`Failed to resolve agent build hash: ${String(err)}`);
    process.exitCode = 1;
    return;
  }

  // 5. Bundle CLI + local-agent with the bumped package version
  console.log("\nBundling CLI...");
  try {
    execSync("node scripts/bundle.js", { cwd: join(repoRoot, "packages", "cli"), stdio: "inherit" });
  } catch {
    console.error("Bundle failed.");
    process.exitCode = 1;
    return;
  }

  // Inject scoped hash into the production local-agent bundle.
  try {
    injectAgentBuildHash(repoRoot, agentBuildHash);
  } catch (err) {
    console.error(`Failed to inject agent build hash into bundle: ${String(err)}`);
    process.exitCode = 1;
    return;
  }

  // 5b. Compile native binaries from bundles
  console.log("\nCompiling native binaries...");
  const compileOutDir = join(homedir(), ".zazigv2", "compile-tmp");
  try {
    execSync(
      `bash "${join(repoRoot, "packages", "cli", "scripts", "compile.sh")}" "${compileOutDir}" "${repoRoot}"`,
      { stdio: "inherit" },
    );
  } catch {
    console.error("Bun compile failed. Is bun installed? (brew install oven-sh/bun/bun)");
    process.exitCode = 1;
    return;
  }

  // 6. Commit bundles + version bump to default branch and push
  let commitSha: string;
  console.log("\nCommitting bundles and version bump...");
  try {
    execSync(
      "git add " +
        [
          "packages/cli/releases/zazig.mjs",
          "packages/local-agent/releases/zazig-agent.mjs",
          "packages/local-agent/releases/agent-mcp-server.mjs",
          "packages/cli/package.json",
          "packages/local-agent/package.json",
        ].join(" "),
      { cwd: repoRoot, stdio: "pipe" }
    );
    const diff = execSync("git diff --cached --name-only", { encoding: "utf-8", cwd: repoRoot }).trim();
    if (diff) {
      execSync(
        `git commit -m "chore: update production bundles and bump version to ${newVersion}"`,
        { cwd: repoRoot, stdio: "pipe" }
      );
      commitSha = execSync("git rev-parse HEAD", { encoding: "utf-8", cwd: repoRoot }).trim();
      execSync(`git push origin ${defaultBranch}`, { cwd: repoRoot, stdio: "pipe" });
      console.log(`Bundles and version bump committed and pushed (${commitSha.slice(0, 7)}).`);
    } else {
      console.error("No staged changes detected after bundle/version bump; promote cannot continue.");
      process.exitCode = 1;
      return;
    }
  } catch (err) {
    console.error(`Bundle/version commit or push failed: ${String(err)}`);
    process.exitCode = 1;
    return;
  }

  // 7. Fast-forward production branch (triggers production CI)
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

    // Checkout production branch, fast-forward merge, push.
    // Note: we don't checkout back to defaultBranch afterwards — the temp
    // worktree is force-removed in the finally block, and Git refuses
    // checkout if the branch is checked out in another worktree (e.g. the
    // CPO's shared worktree).
    execSync("git checkout production", { cwd: repoRoot, stdio: "pipe" });
    try {
      execSync(`git merge ${defaultBranch} --ff-only`, { cwd: repoRoot, stdio: "pipe" });
    } catch {
      console.error(
        "Fast-forward merge into production failed. The production branch has diverged from master.\n" +
        "To fix: git checkout production && git reset --hard master && git push --force-with-lease origin production"
      );
      process.exitCode = 1;
      return;
    }
    execSync("git push origin production", { cwd: repoRoot, stdio: "pipe" });
    console.log("Production branch updated and pushed (triggers CI for Supabase deployment).");
  } catch (err) {
    console.error(`Production branch update failed: ${String(err)}`);
    process.exitCode = 1;
    return;
  }

  // 8. Register promoted version in agent_versions
  console.log("\nRegistering production version...");
  try {
    await registerAgentVersion(supabase, "production", newVersion, commitSha);
    console.log(`Registered production agent version ${newVersion} (${commitSha.slice(0, 7)}).`);
  } catch (err) {
    console.error(`Version registration failed: ${String(err)}`);
    process.exitCode = 1;
    return;
  }

  // 9. Mark complete, unpromoted features as promoted in this version
  try {
    // SQL equivalent: UPDATE features SET promoted_version = <newVersion>
    // WHERE status = 'complete' AND promoted_version IS NULL;
    const { count, error: promoteError } = await supabase
      .from("features")
      .update({ promoted_version: newVersion }, { count: "exact" })
      .eq("status", "complete")
      .is("promoted_version", null);

    if (promoteError) {
      console.error(`Failed to update promoted_version on complete features: ${promoteError.message}`);
      process.exitCode = 1;
      return;
    }

    console.log(`Marked ${count ?? 0} complete feature(s) with promoted_version=${newVersion}.`);
  } catch (err) {
    console.error(`Failed to update promoted features: ${String(err)}`);
    process.exitCode = 1;
    return;
  }

  // 10. Create GitHub Release and upload binaries
  console.log("\nCreating GitHub Release...");
  const tag = `v${newVersion}`;
  try {
    execSync(
      `gh release create "${tag}" ` +
        `--repo zazig-team/zazigv2 ` +
        `--title "v${newVersion}" ` +
        `--notes "Production release ${newVersion} (${commitSha.slice(0, 7)})" ` +
        `--target "${commitSha}" ` +
        `"${join(compileOutDir, "zazig-cli-darwin-arm64")}" ` +
        `"${join(compileOutDir, "zazig-agent-darwin-arm64")}" ` +
        `"${join(compileOutDir, "agent-mcp-server-darwin-arm64")}"`,
      { stdio: "inherit" },
    );
    console.log(`GitHub Release ${tag} created with 3 binary assets.`);
  } catch (err) {
    console.error(`GitHub Release creation failed: ${String(err)}`);
    console.error("Binaries were not uploaded. You can retry with: gh release create ...");
  }

  // 11. Cleanup compile temp dir
  try { rmSync(compileOutDir, { recursive: true, force: true }); } catch { /* */ }

  const sha = commitSha.slice(0, 7);
  console.log(`\nPromoted to production v${newVersion} (${sha}).`);
  console.log("CI will deploy Supabase migrations and edge functions.");
  console.log("Run 'zazig start' to auto-update to the new version.");
}
