# Terminal-First CPO Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace Slack-based CPO with a split-screen terminal TUI where every machine gets its own local CPO instance.

**Architecture:** Local agent asks backend for persistent roles via new edge function, spawns them in tmux, user interacts through a Node TUI (blessed) that streams `tmux capture-pane` output and sends input via `tmux send-keys`. Persistent agents move from jobs table to dedicated `persistent_agents` table.

**Tech Stack:** Node.js, blessed (TUI), tmux, Supabase (edge functions, Postgres), TypeScript

**Design doc:** `docs/plans/2026-02-25-terminal-first-cpo-design.md`
**Pipeline doc:** `docs/plans/2026-02-24-idea-to-job-pipeline-design.md`

---

## Phase 1: Database

### Task 1: Create persistent_agents table

**Files:**
- Create: `supabase/migrations/048_persistent_agents.sql`

**Step 1: Write migration**

```sql
-- 048: Create persistent_agents table
-- Persistent agents (CPO, CTO, etc.) run locally on each machine.
-- One row per (company, role, machine) — every machine gets its own instance.

CREATE TABLE public.persistent_agents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  machine_id UUID NOT NULL REFERENCES public.machines(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'running'
    CHECK (status IN ('running', 'stopped', 'error')),
  prompt_stack TEXT,
  last_heartbeat TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (company_id, role, machine_id)
);

-- RLS: users can read/write their own company's persistent agents
ALTER TABLE public.persistent_agents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their company persistent agents"
  ON public.persistent_agents
  FOR ALL
  USING (
    company_id IN (
      SELECT company_id FROM public.user_companies
      WHERE user_id = auth.uid()
    )
  );
```

**Step 2: Apply migration**

Run: `cd /Users/chrisevans/Documents/GitHub/zazigv2 && npx supabase db push --include-all`
Expected: Migration 048 applied successfully.

**Step 3: Commit**

```bash
git add supabase/migrations/048_persistent_agents.sql
git commit -m "feat(db): create persistent_agents table"
```

---

## Phase 2: Backend

### Task 2: Create company-persistent-jobs edge function

**Files:**
- Create: `supabase/functions/company-persistent-jobs/index.ts`
- Create: `supabase/functions/company-persistent-jobs/deno.json`

**Step 1: Write deno.json**

```json
{
  "imports": {
    "@supabase/supabase-js": "https://esm.sh/@supabase/supabase-js@2"
  }
}
```

**Step 2: Write edge function**

```typescript
/**
 * company-persistent-jobs — returns persistent role definitions for a company.
 *
 * GET /functions/v1/company-persistent-jobs?company_id=X
 *
 * For each persistent role in the company, assembles the prompt stack
 * (personality + role prompt) and returns the complete workspace definition.
 */

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("Missing required environment variables: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY");
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function jsonResponse(body: Record<string, unknown> | unknown[], status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "GET") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return jsonResponse({ error: "Missing authorization header" }, 401);
  }

  const url = new URL(req.url);
  const companyId = url.searchParams.get("company_id");
  if (!companyId) {
    return jsonResponse({ error: "Missing company_id parameter" }, 400);
  }

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });

    // Fetch persistent roles
    const { data: roles, error: rolesError } = await supabase
      .from("roles")
      .select("name, prompt, skills, default_model, slot_type")
      .eq("is_persistent", true);

    if (rolesError) {
      return jsonResponse({ error: `Failed to fetch roles: ${rolesError.message}` }, 500);
    }

    if (!roles || roles.length === 0) {
      return jsonResponse([]);
    }

    // Fetch personalities for this company
    const { data: personalities, error: persError } = await supabase
      .from("exec_personalities")
      .select("role_id, compiled_prompt, roles!inner(name)")
      .eq("company_id", companyId);

    if (persError) {
      console.warn(`Failed to fetch personalities: ${persError.message}`);
    }

    // Assemble prompt stack for each role
    const result = roles.map((role) => {
      const personality = personalities?.find(
        (p: Record<string, unknown>) =>
          (p.roles as Record<string, unknown>)?.name === role.name
      );

      const parts: string[] = [];
      parts.push(`# ${role.name.toUpperCase()}`);
      if (personality?.compiled_prompt) {
        parts.push(String(personality.compiled_prompt));
        parts.push("---");
      }
      if (role.prompt) {
        parts.push(role.prompt);
      }

      return {
        role: role.name,
        prompt_stack: parts.join("\n\n"),
        skills: role.skills ?? [],
        model: role.default_model ?? "claude-opus-4-6",
        slot_type: role.slot_type ?? "claude_code",
      };
    });

    return jsonResponse(result);
  } catch (err) {
    return jsonResponse({ error: String(err) }, 500);
  }
});
```

**Step 3: Deploy**

Run: `cd /Users/chrisevans/Documents/GitHub/zazigv2 && npx supabase functions deploy company-persistent-jobs`
Expected: Deployed successfully.

**Step 4: Commit**

```bash
git add supabase/functions/company-persistent-jobs/
git commit -m "feat(edge): add company-persistent-jobs endpoint"
```

---

## Phase 3: Per-Company Daemon Management

### Task 3: Update daemon.ts for per-company PID files

**Files:**
- Modify: `packages/cli/src/lib/daemon.ts`

**Step 1: Add per-company PID path functions**

Currently `PID_PATH` is hardcoded to `~/.zazigv2/daemon.pid`. Add functions that accept a company ID:

```typescript
export function pidPathForCompany(companyId: string): string {
  return join(ZAZIGV2_DIR, `${companyId}.pid`);
}

