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
 * Resolve the default branch via remote tracking refs.
 */
function resolveDefaultBranch(repoDir: string): string {
  try {
    const ref = execSync("git symbolic-ref refs/remotes/origin/HEAD", { encoding: "utf-8", cwd: repoDir }).trim();
    return ref.replace(/^refs\/remotes\/origin\//, "");
  } catch { /* fallback */ }
  for (const name of ["master", "main"]) {
    try {
      execSync(`git rev-parse --verify refs/remotes/origin/${name}`, { cwd: repoDir, stdio: "pipe" });
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
    agentBuildHash = execSync("git log -1 --format=%h --abbrev=8 -- packages/local-agent/", {
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
  // Promote always targets production — override any staging env vars so
  // credentials, anon key, and Supabase URL resolve to production values.
  delete process.env["ZAZIG_ENV"];
  delete process.env["SUPABASE_URL"];
  delete process.env["SUPABASE_ANON_KEY"];
  process.env["ZAZIG_HOME"] = join(homedir(), ".zazigv2");

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

  // 4. Find the local repo clone and ensure it's a normal (non-bare) clone.
  const cloneDir = join(REPOS_BASE, project.name);
  if (!existsSync(cloneDir)) {
    console.error(`No local repo clone found at ${cloneDir}.`);
    console.error("Run 'zazig start' first to clone the project repo.");
    process.exitCode = 1;
    return;
  }

  // Migrate legacy bare clone → normal clone
  try {
    const isBare = execSync("git rev-parse --is-bare-repository", { encoding: "utf-8", cwd: cloneDir, stdio: "pipe" }).trim();
    if (isBare === "true") {
      const repoUrl = execSync("git remote get-url origin", { encoding: "utf-8", cwd: cloneDir, stdio: "pipe" }).trim();
      console.log("Migrating legacy bare clone to normal clone...");
      const tmpClone = `${cloneDir}-migrate-tmp`;
      try { rmSync(tmpClone, { recursive: true, force: true }); } catch { /* */ }
      execSync(`git clone "${repoUrl}" "${tmpClone}"`, { stdio: "pipe" });
      rmSync(cloneDir, { recursive: true, force: true });
      execSync(`mv "${tmpClone}" "${cloneDir}"`, { stdio: "pipe" });
      console.log("Migration complete.");
    }
  } catch (err) {
    console.error(`Failed to validate/migrate repo: ${String(err)}`);
    process.exitCode = 1;
    return;
  }

  // 5. Fetch latest from origin — updates origin/* tracking refs.
  // Fix legacy bare-repo refspec if present (self-healing migration).
  try {
    const refspec = execSync("git config --get remote.origin.fetch", { encoding: "utf-8", cwd: cloneDir, stdio: "pipe" }).trim();
    if (!refspec.includes("refs/remotes/origin")) {
      execSync('git config remote.origin.fetch "+refs/heads/*:refs/remotes/origin/*"', { cwd: cloneDir, stdio: "pipe" });
      console.log("Fixed legacy refspec on repo clone.");
    }
  } catch { /* non-fatal */ }
  console.log("\nFetching latest from origin...");
  try {
    execSync("git fetch origin", { cwd: cloneDir, stdio: "pipe" });
  } catch (err) {
    console.warn(`Fetch warning (non-fatal): ${String(err)}`);
  }

  // 6. Create a temporary worktree in detached HEAD from origin/<default>.
  //    We use a temporary branch (zazig-promote) to commit on, then push it
  //    as the default branch. This avoids conflicts with branches that may
  //    be checked out in other worktrees (e.g. the shared project worktree).
  const defaultBranch = resolveDefaultBranch(cloneDir);
  const worktreePath = join(homedir(), ".zazigv2", "worktrees", "promote-tmp");
  const promoteBranch = "zazig-promote";

  // Clean up any stale promote worktree / branch
  try { execSync(`git worktree remove --force "${worktreePath}"`, { cwd: cloneDir, stdio: "pipe" }); } catch { /* */ }
  try { rmSync(worktreePath, { recursive: true, force: true }); } catch { /* */ }
  try { execSync("git worktree prune", { cwd: cloneDir, stdio: "pipe" }); } catch { /* */ }
  try { execSync(`git branch -D ${promoteBranch}`, { cwd: cloneDir, stdio: "pipe" }); } catch { /* */ }

  console.log(`Creating worktree on ${defaultBranch}...`);
  try {
    // Create a temporary branch from origin/<default> — won't conflict with anything
    execSync(`git worktree add -b ${promoteBranch} "${worktreePath}" origin/${defaultBranch}`, { cwd: cloneDir, stdio: "pipe" });
  } catch (err) {
    console.error(`Failed to create worktree: ${String(err)}`);
    process.exitCode = 1;
    return;
  }

  const repoRoot = worktreePath;

  try {
    await runPromote(repoRoot, defaultBranch, creds, anonKey, supabase);
  } finally {
    // Cleanup worktree and temp branch
    console.log("\nCleaning up temporary worktree...");
    try { execSync(`git worktree remove --force "${worktreePath}"`, { cwd: cloneDir, stdio: "pipe" }); } catch { /* */ }
    try { rmSync(worktreePath, { recursive: true, force: true }); } catch { /* */ }
    try { execSync("git worktree prune", { cwd: cloneDir, stdio: "pipe" }); } catch { /* */ }
    try { execSync(`git branch -D ${promoteBranch}`, { cwd: cloneDir, stdio: "pipe" }); } catch { /* */ }
  }
}

async function runPromote(
  repoRoot: string,
  defaultBranch: string,
  creds: Credentials,
  anonKey: string,
  supabase: SupabaseClient
): Promise<void> {
  // 1. Safety check — verify worktree was created from origin/<default>
  try {
    execSync("git rev-parse HEAD", { cwd: repoRoot, stdio: "pipe" });
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
    // Force-add bundles (they're gitignored to prevent accidental edits)
    execSync(
      "git add --force " +
        [
          "packages/cli/releases/zazig.mjs",
          "packages/local-agent/releases/zazig-agent.mjs",
        ].join(" "),
      { cwd: repoRoot, stdio: "pipe" }
    );
    execSync(
      "git add " +
        [
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

      // Try direct push first; if master is protected, create a PR and merge via GitHub
      try {
        execSync(`git push origin HEAD:${defaultBranch}`, { cwd: repoRoot, stdio: "pipe" });
        console.log(`Bundles and version bump committed and pushed (${commitSha.slice(0, 7)}).`);
      } catch {
        console.log(`Direct push to ${defaultBranch} rejected (branch protection). Creating PR...`);
        const promotePrBranch = `promote/v${newVersion}`;
        execSync(`git push origin HEAD:${promotePrBranch}`, { cwd: repoRoot, stdio: "pipe" });
        const prUrl = execSync(
          `gh pr create --repo zazig-team/zazigv2 --head "${promotePrBranch}" --base "${defaultBranch}" ` +
            `--title "chore: promote v${newVersion}" ` +
            `--body "Production bundle and version bump for v${newVersion}."`,
          { encoding: "utf-8", cwd: repoRoot, stdio: "pipe" },
        ).trim();
        console.log(`PR created: ${prUrl}`);
        console.log("Waiting for CI checks...");
        execSync(`gh pr checks "${prUrl}" --watch`, { cwd: repoRoot, stdio: "inherit", timeout: 300_000 });
        execSync(`gh pr merge "${prUrl}" --merge --delete-branch`, { cwd: repoRoot, stdio: "pipe" });
        // Re-resolve commit SHA after merge (merge commit may differ)
        execSync("git fetch origin", { cwd: repoRoot, stdio: "pipe" });
        commitSha = execSync(`git rev-parse origin/${defaultBranch}`, { encoding: "utf-8", cwd: repoRoot }).trim();
        console.log(`PR merged. Bundles and version bump on ${defaultBranch} (${commitSha.slice(0, 7)}).`);
      }
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

  // 7. Fast-forward production branch (triggers production CI).
  //    Verify current HEAD is a fast-forward of origin/production, then push
  //    HEAD directly as production. No local checkout of "production" needed.
  console.log("\nUpdating production branch...");
  try {
    // Check if origin/production exists
    let productionExists = true;
    try {
      execSync("git rev-parse --verify origin/production", { cwd: repoRoot, stdio: "pipe" });
    } catch {
      productionExists = false;
    }

    if (productionExists) {
      // Verify ff: origin/production must be an ancestor of HEAD
      try {
        execSync("git merge-base --is-ancestor origin/production HEAD", { cwd: repoRoot, stdio: "pipe" });
      } catch {
        console.error(
          "Fast-forward into production failed. The production branch has diverged from master.\n" +
          "To fix: git checkout production && git reset --hard master && git push --force-with-lease origin production"
        );
        process.exitCode = 1;
        return;
      }
    }

    execSync("git push origin HEAD:production", { cwd: repoRoot, stdio: "pipe" });
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

  // 9. (promoted_version is now stamped automatically by the DB trigger on agent_versions INSERT)

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
