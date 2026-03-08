# Field Testing & Role-Scoped Permissions

**Date:** 2026-03-08
**Status:** Design approved
**Authors:** Tom + Claude (brainstorming session)
**Companion docs:** `shipped/2026-02-24-verification-specialist-design.md`, `shipped/2026-02-24-idea-to-job-pipeline-design.md`, `active/2026-03-06-model-flexibility-design.md`
**Compound doc:** `docs/compound/2026-03-08-playwright-mcp-browser-testing.md`

---

## Problem

Features ship as "green" — all jobs complete, PRs merged, pipeline shows success — but don't actually work when you try them. The existing Verification Specialist checks acceptance criteria at the code level (does the code satisfy the spec?), but that's not the same as "does this actually work when you run it?"

Failure modes observed:
- **(A) Not deployed** — code merged but edge function not pushed, migration not run, config missing
- **(B) Runtime bugs** — code is deployed but breaks when a real user interacts with the UI/CLI
- **(C) Integration failures** — individual jobs work in isolation but the combined feature doesn't function end-to-end

The current pipeline has no mechanism to catch these. Human verification is the only safety net, and it doesn't scale — shipped features pile up and Tom has to remember to manually check each one.

A second, related problem: Playwright MCP tools and other simulation tooling need role-scoped permissions. A front-end Claude Code worker needs Playwright access; a backend Codex worker doesn't. Currently, permissions are machine-wide, not role-aware.

---

## Solution: Two-Tier Field Testing

### Tier 1: Build-Time Visual Verification (per-feature)

