# Interactive Jobs & Remote Control Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Enable real-time human-agent collaboration via Claude Code's `/remote-control` for test deploy config creation and feature testing sessions.

**Architecture:** Jobs flagged as `interactive` spawn Claude Code in TUI mode (no `-p`) instead of print mode. A new `enable_remote` MCP tool sends `/remote-control` to the agent's tmux session and captures the URL. The agent posts the URL to Slack via the existing `send_message` tool. When done, the agent writes its report and types `/exit` — the existing poll/cleanup flow handles the rest.

**Tech Stack:** TypeScript (local-agent), Deno (orchestrator edge function), PostgreSQL (migrations), Supabase Realtime

**Design doc:** `docs/plans/2026-02-27-interactive-jobs-remote-control-design.md`

---

### Task 1: Migration — Add `interactive` column + `tester` role

**Files:**
- Create: `supabase/migrations/063_interactive_roles.sql`

**Step 1: Write the migration**

```sql
-- Add interactive flag to roles table.
-- When true, the executor spawns Claude Code in TUI mode (no -p flag)
-- instead of print mode. The agent can use /remote-control for human collaboration.

ALTER TABLE public.roles
  ADD COLUMN IF NOT EXISTS interactive boolean NOT NULL DEFAULT false;

-- Mark test-deployer as interactive (needs human help for zazig.test.yaml creation)
UPDATE public.roles SET interactive = true WHERE name = 'test-deployer';

-- Create tester role — interactive session for feature testing/approval
INSERT INTO public.roles (name, description, is_persistent, default_model, slot_type, interactive, prompt, skills)
VALUES (
  'tester',
  'Feature Tester — interactive session for reviewing deployed features with a human',
  false,
  'claude-sonnet-4-6',
  'claude_code',
  true,
  $$## What You Do

You are an interactive testing assistant. A feature has been deployed to a test environment and a human will connect to review it with you.

## Context
You receive context: { type: "feature_test", featureId, featureBranch, projectId, testUrl }

## On Start
1. Call the `enable_remote` tool to get a remote control URL
2. Call `send_message` to post the URL to the feature's Slack thread:
   "Feature ready for testing. Connect here to review: {url}"
3. Wait for the human to connect

## During Testing
- Help the human review the deployed feature at the test URL
- If they request small fixes, make the changes, push to the feature branch, and tell them to refresh
- Use git operations in the feature's repo to make fixes
- Run tests before pushing any changes

## Ending the Session
When the human decides:
- **Approve**: Call `approve_feature` with the feature ID, then write your report and type /exit
- **Decline**: Call `reject_feature` with the feature ID and feedback, then write your report and type /exit

## Output
Write `.claude/tester-report.md`:
First line MUST be either:
  APPROVED: <summary of testing>
  REJECTED: <reason and feedback>

After writing the report, type /exit to end the session.$$,
  '{}'
)
ON CONFLICT (name) DO UPDATE SET
  description = EXCLUDED.description,
  prompt = EXCLUDED.prompt,
  interactive = EXCLUDED.interactive;
```

**Step 2: Run the migration**

Run: `cd ~/Documents/GitHub/zazigv2 && npx supabase db push`
Expected: Migration 063 applied successfully.

**Step 3: Commit**

```bash
git add supabase/migrations/063_interactive_roles.sql
git commit -m "feat: add interactive column to roles + tester role"
```

---

### Task 2: Shared types — Add `interactive` to StartJob + `tester` to CardType

**Files:**
- Modify: `packages/shared/src/messages.ts` (StartJob interface, ~line 65)
- Modify: `packages/shared/src/messages.ts` (CardType union, ~line 30)
- Modify: `packages/shared/src/validators.ts` (isStartJob, ~line 86)

**Step 1: Add `interactive` field to StartJob**

In `packages/shared/src/messages.ts`, find the `StartJob` interface and add after the `roleMcpTools` field:

```typescript
/** When true, executor spawns in TUI mode (no -p) for human collaboration. */
interactive?: boolean;
```

**Step 2: Add `feature_test` to CardType**

