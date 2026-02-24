STATUS: COMPLETE
CARD: 699d19b0
BRANCH: cpo/pai-orchestrator
FILES: supabase/functions/orchestrator/index.ts
TESTS: Typecheck clean (root + shared workspaces; pre-existing CLI issue unrelated)
NOTES: Persistent agent jobs now get fully assembled CLAUDE.md in context field. Non-persistent jobs unchanged.

---

# CPO Report — Assemble Full CLAUDE.md for Persistent Agents

## Summary
Moved CLAUDE.md assembly for persistent agent jobs from the local agent to the orchestrator. The local agent becomes a dumb pipe — it just writes whatever is in `msg.context`.

## Changes

### supabase/functions/orchestrator/index.ts (+24 lines, -6 lines)

**New block** (after role/personality fetch, before StartJob construction):
- For `persistent_agent` jobs, assembles full CLAUDE.md from `# {ROLE_NAME}`, personality prompt, `---` separator, and role prompt
- Writes assembled string to `prompt_stack` column on the jobs row for observability

**Modified StartJob construction**:
- `context` field: `assembledContext ?? job.context ?? undefined` (persistent agents get pre-assembled context)
- `personalityPrompt`, `rolePrompt`, `roleSkills`: gated with `job.job_type !== "persistent_agent"` (already baked into context for persistent agents)

### What didn't change
- Non-persistent job dispatch path: identical behavior, still sends separate fields for local `assembleContext()`
- All other orchestrator logic untouched

## Token Usage
- Budget: claude-ok
- Approach: Direct implementation — single file, well-specified change
