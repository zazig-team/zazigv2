---
name: healthcheck
description: |
  Use when checking ecosystem health, diagnosing broken agents, or bootstrapping
  instances from cold start. Also use when Tom says "healthcheck", "what's running",
  "status", "bring everything up", or "is everything ok". Runs parallel diagnostics
  across all zazig instances and offers tiered repair.
---

# Healthcheck

On-demand diagnostic and recovery tool for the zazig exec team ecosystem.
Checks all instances, presents a dashboard, and fixes what's broken.

**Design doc:** `docs/plans/2026-02-19-healthcheck-skill-design.md`

## Invocation

- `/healthcheck` — check all instances
- `/healthcheck {instance-id}` — check one instance (e.g. `/healthcheck tom`)

## Flow

```
/healthcheck [instance-id]
    |
    v
Phase 1: Discovery — read machine.yaml, resolve instances
    |
    v
Phase 2: Parallel diagnosis — one subagent per instance
    |
    v
Phase 3: Render dashboard — green/yellow/red per check
    |
    v
Phase 4: Repair — auto-fix safe things, ask for risky things
    |
    v
Final status report
```

## Phase 1: Discovery

### 1. Read machine config

```bash
cat ~/.zazig/machine.yaml
```

This gives you all instances and their `local_roles`. If arg was passed, filter
to that instance only.

**Fallback if machine.yaml missing:**
1. Check `ZAZIG_INSTANCE_ID` env var — use that as single instance
2. Check for legacy `Codex-*` tmux sessions — assume `tom` instance
3. If nothing found, report error and stop

### 2. Check infrastructure services

Run these in parallel:

```bash
# launchd watchdog — one plist per instance: com.zazig.watchdog-{instance_id}
# Check each discovered instance:
ls ~/Library/LaunchAgents/com.zazig.watchdog-{instance_id}.plist 2>/dev/null && \
  launchctl list com.zazig.watchdog-{instance_id} 2>/dev/null || echo "NOT_LOADED"

# zazig.service (Python engine)
launchctl list com.zazig.exec 2>/dev/null
```

For each instance, record:
- Whether the plist FILE exists (`~/Library/LaunchAgents/com.zazig.watchdog-{instance_id}.plist`)
- Whether the service is loaded/running (PID present in launchctl output)

Record PID and status for dashboard.

## Phase 2: Parallel Diagnosis

**Spawn one background subagent per instance** using the Task tool. Each subagent
runs ALL checks below for its instance and returns structured results.

Subagent prompt template (fill in `{INSTANCE_ID}` and `{ROLES}`):