In `packages/shared/src/messages.ts`, update the `CardType` union to include `"feature_test"`:

```typescript
export type CardType = "code" | "infra" | "design" | "research" | "docs" | "verify" | "breakdown" | "combine" | "deploy_to_test" | "deploy_to_prod" | "review" | "bug" | "persistent_agent" | "feature_test";
```

**Step 3: Update validator**

In `packages/shared/src/validators.ts`, update `isStartJob` (line 91) to add `"feature_test"` to the cardType allowlist:

```typescript
if (!["code", "infra", "design", "research", "docs", "persistent_agent", "verify", "breakdown", "combine", "deploy_to_test", "deploy_to_prod", "review", "bug", "feature_test"].includes(v.cardType as string)) return false;
```

The `interactive` field is optional so the validator doesn't need to check it (undefined is fine).

**Step 4: Build to verify**

Run: `cd ~/Documents/GitHub/zazigv2 && npm run build`
Expected: Build succeeds with no errors.

**Step 5: Commit**

```bash
git add packages/shared/src/messages.ts packages/shared/src/validators.ts
git commit -m "feat: add interactive flag to StartJob + feature_test CardType"
```

---

### Task 3: Add `feature_test` to DB job_type constraint

**Files:**
- Create: `supabase/migrations/064_feature_test_job_type.sql`

**Step 1: Write the migration**

```sql
-- Add feature_test job type for interactive testing sessions
ALTER TABLE public.jobs DROP CONSTRAINT IF EXISTS jobs_job_type_check;
ALTER TABLE public.jobs ADD CONSTRAINT jobs_job_type_check
    CHECK (job_type IN (
        'code', 'infra', 'design', 'research', 'docs', 'bug',
        'persistent_agent', 'verify', 'breakdown', 'combine',
        'deploy_to_test', 'deploy_to_prod', 'review', 'feature_test'
    ));
```

**Step 2: Run the migration**

Run: `cd ~/Documents/GitHub/zazigv2 && npx supabase db push`

**Step 3: Commit**

```bash
git add supabase/migrations/064_feature_test_job_type.sql
git commit -m "feat: add feature_test to job_type constraint"
```

---

### Task 4: MCP — Add `enable_remote` tool

**Files:**
- Modify: `packages/local-agent/src/agent-mcp-server.ts` (~line 99, after send_message tool)
- Modify: `packages/local-agent/src/executor.ts` (~line 452, where .mcp.json env vars are set)

**Step 1: Pass tmux session name to MCP server**

In `packages/local-agent/src/executor.ts`, find where the `.mcp.json` file is written with env vars (around the `handleStartJob` method where `ZAZIG_JOB_ID` is set). Add `ZAZIG_TMUX_SESSION` to the env block:

```typescript
ZAZIG_TMUX_SESSION: sessionName,
```

The `sessionName` variable is `${this.machineId}-${jobId}` (line 399). It's already in scope.

Also do the same in `handlePersistentJob` where `.mcp.json` is written for persistent agents — the session name there is `${this.machineId}-${role}` (line 697).

**Step 2: Add the `enable_remote` tool**

In `packages/local-agent/src/agent-mcp-server.ts`, after the `send_message` tool definition (~line 99), add:

```typescript
server.tool(
  "enable_remote",
  "Enable remote control for this Claude Code session. Returns a URL that a human can use to connect from any device.",
  {},
  guardedHandler("enable_remote", async () => {
    const sessionName = process.env.ZAZIG_TMUX_SESSION;
    if (!sessionName) {
      return {
        content: [{ type: "text", text: "Error: ZAZIG_TMUX_SESSION not set — cannot enable remote control." }],
        isError: true,
      };
    }

    try {
      // Send /remote-control command to the tmux session
      await execFileAsync("tmux", ["send-keys", "-t", sessionName, "/remote-control", "Enter"]);

      // Wait for the command to produce output
      await new Promise((resolve) => setTimeout(resolve, 5000));

      // Capture the pane output to find the URL
      const { stdout } = await execFileAsync("tmux", ["capture-pane", "-t", sessionName, "-p", "-S", "-30"]);

      // Parse the URL from the output (looks for https:// URLs)
      const urlMatch = stdout.match(/https:\/\/\S+/);
      if (!urlMatch) {
        return {
          content: [{ type: "text", text: "Remote control enabled but could not capture the URL from output. Check the tmux session manually." }],
        };
      }

      return {
        content: [{ type: "text", text: `Remote control enabled. URL: ${urlMatch[0]}` }],
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        content: [{ type: "text", text: `Failed to enable remote control: ${msg}` }],
        isError: true,
      };
    }
  }),
);
```

