# Staging + Promote Pipeline Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Decouple development from production by adding a staging environment, promote gate, and updated pipeline statuses so breaking changes never reach production.

**Architecture:** Two Supabase projects (staging + production), two CLI binaries (`zazig` + `zazig-staging`), CI gates on PRs, auto-deploy to staging on merge, manual `zazig promote` to production. Feature statuses simplified to `created → breaking_down → building → combining_and_pr → verifying → merged`. Project-level deployments tracked in a new `deployments` table.

**Tech Stack:** TypeScript (Node.js), Supabase (Postgres + Edge Functions), GitHub Actions CI, Doppler secrets

**Design doc:** `docs/plans/active/2026-03-03-staging-promote-pipeline-design.md`

---

## Phase 1: Foundation

### Task 1: Create staging Supabase project (manual)

This task is manual — done in the Supabase dashboard, not code.

**Step 1: Create the project**

Go to https://supabase.com/dashboard → New Project
- Name: `zazigv2-staging`
- Region: same as production (eu-west-2)
- Note the project ref, URL, anon key, and service role key

**Step 2: Seed the staging DB**

Run from the zazigv2 repo root:
```bash
npx supabase link --project-ref <staging-project-ref>
npx supabase db push
```

Then re-link production:
```bash
npx supabase link --project-ref jmussmwglgbwncgygzbz
```

**Step 3: Deploy all edge functions to staging**

```bash
for fn_dir in supabase/functions/*/; do
  fn=$(basename "$fn_dir")
  [ "$fn" = "_shared" ] && continue
  npx supabase functions deploy "$fn" --project-ref <staging-project-ref>
done
```

**Step 4: Add Doppler staging config**

```bash
doppler setup --project zazig --config staging
doppler secrets set SUPABASE_URL=https://<staging-ref>.supabase.co
doppler secrets set SUPABASE_ANON_KEY=<staging-anon-key>
doppler secrets set SUPABASE_SERVICE_ROLE_KEY=<staging-service-role-key>
doppler secrets set SUPABASE_PROJECT_REF=<staging-project-ref>
```

**Step 5: Add GitHub Actions secrets for staging**

In repo Settings → Secrets:
- `SUPABASE_STAGING_PROJECT_REF` = `<staging-project-ref>`

(The existing `SUPABASE_ACCESS_TOKEN` works for both projects.)

**Step 6: Commit**

Nothing to commit — this is all external setup.

---

### Task 2: DB migration — new feature statuses

Replace the current feature status CHECK constraint with the simplified pipeline statuses.

**Files:**
- Create: `supabase/migrations/098_simplified_pipeline_statuses.sql`

**Step 1: Write the migration**

```sql
-- 098_simplified_pipeline_statuses.sql
-- Simplify feature pipeline statuses:
--   Remove: ready_for_breakdown, breakdown, pr_ready, deploying_to_test,
--           ready_to_test, deploying_to_prod
--   Add: breaking_down, combining_and_pr, merged
--   Keep: created, building, combining (will migrate to combining_and_pr),
--          verifying, complete, cancelled, failed
--
-- Migrate existing features to new statuses before swapping constraint.

BEGIN;

-- Step 1: Migrate existing features to new status values
UPDATE public.features SET status = 'breaking_down' WHERE status IN ('ready_for_breakdown', 'breakdown');
UPDATE public.features SET status = 'combining_and_pr' WHERE status = 'combining';
UPDATE public.features SET status = 'merged' WHERE status IN ('pr_ready', 'deploying_to_test', 'ready_to_test', 'deploying_to_prod', 'complete');

-- Step 2: Drop old constraint and add new one
ALTER TABLE public.features DROP CONSTRAINT IF EXISTS features_status_check;
ALTER TABLE public.features ADD CONSTRAINT features_status_check CHECK (status IN (
  'created',
  'breaking_down',
  'building',
  'combining_and_pr',
  'verifying',
  'merged',
  'cancelled',
  'failed'
));

COMMIT;
```

