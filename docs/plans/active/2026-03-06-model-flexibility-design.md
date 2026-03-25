# Model & Subscription Flexibility

**Date:** 2026-03-06
**Status:** Draft
**Authors:** Tom Weaver, Claude
**Part of:** Org Model — Orchestrator, Local Agent, WebUI, CLI

## Problem

The current system hardcodes model-to-role mappings (`senior-engineer` = `claude-sonnet-4-6`) and limits machines to exactly two slot types (`claude_code | codex`). This creates several failures:

1. **Availability mismatch** — jobs dispatched to machines that can't run the required model (e.g., Chris lacks Codex Spark on his Pro plan, jobs silently fail).
2. **Model lock-in** — roles are welded to specific models. No fallback when a model is unavailable, no flexibility for alternative providers.
3. **No configuration surface** — users can't declare what subscriptions/models they have. It's all hardcoded in DB seeds and config files.
4. **Brittle to change** — new models (e.g., Codex 5.4) require migrations to update CHECK constraints, role seeds, and routing logic.

The system needs to decouple roles from models, let machines self-report what they can run, and route jobs flexibly based on what's actually available.

## Core Concepts

Three layers replace the current hardcoded model/slot system:

### 1. Backends

An execution environment that can run models. Examples: `claude-code`, `codex-cli`, `gemini-cli`, `ollama`, `openai-api`, `anthropic-api`.

A machine has N backends, each with:
- A slot capacity (how many concurrent jobs)
- A list of models it can currently run (discovered by probing)

### 2. Role Model Preferences

Ordered fallback list per role. Example:

```
senior-engineer -> [claude-sonnet-4-6, gemini-2.5-pro, qwen-3]
```

The orchestrator walks the list and picks the first model that any available machine can actually run. If Sonnet is maxed out everywhere but a machine has Qwen, the job falls through automatically.

### 3. Probing

The local agent discovers what's available at runtime by testing each backend/model. No static config for model lists. Heartbeats carry the live truth. If a user runs out of tokens, the model drops off the next probe cycle, and the orchestrator routes around it.

## Architecture

### Dispatch Flow

```
Job created (with role)
  -> look up role.model_preferences
  -> for each model in preference order:
      -> find online machines with a backend that lists this model AND has available slots
      -> if found: dispatch to that machine, record model + backend on job
      -> if not found: try next model in list
  -> if no model works: job stays queued
```

### Backend Execution Abstraction

Each backend implements a common interface:

```typescript
interface Backend {
  name: string;                          // 'claude-code', 'codex-cli', 'openai-api', 'ollama'
  type: 'cli' | 'api';

  // Discovery
  detect(): Promise<boolean>;            // Is this backend available on this machine?
  authenticate(): Promise<boolean>;      // Trigger login/auth flow
  isAuthenticated(): Promise<boolean>;   // Check current auth status
  probeModels(): Promise<string[]>;      // Which models can this backend run right now?

  // Execution
  execute(job: StartJob): Promise<void>; // Run a job using this backend
}
```

Adding a new backend (Perplexity API, LM Studio, etc.) means writing one class implementing this interface and registering it. No orchestrator changes, no schema changes, no protocol changes.

### MVP Backends

| Backend | Type | Auth Method | Models |
|---------|------|-------------|--------|
| `claude-code` | cli | `claude login` (OAuth) | opus, sonnet, haiku |
| `codex-cli` | cli | `codex login` | codex models |
| `gemini-cli` | cli | `gemini auth login` | gemini models |
| `ollama` | api | None (local) | whatever's pulled |
| `openai-api` | api | API key in keychain | gpt-4o, o3, etc. |
| `anthropic-api` | api | API key in keychain | opus, sonnet, haiku |

### Probing Strategy

Probes run on daemon startup + every 30 minutes. On job failure with `model_unavailable`, an immediate re-probe is triggered.

| Backend | Detection | Model Discovery |
|---------|-----------|-----------------|
| `claude-code` | `which claude` | `claude --model X -p "hi" --max-turns 1` per candidate |
| `codex-cli` | `which codex` | Similar lightweight invocation per model |
| `gemini-cli` | `which gemini` | `gemini --model X "hi"` |
| `ollama` | HTTP `localhost:11434/api/tags` | Returns full model list directly |
| `openai-api` | API key in keychain | Test call per model |
| `anthropic-api` | API key in keychain | Test call per model |

### Credential Storage

Credentials stay on the user's local machine. Never in our DB.

