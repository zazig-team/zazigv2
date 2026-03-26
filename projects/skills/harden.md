# /harden

**Role:** CPO
**Type:** Operational — runs the 6-stage idea hardening pipeline
**Usage:** `/harden {idea_id}` | `/harden {idea_id} --skip-workshop` | `/harden {file_path}`

Takes a raw or triaged idea and runs it through progressive stages of rigour — workshop, prior art, plan generation, multi-model review, synthesis, and gap analysis — before it becomes a capability on the roadmap.

---

## When to Use

Use when:
- An idea will become a capability (multi-feature, strategic, architectural change)
- The CPO picks up an idea with status `hardening` from the inbox
- User explicitly calls `/harden`

Do NOT use for: bug fixes, single features with clear scope, config changes. Those go through `/triage` → `/spec-feature` directly.

---

## Invocation Forms

| Form | Behaviour |
|------|-----------|
| `/harden {idea_id}` | Full pipeline — starts with interactive workshop if idea is vague |
| `/harden {idea_id} --skip-workshop` | Skip Stage 1, go straight to plan generation |
| `/harden {file_path}` | Run Stages 3–5 on an existing design doc (skip 1 and 2) |

---

## Stage 1: Workshop (Interactive, Optional)

Invoke only when the idea is vague — `scope='initiative'`, multiple systems involved, or ambiguous requirements. Skip when:
- `--skip-workshop` flag is set
- The idea already has a detailed `description` + `workshop_notes`

### Procedure

1. Fetch the idea via `query_ideas(idea_id=...)`.
2. Assess vagueness: if the idea has a clear, detailed description with concrete scope, skip to Stage 2.
3. Load and invoke the `brainstorming` skill with the idea's description as input.
4. After the workshop completes, call `update_idea` to write the refined description and any workshop notes back to the idea record.
5. Continue to Stage 2.

---

## Stages 2–6: Background Pipeline

After Stage 1 (or immediately if skipped), dispatch a background agent to run the remaining stages autonomously. Use the `dispatch-subagent` pattern — spawn a general-purpose agent in the background with the prompt below.

**If invoked with a `{file_path}` instead of an `{idea_id}`**, skip Stages 1 and 2 entirely. Pass the file path as the plan doc and begin at Stage 3.

### Agent Prompt Template

Substitute `{idea_id}`, `{idea_title}`, `{idea_description}`, and `{workshop_notes}` from the idea record. Generate `{slug}` from the idea title (lowercase, hyphens, max 50 chars). Use today's date for `{date}` (YYYY-MM-DD format).

