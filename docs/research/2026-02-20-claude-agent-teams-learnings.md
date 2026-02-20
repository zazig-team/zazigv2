# Claude Agent Teams — Architecture Learnings for Zazig

**Date:** 2026-02-20
**Source:** https://oikon48.dev/en/blog/claude-agent-teams/
**Context:** Analyzing Agent Teams for applicability to zazig exec-to-exec coordination, squad dispatch, and autonomous exec patterns.

---

## What Agent Teams Is

An experimental Claude Code feature (`CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`) that adds native multi-agent coordination primitives on top of standard Claude Code sessions:

- **Task system**: Shared task list at `~/.claude/tasks/{team-name}/` with dependency modeling
- **Inbox messaging**: File-based inter-agent DMs at `~/.claude/teams/{team-name}/inboxes/{agent}.json`
- **Lifecycle management**: Teammates enter idle state between assignments, main agent shuts them down explicitly
- **Hook interception**: PreToolUse hooks can intercept TaskCreate/TaskUpdate for external orchestration

The CLI spawns agents with `--agent-id name@team`, `--team-name`, `--parent-session-id`, and related flags.

---

## Key Patterns

### Task Dependency Modeling

```json
{
  "id": "3",
  "subject": "Implement auth handler",
  "status": "pending",
  "blockedBy": ["1", "2"],
  "blocks": ["4"]
}
```

Four native tools: `TaskCreate`, `TaskGet`, `TaskList`, `TaskUpdate`. Shared across teammates. `CLAUDE_CODE_TASK_LIST_ID` enables multiple processes to share one task list.

### Inbox Messaging Schema

```json
{
  "from": "cto",
  "text": "Architecture approved. No tech-review blockers.",
  "summary": "Tech review cleared",
  "timestamp": "2026-02-20T10:00:00Z",
  "read": false
}
```

Bidirectional. Any agent can write to any other agent's inbox file. Agents poll their own inbox on each cycle.

### Lifecycle: Subagents vs. Agent Teams

| Aspect | Subagents (current zazig) | Agent Teams |
|---|---|---|
| Communication | One-way (result only) | Bidirectional |
| Visibility | Final result only | Ongoing via inbox/tasks |
| Idle state | N/A | Native — teammates wait |
| Task sharing | Manual (files, Trello) | Native shared task list |
| Dependency graph | Manual | Native blockedBy/blocks |

### Discussion Pattern

Multi-round deliberation: main agent posts proposal → teammates respond → rounds iterate. Works well with a dedicated Red Team agent providing adversarial critique. Avoids the synchronous gate problem where one agent blocks all others.

---

## Applicability to Zazig

### Problem 1: Exec-to-Exec Messaging Failures

**Current state**: Execs communicate via state files (`cto-standup.md` mtime), Trello cards, or Slack. All have failed:
- State file mtime ≠ progress (CTO was "alive" but not reviewing — VP-Eng blocked 24h)
- Single Trello card escalation — Tom never saw it
- Slack is optional in tmux mode

**Agent Teams answer**: The inbox JSON protocol (`~/.claude/teams/{team}/inboxes/{role}.json`) is a direct solution. Any exec can write to any other exec's inbox. Execs poll their inbox on each heartbeat cycle.

**Zazig adaptation**: Implement at `~/.local/share/zazig-{instance_id}/inboxes/{role}.json`. Same schema. CPO → CTO review request goes in CTO's inbox. CTO → VP-Eng approval goes in VP-Eng's inbox. Supervisor monitors all inboxes for staleness (unread message > N hours = exec is stuck). This is multi-path escalation by default.

### Problem 2: Squad Dispatch Fragility

**Current state**: VP-Eng dispatches worktree agents via `dispatch-with-worktree.sh`. Fragile mktemp handling, cpo-task.md inheritance bugs, no dependency ordering across concurrent squads.

**Agent Teams answer**: Native `blockedBy`/`blocks` task graph. VP-Eng writes task graph to shared state, squad agents poll for their task + dependencies. No file-based hand-off needed.

