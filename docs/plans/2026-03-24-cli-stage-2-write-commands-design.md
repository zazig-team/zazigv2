# CLI Stage 2: Write Commands

**Date:** 2026-03-24
**Status:** Approved
**Author:** CPO

## Summary

Add 6 write commands to the zazig CLI, giving agents the ability to create and mutate pipeline entities without MCP tools. Follows the same patterns established in CLI Stage 1 (read commands) and Stage 1.1 (pagination).

## Commands

All commands require `--company <uuid>`. All output JSON to stdout, errors to stderr with exit code 1. No interactive prompts.

### 1. `zazig create-feature`

Creates a feature and immediately queues it for pipeline breakdown.

**Required flags:**
- `--title <string>`
- `--description <string>`
- `--spec <string>`
- `--acceptance-tests <string>`
- `--priority <low|medium|high>`

**Optional flags:**
- `--project-id <uuid>`
- `--human-checklist <string>`
- `--fast-track` (boolean, skips breakdown — single direct engineering job)

**Edge function:** `POST /functions/v1/create-feature`
**Returns:** `{ feature_id: "<uuid>" }`

**CLI-enforced quality gate:** The API only requires `title`, but features enter the pipeline immediately on creation. The CLI requires description, spec, acceptance_tests, and priority to prevent empty features from wasting build cycles.

### 2. `zazig update-feature`

Updates an existing feature's metadata or status.

**Required flags:**
- `--id <uuid>`
- At least one field to update (CLI rejects no-op calls)

**Optional flags:**
- `--title <string>`
- `--description <string>`
- `--spec <string>`
- `--acceptance-tests <string>`
- `--human-checklist <string>`
- `--priority <low|medium|high>`
- `--status <breaking_down|complete|cancelled>`
- `--fast-track` (boolean)

**Edge function:** `POST /functions/v1/update-feature`
**Returns:** `{ ok: true }`

**Note:** Status `cancelled` is included — the edge function supports it even though the MCP schema omits it.

### 3. `zazig create-idea`

Creates a new idea in the ideas inbox.

**Required flags:**
- `--raw-text <string>`
- `--originator <string>`

**Optional flags:**
- `--title <string>`
- `--description <string>`
- `--source <terminal|slack|telegram|agent|web|api|monitoring>`
- `--domain <product|engineering|marketing|cross-cutting|unknown>`
- `--priority <low|medium|high|urgent>`
- `--scope <string>`
- `--complexity <string>`
- `--tags <comma-separated>`
- `--project-id <uuid>`

**Edge function:** `POST /functions/v1/create-idea`
**Returns:** `{ idea_id: "<uuid>" }`

### 4. `zazig update-idea`

Updates triage metadata on an existing idea.

**Required flags:**
- `--id <uuid>`
- At least one field to update (CLI rejects no-op calls)

**Optional flags:**
- `--title <string>`
- `--description <string>`
- `--status <new|triaging|triaged|developing|specced|workshop|hardening|parked|rejected|done>`
- `--priority <low|medium|high|urgent>`
- `--triage-notes <string>`
- `--triage-route <promote|develop|workshop|harden|park|reject|founder-review>`
- `--spec <string>`
- `--tags <comma-separated>`
- `--complexity <simple|medium|complex>`
- `--project-id <uuid>`

**Edge function:** `POST /functions/v1/update-idea`
**Returns:** `{ ok: true }`

### 5. `zazig promote-idea`

Promotes a triaged idea to a feature, job, research track, or capability.

**Required flags:**
- `--id <uuid>`
- `--to <feature|job|research|capability>`
- `--project-id <uuid>` (required when `--to` is `feature` or `job`)

**Optional flags:**
- `--title <string>` (overrides idea title on promoted entity)

**Edge function:** `POST /functions/v1/promote-idea`
**Returns:** `{ idea_id, promoted_to_type, promoted_to_id, promotion_id }`

**Note:** `capability` is included — the edge function supports it for the hardening pipeline, even though the MCP schema omits it.

### 6. `zazig create-rule`

Creates a project rule injected into future agent prompts.

**Required flags:**
- `--project-id <uuid>`
- `--rule <string>`
- `--applies-to <comma-separated>` (e.g. `code,combine`)

**Edge function:** `POST /functions/v1/create-project-rule`
**Returns:** `{ rule_id: "<uuid>" }`

## Implementation Pattern

Each command follows the identical structure from Stage 1:

```
1. Parse process.argv for flags (manual parsing, no library)
2. Validate required flags — stderr error + exit(1) if missing
3. For update commands: validate at least one mutable field is present
4. getValidCredentials() — auto-refresh JWT
5. Resolve supabaseUrl from config/creds
6. POST to edge function with:
   - Headers: Authorization Bearer, apikey, x-company-id
   - Body: JSON with all provided fields
7. stdout.write(JSON.stringify(response))
8. Errors: stderr.write(JSON.stringify({ error })) + exit(1)
```

New files (one per command):
- `packages/cli/src/commands/create-feature.ts`
- `packages/cli/src/commands/update-feature.ts`
- `packages/cli/src/commands/create-idea.ts`
- `packages/cli/src/commands/update-idea.ts`
- `packages/cli/src/commands/promote-idea.ts`
- `packages/cli/src/commands/create-rule.ts`

Plus 6 new `case` entries in `packages/cli/src/index.ts`.

## Comma-separated arrays

`--tags` and `--applies-to` accept comma-separated values: `--tags "infra,backend"` → `["infra", "backend"]`. Split on comma, trim whitespace, filter empty strings.

## Design Decisions

1. **CLI enforces stricter required fields than the API** — `create-feature` requires description, spec, acceptance_tests, priority. The API is loose for internal use; the CLI is the agent-facing quality gate.
2. **Update commands reject no-ops** — passing just `--id` with nothing to change is an error. Fail fast.
3. **Inline flags only** — no stdin, no file paths. Agents construct commands programmatically; long strings in flags are fine.
4. **No batch commands** — batch_create_features/ideas/jobs stay MCP-only.
5. **No confirmation prompts** — agents don't want interactive prompts. Bad input = immediate error.
6. **Include cancelled status and capability promotion** — both are supported by edge functions but missing from MCP schemas. The CLI should expose the full capability.
