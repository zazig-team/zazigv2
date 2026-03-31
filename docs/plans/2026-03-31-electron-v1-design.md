# Electron Desktop App v1.0 — Design

**Status:** Approved
**Date:** 2026-03-31

## Summary

A desktop app that combines a pipeline dashboard with embedded terminal access to agent sessions. Launched via `zazig desktop`. All data comes from the CLI — Electron never talks to Supabase directly.

## Architecture

```
┌─────────────────────────────────────────────────┐
│                 Electron App                     │
│                                                  │
│  ┌──────────────┐  ┌─────────────────────────┐  │
│  │   Pipeline    │  │     Terminal Pane        │  │
│  │   Column      │  │     (xterm.js)           │  │
│  │   (~280px)    │  │                           │  │
│  │              │  │  ← tmux attach to         │  │
│  │  Status bar  │  │    selected session       │  │
│  │  Active jobs │  │                           │  │
│  │  Failed      │  │                           │  │
│  │  Backlog     │  │                           │  │
│  │  Completed   │  │                           │  │
│  │              │  │                           │  │
│  │  [⟳ 5s poll] │  │                           │  │
│  └──────────────┘  └─────────────────────────┘  │
└──────────────────────────────────────────────────┘
         │                        │
    zazig CLI (--json)       tmux attach -t <session>
                                (via node-pty)
```

- **Main process** — spawns CLI commands as child processes, parses JSON stdout, sends data to renderer via IPC
- **Renderer** — React + xterm.js. Two panels: pipeline column (left), terminal pane (right)
- **Terminal** — xterm.js + node-pty. Clicking a job/agent in the pipeline runs `tmux attach -t <session>` in the terminal pane
- **Data** — main process polls `zazig status --json` every 5 seconds, diffs the result, pushes updates to renderer via IPC
- **Key constraint:** CLI is the single API surface. If we add a feature to the CLI, Electron gets it for free.

## Pipeline Column (~280px fixed)

Top to bottom:

1. **Status bar** — daemon running/stopped, company name
2. **Active jobs** — each with:
   - Job title
   - Parent feature name
   - Local run indicator (green dot = tmux session exists, grey = not)
   - "Watch" button → attaches tmux session in terminal pane
3. **Failed features** — red, with retry/park actions
4. **Backlog** — queued features waiting for capacity
5. **Recently completed** — last 5, collapsible

### Data sources

- `zazig status --json` — daemon state, active jobs, local tmux sessions
- `zazig standup --json` — pipeline counts, failed/stuck/completed lists
- Cross-reference job IDs from standup against active tmux sessions from status to show green/grey local indicator

### Interactions

- Click a job → attaches its tmux session in the terminal pane
- Click "Watch" on a non-running job → shows "not running locally"
- Failed features show inline — no drill-down views for v1.0

## Terminal Pane

- **Default state:** On launch, attaches to CPO session if one exists. Otherwise shows "No active agents — run `zazig start` to begin"
- xterm.js terminal powered by node-pty
- Clicking a job/agent in pipeline runs `tmux attach -t <session-name>` in the PTY
- Full interactive terminal — type, scroll, resize
- Mouse mode enabled (matches `zazig chat` behaviour)
- **Session switching:** clicking a different item detaches current session and attaches the new one
- One terminal pane, one session at a time — no tabs for v1.0

## Launch & Packaging

- `zazig desktop` CLI command spawns the Electron process
- Lives in `packages/desktop` in the monorepo
- Electron pulled as a dev dependency, app code bundled with esbuild
- No code signing, no DMG, no auto-update for v1.0
- Single window, not restorable across restarts

## Decisions Log

| Decision | Choice | Rationale |
|---|---|---|
| Data access | CLI only, no direct Supabase | Single API surface, CLI is already instrumented with --json |
| Terminal integration | tmux passthrough | Sessions already exist, single source of truth, works alongside `zazig chat` |
| Layout | Split view | Pipeline always visible, terminal always visible, matches actual workflow |
| Data refresh | 5s polling | Simple, reliable, local CLI calls are cheap. Event-driven deferred to v2 |
| Distribution | `zazig desktop` command | Consistent with existing CLI UX, no separate download |
| Packaging | No signing, no DMG | v1.0 scope — standalone DMG is Phase 2 |

## Out of Scope (v1.0)

- Code signing / DMG distribution
- Auto-update
- Tab bar for multiple terminal sessions
- Event-driven updates (daemon push)
- Drill-down views for features/jobs
- Window state persistence across restarts
- Idea triage UI (pipeline only)