export function logPathForCompany(companyId: string): string {
  const logDir = join(ZAZIGV2_DIR, "logs");
  mkdirSync(logDir, { recursive: true });
  return join(logDir, `${companyId}.log`);
}

export function readPidForCompany(companyId: string): number | null {
  const pidPath = pidPathForCompany(companyId);
  try {
    return parseInt(readFileSync(pidPath, "utf-8").trim(), 10);
  } catch {
    return null;
  }
}

export function isDaemonRunningForCompany(companyId: string): boolean {
  const pid = readPidForCompany(companyId);
  return pid !== null && isRunning(pid);
}

export function removePidFileForCompany(companyId: string): void {
  try { unlinkSync(pidPathForCompany(companyId)); } catch { /* */ }
}

export function startDaemonForCompany(env: NodeJS.ProcessEnv, companyId: string): number {
  const agentEntry = resolveAgentEntry();
  const logPath = logPathForCompany(companyId);
  const logFd = openSync(logPath, "a");
  const child = spawn(process.execPath, [agentEntry], {
    detached: true,
    stdio: ["ignore", logFd, logFd],
    env,
  });
  child.unref();
  const pid = child.pid!;
  writeFileSync(pidPathForCompany(companyId), String(pid));
  return pid;
}
```

Keep existing non-company functions for backward compatibility during transition.

**Step 2: Commit**

```bash
git add packages/cli/src/lib/daemon.ts
git commit -m "feat(cli): add per-company daemon PID management"
```

---

### Task 4: Add company picker helper

**Files:**
- Create: `packages/cli/src/lib/company-picker.ts`

**Step 1: Write company picker**

This helper fetches the user's companies from Supabase and prompts if more than one.

```typescript
/**
 * company-picker.ts — prompts user to select a company if they belong to multiple.
 */

import { createInterface } from "node:readline/promises";

interface Company {
  id: string;
  name: string;
}