**Zazig adaptation**: Before dispatching squads, VP-Eng writes to `~/.local/share/zazig-{instance_id}/tasks/{project}/`. Each squad agent gets its task ID on launch (env var or stdin). It polls the task list, waits for `blockedBy` tasks to reach `completed`, then executes. VP-Eng reads the same task list to report progress to Supervisor/CPO.

### Problem 3: "Alive but Stuck" Watchdog Blindness

**Current state**: `tmux has-session` + state file mtime. Sessions can be alive but frozen at a permission prompt. Supervisor has no visibility into whether an exec is idle-waiting vs. idle-stuck.

**Agent Teams answer**: Teammates have explicit idle state. When idle, they're waiting for assignment. If they don't respond to a message within a timeout, they're stuck.

**Zazig adaptation**: Add `status` field to exec state files: `{"status": "idle|working|awaiting_review", "task": "...", "last_cycle": "..."}`. Supervisor treats `idle` + no inbox messages → healthy. `idle` + unread inbox messages for >30min → stuck, restart. This gives Supervisor authority to manage all execs (napkin: "Supervisor limited to VP-Eng only" — antipattern).

### Problem 4: Tech-Review as Infinite Gate

**Current state**: CPO adds `tech-review` label → VP-Eng waits indefinitely → if CTO is stuck, pipeline freezes completely. The gate-watchdog design doc (`docs/plans/2026-02-18-gate-watchdog-design.md`) addresses this but hasn't been built.

**Agent Teams answer**: Discussion Pattern with timed rounds. No synchronous gate — just a time-bounded deliberation window with a deterministic fallback.

**Zazig adaptation**: CPO posts review request to CTO inbox. CTO has N hours to respond (configurable per-label, e.g., `tech-review: 4h`). Supervisor monitors CTO inbox for a response. If timeout expires: Supervisor posts fallback decision (proceed with CTO caveats logged), alerts Tom. This converts an indefinite gate into a timed async review.

### Problem 5: Hook Interception → Trello Mirroring

**Agent Teams answer**: PreToolUse hooks intercept TaskCreate/TaskUpdate before execution.

**Zazig adaptation**: A Stop hook (or PreToolUse) on task state changes mirrors the transition to Trello. VP-Eng marks task `completed` → hook calls `trello-lite move <card> <done-list>`. This eliminates the manual Trello update step from exec workflows and keeps boards accurate without exec overhead.

---

## What This Doesn't Change

- **Slack-native exec identity**: Agent Teams are Claude Code sessions with no Slack presence. Slack bolt adapters remain the right external-facing layer.
- **Registry.yaml**: Agent Teams has no roster concept. Registry stays as source of truth for which execs exist.
- **Doppler/credential routing**: Unaffected.
- **Python service (zazig/)**: The Claude Agent SDK service is separate from Claude Code Agent Teams. These are complementary layers — SDK for external Slack events, Agent Teams patterns for internal exec coordination in tmux mode.

---

## Build Priority

| Priority | What | Solves |
|---|---|---|
| High | Exec inbox protocol at `~/.local/share/zazig-{instance_id}/inboxes/` | Single-path escalation failures, CTO 24h stall |
| High | Task graph in state dir for VP-Eng squad dispatch | mktemp fragility, cpo-task.md inheritance bugs |
| Medium | `status` + `awaiting_review` fields in exec state files | "Alive but stuck" watchdog blindness |
| Medium | Supervisor authority over all execs, not just VP-Eng | CTO/CPO stalls go unmanaged |
| Low | PreToolUse hook mirroring tasks → Trello | Manual Trello update overhead |

The inbox protocol is the highest-leverage first build — flat JSON, no new dependencies, directly addresses the most costly failure mode (exec comms failures that waste 24h+ cycles).

---

## Related

- Gate watchdog design: `docs/plans/2026-02-18-gate-watchdog-design.md`
- Napkin antipatterns: zazig `napkin.md` → "Patterns That Don't Work" section
- Agent Teams blog: https://oikon48.dev/en/blog/claude-agent-teams/