**Step 2: Push to staging**

```bash
npx supabase link --project-ref <staging-project-ref>
npx supabase db push
npx supabase link --project-ref jmussmwglgbwncgygzbz
```

Expected: migration applies cleanly.

**Step 3: Commit**

```bash
git add supabase/migrations/098_simplified_pipeline_statuses.sql
git commit -m "feat(db): simplify feature pipeline statuses"
```

---

### Task 3: DB migration — deployments table

**Files:**
- Create: `supabase/migrations/099_deployments_table.sql`

**Step 1: Write the migration**

```sql
-- 099_deployments_table.sql
-- Track project-level deployments to staging and production.

CREATE TABLE IF NOT EXISTS public.deployments (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id       UUID        REFERENCES public.projects(id),
  company_id       UUID        NOT NULL REFERENCES public.companies(id),
  git_sha          TEXT        NOT NULL,
  environment      TEXT        NOT NULL CHECK (environment IN ('staging', 'production')),
  status           TEXT        NOT NULL DEFAULT 'deployed'
                               CHECK (status IN ('deployed', 'testing', 'fix_required', 'promoted', 'failed')),
  features_included UUID[]     DEFAULT '{}',
  promoted_by      TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  promoted_at      TIMESTAMPTZ
);

CREATE INDEX idx_deployments_company ON public.deployments(company_id);
CREATE INDEX idx_deployments_env ON public.deployments(environment, status);
CREATE INDEX idx_deployments_created ON public.deployments(created_at DESC);

ALTER TABLE public.deployments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on deployments"
  ON public.deployments FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated users read own company deployments"
  ON public.deployments FOR SELECT TO authenticated
  USING (public.user_in_company(company_id));
```

**Step 2: Push to staging**

```bash
npx supabase link --project-ref <staging-project-ref>
npx supabase db push
npx supabase link --project-ref jmussmwglgbwncgygzbz
```

**Step 3: Commit**

```bash
git add supabase/migrations/099_deployments_table.sql
git commit -m "feat(db): add deployments table for staging/production tracking"
```

---

### Task 4: Update FEATURE_STATUSES in shared messages

**Files:**
- Modify: `packages/shared/src/messages.ts` (lines 214-227)

**Step 1: Update the FEATURE_STATUSES const**

Find:
```typescript
export const FEATURE_STATUSES = [
  "created", "ready_for_breakdown", "breakdown", "building",
  "combining", "verifying", "deploying_to_test", "ready_to_test",
  "deploying_to_prod", "complete", "cancelled",
] as const;
```

Replace with:
```typescript
export const FEATURE_STATUSES = [
  "created",
  "breaking_down",
  "building",
  "combining_and_pr",
  "verifying",
  "merged",
  "cancelled",
  "failed",
] as const;
```

**Step 2: Build to check for type errors**

```bash
npm run build
```

Expected: may produce errors in orchestrator or local-agent where old status strings are used. Note them — they'll be fixed in Phase 4.

**Step 3: Commit**

```bash
git add packages/shared/src/messages.ts
git commit -m "feat(shared): update FEATURE_STATUSES to simplified pipeline"
```

---

### Task 5: Create environments.yaml schema

**Files:**
- Create: `packages/shared/src/environments.ts`
- Modify: `packages/shared/src/index.ts` (add export)

**Step 1: Write the schema**