Claude Code workers (not Codex — they can't run `/loop` or Playwright) run visual verification during the build itself. The feature doesn't advance past `building` until the builder can see it working via Playwright, FlowDeck, or CLI.

- **No new pipeline stage needed** — the builder uses `/loop` + simulation tools to iterate until the UI/CLI output matches expectations
- **Guided by `field_test` instructions** on the feature (see Schema Changes below) — concrete user-journey steps that define "working" at the user level, not the code level
- **Natural role split**: Claude Code workers take front-end/visual work (better at UI + have Playwright), Codex workers take backend/pipeline work (API-verifiable, no browser needed)
- **Not every feature needs this** — `field_test` is nullable. Backend-only features skip it.

### Tier 2: Post-Ship Field Testing (per-idea)

Once all features for an idea are deployed, a **Field Tester** contractor runs the end-to-end user journey across the combined features.

Pipeline extension:
```
merged → deployed → field_testing → verified
```

- `deployed` — auto-advanced from `merged` after deploy checks pass
- `field_testing` — Field Tester contractor actively exercising the feature/idea
- `verified` — field test passed, feature confirmed working in production

---

## Architecture

### Pipeline Extension

**Two new feature statuses:** `deployed`, `field_testing`

**Deploy verification (merged → deployed):**
The orchestrator runs a lightweight automated deploy check when a feature hits `merged`:
- Is the edge function reachable? (HTTP health check)
- Did the migration land? (schema introspection or version check)
- Are required env vars / config present?

Pass → auto-advance to `deployed`. Fail → flag, notify human. The human bottleneck only kicks in on failure, not on every feature.

**Field Tester contractor (deployed → field_testing → verified):**
Auto-commissioned by the orchestrator when a feature enters `deployed` and has a non-null `field_test` field. If `field_test` is null, the feature skips straight to verified/complete.

### Field Tester Contractor

**Role:** `field-tester`
**Pattern:** Contractor (skill + role-scoped MCP tools), same as Breakdown Specialist and Verification Specialist.

**Capabilities:**
- Reads the feature's `field_test` instructions (concrete user-journey steps)
- Reads the original spec + AC for context
- Executes the test plan using appropriate simulation tools
- Produces evidence: screenshots (Playwright), command output (CLI), API responses
- Reports pass/fail per test step with evidence attached

**On pass:** orchestrator advances feature to `verified`
**On fail:** orchestrator flags feature, notifies human with the Field Tester's evidence report

### Idea-Level Field Testing

**Trigger:** When all features linked to an idea (via `promoted_to_type` / `promoted_to_id` on the ideas table) reach `deployed` or `verified`, the orchestrator auto-commissions an idea-level field test.

**Test instructions** live on the idea (`field_test` column on `ideas` table) — describes the end-to-end user journey across all the idea's features. This catches integration failures (category C) that per-feature testing misses.

**Same Field Tester contractor**, operating at idea scope rather than feature scope.

---

## Simulation Tooling

| Surface | Tool | Cost | Integration |
|---------|------|------|-------------|
| Web | Playwright MCP (built-in Claude Code plugin) | Free | Already working — see compound doc |
| iOS | FlowDeck CLI | $59/yr personal, $179/yr team | Native CLI, no MCP. Optional per-machine. |
| iOS | agent-browser v0.9+ | TBD | CLI-based |
| CLI | Direct execution | Free | Already available |
| API | curl / Supabase client | Free | Already available |

Machines declare their simulation capabilities, extending the `machine_backends` pattern from the model flexibility design. The orchestrator routes field testing jobs to machines that have the right tools installed.

### Auth for Simulation

For Playwright/browser-based testing, the Field Tester needs to authenticate. Established pattern (from compound doc):
1. Generate a magic link via Supabase admin API (no user password needed)
2. Navigate Playwright to the magic link URL
3. Navigate to an authenticated route (landing page doesn't process the auth hash)

For CLI testing: use test credentials / service role key from Doppler.
For API testing: use service role key or generate a short-lived JWT.

---

## Role-Scoped Permissions via Hooks

### The Problem

Different roles need different tool access. A front-end builder needs Playwright; a backend worker doesn't. Currently, permissions are set per-machine in `.claude/settings.local.json` — no role awareness.

### The Solution: PreToolUse Hook

A `PreToolUse` hook in `.claude/settings.json` (committed to repo, shared across machines) that:
1. Reads `agent_type` (= role) and `tool_name` from the JSON input on stdin
2. Checks a permissions matrix
3. Returns `allow` / `deny` / `ask` per tool per role

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": ".*",
        "hooks": [
          {
            "type": "command",
            "command": "$CLAUDE_PROJECT_DIR/.claude/hooks/role-permissions.sh"
          }
        ]
      }
    ]
  }
}
```

### Permissions Matrix

The matrix defines per-role tool access:

| Role | Playwright | CLI exec | MCP tools | File write |
|------|-----------|----------|-----------|------------|
| field-tester | yes | yes | scoped | read-only |
| senior-engineer (Claude) | yes | yes | scoped | yes |
| junior-engineer (Codex) | no | limited | scoped | yes |
| cpo | no | no | scoped | no |
| breakdown-specialist | no | no | scoped | no |
| verification-specialist | no | yes | scoped | no |

### Sync Mechanism

The permissions matrix lives in the DB (`roles` table, new `allowed_tools` JSONB column). Two sync options:

**Option A — HTTP hook (preferred):** The `PreToolUse` hook is an HTTP hook that calls a Supabase edge function. The edge function reads the role's `allowed_tools` from the DB and returns allow/deny. Latency is ~50-100ms per tool call.

**Option B — Local cache:** A `SessionStart` hook pulls the latest matrix from the DB and caches it as a local JSON file. The `PreToolUse` command hook reads from the local cache. Zero latency per tool call, but matrix updates require a new session.

Recommendation: **Option B** for latency reasons. A `SessionStart` hook that runs `curl` to fetch the matrix is fast and reliable. The matrix changes infrequently (only when roles are added/modified).

---

## Schema Changes

### Features table

```sql
-- New column: field test instructions (nullable)
ALTER TABLE public.features
  ADD COLUMN IF NOT EXISTS field_test text;

-- New statuses: deployed, field_testing
-- Update constraint (extends migration 098)
ALTER TABLE public.features DROP CONSTRAINT IF EXISTS features_status_check;
ALTER TABLE public.features ADD CONSTRAINT features_status_check CHECK (status IN (
  'created',
  'breaking_down',
  'building',
  'combining_and_pr',
  'verifying',
  'merged',
  'deployed',
  'field_testing',
  'cancelled',
  'failed'
));
```

### Ideas table

```sql
-- New column: idea-level field test instructions (nullable)
ALTER TABLE public.ideas
  ADD COLUMN IF NOT EXISTS field_test text;