```
You are running the idea hardening pipeline for idea {idea_id}: "{idea_title}"

Idea description: {idea_description}
Workshop notes (if any): {workshop_notes}

Complete these stages in order. Write all documents to the working directory.

## Stage 2a: Prior Art Check
- Call query_features (status filters: building, complete) searching for overlap with this idea
- Call query_ideas (status: parked, rejected) to learn from past attempts
- Scan docs/plans/active/ for adjacent design docs using Glob and Grep
Summarise findings. If a near-duplicate exists, stop and notify the user before proceeding.

## Stage 2b: Codebase Impact Scan
Use Glob and Grep to identify affected code:
- DB tables: scan supabase/migrations/ for related table names
- Edge functions: scan supabase/functions/ for affected endpoints
- Skills: scan projects/skills/ for skills to update or create
- Agent code: scan packages/local-agent/src/ for affected modules
- WebUI: scan packages/webui/src/ for affected components
Classify blast radius as: narrow (1-2 files) / moderate (3-7 files) / wide (8+ files).

## Stage 2c: Plan Generation
Write a design document to docs/plans/active/{date}-{slug}-design.md using this exact template:

Top-matter:
- Date: {date}
- Status: Draft (auto-generated)
- Source idea: {idea_id}

Sections:
1. Problem (expanded from idea description)
2. Prior Art (from 2a)
3. Codebase Impact (from 2b, with blast radius classification)
4. Decisions (key choices with options and trade-offs)
5. Design (architecture, data model, integration points)
6. Implementation Phases (sequenced work with S/M/L/XL effort estimates)
7. Effort Summary (table: Phase | Estimate | Depends On)
8. Risks and Open Questions
9. Relationship to Existing Work

## Stage 3: Second Opinions (run all in parallel)

### Tier 1: Codex
Invoke the codex-delegate skill with the plan doc path.
Ask: "Review this design plan for implementation gaps, code-level feasibility, and missing technical details. Rate each finding: critical / high / medium / low."
Save output to docs/plans/active/{date}-{slug}-review-codex.md

### Tier 2: Gemini
Invoke the gemini-subagent skill with the plan doc content.
Ask: "Review this design plan for architectural soundness, missing alternatives, risk analysis, and simplification opportunities. Rate each finding: critical / high / medium / low."
Save output to docs/plans/active/{date}-{slug}-review-gemini.md

### Tier 3: second-opinion (fallback)
If Tier 1 or Tier 2 is unavailable, invoke the second-opinion skill as fallback.
Save output to docs/plans/active/{date}-{slug}-review-second-opinion.md

Timeout: If any reviewer hasn't responded after 5 minutes, proceed with available reviews.

## Stage 4: Synthesis → v2
1. Read all review files from Stage 3
2. Incorporate all critical and high findings into the plan
3. Resolve conflicts between reviewers (document both perspectives; pick one with rationale)
4. Add a Review History section to the plan:
   | Reviewer | Findings | Resolutions |
   |----------|----------|-------------|
5. Update the plan doc in-place (same path, update Status to "Draft v2")

## Stage 5: Gap Review
Invoke the review-plan skill on the v2 plan. Focus on:
- Dependencies that don't exist yet
- One-way doors (hard-to-reverse decisions)
- Conflicts with existing active plans
- Missing error/edge cases
- Simplification opportunities
Apply any fixable gaps to the plan. Unfixable gaps go into the Risks section.
Save gap review notes to docs/plans/active/{date}-{slug}-gap-review.md

## Stage 6: Write-Up & Post
Notify the user with a summary:
- "Hardening complete for '{idea_title}'"
- Plan path: docs/plans/active/{date}-{slug}-design.md
- Blast radius classification
- Number of reviews completed
- Top 3 risks from the plan
- Next step: "Review and approve to create capability on roadmap."
```

---

## Post-Pipeline

After the background agent completes, the user reviews the plan and chooses one of:
1. **Approve** — proceed to `/plan-capability` to create the capability on the roadmap
2. **Request changes** — re-enter Stage 1 (workshop) with specific feedback
3. **Reject** — park or reject the idea via `update_idea`

The CPO does not auto-promote. Explicit human approval is required before creating a capability.

---

## Rules

- Never auto-promote an idea to a capability without explicit human approval
- Always check for near-duplicates in Stage 2a before generating a plan
- Content-level duplicate checking is mandatory — compare descriptions, not just titles
- All review documents must be saved to `docs/plans/active/` with consistent naming
- If Stage 2a finds a near-duplicate, stop and notify the user before proceeding
- The background agent must complete Stages 2–6 in sequence (except Stage 3 reviewers, which run in parallel)
- Timeout: proceed after 5 minutes if any Stage 3 reviewer is unresponsive

---

## MCP Tools Used

| Tool | Purpose | When |
|------|---------|------|
| query_ideas | Fetch idea details | Stage 1 |
| update_idea | Write back workshop notes / refined description | Stage 1 |
| query_features | Check for overlapping features | Stage 2a |
| query_ideas | Check parked/rejected ideas for prior attempts | Stage 2a |
| execute_sql | Search capabilities table for overlap | Stage 2a |
| zazig send-message-to-human | Notify user of completion / near-duplicate alerts | Stage 2a, Stage 6 |
