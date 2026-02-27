# Interactive Jobs & Remote Control Design

**Date:** 2026-02-27
**Status:** Approved

## Problem

The pipeline needs interactive human-agent communication at two points:

1. **Test deploy config** — `zazig.test.yaml` doesn't exist for most projects. Creating it requires back-and-forth with a human (what provider? project ID? custom script?).
2. **Feature testing** — once deployed to test, a human needs to review, request small fixes, and ultimately approve or decline the feature.

Slack is too slow and clunky for this kind of interactive work. The existing `job_blocked` → Slack thread → `job_unblocked` flow is not a good experience.

## Solution

Use Claude Code's `/remote-control` command to enable real-time human-agent collaboration. Slack becomes the notification channel (posting connection URLs), while the actual interaction happens via `/remote-control` sessions.

## Design

### 1. Interactive Job Mode

The `roles` table gets a new boolean column: `interactive` (default `false`).

When `interactive: true`, the executor spawns the job in TUI mode (no `-p` flag) — same as CPO persistent agents, but the job is **not persistent**. It completes and exits when the work is done.

- Reuses the existing persistent agent spawn path but skips heartbeat/keepalive logic
- Longer timeout than `-p` jobs (30 minutes instead of 10)
- Still writes a report file when done
- Still tracked in `activeJobs` and releases its slot on completion

### 2. `enable_remote` MCP Tool

A new tool in `agent-mcp-server.ts` that any interactive job can call:

1. Sends `/remote-control` to the agent's own tmux session via `tmux send-keys`
2. Waits briefly, then uses `tmux capture-pane` to capture the output
3. Parses the URL from the captured output
4. Returns the URL to the agent

The agent then uses the existing `send_message` MCP tool to post the URL to the feature's Slack thread.

No new message types or orchestrator changes needed — the agent decides when it needs human help and handles it with two MCP tool calls.

### 3. Test Deploy Flow

The `test-deployer` role has `interactive: true`.

When a feature passes verification:

1. Orchestrator creates a `deploy_to_test` job (already implemented)
2. Executor spawns the test-deployer in TUI mode
3. Agent checks for `zazig.test.yaml` in the repo root
4. **If found:** runs the deploy command, reports the URL
5. **If missing:** calls `enable_remote` → posts URL to Slack thread ("I need help setting up test deploy config") → waits for human to connect → collaborates to create `zazig.test.yaml` → commits it to the branch → proceeds with deploy

Once the config exists (first time only), future deploys for other features in the same project find the yaml and deploy without human input.

### 4. Testing Session Flow

A new `tester` role with `interactive: true`.

When a feature reaches `ready_to_test`:

1. Orchestrator creates a `tester` job for the feature
2. Tester agent starts in TUI mode, calls `enable_remote`, posts the URL to the feature's Slack thread: "Feature X is ready for testing. Connect here to review: {url}"
3. Session stays alive, waiting for a human to connect
4. Human connects, reviews the test URL with the agent — can ask for small fixes, agent pushes to branch, human refreshes the test env
5. Session ends when the human either:
   - **Approves** → agent sends `feature_approved`, job completes, feature advances to prod deploy
   - **Declines** → agent sends `feature_rejected` with feedback, job completes, feature goes back through the pipeline

### 5. Constraints

- Co-founders are in different countries; jobs can run on any machine
- `/remote-control` enables connection from any device (phone, laptop, another machine)
- Slack is the notification channel only — interaction happens in `/remote-control`
- Small fixes stay in the light loop (push to branch, test env auto-rebuilds, human refreshes)
- Big fixes cause the feature to go back through verify

## Components Summary

| Component | Change |
|---|---|
| `roles.interactive` column | New boolean, default false |
| `enable_remote` MCP tool | New tool in `agent-mcp-server.ts` |
| `test-deployer` role | Set `interactive: true` |
| `tester` role | New role, `interactive: true` |
| Executor | Support interactive non-persistent jobs (TUI mode, 30min timeout, report on exit) |
| Orchestrator | Create `tester` job when feature transitions to `ready_to_test` |
| Slack | Both roles post `/remote-control` URLs to feature Slack threads |