export async function fetchUserCompanies(
  supabaseUrl: string,
  anonKey: string,
  accessToken: string
): Promise<Company[]> {
  const res = await fetch(
    `${supabaseUrl}/rest/v1/user_companies?select=company_id,companies(id,name)`,
    {
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${accessToken}`,
      },
    }
  );
  if (!res.ok) throw new Error(`Failed to fetch companies: HTTP ${res.status}`);
  const rows = (await res.json()) as Array<{
    company_id: string;
    companies: { id: string; name: string };
  }>;
  return rows.map((r) => ({ id: r.companies.id, name: r.companies.name }));
}

export async function pickCompany(companies: Company[]): Promise<Company> {
  if (companies.length === 0) {
    throw new Error("You don't belong to any companies. Run 'zazig setup' first.");
  }
  if (companies.length === 1) {
    return companies[0]!;
  }

  console.log("\nWhich company?\n");
  for (let i = 0; i < companies.length; i++) {
    console.log(`  ${i + 1}. ${companies[i]!.name}`);
  }

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const ans = await rl.question(`\nChoice [1]: `);
    const idx = (parseInt(ans.trim(), 10) || 1) - 1;
    if (idx < 0 || idx >= companies.length) {
      throw new Error("Invalid choice.");
    }
    return companies[idx]!;
  } finally {
    rl.close();
  }
}
```

**Step 2: Commit**

```bash
git add packages/cli/src/lib/company-picker.ts
git commit -m "feat(cli): add company picker helper"
```

---

## Phase 4: TUI

### Task 5: Add blessed dependency

**Files:**
- Modify: `packages/cli/package.json`

**Step 1: Install blessed**

Run: `cd /Users/chrisevans/Documents/GitHub/zazigv2/packages/cli && npm install blessed @types/blessed`

**Step 2: Commit**

```bash
git add packages/cli/package.json ../../package-lock.json
git commit -m "feat(cli): add blessed TUI dependency"
```

---

### Task 6: Create chat.ts TUI

**Files:**
- Create: `packages/cli/src/commands/chat.ts`

**Step 1: Write the TUI**

```typescript
/**
 * chat.ts — split-screen TUI for persistent agent interaction.
 *
 * Top: read-only stream of active agent tmux session (capture-pane polling).
 * Bottom: status bar + input line.
 * Tab: switch between persistent agents.
 * Ctrl+C: graceful shutdown (stops daemon + agents).
 */

import blessed from "blessed";
import { execSync, exec } from "node:child_process";

interface AgentSession {
  role: string;
  sessionName: string;
}

interface ChatOptions {
  companyName: string;
  agents: AgentSession[];
  onShutdown: () => void;
}

export function launchTui(options: ChatOptions): void {
  const { companyName, agents, onShutdown } = options;

  if (agents.length === 0) {
    console.error("No persistent agents running.");
    return;
  }

  let activeIndex = 0;
  let captureInterval: ReturnType<typeof setInterval> | null = null;

  const screen = blessed.screen({
    smartCSR: true,
    title: `zazig — ${companyName}`,
  });

  // --- Top: agent output ---
  const outputBox = blessed.box({
    top: 0,
    left: 0,
    width: "100%",
    height: "100%-3",
    scrollable: true,
    alwaysScroll: true,
    scrollbar: { ch: "│" },
    tags: false,
    style: { fg: "white", bg: "black" },
  });

  // --- Status bar ---
  const statusBar = blessed.box({
    bottom: 2,
    left: 0,
    width: "100%",
    height: 1,
    tags: true,
    style: { fg: "white", bg: "blue" },
  });

  // --- Input line ---
  const inputBox = blessed.textbox({
    bottom: 0,
    left: 0,
    width: "100%",
    height: 3,
    inputOnFocus: true,
    border: { type: "line" },
    style: {
      fg: "white",
      bg: "black",
      border: { fg: "gray" },
    },
  });

  screen.append(outputBox);
  screen.append(statusBar);
  screen.append(inputBox);

  function updateStatusBar(): void {
    const tabs = agents
      .map((a, i) =>
        i === activeIndex
          ? `{bold}[${a.role.toUpperCase()}]{/bold}`
          : ` ${a.role.toUpperCase()} `
      )
      .join("  ");
    statusBar.setContent(`  ${companyName} · ${tabs}          Tab: switch`);
    screen.render();
  }

  function capturePane(): void {
    const session = agents[activeIndex]!.sessionName;
    try {
      const output = execSync(
        `tmux capture-pane -t ${session} -p -S -200`,
        { encoding: "utf-8", timeout: 2000 }
      );
      outputBox.setContent(output);
      outputBox.setScrollPerc(100);
      screen.render();
    } catch {
      // Session may not exist yet or tmux not ready
    }
  }

  function startCapture(): void {
    if (captureInterval) clearInterval(captureInterval);
    capturePane();
    captureInterval = setInterval(capturePane, 300);
  }

  function sendMessage(text: string): void {
    const session = agents[activeIndex]!.sessionName;
    const escaped = text.replace(/'/g, "'\\''");
    try {
      execSync(`tmux send-keys -t ${session} '${escaped}' Enter`, {
        timeout: 5000,
      });
    } catch {
      // Session may have died
    }
  }

  // --- Key bindings ---

  // Tab: cycle agents
  screen.key(["tab"], () => {
    if (agents.length > 1) {
      activeIndex = (activeIndex + 1) % agents.length;
      updateStatusBar();
      capturePane();
    }
  });

  // Ctrl+C: shutdown
  screen.key(["C-c"], () => {
    if (captureInterval) clearInterval(captureInterval);
    screen.destroy();
    onShutdown();
  });

  // Input handling
  inputBox.on("submit", (value: string) => {
    if (value.trim()) {
      sendMessage(value.trim());
    }
    inputBox.clearValue();
    inputBox.focus();
    screen.render();
  });

  // Focus input on start
  inputBox.focus();
  updateStatusBar();
  startCapture();
  screen.render();
}
```

**Step 2: Commit**

```bash
git add packages/cli/src/commands/chat.ts
git commit -m "feat(cli): add split-screen TUI for persistent agents"
```

---

## Phase 5: CLI Commands

### Task 7: Rewrite start.ts — company picker, backend discovery, TUI launch

**Files:**
- Modify: `packages/cli/src/commands/start.ts`

**Step 1: Rewrite start command**

The new `start` flow:
1. Check prerequisites (claude CLI)
2. Get credentials
3. Fetch user's companies, pick one (or use `--company` flag)
4. Start per-company daemon
5. Daemon calls `company-persistent-jobs` endpoint and spawns agents
6. Launch TUI (unless `--no-tui`)

The daemon spawning of persistent agents happens inside the local-agent process (executor). The CLI just starts the daemon with the company context and then opens the TUI.

Key changes to `start.ts`:
- Add `--company` and `--no-tui` flag parsing
- Pass `ZAZIG_COMPANY_ID` and `ZAZIG_COMPANY_NAME` in daemon env
- After daemon starts, discover agent tmux sessions and launch TUI
- Use per-company PID files

```typescript
// At the top, add imports:
import { fetchUserCompanies, pickCompany } from "../lib/company-picker.js";
import {
  isDaemonRunningForCompany,
  readPidForCompany,
  startDaemonForCompany,
  removePidFileForCompany,
  logPathForCompany,
} from "../lib/daemon.js";
import { launchTui } from "./chat.js";
import { DEFAULT_SUPABASE_ANON_KEY } from "../lib/constants.js";
```

After credentials and config, add:
```typescript
// Fetch companies and pick one
const anonKey = process.env["SUPABASE_ANON_KEY"] ?? DEFAULT_SUPABASE_ANON_KEY;
const companies = await fetchUserCompanies(creds.supabaseUrl, anonKey, creds.accessToken);
const company = await pickCompany(companies);

console.log(`Starting zazig for ${company.name}...`);
```

Replace daemon spawn with per-company version:
```typescript
const env: NodeJS.ProcessEnv = {
  ...process.env,
  SUPABASE_ACCESS_TOKEN: creds.accessToken,
  SUPABASE_REFRESH_TOKEN: creds.refreshToken,
  SUPABASE_URL: creds.supabaseUrl,
  ZAZIG_MACHINE_NAME: config.name,
  ZAZIG_COMPANY_ID: company.id,
  ZAZIG_COMPANY_NAME: company.name,
  ZAZIG_SLOTS_CLAUDE_CODE: String(config.slots.claude_code),
  ZAZIG_SLOTS_CODEX: String(config.slots.codex),
};

let pid: number;
try {
  pid = startDaemonForCompany(env, company.id);
} catch (err) {
  console.error(`Failed to start daemon: ${String(err)}`);
  process.exitCode = 1;
  return;
}
```

After daemon starts, wait for agents to spawn then launch TUI:
```typescript
await sleep(3000); // Give daemon time to spawn agents

if (!isRunning(pid)) {
  console.error(`Agent failed to start. Check ${logPathForCompany(company.id)}`);
  process.exitCode = 1;
  return;
}

// Discover spawned agent sessions
const machineId = config.name;
const agentSessions = discoverAgentSessions(machineId);

if (noTui) {
  console.log("Zazig started successfully (headless).");
  console.log(`Logs: ${logPathForCompany(company.id)}`);
} else {
  console.log("Zazig started. Opening chat...\n");
  launchTui({
    companyName: company.name,
    agents: agentSessions,
    onShutdown: () => {
      // Ctrl+C: stop daemon and all agents
      try { process.kill(pid, "SIGTERM"); } catch { /* */ }
      removePidFileForCompany(company.id);
      console.log("\nZazig stopped.");
      process.exit(0);
    },
  });
}
```

Helper to discover agent tmux sessions:
```typescript
function discoverAgentSessions(machineId: string): Array<{ role: string; sessionName: string }> {
  try {
    const output = execSync("tmux list-sessions -F '#{session_name}'", {
      encoding: "utf-8",
      timeout: 5000,
    });
    return output
      .trim()
      .split("\n")
      .filter((s) => s.startsWith(`${machineId}-`))
      .map((sessionName) => ({
        role: sessionName.replace(`${machineId}-`, ""),
        sessionName,
      }));
  } catch {
    return [];
  }
}
```

**Step 2: Commit**

```bash
git add packages/cli/src/commands/start.ts
git commit -m "feat(cli): company picker + TUI launch in zazig start"
```

---

### Task 8: Rewrite stop.ts — company picker

**Files:**
- Modify: `packages/cli/src/commands/stop.ts`

**Step 1: Add company picker to stop**

```typescript
import { fetchUserCompanies, pickCompany } from "../lib/company-picker.js";
import { getValidCredentials } from "../lib/credentials.js";
import {
  isDaemonRunningForCompany,
  readPidForCompany,
  removePidFileForCompany,
} from "../lib/daemon.js";
import { DEFAULT_SUPABASE_ANON_KEY } from "../lib/constants.js";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRunning(pid: number): boolean {
  try { process.kill(pid, 0); return true; } catch { return false; }
}

export async function stop(): Promise<void> {
  let creds;
  try {
    creds = await getValidCredentials();
  } catch {
    console.error("Not logged in. Run 'zazig login' first.");
    process.exitCode = 1;
    return;
  }

  const anonKey = process.env["SUPABASE_ANON_KEY"] ?? DEFAULT_SUPABASE_ANON_KEY;
  const companies = await fetchUserCompanies(creds.supabaseUrl, anonKey, creds.accessToken);
  const company = await pickCompany(companies);

  const pid = readPidForCompany(company.id);
  if (!pid || !isRunning(pid)) {
    console.log(`Agent is not running for ${company.name}.`);
    return;
  }

  process.stdout.write(`Stopping zazig for ${company.name} (PID ${pid})...`);

  try { process.kill(pid, "SIGTERM"); } catch { /* */ }

  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    await sleep(200);
    if (!isRunning(pid)) break;
  }

  if (isRunning(pid)) {
    try { process.kill(pid, "SIGKILL"); } catch { /* */ }
  }

  removePidFileForCompany(company.id);
  console.log(" stopped.");
}
```

**Step 2: Commit**

```bash
git add packages/cli/src/commands/stop.ts
git commit -m "feat(cli): company picker in zazig stop"
```

---

### Task 9: Register chat command and update help

**Files:**
- Modify: `packages/cli/src/index.ts`

**Step 1: Add chat command**

Add to the imports section:
```typescript
import { chat } from "./commands/chat.js";
```

Add to the switch statement:
```typescript
case "chat":
  await chat();
  break;
```

Create a standalone `chat()` export in `chat.ts` that handles the reconnect flow:
```typescript
export async function chat(): Promise<void> {
  // Similar to start but just opens TUI to existing daemon
  // 1. Get creds, fetch companies, pick one
  // 2. Check daemon is running for that company
  // 3. Discover agent sessions
  // 4. Launch TUI
}
```

Update help text to include `chat` command.

**Step 2: Commit**

```bash
git add packages/cli/src/index.ts packages/cli/src/commands/chat.ts
git commit -m "feat(cli): register zazig chat command"
```

---

## Phase 6: Local Agent Changes

### Task 10: Executor — persistent agent discovery on startup

**Files:**
- Modify: `packages/local-agent/src/connection.ts` or `packages/local-agent/src/executor.ts`

**Step 1: On daemon startup, call company-persistent-jobs**

When the daemon starts and `ZAZIG_COMPANY_ID` is set, fetch persistent job definitions from the backend and spawn them via `handlePersistentJob`.

Add to the connection/startup flow:
```typescript
async function discoverAndSpawnPersistentAgents(): Promise<void> {
  const companyId = process.env["ZAZIG_COMPANY_ID"];
  if (!companyId) return; // No company context — skip

  const supabaseUrl = config.supabase.url;
  const anonKey = config.supabase.anon_key;
  const accessToken = config.supabase.access_token;

  const res = await fetch(
    `${supabaseUrl}/functions/v1/company-persistent-jobs?company_id=${encodeURIComponent(companyId)}`,
    {
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${accessToken}`,
      },
    }
  );

  if (!res.ok) {
    console.error(`[local-agent] Failed to fetch persistent jobs: HTTP ${res.status}`);
    return;
  }

  const jobs = await res.json();
  for (const job of jobs) {
    // Build a synthetic StartJob-like message and call handlePersistentJob
    await executor.spawnPersistentAgent(job);
  }
}
```

**Step 2: Commit**

```bash
git add packages/local-agent/src/
git commit -m "feat(local-agent): discover and spawn persistent agents on startup"
```

---

### Task 11: Executor — upsert persistent_agents table, company-scoped workspace

**Files:**
- Modify: `packages/local-agent/src/executor.ts`

**Step 1: Update handlePersistentJob**

Change workspace path from `~/.zazigv2/{role}-workspace` to `~/.zazigv2/{companyId}-{role}-workspace`.

Add upsert to `persistent_agents` table on spawn:
```typescript
const companyId = process.env["ZAZIG_COMPANY_ID"] ?? "";
const workspaceDir = join(homedir(), ".zazigv2", `${companyId}-${role}-workspace`);

