# Background Triage from WebUI

**Date:** 2026-03-09
**Status:** Active
**Authors:** Tom, Claude

## Problem

The Ideas page Triage button just sets `status='triaged'` — no analysis, no priority assessment, no goal alignment, no duplicate checking. The full triage skill (Phase 2: analyse, set priority, assign exec, check duplicates) never runs unless the CPO happens to do it during a heartbeat.

## Design

When a user clicks "Triage" on an idea in the WebUI, commission a background agent job that runs the triage skill on that single idea and writes back enriched metadata.

### Flow

1. User clicks **Triage** on an idea card
2. WebUI calls `request-work` with `role='triage-analyst'`, `context='{idea_id}'`
3. WebUI sets idea status to `triaging` via `update-idea` edge function
4. Card shows "Analysing..." state with a subtle pulse animation
5. Orchestrator dispatches job to a machine with a free claude_code slot
6. Daemon spawns ephemeral Claude session with triage-analyst role config
7. Agent loads `/triage` skill, reads the single idea, analyses it:
   - Refines description for clarity
   - Sets priority (low/medium/high/urgent) based on strategic fit
   - Sets suggested_exec (cpo/cto/cmo/contractor)
   - Checks for duplicate ideas and features (content-level)
   - Writes triage_notes with recommendation (promote → feature/job/research, park, or reject)
   - Adds/corrects tags
8. Agent calls `update_idea` with enriched metadata + `status='triaged'`
9. Realtime subscription updates the card — shows priority, recommendation, and triage notes
10. Card moves from Inbox to Triaged tab

### New Role: `triage-analyst`

```
name: triage-analyst
prompt: (see below)
skills: ['triage']
mcp_tools: ['query_ideas', 'update_idea', 'query_features', 'query_goals', 'query_focus_areas']
slot_type: claude_code
is_persistent: false
interactive: false
default_model: claude-sonnet-4-6
```

**Prompt:**
```
You are a triage analyst for zazig. You receive a single idea ID in your job context.

Your task: run the /triage skill on this specific idea. You are triaging on behalf of the CPO.

## Strategic Context
Before triaging, query goals and focus areas to understand current priorities.
Use this context to assess strategic fit and set priority accordingly.

## Single-Idea Mode
The /triage skill is designed for inbox sweeps. Adapt it for single-idea triage:
- Skip Phase 1 (gathering inbox) — you already have the idea ID
- Run Phase 2 fully on this one idea
- Skip Phase 3 (human presentation) — write your recommendation into triage_notes
- Skip Phase 4 (execute approvals) — the human will act from the WebUI

## Output
Call update_idea with:
- Refined description (if needed)
- priority: low/medium/high/urgent
- suggested_exec: cpo/cto/cmo or contractor name
- tags: relevant tags
- triage_notes: your recommendation (promote → feature/job/research, park, or reject) with reasoning
- status: triaged

Then write your report to .claude/triage-analyst-report.md.
```

### Database Changes

1. **Add `triaging` to ideas status constraint**
   ```sql
   ALTER TABLE public.ideas DROP CONSTRAINT ideas_status_check;
   ALTER TABLE public.ideas ADD CONSTRAINT ideas_status_check
     CHECK (status = ANY (ARRAY['new','triaging','triaged','parked','rejected','promoted','done']));
   ```

2. **Insert `triage-analyst` role**
   ```sql
   INSERT INTO roles (name, description, prompt, skills, mcp_tools, slot_type, is_persistent, interactive, default_model)
   VALUES ('triage-analyst', 'Background triage agent for single ideas', '...',
           ARRAY['triage'],
           ARRAY['query_ideas','update_idea','query_features','query_goals','query_focus_areas'],
           'claude_code', false, false, 'claude-sonnet-4-6');
   ```

3. **Add `triage-analyst` to request_standalone_work allowed roles**
   ```sql
   -- Update the CHECK or IF validation in request_standalone_work()
   ```

### Edge Function Changes

- `request-work/index.ts`: Add `'triage-analyst'` to allowed roles validation

### WebUI Changes

- **Triage button**: Calls `requestTriageJob(ideaId)` which:
  1. Calls `update-idea` with `status='triaging'`
  2. Calls `request-work` with `role='triage-analyst'`, `context=ideaId`
- **Card state**: When `status='triaging'`, show "Analysing..." with pulse animation instead of action buttons
- **Triaged card**: When status becomes `triaged`, show enriched info (priority badge, triage_notes, suggested_exec)
- **Toast**: "Triage started — an agent is analysing this idea"

### Triage Skill Update

Add a preamble to `projects/skills/triage.md`:

```markdown
## Single-Idea Mode
If your job context contains a single idea ID, triage only that idea:
- Skip Phase 1 — use the idea ID from context
- Run Phase 2 on the single idea
- Write recommendation to triage_notes (not human presentation)
- Do not call promote_idea — the human will act from the WebUI
```

## Future: as-cpo Skill

Once the Exec Context Skills idea is built and the `/as-cpo` skill exists, add it to the triage-analyst role's skills array. This will give the agent the CPO's full strategic context (roadmap, doctrines, memory files) rather than the baked-in prompt.

## Implementation Order

1. Migration: status constraint + role + RPC update
2. Edge function: allow triage-analyst role
3. Triage skill: add single-idea mode preamble
4. WebUI: triage button → background job + triaging state
5. Deploy edge function + push to master
6. Test end-to-end