- **CLI backends:** Credentials managed by the CLI tool itself (e.g., Claude Code stores its own OAuth tokens).
- **API backends:** API keys stored in macOS Keychain (or platform equivalent).
- **Local backends (Ollama):** No credentials needed.

The orchestrator never sees credentials. It only sees "machine X can run model Y with Z available slots."

## Schema Changes

### New Table: `machine_backends`

```sql
CREATE TABLE machine_backends (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  machine_id  uuid NOT NULL REFERENCES machines(id) ON DELETE CASCADE,
  backend     text NOT NULL,
  total_slots int  NOT NULL DEFAULT 1 CHECK (total_slots >= 0),
  models      text[] NOT NULL DEFAULT '{}',
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (machine_id, backend)
);
```

### Modify `roles` Table

- Add `model_preferences text[] NOT NULL DEFAULT '{}'`
- Populate from existing `default_model` values
- Drop `default_model` column
- Drop `slot_type` column (backend is derived from the matched model)

### Modify `jobs` Table

- Add `backend text` column (records which backend executed the job)
- Drop `slot_type` column
- Drop `model` CHECK constraint (models are now dynamic)

### Modify `machines` Table

- Drop `slots_claude_code` column (replaced by `machine_backends`)
- Drop `slots_codex` column

### `complexity_routing` Table

No changes needed. It maps complexity to role, and the role now carries `model_preferences`. The indirection still works.

## Heartbeat Protocol Change

```typescript
// Old
interface Heartbeat {
  type: "heartbeat";
  machineId: string;
  slotsAvailable: Record<SlotType, number>;
}

// New
interface Heartbeat {
  type: "heartbeat";
  machineId: string;
  backends: {
    [backend: string]: {
      available: number;
      total: number;
      models: string[];
    };
  };
}
```

Protocol version bumps. Old agents talking to new orchestrator get rejected with "upgrade required" message. Clean break, no shimming.

## Orchestrator Dispatch Query

```sql
SELECT m.id, m.name, mb.backend, mb.total_slots,
  mb.total_slots - COALESCE(running.count, 0) AS available
FROM machines m
JOIN machine_backends mb ON mb.machine_id = m.id
LEFT JOIN (
  SELECT machine_id, backend, count(*)
  FROM jobs WHERE status IN ('running', 'dispatched')
  GROUP BY machine_id, backend
) running ON running.machine_id = m.id AND running.backend = mb.backend
WHERE m.status = 'online'
  AND $1 = ANY(mb.models)
  AND mb.total_slots - COALESCE(running.count, 0) > 0
ORDER BY available DESC
LIMIT 1
```

Run once per model in the role's preference list until a match is found. If no model matches, job stays queued.

## User Experience

### New User (Day 1)

Sign up, connect Claude (everyone has it). System auto-activates:

| Role | model_preferences |
|------|------------------|
| `cpo` | `[claude-opus-4-6]` |
| `cto` | `[claude-sonnet-4-6]` |
| `senior-engineer` | `[claude-sonnet-4-6]` |
| `reviewer` | `[claude-sonnet-4-6]` |
| `breakdown-specialist` | `[claude-sonnet-4-6]` |

Zero configuration. `zazig start` probes for Claude Code, reports available models. User is talking to their CPO about their business within minutes.

### Adding More Capabilities (Later)

Roles have two states:
- **Active** — model preferences set, at least one machine can run at least one preferred model.
- **Available** — role exists but not configured or no machine can serve it. Visible in WebUI as unlockable.

Two paths to activate roles:

**Path A: "I got a new tool"** — User connects Codex. WebUI shows: "Codex unlocks Junior Engineer (fast parallel coding). Activate?" User confirms. Role activates with appropriate model preferences.

**Path B: "I want a capability"** — User browses available roles, sees "Deep Researcher", clicks it. "This role needs one of: Gemini, Perplexity, Grok. Which do you have?" User picks. Role activates with that model.

### User Mental Model: "Connections"

Users see providers, not CLIs or API keys:

```
Your Connections:
  [check] Claude (Anthropic)     - 2 slots, Opus + Sonnet
  [check] Codex (OpenAI)         - 1 slot, Codex Spark
  [    ]  Gemini (Google)        - Connect ->
  [    ]  Perplexity             - Connect ->
  [    ]  Local Models (Ollama)  - Set up ->
```

Behind each connection is either a CLI login or an API key, but the user doesn't need to know or care which. "Connect" does whatever is needed: spawns an OAuth flow, opens a CLI login page, or walks them through setup.

### CLI Flow