// Upsert persistent_agents row
await this.supabase
  .from("persistent_agents")
  .upsert(
    {
      company_id: companyId,
      role,
      machine_id: this.machineId,
      status: "running",
      prompt_stack: msg.context ?? "",
      last_heartbeat: new Date().toISOString(),
    },
    { onConflict: "company_id,role,machine_id" }
  );
```

Add heartbeat updates (piggyback on existing heartbeat interval):
```typescript
// In the heartbeat function, add:
await this.supabase
  .from("persistent_agents")
  .update({ last_heartbeat: new Date().toISOString() })
  .eq("company_id", companyId)
  .eq("machine_id", this.machineId)
  .eq("status", "running");
```

On shutdown, set status to `stopped`:
```typescript
await this.supabase
  .from("persistent_agents")
  .update({ status: "stopped" })
  .eq("company_id", companyId)
  .eq("machine_id", this.machineId);
```

**Step 2: Commit**

```bash
git add packages/local-agent/src/executor.ts
git commit -m "feat(executor): upsert persistent_agents + company-scoped workspace"
```

---

## Phase 7: Cleanup

### Task 12: Remove send_message from CPO MCP tools

**Files:**
- Modify: `packages/local-agent/src/agent-mcp-server.ts`

**Step 1: Remove send_message tool registration**

Delete the `server.tool("send_message", ...)` block. The CPO talks directly through the TUI — no messaging MCP tool needed.

Note: Keep `send_message` available for non-CPO agents that may still use it. The removal should be conditional based on role, OR we keep it for now and just remove it from the CPO's `.claude/settings.json` auto-approve list. The simpler approach: keep the tool in the server but don't auto-approve it for CPO sessions. The executor can pass the role to the MCP server and conditionally register tools.

For now, the simplest path: just remove `send_message` from the CPO's `.claude/settings.json` permissions list in `handlePersistentJob`. The tool exists but the CPO can't use it without approval.

**Step 2: Commit**

```bash
git add packages/local-agent/src/executor.ts
git commit -m "feat(executor): remove send_message from CPO auto-approved tools"
```

---

### Task 13: Remove persistent agent dispatch from orchestrator

**Files:**
- Modify: `supabase/functions/orchestrator/index.ts`

**Step 1: Remove persistent agent dispatch path**

Delete:
- The code in `dispatchQueuedJobs` that handles `job_type === "persistent_agent"`
- The auto-requeue logic that re-creates persistent agent jobs on completion
- The prompt stack assembly specifically for persistent agents (now handled by `company-persistent-jobs` edge function)

**Step 2: Deploy orchestrator**

Run: `cd /Users/chrisevans/Documents/GitHub/zazigv2 && npx supabase functions deploy orchestrator`

**Step 3: Commit**

```bash
git add supabase/functions/orchestrator/index.ts
git commit -m "feat(orchestrator): remove persistent agent dispatch path"
```

---

### Task 14: Update CPO role prompt — terminal conversation instructions

**Files:**
- Create: `supabase/migrations/049_cpo_terminal_prompt.sql`

**Step 1: Write migration**

Replace the messaging instructions section of the CPO role prompt with terminal-specific instructions:

```sql
-- 049: Update CPO role prompt for terminal-first interaction
-- Removes Slack messaging instructions, adds direct terminal conversation guidance.