> You are a diagnostic agent checking zazig instance `{INSTANCE_ID}`.
> Run these checks and return a structured report. Do NOT fix anything — only diagnose.
>
> **Roles to check:** {ROLES from machine.yaml local_roles}
> **State dir:** `~/.local/share/zazig-{INSTANCE_ID}/`
> **Session prefix:** `{INSTANCE_ID}-` (e.g. `{INSTANCE_ID}-supervisor`, `{INSTANCE_ID}-vpe`)
>
> For EACH role in the roles list, check:
> 1. `tmux has-session -t {INSTANCE_ID}-{role_session_name}` (alive or dead?)
> 2. Read the role's state file from the state dir (see state file map below)
> 3. If the session is alive, capture pane: `tmux capture-pane -t {session} -p -S -20`
>    Look for: welcome screen, error messages, permission prompts, active work
>
> **Role → session name → state file map:**
>
> | Role | Session suffix | State file | Staleness field |
> |------|---------------|------------|-----------------|
> | supervisor | supervisor | supervisor-state.json | lastTick |
> | vp_eng | vpe | vpe-state.json | updatedAt |
> | cpo | cpo | cpo-state.json | updatedAt |
> | cto | cto | cto-state.json | updatedAt |
> | cmo | cmo | cmo-state.json | updatedAt |
>
> **Additional checks:**
> - State dir exists? List files in it.
> - `gate-status.json` — any active gates? Any expired?
> - `cpo-events.log` — tail last 20 lines. Any crash loops, double failures, escalations?
> - `cpo-standup.md` — exists? How old? Summarize last entry (3 lines max).
> - For each exec with a standup file (e.g. `cto-standup.md`), check mtime.
>
> **Staleness thresholds:**
>
> | Role | Green | Yellow | Red |
> |------|-------|--------|-----|
> | supervisor | <10min | 10-20min | >20min or dead |
> | vp_eng | <30min | 30-60min | >60min or dead |
> | cpo/cto/cmo | standup <4h | standup 4-8h | standup >8h or dead |
>
> **Return format — report as plain text, one section per role:**
> ```
> INSTANCE: {id}
> STATE_DIR: exists|missing
>
> ROLE: supervisor
> SESSION: alive|dead
> STALENESS: {seconds since last tick, or N/A if dead}
> STATUS: green|yellow|red
> DETAIL: {one line — e.g. "last tick 3m ago" or "session dead" or "stale 25m"}
> PANE: {one line summary of pane capture, or "N/A"}
>
> ROLE: vpe
> ...
>
> GATES: {count active} active, {count expired} expired
> GATE_DETAIL: {one line per expired gate, or "none"}
>
> EVENTS: {one line summary of notable events, or "clean"}
>
> OVERNIGHT: {3 line summary from cpo-standup.md, or "no standup found"}
> ```

### While subagents run

Check infrastructure in the main thread (already done in Phase 1). Wait for all
subagent results.

## Phase 3: Render Dashboard

Merge all subagent results into the dashboard format:

```
ZAZIG ECOSYSTEM HEALTH — {date} {time} UTC

┌─ Instance: {id} ─────────────────────────────────────
│  {Role}   {emoji}  {detail}
│  ...
│  Gates    {emoji}  {detail}
│  State dir {emoji} {detail}
│  Events   {emoji}  {detail}
└──────────────────────────────────────────────────────

┌─ Infrastructure ─────────────────────────────────────
│  watchdog (zazig)   {emoji}  {detail}  ← com.zazig.watchdog-zazig
│  watchdog (tom)     {emoji}  {detail}  ← com.zazig.watchdog-tom
│  zazig.service      {emoji}  {detail}  ← com.zazig.exec
└──────────────────────────────────────────────────────
```

**Status emoji mapping:**
- `green` → display as green indicator (healthy)
- `yellow` → display as yellow indicator (warning)
- `red` → display as red indicator (broken)
- Role not in instance's `local_roles` → display as white indicator (not configured)

### Classify actions

For each red/yellow finding, classify the repair:

| Finding | Classification | Action |
|---------|---------------|--------|
| Session dead | `[auto]` | Restart via launch script |
| State dir missing | `[auto]` | `mkdir -p` |
| Expired gate | `[auto]` | Clear expired gate in gate-status.json |
| Session alive but stale >2x threshold | `[ask]` | Kill and restart |
| Session alive, at welcome screen | `[auto]` | Send startup prompt via `Codex-send` |
| `context.md` missing | `[ask]` | Run `generate-context.py` |
| Cold start detected (all dead + no state) | `[ask]` | Full bootstrap sequence |
| Role not configured | `[info]` | Report only |
| launchd watchdog plist exists but not loaded | `[auto]` | `launchctl load ~/Library/LaunchAgents/com.zazig.watchdog-{instance_id}.plist` |
| launchd watchdog plist missing | `[ask]` | Run `scripts/install-watchdog.sh {instance_id}` |

### Overnight summary

If `cpo-standup.md` exists and is <24h old, append a brief overnight summary
section to the dashboard per instance. Pull from the subagent's OVERNIGHT field.

## Phase 4: Repair

### Auto-fixes (execute immediately, report what was done)

For each `[auto]` action:

**Restart dead session:**
```bash
# Ensure ZAZIG_INSTANCE_ID is set for the launch script
export ZAZIG_INSTANCE_ID="{instance-id}"

# Start in a new tmux session
tmux new-session -d -s {instance-id}-{role} -c ~/Documents/GitHub/zazig \
  "scripts/launch-{role}.sh {instance-id}"
```

Role → launch script mapping:
| Role | Script | Session suffix |
|------|--------|---------------|
| supervisor | launch-supervisor.sh | supervisor |
| vp_eng | launch-vpe.sh | vpe |
| cpo | launch-cpo.sh | cpo |
| cto | launch-cto.sh | cto |
| cmo | launch-cmo.sh | cmo |

**Send startup prompt to welcome-screen session:**
```bash
Codex-send {instance-id}-{role} "Read manuals/{ROLE}-AGENTS.md and ~/.zazig/instances/{instance-id}/context.md — you are the {Role} agent. Start your execution loop."
```

Role → manual mapping:
| Role | Manual file | Prompt role name |
|------|------------|-----------------|
| supervisor | SUPERVISOR-AGENTS.md | Supervisor |
| vp_eng | VP-ENG-AGENTS.md | VP-Engineering |
| cpo | CPO-AGENTS.md | CPO |
| cto | CTO-AGENTS.md | CTO |
| cmo | CMO-AGENTS.md | CMO |

**Create missing state dir:**
```bash
mkdir -p ~/.local/share/zazig-{instance-id}
```

### Confirmations (ask per fix)

Use `AskUserQuestion` for each `[ask]` action. Present the finding and proposed
fix. Respect the answer — if denied, skip and move on.

### Cold start bootstrap

If cold start detected for an instance, present:

```
Instance '{id}' appears to be a cold start (no sessions, state dir empty).
Bootstrap full instance? This will start: {list of configured roles}
```

If confirmed, execute the bootstrap sequence IN ORDER:
1. `mkdir -p ~/.local/share/zazig-{id}/`
2. Check `~/.zazig/instances/{id}/context.md` — generate if missing
3. Start Supervisor first, wait 15s for TUI ready
4. Start VP-Eng, wait 15s
5. Start remaining execs in parallel, wait 15s each
6. Verify all sessions alive

### Post-repair verification

After all repairs complete, wait 15 seconds, then re-check each repaired session:
```bash
tmux has-session -t {session-name} 2>/dev/null
```

Report final state:
```
REPAIRS COMPLETE:
  zazig-cto    restarted → alive
  tom-supervisor restarted → alive
  tom-vpe      restarted → alive (waiting for init)
```

If any repair failed, report it as still red and suggest manual investigation.

## Common Mistakes

- **Forgetting `ZAZIG_INSTANCE_ID` export** — launch scripts need this. Always set it.
- **Using `tmux send-keys` instead of `Codex-send`** — Codex TUI swallows raw send-keys. Always use `Codex-send`.
- **Restarting a session that's actively working** — check pane capture first. If it shows active tool calls, it's working, not stalled.
- **Not waiting for TUI ready** — launch scripts handle this internally, but if you send a prompt manually, wait for the `❯` prompt.
- **Killing sessions from inside tmux** — if you're running in a tmux session yourself, `tmux kill-session` on your own session would kill you. The skill runs from Codex which may or may not be in tmux — always check.
- **Wrong watchdog plist name** — watchdog plists are `com.zazig.watchdog-{instance_id}` (one per instance, installed by `scripts/install-watchdog.sh`). There is no shared `com.zazig.supervisor-watchdog`. Always check per-instance.
- **`tmux capture-pane -l N` fails** — use `-S -N` instead (e.g. `-S -20`). The `-l` flag exits 1 in this environment. See napkin.
- **`launchctl load` before checking file exists** — missing plist gives an I/O error, not "not found". Always `ls` the plist path first to distinguish "not installed" from "not loaded".