```typescript
/**
 * zazig.environments.yaml — Environment Configuration Schema
 *
 * Defines staging and production environments for a project.
 * Lives in the project repo root. Built incrementally — agents add
 * entries when they provision infrastructure.
 *
 * v1 deploy providers: supabase, vercel, custom
 */

export type EnvironmentDeployProvider = "supabase" | "vercel" | "custom";

export interface EnvironmentDeploy {
  /** Deployment provider. */
  provider: EnvironmentDeployProvider;
  /** Supabase project ref (required for supabase provider). */
  project_ref?: string;
  /** Whether to deploy edge functions (supabase provider). */
  edge_functions?: boolean;
  /** Whether to push migrations (supabase provider). */
  migrations?: boolean;
  /** Vercel project ID (required for vercel provider). */
  project_id?: string;
  /** Vercel team ID (optional for vercel provider). */
  team_id?: string;
  /** Custom deploy script path (required for custom provider). */
  script?: string;
}

export interface EnvironmentAgentConfig {
  /** Where the local agent runs from: 'repo' (git dist/) or 'pinned' (~/.zazigv2/builds/current/). */
  source: "repo" | "pinned";
  /** Doppler config name for secrets. */
  doppler_config: string;
}

export interface EnvironmentHealthcheck {
  /** URL path to poll (appended to deploy URL). */
  path: string;
  /** Timeout in seconds. */
  timeout: number;
}

export interface EnvironmentConfig {
  deploy: EnvironmentDeploy;
  agent?: EnvironmentAgentConfig;
  healthcheck?: EnvironmentHealthcheck;
  /** Which environment must pass before promoting to this one. */
  promote_from?: string;
}

export interface EnvironmentsConfig {
  /** Project name. */
  name: string;
  /** Environment definitions keyed by name (e.g. 'staging', 'production'). */
  environments: Record<string, EnvironmentConfig>;
}
```

**Step 2: Add export to index.ts**

In `packages/shared/src/index.ts`, add:
```typescript
export * from "./environments.js";
```

**Step 3: Build**

```bash
npm run build
```

Expected: clean build.

**Step 4: Commit**

```bash
git add packages/shared/src/environments.ts packages/shared/src/index.ts
git commit -m "feat(shared): add environments.yaml schema"
```

---

### Task 6: Create zazig.environments.yaml for zazigv2

**Files:**
- Create: `zazig.environments.yaml`

**Step 1: Write the config**

```yaml
name: zazigv2
environments:
  staging:
    deploy:
      provider: supabase
      project_ref: STAGING_PROJECT_REF_HERE
      edge_functions: true
      migrations: true
    agent:
      source: repo
      doppler_config: staging
  production:
    deploy:
      provider: supabase
      project_ref: jmussmwglgbwncgygzbz
      edge_functions: true
      migrations: true
    agent:
      source: pinned
      doppler_config: prd
    promote_from: staging
```

Note: Replace `STAGING_PROJECT_REF_HERE` after Task 1 is complete.

**Step 2: Commit**

```bash
git add zazig.environments.yaml
git commit -m "feat: add environments.yaml for zazigv2 staging/production"
```

---

## Phase 2: CI Gates

### Task 7: Add PR gate workflow (build + test)

**Files:**
- Create: `.github/workflows/ci.yml`

**Step 1: Write the workflow**

```yaml
name: CI

on:
  pull_request:
    branches: [master, main]

jobs:
  build-and-test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm

      - run: npm ci
      - run: npm run build
      - run: npm run test
```

**Step 2: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "feat(ci): add PR gate — build + test must pass to merge"
```

---

### Task 8: Update edge function deploy workflow for staging

Modify the existing workflow to deploy to **staging** on merge (not production). Production deploys happen via `zazig promote`.

**Files:**
- Modify: `.github/workflows/deploy-edge-functions.yml`

**Step 1: Update the workflow**

Replace the entire file with:

```yaml
name: Deploy to Staging

on:
  push:
    branches: [main, master]

