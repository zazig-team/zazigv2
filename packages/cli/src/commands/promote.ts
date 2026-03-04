/**
 * promote.ts — Push tested staging build to production.
 *
 * Flow: authenticate → pick company → pick project → resolve repo →
 * create temp worktree → run promote logic → cleanup.
 *
 * Reads zazig.environments.yaml from the project repo, pushes migrations,
 * deploys edge functions, and pins the local agent build.
 */

import { execSync } from "node:child_process";
import { existsSync, readdirSync, statSync, rmSync } from "node:fs";
import { resolve, join } from "node:path";
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

interface EnvironmentDeploy {
  provider: string;
  project_ref?: string;
  edge_functions?: boolean;
  migrations?: boolean;
  script?: string;
}

interface EnvironmentConfig {
  deploy: EnvironmentDeploy;
  agent?: { source: string; doppler_config: string };
  promote_from?: string;
}

interface EnvironmentsFile {
  name: string;
  environments: Record<string, EnvironmentConfig>;
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

function loadEnvironments(repoRoot: string): EnvironmentsFile | null {
  const yamlPath = resolve(repoRoot, "zazig.environments.yaml");
  if (!existsSync(yamlPath)) return null;

  try {
    const json = execSync(
      `node -e "const yaml = require('js-yaml'); const fs = require('fs'); console.log(JSON.stringify(yaml.load(fs.readFileSync('${yamlPath}', 'utf8'))))"`,
      { encoding: "utf-8", cwd: repoRoot }
    );
    return JSON.parse(json) as EnvironmentsFile;
  } catch {
    console.error("Failed to parse zazig.environments.yaml. Install js-yaml: npm i -D js-yaml");
    return null;
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
    // 10. Cleanup worktree
    console.log("\nCleaning up temporary worktree...");
    try { execSync(`git worktree remove --force "${worktreePath}"`, { cwd: bareRepoDir, stdio: "pipe" }); } catch { /* */ }
    try { rmSync(worktreePath, { recursive: true, force: true }); } catch { /* */ }
    try { execSync("git worktree prune", { cwd: bareRepoDir, stdio: "pipe" }); } catch { /* */ }
  }
}

async function runPromote(repoRoot: string, defaultBranch: string): Promise<void> {
  // 1. Load environments config
  const config = loadEnvironments(repoRoot);
  if (!config) {
    console.error("No zazig.environments.yaml found in project repo.");
    process.exitCode = 1;
    return;
  }

  const prodEnv = config.environments["production"];
  if (!prodEnv) {
    console.error("No 'production' environment defined in zazig.environments.yaml.");
    process.exitCode = 1;
    return;
  }

  // 2. Safety checks — verify worktree is on the default branch and up to date
  try {
    const branch = execSync("git rev-parse --abbrev-ref HEAD", { encoding: "utf-8", cwd: repoRoot }).trim();
    if (branch !== defaultBranch) {
      console.error(`Worktree is on ${branch}, expected ${defaultBranch}.`);
      process.exitCode = 1;
      return;
    }

    const local = execSync("git rev-parse HEAD", { encoding: "utf-8", cwd: repoRoot }).trim();
    const remote = execSync(`git rev-parse origin/${branch}`, { encoding: "utf-8", cwd: repoRoot }).trim();
    if (local !== remote) {
      console.error(`Local ${branch} (${local.slice(0, 7)}) differs from origin (${remote.slice(0, 7)}).`);
      process.exitCode = 1;
      return;
    }
  } catch (err) {
    console.error(`Git check failed: ${String(err)}`);
    process.exitCode = 1;
    return;
  }

  // 3. Install dependencies and build
  console.log("\nInstalling dependencies...");
  try {
    execSync("npm ci", { cwd: repoRoot, stdio: "inherit" });
  } catch {
    console.error("npm ci failed.");
    process.exitCode = 1;
    return;
  }

  console.log("\nRunning build check...");
  try {
    execSync("npm run build", { cwd: repoRoot, stdio: "inherit" });
  } catch {
    console.error("Build failed. Fix build errors before promoting.");
    process.exitCode = 1;
    return;
  }

  // 4. Fast-forward master into production branch (triggers Vercel production deploy)
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
    console.log("Production branch updated and pushed (triggers Vercel production deploy).");
  } catch (err) {
    try { execSync(`git checkout ${defaultBranch}`, { cwd: repoRoot, stdio: "pipe" }); } catch { /* best-effort */ }
    console.error(`Production branch update failed: ${String(err)}`);
    process.exitCode = 1;
    return;
  }

  const deploy = prodEnv.deploy;

  // 5. Push migrations (if supabase provider with migrations enabled)
  if (deploy.provider === "supabase" && deploy.migrations && deploy.project_ref) {
    console.log(`\nPushing migrations to production (${deploy.project_ref})...`);
    try {
      execSync(`npx supabase link --project-ref ${deploy.project_ref}`, { cwd: repoRoot, stdio: "inherit" });
      execSync("npx supabase db push --include-all", { cwd: repoRoot, stdio: "inherit" });
    } catch (err) {
      console.error(`Migration push failed: ${String(err)}`);
      process.exitCode = 1;
      return;
    }
  }

  // 6. Deploy edge functions (if supabase provider with edge_functions enabled)
  if (deploy.provider === "supabase" && deploy.edge_functions && deploy.project_ref) {
    console.log(`\nDeploying edge functions to production (${deploy.project_ref})...`);
    try {
      execSync(`npx supabase link --project-ref ${deploy.project_ref}`, { cwd: repoRoot, stdio: "pipe" });
      const fnDir = resolve(repoRoot, "supabase", "functions");
      if (existsSync(fnDir)) {
        const functions = readdirSync(fnDir).filter(f => {
          return f !== "_shared" && statSync(resolve(fnDir, f)).isDirectory();
        });
        for (const fn of functions) {
          console.log(`  Deploying: ${fn}`);
          execSync(`npx supabase functions deploy ${fn} --no-verify-jwt --project-ref ${deploy.project_ref}`, {
            cwd: repoRoot,
            stdio: "pipe",
          });
        }
      }
    } catch (err) {
      console.error(`Edge function deploy failed: ${String(err)}`);
      process.exitCode = 1;
      return;
    }
  }

  // 7. Custom provider
  if (deploy.provider === "custom" && deploy.script) {
    console.log(`\nRunning custom deploy script: ${deploy.script}`);
    try {
      execSync(deploy.script, { cwd: repoRoot, stdio: "inherit" });
    } catch (err) {
      console.error(`Custom deploy script failed: ${String(err)}`);
      process.exitCode = 1;
      return;
    }
  }

  // 8. Pin local agent build (if agent config says pinned)
  if (prodEnv.agent?.source === "pinned") {
    console.log("\nPinning local agent build...");
    pinCurrentBuild(repoRoot);
  }

  // 9. Re-link to production project ref (so local supabase CLI defaults to prod)
  if (deploy.provider === "supabase" && deploy.project_ref) {
    try {
      execSync(`npx supabase link --project-ref ${deploy.project_ref}`, { cwd: repoRoot, stdio: "pipe" });
    } catch { /* best-effort */ }
  }

  const sha = execSync("git rev-parse --short HEAD", { encoding: "utf-8", cwd: repoRoot }).trim();
  console.log(`\nPromoted ${config.name} to production (${sha}).`);
  console.log("Restart your production agent to use the new build: zazig stop && zazig start");
}