```

### Roles table

```sql
-- New column: allowed tools matrix
ALTER TABLE public.roles
  ADD COLUMN IF NOT EXISTS allowed_tools jsonb DEFAULT '{}';
```

Example `allowed_tools` value:
```json
{
  "playwright": true,
  "cli_exec": true,
  "file_write": "read-only",
  "mcp_tools": ["query_features", "query_jobs"]
}
```

### Machines table (extension)

```sql
-- New column: simulation capabilities
ALTER TABLE public.machines
  ADD COLUMN IF NOT EXISTS simulation_capabilities text[] DEFAULT '{}';
```

Example values: `{'playwright', 'flowdeck', 'cli', 'api'}`

---

## Changes to Existing Components

### Featurify / Breakdown Specialist

Updated skill to write `field_test` instructions when the feature has a user-facing surface. The instructions are concrete, step-by-step:

> "Navigate to zazig.com/pipeline. Log in with test credentials. Verify the Field Testing column appears. Check that feature X shows with a green badge. Take a screenshot."

or:

> "Run `zazig status --format json`. Verify valid JSON output. Check that the response includes the `machines` field with at least one entry."

Not every feature gets a `field_test` — backend-only, migration, or config features leave it null.

### Orchestrator

New transitions:
- `merged` → run deploy checks → `deployed` (or flag failure)
- `deployed` + `field_test IS NOT NULL` → commission Field Tester → `field_testing`
- `deployed` + `field_test IS NULL` → skip to verified/complete
- `field_testing` + pass → verified/complete
- `field_testing` + fail → notify human with evidence

New idea-level trigger:
- All features for an idea reach `deployed`/verified → commission idea-level Field Tester (if `ideas.field_test` is populated)

### Workspace Assembly

Field Tester workspaces need:
- Playwright MCP permissions (auto-allowed via role-scoped hook)
- Auth credentials (magic link generation capability via service role key)
- The feature's `field_test` instructions + spec + AC in the prompt

### WebUI Pipeline

Two new columns on the pipeline board: **Deployed** and **Field Testing** (between Merged/Shipped and the terminal states).

---

## Implementation Priority

1. **Role-scoped permissions hook** — immediate standalone value, unblocks everything else, addresses the Slack thread concern. Small scope: one hook script + one migration for `allowed_tools` column.

2. **`field_test` column + featurify changes** — start writing field test instructions into features during breakdown. Small scope: one migration + skill update.

3. **Build-time Playwright loop for Claude Code workers** — Tier 1 visual verification. No new pipeline stages. Just the builder using `/loop` + Playwright guided by `field_test` instructions. Needs Playwright permissions pre-allowed for Claude Code roles.

4. **`deployed` + `field_testing` pipeline stages + Field Tester contractor** — Tier 2 post-ship automation. Larger scope: migrations, orchestrator changes, new contractor role + skill, WebUI pipeline columns.

5. **Idea-level field testing** — Tier 3. Depends on #4 being proven. Adds idea-level trigger + `ideas.field_test` column.

---

## Open Questions

1. **Deploy check specifics** — What does the automated deploy check actually verify? Edge function reachability is straightforward (HTTP HEAD), but migration verification and config checks need design. Could start with manual `deployed` confirmation and automate later.

2. **Evidence storage** — Where do Field Tester screenshots and reports go? Options: Supabase Storage bucket, job `result` column (already exists), or a dedicated `field_test_results` table.

3. **FlowDeck licensing** — $59/yr personal or $179/yr team. Worth it for iOS development? Decision can be deferred until iOS work begins.

4. **Field test failure retry** — When a field test fails and a human fixes the issue, does the Field Tester re-run automatically? Or does the human manually re-trigger?

5. **Matrix granularity** — Is tool-level granularity enough for the permissions matrix, or do we need argument-level control (e.g., "can use Bash but not `rm -rf`")? The hook system supports both, but argument-level adds complexity.