jobs:
  build-and-test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm

      - run: npm ci
      - run: npm run build
      - run: npm run test

  deploy-edge-functions:
    needs: build-and-test
    runs-on: ubuntu-latest
    if: contains(join(github.event.commits.*.modified, ','), 'supabase/functions/')
       || contains(join(github.event.commits.*.added, ','), 'supabase/functions/')
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - uses: supabase/setup-cli@v1
        with:
          version: latest

      - name: Deploy changed functions to STAGING
        run: |
          BEFORE_SHA="${{ github.event.before }}"
          ZERO_HASH="0000000000000000000000000000000000000000"

          if [ "$BEFORE_SHA" = "$ZERO_HASH" ]; then
            echo "First push — deploying ALL functions to staging"
            for fn_dir in supabase/functions/*/; do
              fn=$(basename "$fn_dir")
              [ "$fn" = "_shared" ] && continue
              echo "Deploying: $fn"
              supabase functions deploy "$fn" --project-ref "$SUPABASE_STAGING_PROJECT_REF"
            done
            exit 0
          fi

          shared_changed=$(git diff --name-only "$BEFORE_SHA" HEAD -- supabase/functions/_shared/ || true)

          if [ -n "$shared_changed" ]; then
            echo "_shared changed — deploying ALL functions to staging"
            for fn_dir in supabase/functions/*/; do
              fn=$(basename "$fn_dir")
              [ "$fn" = "_shared" ] && continue
              echo "Deploying: $fn"
              supabase functions deploy "$fn" --project-ref "$SUPABASE_STAGING_PROJECT_REF"
            done
          else
            changed=$(git diff --name-only "$BEFORE_SHA" HEAD -- supabase/functions/ \
              | cut -d/ -f3 \
              | sort -u \
              | grep -v _shared \
              || true)

            if [ -z "$changed" ]; then
              echo "No edge functions changed."
              exit 0
            fi

            echo "Deploying to staging: $changed"
            for fn in $changed; do
              echo "Deploying: $fn"
              supabase functions deploy "$fn" --project-ref "$SUPABASE_STAGING_PROJECT_REF"
            done
          fi
        env:
          SUPABASE_ACCESS_TOKEN: ${{ secrets.SUPABASE_ACCESS_TOKEN }}
          SUPABASE_STAGING_PROJECT_REF: ${{ secrets.SUPABASE_STAGING_PROJECT_REF }}

  push-staging-migrations:
    needs: build-and-test
    runs-on: ubuntu-latest
    if: contains(join(github.event.commits.*.modified, ','), 'supabase/migrations/')
       || contains(join(github.event.commits.*.added, ','), 'supabase/migrations/')
    steps:
      - uses: actions/checkout@v4

      - uses: supabase/setup-cli@v1
        with:
          version: latest

      - name: Push migrations to STAGING
        run: |
          supabase link --project-ref "$SUPABASE_STAGING_PROJECT_REF"
          supabase db push --include-all
        env:
          SUPABASE_ACCESS_TOKEN: ${{ secrets.SUPABASE_ACCESS_TOKEN }}
          SUPABASE_STAGING_PROJECT_REF: ${{ secrets.SUPABASE_STAGING_PROJECT_REF }}
