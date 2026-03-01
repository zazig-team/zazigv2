# CLI for Local Agent Installation

**Date:** 2026-02-21
**Status:** Approved

## Problem

The local agent requires cloning the zazigv2 repo, building from source, configuring `machine.yaml` manually, and running with Doppler for secrets. This is fine for internal development but unusable for team members or customers who want to contribute compute to a company's pipeline.

## Solution

A new `@zazig/cli` npm package (binary: `zazig`) that wraps the local agent into an installable CLI with interactive setup, credential management, and daemon lifecycle commands.

**Install:** `npm install -g @zazig/cli`

## Commands

### `zazig login`

Authenticates the user and stores credentials locally.

- v1: Prompts for Supabase URL, anon key, and service role key (manual token entry)
- Future: Browser-based OAuth via Supabase Auth
- Stores credentials in `~/.zazigv2/credentials.json`
- Validates tokens by making a test API call before saving

### `zazig join <company>`

Connects this machine to a company's pipeline.

- Queries Supabase for the company by name/slug
- Prompts for:
  - Machine name (default: hostname)
  - Claude Code slots (default: 1)
  - Codex slots (default: 0)
- Writes `~/.zazigv2/machine.yaml` with company_id, slots, and supabase config
- Validates the company exists before writing config

### `zazig start`

Starts the local agent daemon in the background.

- Checks that login and join have been completed (credentials + machine.yaml exist)
- Forks the local-agent process to the background
- Writes PID to `~/.zazigv2/daemon.pid`
- Redirects stdout/stderr to `~/.zazigv2/logs/agent.log` (rotated)
- Exits immediately after confirming the daemon started successfully
- If already running (PID file exists and process alive): prints status and exits

### `zazig stop`

Stops the running daemon.

- Reads `~/.zazigv2/daemon.pid`
- Sends SIGTERM for graceful shutdown (the local agent already handles this)
- Waits up to 10s for process to exit, then SIGKILL
- Removes PID file
- If not running: prints message and exits cleanly

### `zazig status`

Shows current agent state.

- Checks if daemon is running (PID file + process check)
- If running, queries Supabase for:
  - Connection state (connected/disconnected)
  - Company name
  - Machine name
  - Slot allocation and usage
  - Active jobs (count + brief summary)
- If not running: shows "Agent is not running"

## Package Structure

```
packages/cli/
  src/
    index.ts          # Entry point, argument parser
    commands/
      login.ts        # zazig login
      join.ts         # zazig join <company>
      start.ts        # zazig start (daemonize)
      stop.ts         # zazig stop
      status.ts       # zazig status
    lib/
      credentials.ts  # Read/write ~/.zazigv2/credentials.json
      config.ts       # Read/write ~/.zazigv2/machine.yaml (reuses local-agent config)
      daemon.ts       # PID file management, fork, signal handling
  package.json        # bin: { "zazig": "./dist/index.js" }
  tsconfig.json
```

## Dependencies

- `commander` or `yargs` for argument parsing (or bare `process.argv` to keep it minimal)
- `prompts` or `inquirer` for interactive input
- Imports `@zazigv2/local-agent` for the actual daemon logic (or spawns it as a child process)

## Config Files

All stored in `~/.zazigv2/`:

| File | Purpose |
|------|---------|
| `credentials.json` | Supabase URL + keys (created by `zazig login`) |
| `machine.yaml` | Machine name, company_id, slots (created by `zazig join`) |
| `daemon.pid` | PID of running daemon (created by `zazig start`) |
| `logs/agent.log` | Daemon stdout/stderr output |

## Scope (v1)

### In scope

- `npm install -g @zazig/cli`
- `zazig login` (manual token entry)
- `zazig join <company>` (interactive machine config)
- `zazig start` (background daemon with PID file)
- `zazig stop` (graceful shutdown)
- `zazig status` (running state + basic info)

### Not in scope (future)

- Browser-based OAuth login
- `zazig logs` (tail daemon output)
- `zazig config` (edit settings without re-running join)
- `zazig jobs` (list active/recent jobs)
- `zazig update` (self-update)
- Homebrew tap / curl installer
- Auto-start on boot (launchd/systemd)
- Windows support