UPDATE public.roles
SET prompt = regexp_replace(
  prompt,
  '## Handling Inbound Messages.*$',
  '## Conversation

You are talking directly to a human in a terminal. They can see everything you do — tool calls, thinking, file reads, task lists. Be transparent about your process.

When you need to create features, query projects, or commission contractors, use your MCP tools. The human sees the tool calls in real time.

Do not use the send_message tool — you are not in a messaging gateway. Just speak directly.',
  's'  -- dot-matches-newline flag
)
WHERE name = 'cpo';
```

**Step 2: Apply migration**

Run: `cd /Users/chrisevans/Documents/GitHub/zazigv2 && npx supabase db push --include-all`

**Step 3: Commit**

```bash
git add supabase/migrations/049_cpo_terminal_prompt.sql
git commit -m "feat(db): update CPO role prompt for terminal conversation"
```

---

### Task 15: Clean up jobs table — remove persistent_agent entries

**Files:**
- Create: `supabase/migrations/050_remove_persistent_agent_jobs.sql`

**Step 1: Write migration**

```sql
-- 050: Remove persistent_agent from jobs table
-- Persistent agents now live in the persistent_agents table.

-- Delete any existing persistent_agent jobs
DELETE FROM public.jobs WHERE job_type = 'persistent_agent';