```

**Step 2: Commit**

```bash
git add .github/workflows/deploy-edge-functions.yml
git commit -m "feat(ci): deploy edge functions + migrations to staging on merge"
```

---

## Phase 3: CLI Commands

### Task 9: Pinned builds infrastructure

**Files:**
- Create: `packages/cli/src/lib/builds.ts`

**Step 1: Write the builds module**

```typescript
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
  return existsSync(join(CURRENT, "packages", "local-agent", "dist", "index.js"));
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

  // Copy built artifacts
  const toCopy = [
    "packages/local-agent/dist",
    "packages/shared/dist",
    "packages/local-agent/package.json",
    "packages/shared/package.json",
    "package.json",
    "node_modules",
  ];

  for (const rel of toCopy) {
    const src = join(repoRoot, rel);
    const dest = join(CURRENT, rel);
    if (existsSync(src)) {
      mkdirSync(join(dest, ".."), { recursive: true });
      cpSync(src, dest, { recursive: true });
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
```

**Step 2: Build**

```bash
npm run build
```

**Step 3: Commit**

```bash
git add packages/cli/src/lib/builds.ts
git commit -m "feat(cli): add pinned builds infrastructure"
```

---

### Task 10: `zazig promote` command

**Files:**
- Create: `packages/cli/src/commands/promote.ts`
- Modify: `packages/cli/src/index.ts` (add case)

**Step 1: Write the promote command**

```typescript
/**
 * promote.ts — Push tested staging build to production.
 *
 * Reads zazig.environments.yaml, pushes migrations, deploys edge functions,
 * and pins the local agent build.
 */

import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
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

  // Simple YAML parse — only handles flat structure we need.
  // For production, use a proper YAML parser.
  const raw = readFileSync(yamlPath, "utf-8");

  // Use dynamic import for yaml parsing
  try {
    // Try to parse with JSON-compatible subset or simple regex extraction
    // For now, shell out to node -e with js-yaml if available
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

  const deploy = prodEnv.deploy;

  // 4. Push migrations (if supabase provider with migrations enabled)
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

  // 5. Deploy edge functions (if supabase provider with edge_functions enabled)
  if (deploy.provider === "supabase" && deploy.edge_functions && deploy.project_ref) {
    console.log(`\nDeploying edge functions to production (${deploy.project_ref})...`);
    try {
      execSync(`npx supabase link --project-ref ${deploy.project_ref}`, { cwd: repoRoot, stdio: "pipe" });
      // Deploy all functions
      const { readdirSync, statSync } = await import("node:fs");
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

  // 6. Custom provider
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

  // 7. Pin local agent build (if agent config says pinned)
  if (prodEnv.agent?.source === "pinned") {
    console.log("\nPinning local agent build...");
    pinCurrentBuild(repoRoot);
  }

  // 8. Re-link to production project ref (so local supabase CLI defaults to prod)
  if (deploy.provider === "supabase" && deploy.project_ref) {
    try {
      execSync(`npx supabase link --project-ref ${deploy.project_ref}`, { cwd: repoRoot, stdio: "pipe" });
    } catch { /* best-effort */ }
  }

  const sha = execSync("git rev-parse --short HEAD", { encoding: "utf-8", cwd: repoRoot }).trim();
  console.log(`\nPromoted ${config.name} to production (${sha}).`);
  console.log("Restart your production agent to use the new build: zazig stop && zazig start");
}
```

**Step 2: Register in CLI index.ts**

In `packages/cli/src/index.ts`, add the import and case:

```typescript
// Add import at top
import { promote } from "./commands/promote.js";

// Add case in switch
case "promote":
  await promote(args);
  break;
```

**Step 3: Build and verify**

```bash
npm run build
```

**Step 4: Commit**

```bash
git add packages/cli/src/commands/promote.ts packages/cli/src/index.ts
git commit -m "feat(cli): add zazig promote command"
```

---

### Task 11: `zazig hotfix` command

**Files:**
- Create: `packages/cli/src/commands/hotfix.ts`
- Modify: `packages/cli/src/index.ts` (add case)

**Step 1: Write the hotfix command**

```typescript
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
```

**Step 2: Register in CLI index.ts**

```typescript
import { hotfix } from "./commands/hotfix.js";

case "hotfix":
  await hotfix(args);
  break;
```

**Step 3: Build and commit**

```bash
npm run build
git add packages/cli/src/commands/hotfix.ts packages/cli/src/index.ts
git commit -m "feat(cli): add zazig hotfix command"
```

---

### Task 12: `zazig staging-fix` command

**Files:**
- Create: `packages/cli/src/commands/staging-fix.ts`
- Modify: `packages/cli/src/index.ts` (add case)

**Step 1: Write the staging-fix command**

```typescript
/**
 * staging-fix.ts — Interactive agent session for fixing staging issues.
 *
 * Opens an interactive Claude session pre-loaded with staging context.
 * Agent can read staging DB, deploy to staging, and commit fixes to master.
 */

import { spawnSync, execSync } from "node:child_process";
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
      // Ensure staging credentials are available if set
      ZAZIG_ENV: "staging",
    },
  });

  if (result.status !== 0 && result.status !== null) {
    console.error("Staging fix session ended with errors.");
    process.exitCode = 1;
  }

  console.log("\nStaging fix session ended.");
}
```

**Step 2: Register in CLI index.ts**

```typescript
import { stagingFix } from "./commands/staging-fix.js";

