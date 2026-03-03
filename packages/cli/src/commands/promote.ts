/**
 * promote.ts — Push tested staging build to production.
 *
 * Reads zazig.environments.yaml, pushes migrations, deploys edge functions,
 * and pins the local agent build.
 */

import { execSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { pinCurrentBuild, rollback as rollbackBuild } from "../lib/builds.js";

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

export async function promote(args: string[]): Promise<void> {
  const repoRoot = process.cwd();

  // Handle --rollback
  if (args.includes("--rollback")) {
    const ok = rollbackBuild();
    process.exitCode = ok ? 0 : 1;
    return;
  }

  // 1. Load environments config
  const config = loadEnvironments(repoRoot);
  if (!config) {
    console.error("No zazig.environments.yaml found in current directory.");
    process.exitCode = 1;
    return;
  }

  const prodEnv = config.environments["production"];
  if (!prodEnv) {
    console.error("No 'production' environment defined in zazig.environments.yaml.");
    process.exitCode = 1;
    return;
  }

  // 2. Safety checks
  try {
    const branch = execSync("git rev-parse --abbrev-ref HEAD", { encoding: "utf-8", cwd: repoRoot }).trim();
    if (branch !== "master" && branch !== "main") {
      console.error(`Must be on master/main to promote. Currently on: ${branch}`);
      process.exitCode = 1;
      return;
    }

    // Check if up to date
    execSync("git fetch origin", { cwd: repoRoot, stdio: "pipe" });
    const local = execSync("git rev-parse HEAD", { encoding: "utf-8", cwd: repoRoot }).trim();
    const remote = execSync(`git rev-parse origin/${branch}`, { encoding: "utf-8", cwd: repoRoot }).trim();
    if (local !== remote) {
      console.error(`Local ${branch} (${local.slice(0, 7)}) differs from origin (${remote.slice(0, 7)}). Pull first.`);
      process.exitCode = 1;
      return;
    }
  } catch (err) {
    console.error(`Git check failed: ${String(err)}`);
    process.exitCode = 1;
    return;
  }

  // 3. Build check
  console.log("Running build check...");
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
    const branch = execSync("git rev-parse --abbrev-ref HEAD", { encoding: "utf-8", cwd: repoRoot }).trim();

    // Fetch latest and ensure production branch exists locally
    execSync("git fetch origin", { cwd: repoRoot, stdio: "pipe" });
    try {
      execSync("git rev-parse --verify production", { cwd: repoRoot, stdio: "pipe" });
    } catch {
      // Create local production branch tracking remote
      try {
        execSync("git branch production origin/production", { cwd: repoRoot, stdio: "pipe" });
      } catch {
        // Remote doesn't exist either — create from current HEAD
        execSync("git branch production", { cwd: repoRoot, stdio: "pipe" });
      }
    }

    // Checkout production branch, fast-forward merge, push, return
    execSync("git checkout production", { cwd: repoRoot, stdio: "pipe" });
    try {
      execSync(`git merge ${branch} --ff-only`, { cwd: repoRoot, stdio: "pipe" });
    } catch {
      // Return to original branch before erroring
      execSync(`git checkout ${branch}`, { cwd: repoRoot, stdio: "pipe" });
      console.error(
        "Fast-forward merge into production failed. The production branch has diverged from master.\n" +
        "To fix: git checkout production && git reset --hard master && git push --force-with-lease origin production"
      );
      process.exitCode = 1;
      return;
    }
    execSync("git push origin production", { cwd: repoRoot, stdio: "pipe" });
    execSync(`git checkout ${branch}`, { cwd: repoRoot, stdio: "pipe" });
    console.log("Production branch updated and pushed (triggers Vercel production deploy).");
  } catch (err) {
    // Try to return to master on any error
    try { execSync("git checkout master", { cwd: repoRoot, stdio: "pipe" }); } catch { /* best-effort */ }
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