-- Update the job_type CHECK constraint to remove persistent_agent
ALTER TABLE public.jobs
  DROP CONSTRAINT IF EXISTS jobs_job_type_check;

ALTER TABLE public.jobs
  ADD CONSTRAINT jobs_job_type_check
  CHECK (job_type IN (
    'code', 'infra', 'design', 'research', 'docs', 'bug',
    'verify', 'breakdown', 'combine', 'deploy', 'review'
  ));
```

**Step 2: Update shared types**

Modify `packages/shared/src/messages.ts`: remove `"persistent_agent"` from `CardType`.

**Step 3: Apply migration**

Run: `cd /Users/chrisevans/Documents/GitHub/zazigv2 && npx supabase db push --include-all`

**Step 4: Commit**

```bash
git add supabase/migrations/050_remove_persistent_agent_jobs.sql packages/shared/src/messages.ts
git commit -m "feat(db): remove persistent_agent from jobs table"
```

---

### Task 16: Update zazig status to use persistent_agents table

**Files:**
- Modify: `packages/cli/src/commands/status.ts`

**Step 1: Update persistent agents query**

Replace the query that reads persistent agents from the jobs table with a query to the new `persistent_agents` table:

```typescript
// Replace the persistent agent jobs query with:
const persistentAgents = await apiFetch(
  `${creds.supabaseUrl}/rest/v1/persistent_agents` +
    `?select=id,role,status,machine_id,last_heartbeat,company_id` +
    `&company_id=in.(${companyIds.join(",")})`,
  headers
);