case "staging-fix":
  await stagingFix();
  break;
```

**Step 3: Build and commit**

```bash
npm run build
git add packages/cli/src/commands/staging-fix.ts packages/cli/src/index.ts
git commit -m "feat(cli): add zazig staging-fix interactive command"
```

---

### Task 13: `zazig-staging` binary

The staging binary is a thin wrapper that sets environment variables and delegates to the same CLI with staging Supabase credentials.

**Files:**
- Create: `packages/cli/src/staging-index.ts`
- Modify: `packages/cli/package.json` (add bin entry + build step)

**Step 1: Write the staging entry point**

```typescript
#!/usr/bin/env node

/**
 * zazig-staging — CLI entry point for staging environment.
 *
 * Identical to zazig but forces ZAZIG_ENV=staging and uses
 * staging Doppler config for Supabase credentials.
 */

// Set environment before any imports
process.env["ZAZIG_ENV"] = "staging";

// Delegate to the main CLI
await import("./index.js");
```

**Step 2: Add bin entry to package.json**

In `packages/cli/package.json`, update:

```json
"bin": {
  "zazig": "./dist/index.js",
  "zazig-staging": "./dist/staging-index.js"
},
```

**Step 3: Update build script to chmod both**

In `packages/cli/package.json`, update the build script:

```json
"build": "tsc -p tsconfig.build.json && chmod +x dist/index.js dist/staging-index.js"
```

**Step 4: Build and commit**

```bash
npm run build
git add packages/cli/src/staging-index.ts packages/cli/package.json
git commit -m "feat(cli): add zazig-staging binary"
```

---

## Phase 4: Pipeline Updates

### Task 14: Update orchestrator feature status transitions

The orchestrator needs to use the new status names. This is the largest task — it touches many transition points.

**Files:**
- Modify: `supabase/functions/orchestrator/index.ts`

**Key changes (refer to line numbers from the explore agent research):**

| Old status | New status | Orchestrator locations |
|---|---|---|
| `ready_for_breakdown` | Remove — go straight to `breaking_down` | `triggerBreakdown` (~line 2775) |
| `breakdown` | `breaking_down` | `triggerBreakdown` CAS, `handleJobComplete` breakdown path |
| `combining` | `combining_and_pr` | `triggerCombining` (~line 1882) |
| `pr_ready` | `merged` | `handleJobComplete` verify PASSED path (~line 1345) |
| `deploying_to_test` | Remove from feature pipeline | Various deploy paths |
| `ready_to_test` | Remove from feature pipeline | Various deploy paths |
| `deploying_to_prod` | Remove from feature pipeline | Various deploy paths |
| `complete` | `merged` | `handleProdDeployComplete` |

**Step 1: Search and replace all status string references**

Work through each status transition in the orchestrator. For each one:
1. Find the `.update({ status: "old_value" })` call
2. Replace with the new status value
3. Update any `.eq("status", "old_value")` guards

**Step 2: Remove deploy-to-test and deploy-to-prod feature transitions**

The feature pipeline now ends at `merged`. The orchestrator should NOT transition features to `deploying_to_test` or beyond. Remove or gate those code paths.

**Step 3: Update the verify PASSED handler**

When verification passes, the new flow is:
1. Merge the PR (via GitHub API)
2. Set feature status to `merged`

Instead of the current flow which goes to `pr_ready` or `deploying_to_test`.

**Step 4: Deploy to staging and test**

```bash
npx supabase functions deploy orchestrator --no-verify-jwt --project-ref <staging-project-ref>
```

**Step 5: Commit**

```bash
git add supabase/functions/orchestrator/index.ts
git commit -m "feat(orchestrator): update to simplified pipeline statuses"
```

Note: This task is intentionally high-level because the orchestrator is large (~2800 lines) and the exact changes depend on reading each transition point carefully. The implementing agent should use the line numbers from the research to navigate.

---

### Task 15: Update dashboard for new statuses

**Files:**
- Modify: `dashboard/index.html`

**Step 1: Update PIPELINE_COLUMNS**

Find the `PIPELINE_COLUMNS` array (~line 1244) and replace with:

```javascript
const PIPELINE_COLUMNS = [
  { key: 'breaking_down',    label: 'Breakdown',    color: '#ec4899' },
  { key: 'building',         label: 'Building',     color: '#f97316' },
  { key: 'combining_and_pr', label: 'Combine + PR', color: '#eab308' },
  { key: 'verifying',        label: 'Verifying',    color: '#06b6d4' },
  { key: 'merged',           label: 'Merged',       color: '#22c55e' },
];
```

**Step 2: Remove `ready_for_breakdown` from INTAKE_COLUMNS if present**

Features with status `created` stay in the intake column. `breaking_down` moves them to the pipeline.

**Step 3: Update CSS variables for status colors**

Add/update CSS custom properties for the new status names.

**Step 4: Commit**

```bash
git add dashboard/index.html
git commit -m "feat(dashboard): update kanban columns for simplified pipeline"
```

---

## Phase 5: Local Agent Updates

### Task 16: Update local agent start to support pinned builds

When `ZAZIG_ENV` is not set or is `production`, and a pinned build exists, the agent should run from the pinned build directory.

**Files:**
- Modify: `packages/cli/src/commands/start.ts`

**Step 1: Update start command**

At the top of the `start()` function, check if running in production mode with a pinned build:

```typescript
import { hasPinnedBuild } from "../lib/builds.js";