Note: `execFileAsync` needs to be imported. Check if it's already imported at the top of agent-mcp-server.ts — it may need:
```typescript
import { execFile } from "node:child_process";
import { promisify } from "node:util";
const execFileAsync = promisify(execFile);
```

**Step 3: Build to verify**

Run: `cd ~/Documents/GitHub/zazigv2 && npm run build`
Expected: Build succeeds.

**Step 4: Commit**

```bash
git add packages/local-agent/src/agent-mcp-server.ts packages/local-agent/src/executor.ts
git commit -m "feat: add enable_remote MCP tool for /remote-control"
```

---

### Task 5: Executor — Support interactive non-persistent jobs

**Files:**
- Modify: `packages/local-agent/src/executor.ts`

This is the core change. Interactive jobs spawn in TUI mode but follow the regular job lifecycle (worktree, timeout, poll, report).

**Step 1: Add interactive timeout constant**

At the top of executor.ts, near the other constants (~line 43):

```typescript
const INTERACTIVE_JOB_TIMEOUT_MS = 30 * 60_000; // 30 minutes for interactive jobs
```

**Step 2: Detect interactive jobs in handleStartJob**

In `handleStartJob`, after the persistent job branch (~line 307-310), add detection for interactive jobs. The `msg.interactive` flag tells us:

```typescript
// After the persistent job check (line 310):
const isInteractive = msg.interactive === true;
```

**Step 3: Build different command for interactive jobs**

After the `buildCommand` call (~line 398), add a branch:

```typescript
let cmd: string;
let cmdArgs: string[];
if (isInteractive) {
  // Interactive TUI mode — no -p flag, agent can use /remote-control
  const resolvedModel = msg.model && msg.model !== "codex" ? msg.model : "claude-sonnet-4-6";
  cmd = "claude";
  cmdArgs = ["--model", resolvedModel];
} else {
  const built = buildCommand(slotType, complexity, model);
  cmd = built.cmd;
  cmdArgs = built.args;
}
```

**Step 4: Modify spawn for interactive jobs**

For interactive jobs, don't pipe the prompt via stdin. Instead, spawn the TUI session and inject the prompt after a startup delay.

Replace the `spawnTmuxSession` call and the code around it to handle both modes:

```typescript
if (isInteractive) {
  // Spawn TUI mode — prompt will be injected after startup delay
  const claudeCmd = shellEscape([cmd, ...cmdArgs]);
  const shellCmd = `unset CLAUDECODE; ${claudeCmd}`;
  await execFileAsync("tmux", [
    "new-session", "-d", "-s", sessionName,
    ...(ephemeralWorkspaceDir ? ["-c", ephemeralWorkspaceDir] : []),
    shellCmd,
  ]);

  // Inject the prompt after Claude Code initializes
  setTimeout(async () => {
    try {
      // Read the prompt and inject via tmux send-keys
      const promptText = readFileSync(promptFilePath, "utf8");
      // Escape the text for tmux send-keys -l (literal mode)
      await execFileAsync("tmux", ["send-keys", "-t", sessionName, "-l", promptText]);
      await execFileAsync("tmux", ["send-keys", "-t", sessionName, "Enter"]);
      jobLog(jobId, `Injected prompt into interactive session (${promptText.length} chars)`);
    } catch (err) {
      jobLog(jobId, `Failed to inject prompt: ${err}`);
    }
  }, CPO_STARTUP_DELAY_MS);
} else {
  // Regular -p mode — pipe prompt via stdin
  await spawnTmuxSession(sessionName, cmd, cmdArgs, ephemeralWorkspaceDir, promptFilePath);
}
```