if (persistentAgents.length > 0) {
  console.log(`  Persistent agents:`);
  for (const agent of persistentAgents) {
    const role = String(agent.role ?? "unknown").toUpperCase();
    const agentStatus = String(agent.status ?? "unknown");
    const assigned = agent.machine_id === machineId ? " on this machine" : "";
    const icon = agentStatus === "running" ? "●" : "○";
    console.log(`    ${icon} ${role.padEnd(12)} ${agentStatus}${assigned}`);
  }
}
```

Remove the `&job_type=neq.persistent_agent` filter from the active jobs query (no longer needed).

**Step 2: Commit**

```bash
git add packages/cli/src/commands/status.ts
git commit -m "feat(cli): update zazig status to use persistent_agents table"
```

---

## Build & Verify

### Task 17: Build and smoke test

**Step 1: Build**

Run: `cd /Users/chrisevans/Documents/GitHub/zazigv2 && npm run build`
Expected: Clean build, no errors.

**Step 2: Smoke test**

Run: `cd /Users/chrisevans/Documents/GitHub/zazigv2/packages/cli && node dist/index.js start`
Expected: Company picker appears (if multiple companies), daemon starts, TUI opens showing CPO session.

**Step 3: Test chat reconnect**

Press Ctrl+C to exit TUI. Then:
Run: `node dist/index.js chat`
Expected: TUI reconnects showing CPO session still running.

**Step 4: Test stop**

Run: `node dist/index.js stop`
Expected: Company picker, daemon stops, CPO session torn down.