// In start():
const env = process.env["ZAZIG_ENV"] ?? "production";

if (env === "production" && hasPinnedBuild()) {
  // Run from pinned build
  const buildDir = join(homedir(), ".zazigv2", "builds", "current");
  const agentEntry = join(buildDir, "packages", "local-agent", "dist", "index.js");
  // ... spawn node with agentEntry
} else {
  // Run from repo (current behavior)
}
```

The exact implementation depends on how `start.ts` currently spawns the agent. The implementing agent should read `start.ts` and adapt.

**Step 2: Build and commit**

```bash
npm run build
git add packages/cli/src/commands/start.ts
git commit -m "feat(cli): support pinned builds in zazig start"
```

---

## Execution Order

Tasks 1-6 (Foundation) must be done first and in order.
Tasks 7-8 (CI) can be done in parallel, after Phase 1.
Tasks 9-13 (CLI) can be done in parallel, after Phase 1.
Task 14 (Orchestrator) depends on Task 2 (new statuses in DB).
Task 15 (Dashboard) depends on Task 2.
Task 16 depends on Task 9 (builds infrastructure).

**Suggested sequence:**
1. Task 1 (manual setup) — do first, unblocks everything
2. Tasks 2-6 in order (foundation)
3. Tasks 7-8 (CI gates)
4. Tasks 9-13 (CLI commands — can be parallelised)
5. Tasks 14-15 (pipeline updates)
6. Task 16 (pinned builds support)

---

## Verification

After all tasks:

1. `npm run build` — compiles clean
2. `npm run test` — tests pass
3. Create a test feature on staging → verify it flows through `created → breaking_down → building → combining_and_pr → verifying → merged`
4. Run `zazig promote` → verify edge functions deploy to production, migrations push, build pinned
5. Run `zazig start` → verify agent starts from pinned build
6. Run `zazig-staging start` → verify agent starts from repo
7. Run `zazig hotfix "test"` → verify interactive session opens
8. Run `zazig staging-fix` → verify interactive session opens
9. Dashboard shows new pipeline columns correctly