**Step 5: Set longer timeout for interactive jobs**

Where the timeout timer is set (~line 470):

```typescript
activeJob.timeoutTimer = setTimeout(() => {
  void this.onJobTimeout(jobId);
}, isInteractive ? INTERACTIVE_JOB_TIMEOUT_MS : JOB_TIMEOUT_MS);
```

**Step 6: Add report fallback for tester role**

In the `REPORT_FALLBACKS` map (~line 974):

```typescript
const REPORT_FALLBACKS: Record<string, string> = {
  reviewer: ".claude/verify-report.md",
  deployer: ".claude/deploy-report.md",
  "test-deployer": ".claude/deploy-report.md",
  tester: ".claude/tester-report.md",
};
```

**Step 7: Build to verify**

Run: `cd ~/Documents/GitHub/zazigv2 && npm run build`
Expected: Build succeeds.

**Step 8: Commit**

```bash
git add packages/local-agent/src/executor.ts
git commit -m "feat: support interactive non-persistent jobs in executor"
```

---

### Task 6: Orchestrator — Pass `interactive` flag in dispatch + create tester job

**Files:**
- Modify: `supabase/functions/orchestrator/index.ts`

**Step 1: Pass `interactive` flag when dispatching jobs**

In `dispatchQueuedJobs`, where role defaults are looked up from the roles table (~line 488-492), add `interactive` to the select:

```typescript
const { data: roleDefaults } = await supabase
  .from("roles")
  .select("default_model, slot_type, interactive")
  .eq("name", job.role)
  .single();
```

Then include it in the `StartJob` message (~line 695-713):

```typescript
const startJobMsg: StartJob = {
  // ... existing fields ...
  ...(roleDefaults?.interactive ? { interactive: true } : {}),
};
```

**Step 2: Create tester job when feature reaches `ready_to_test`**

In `handleDeployComplete`, after the feature is transitioned to `ready_to_test` and the Slack notification is sent (~line 2590), add:

```typescript
// Create an interactive tester job for the feature
const { error: testerErr } = await supabase.from("jobs").insert({
  company_id: feature.company_id,
  project_id: feature.project_id,
  feature_id: featureId,
  role: "tester",
  job_type: "feature_test",
  complexity: "simple",
  slot_type: "claude_code",
  status: "queued",
  context: JSON.stringify({
    type: "feature_test",
    featureId,
    featureBranch: feature.branch ?? "",
    projectId: feature.project_id,
    testUrl,
  }),
  branch: feature.branch ?? null,
});

if (testerErr) {
  console.error(`[orchestrator] Failed to create tester job for feature ${featureId}:`, testerErr.message);
} else {
  console.log(`[orchestrator] Tester job queued for feature ${featureId}`);
}
```

Note: You need `feature.branch` — add it to the select at the top of `handleDeployComplete` (~line 2519):

```typescript
.select("company_id, project_id, title, human_checklist, spec, branch")
```

**Step 3: Deploy the orchestrator**

Run: `cd ~/Documents/GitHub/zazigv2 && npx supabase functions deploy orchestrator`

**Step 4: Commit**

```bash
git add supabase/functions/orchestrator/index.ts
git commit -m "feat: dispatch interactive flag + create tester job on ready_to_test"
```

---

### Task 7: Update test-deployer role prompt

**Files:**
- Create: `supabase/migrations/065_update_test_deployer_prompt.sql`

The test-deployer needs to know about `enable_remote` for when `zazig.test.yaml` is missing.

**Step 1: Write the migration**