```
$ zazig start

Detecting backends...
  [check] claude-code (claude-opus-4-6, claude-sonnet-4-6)
  [check] codex-cli (gpt-5.4-codex, gpt-5.3-codex-spark)
  [check] ollama (qwen-3, deepseek-r1)
  [x]     gemini-cli (not installed)

Max concurrent Claude Code sessions? [5]:
Max concurrent Codex sessions? [2]:
Max concurrent Ollama sessions? [3]:

Starting daemon...
Machine 'tom-mac-mini' online with 3 backends, 7 models
```

Unauthenticated backends prompt to log in:

```
  [!] codex-cli (installed but not logged in)
  Would you like to log in to Codex now? [Y/n]: y
  Opening Codex login...
  [check] codex-cli (gpt-5.4-codex, gpt-5.3-codex-spark)
```

New command `zazig backends` shows fleet-wide status.

### Config File

Stores only slot counts. Model lists are never in config — always discovered by probing.

```json
{
  "name": "tom-mac-mini",
  "backends": {
    "claude-code": { "total_slots": 5 },
    "codex-cli": { "total_slots": 2 },
    "ollama": { "total_slots": 3 }
  }
}
```

### WebUI Views

1. **Fleet view** (Settings) — all machines, their backends, capacity, live model availability.
2. **Roles marketplace** — grid of all roles. Active ones show preferences and serving machines. Available ones show what's needed to unlock. Click to configure preferences.
3. **Role config modal** — drag-to-reorder model preference list. Add models from dropdown of models seen across fleet. Warning if no machine can serve any preferred model.

## Self-Healing Behavior

- **Token exhaustion:** Model drops off next probe cycle (30 min, or immediate on job failure). Heartbeat stops advertising it. Orchestrator routes to next preference or different machine. When tokens refresh, next probe picks it back up.
- **Machine goes offline:** Existing behavior (2 min heartbeat timeout). Jobs re-queued. Model preferences mean they can land on a different machine with a different backend.
- **New model released:** Add to a role's preference list (WebUI or migration). Any machine whose probe discovers it starts advertising it. Zero orchestrator changes.
- **Backend auth expires:** Probe detects it. Backend's models drop off heartbeat. `zazig start` or WebUI prompts re-auth.

## Implementation Plan

### Phase 1: Schema Migration

1. Create `machine_backends` table
2. Add `model_preferences text[]` to `roles`, populate from `default_model`
3. Add `backend text` to `jobs`
4. Backfill `machine_backends` from existing `slots_claude_code`/`slots_codex`
5. Backfill `jobs.backend` from existing `slot_type`
6. Drop old columns: `machines.slots_claude_code`, `machines.slots_codex`, `jobs.slot_type`, `roles.slot_type`, `roles.default_model`
7. Drop `model` CHECK constraint on `jobs`

### Phase 2: Local Agent

1. Implement `Backend` interface + MVP backend classes (claude-code, codex-cli, gemini-cli, ollama, openai-api, anthropic-api)
2. Replace slot tracker with backend-aware tracker
3. Implement probing (startup + periodic)
4. Update heartbeat to new protocol
5. Update job executor to route via backend
6. Update `config.json` format
7. Update `zazig start` first-run flow with backend detection + auth

### Phase 3: Orchestrator

1. Update heartbeat handler to upsert `machine_backends` table
2. Replace dispatch logic with model preference walking
3. Remove `SlotType` enum from shared types
4. Protocol version bump — reject old agents with upgrade message

### Phase 4: WebUI/CLI

1. `zazig backends` command
2. Fleet view in WebUI
3. Roles marketplace view
4. Role preference config modal
5. Connections management page

**Phases 1-3 ship together** (one PR — interdependent). Phase 4 follows incrementally.

### Backward Compatibility

Clean break. Protocol version bumps. Old agents are rejected with "upgrade required". No shimming — the old two-slot system is fully replaced.

## Open Questions

1. **Probe cost** — running `claude --model X -p "hi"` for each model on each probe cycle costs tokens. Should we use a cheaper detection method (version/capability endpoint) if one becomes available?
2. **Company-level preference overrides** — the design supports this via a `company_role_preferences` table or JSONB on `company_roles`. Not MVP, but should we reserve the schema space?
3. **Model aliases** — should roles reference abstract names (`sonnet`, `opus`) that resolve to versioned model IDs (`claude-sonnet-4-6`), or always use exact model IDs?
4. **Rate limiting awareness** — beyond binary "model available or not", should probes detect rate limit proximity and report degraded capacity?
