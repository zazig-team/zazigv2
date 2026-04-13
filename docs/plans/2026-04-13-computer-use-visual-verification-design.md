# Pre-Merge Visual Verification via Claude Computer Use

**Date:** 2026-04-13
**Status:** Approved
**Author:** CPO

## Problem

No visual or interaction-level verification exists before merge. CI tests are headless unit/integration. Visual regressions are only caught after code hits master — either by humans on staging or not at all. The Electron desktop app is a complete blind spot.

## Solution

Add a new pipeline stage `visual_verifying` between `ci_checking` and `merging`. A verification agent uses Claude Code's built-in computer use tool to visually exercise the app from the PR branch, running both feature-specific acceptance tests and a project-level smoke suite.

## Pipeline Integration

### Updated feature flow

```
breaking_down → writing_tests → building → combining_and_pr → ci_checking → visual_verifying → merging → complete
```

### New primitives

- **Feature status:** `visual_verifying`
- **Card type:** `visual_verify`
- **Slot type:** `visual_verify`
- **Role:** `visual-verifier`
- **Model:** Sonnet 4.6

### Transitions

- CI check job completes → `triggerVisualVerification` creates `visual_verify` job → feature status → `visual_verifying`
- Visual verify job completes → `triggerMerging` fires → normal merge flow
- Visual verify job fails → `request-feature-fix` creates fix job with failure context + screenshots → feature resets to `building`
- Same max 5 retry cap as other stages

## Verification Agent

Runs as an **interactive Claude Code session in tmux** (not `-p`). Launched with `--dangerously-skip-permissions` to bypass computer use approval prompts.

### Execution sequence

1. Read `tests/visual/config.json` from the repo
2. Start dev server using configured command
3. Wait for ready check (poll configured URL)
4. Open browser via computer use
5. Run feature acceptance tests from job context — execute each step, screenshot at each verify point
6. Run smoke suite from `tests/visual/smoke-suite.md` — execute each test, screenshot at each verify point
7. Report pass/fail with screenshot evidence

### Limits

- 10 minute timeout
- 50 screenshot/action iteration cap
- Whichever hits first

### Job context payload

```json
{
  "type": "visual_verify",
  "featureId": "...",
  "featureBranch": "...",
  "prUrl": "...",
  "acceptanceTests": "acceptance test text from the feature spec",
  "smokeSuitePath": "tests/visual/smoke-suite.md",
  "configPath": "tests/visual/config.json"
}
```

### On failure — context passed to fix job

```json
{
  "type": "visual_verify_fix",
  "failedChecks": ["description of what failed"],
  "screenshotUrls": ["https://storage.../screenshot-1.png"],
  "acceptanceTests": "original acceptance tests"
}
```

## Machine Availability

### Idle detection

Visual verify jobs lock the machine's screen. Only dispatch to machines where no human is active.

The daemon checks user idle time via `ioreg`:

```bash
ioreg -c IOHIDSystem | awk '/HIDIdleTime/ {print $NF/1000000000; exit}'
```

Returns seconds since last mouse/keyboard input.

### Slot reporting

Machines report in every poll:

```json
{
  "slots_available": {
    "claude_code": 4,
    "codex": 4,
    "visual_verify": 0 | 1
  }
}
```

`visual_verify` = 1 only when:
- User idle > threshold (default: 5 minutes)
- No visual verify job already running on this machine

`agent-inbound-poll` edge function claims `visual_verify` jobs against this slot using the same atomic CAS logic as other slot types.

### Machine prerequisites

- macOS with Accessibility + Screen Recording permissions granted to Claude Code
- Claude Code v2.1.85+ (computer use support)
- Browser installed (Chromium/Chrome)
- Machine registers `visual_verify` capability in daemon config

No Docker, no virtual display, no additional infrastructure.

## Smoke Suite

### Location

Per-project, in the project's repo:
- `tests/visual/smoke-suite.md` — test definitions
- `tests/visual/config.json` — dev server and environment config

### Config format

```json
{
  "devCommand": "bun run dev",
  "baseUrl": "http://localhost:3000",
  "readyCheck": "http://localhost:3000/health",
  "timeout": 30
}
```

### Smoke suite format

```markdown
# Smoke Suite

## App loads
- Navigate to http://localhost:3000
- Verify: page loads without errors, main layout visible

## Navigation works
- Click the sidebar "Projects" link
- Verify: projects page loads, project list visible

## Settings accessible
- Click user avatar in top right
- Click "Settings"
- Verify: settings page loads, form fields visible
```

Natural language steps. Each test is a heading + action steps + verify assertion. Features can add new smoke tests in their PRs.

### Scope

All features run both:
1. **Acceptance tests** — feature-specific, from the feature spec
2. **Smoke suite** — project-level, catches unintended regressions

No exceptions — even pure backend features run the smoke suite.

## Phasing

### v1 (this feature)

- New pipeline stage, role, card type, slot type
- Idle detection via `ioreg`
- `--dangerously-skip-permissions` for unattended execution
- Smoke suite + acceptance tests on every feature
- Per-project config and smoke suite files
- On fail: reset to `building` with fix job + screenshots
- Sonnet 4.6, 10 min timeout, 50 iteration cap

### Deferred to v2

- Auto-cancel if user returns mid-verification
- Post-merge staging verification
- Electron/desktop app verification (native app testing beyond browser)
- Multiple viewport/resolution testing
- Dedicated verification machine mode
- Performance benchmarking via computer use

## Files to modify

### Edge functions
- `supabase/functions/agent-inbound-poll/index.ts` — claim `visual_verify` jobs against new slot type
- `supabase/functions/agent-event/handlers.ts` — handle `visual_verify` job completion/failure
- `supabase/functions/_shared/pipeline-utils.ts` — add `triggerVisualVerification`, update `triggerMerging` caller

### Local agent
- `packages/local-agent/src/executor.ts` — handle `visual_verify` job type, start interactive session, idle detection
- `packages/local-agent/src/connection.ts` — report `visual_verify` slot availability in poll

### Shared
- `packages/shared/src/messages.ts` — add `visual_verify` card type, `visual_verifying` feature status

### New files
- `tests/visual/smoke-suite.md` — initial smoke suite for zazigv2
- `tests/visual/config.json` — dev server config for zazigv2

### Database
- Migration: add `visual_verifying` to feature status enum