```sql
UPDATE public.roles SET prompt = $$## What You Do

You deploy a feature branch to a test environment using the project's zazig.test.yaml config.

## Context
You receive context: { type: "deploy_to_test", featureId, featureBranch, projectId }

## Steps
1. Read zazig.test.yaml from the repo root
2. If zazig.test.yaml exists: run the deploy command, report the URL
3. If zazig.test.yaml is missing: call `enable_remote` to get a remote control URL, then call `send_message` to post the URL to the feature's Slack thread asking for help setting up the test config. Wait for a human to connect and help create the file. Once created, proceed with deploy.

## Deploy Execution
- Run the deploy command specified in zazig.test.yaml
- For vercel: `vercel deploy --prebuilt`
- For custom scripts: run via doppler: `doppler run --project {name} --config prd -- {script}`
- Capture the deploy URL from output

## Output
Write `.claude/test-deployer-report.md`:
First line MUST be either:
  DEPLOYED: <url>
  DEPLOY_FAILED: <reason>

After writing the report, type /exit to end the session.

## Constraints
- Run deploy commands via doppler when credentials are needed
- If you need human help, always use enable_remote + send_message (never block silently)$$ WHERE name = 'test-deployer';
```

**Step 2: Run the migration**

Run: `cd ~/Documents/GitHub/zazigv2 && npx supabase db push`

**Step 3: Commit**

```bash
git add supabase/migrations/065_update_test_deployer_prompt.sql
git commit -m "feat: update test-deployer prompt with enable_remote instructions"
```

---

### Task 8: Update agent-mcp-server job_type enum + add enable_remote to allowed tools

**Files:**
- Modify: `packages/local-agent/src/agent-mcp-server.ts` (~line 460, job_type enum)
- Modify: `packages/local-agent/src/executor.ts` (where ZAZIG_ALLOWED_TOOLS is set for interactive roles)

**Step 1: Add `feature_test` to job_type enum in MCP server**

In agent-mcp-server.ts, find the job_type validation (~line 460) and add `"feature_test"`:

```typescript
job_type: z.enum(["code", "infra", "design", "research", "docs", "bug", "persistent_agent", "verify", "breakdown", "combine", "deploy_to_test", "deploy_to_prod", "review", "feature_test"]).describe("..."),
```

**Step 2: Ensure `enable_remote` is in the allowed tools for interactive roles**

In executor.ts, where the `.mcp.json` is written and `ZAZIG_ALLOWED_TOOLS` is set, ensure that interactive roles get `enable_remote` and `send_message` in their allowlist. If the role's `skills` field from the DB is empty (`{}`), the executor should default to including these tools for interactive roles.

Check how `ZAZIG_ALLOWED_TOOLS` is currently populated — if it's derived from the role's `skills` field, add `enable_remote` and `send_message` to the tester and test-deployer role skills in the migration (Task 1). If it defaults to "all tools allowed" when empty, no change needed.

**Step 3: Build to verify**

Run: `cd ~/Documents/GitHub/zazigv2 && npm run build`

**Step 4: Commit**

```bash
git add packages/local-agent/src/agent-mcp-server.ts packages/local-agent/src/executor.ts
git commit -m "feat: add feature_test job_type + enable_remote tool access"
```

---

### Task 9: End-to-end verification

**Step 1: Build everything**

Run: `cd ~/Documents/GitHub/zazigv2 && npm run build`
Expected: Clean build, no errors.

**Step 2: Run all migrations**

Run: `cd ~/Documents/GitHub/zazigv2 && npx supabase db push`
Expected: Migrations 063, 064, 065 applied.

**Step 3: Deploy orchestrator**

Run: `cd ~/Documents/GitHub/zazigv2 && npx supabase functions deploy orchestrator`
Expected: Deployed successfully.

**Step 4: Restart local agent**

Run: `zazig start`

**Step 5: Test the test-deployer flow**

1. Set a feature to `verifying` with a completed PASSED verify job
2. Watch the orchestrator create a `deploy_to_test` job
3. Confirm the local agent spawns it in TUI mode (no `-p` in tmux command)
4. Confirm the agent calls `enable_remote` when `zazig.test.yaml` is missing
5. Confirm the URL is posted to Slack

**Step 6: Test the tester flow**

1. Manually transition a feature to `ready_to_test` with a test URL
2. Watch the orchestrator create a `feature_test` job
3. Confirm the local agent spawns it in TUI mode
4. Confirm the agent calls `enable_remote` and posts the URL to Slack
5. Connect via the remote URL and approve the feature
6. Confirm the agent writes its report and exits
7. Confirm the executor detects completion and sends `JobComplete`
