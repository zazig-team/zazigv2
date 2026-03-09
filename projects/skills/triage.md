# /triage

**Role:** CPO / triage-analyst
**Type:** Operational — sweeps the ideas inbox and triages new ideas

Run this skill to clear the ideas inbox, classify new ideas, and prepare explicit promote/park/reject recommendations for human approval.

---

## Single-Idea Mode

If your job context contains a single idea ID, triage only that idea:
- Skip Phase 1 — use the idea ID from context
- Run Phase 2 on the single idea
- Write recommendation to `triage_notes` (not human presentation)
- Do not call `promote_idea` — the human will act from the WebUI
- Set `status='triaged'` when complete (not `triaging`)

---

## Phase 1: Gather Inbox State

Call `query_ideas` with `status='new'`.

`query_ideas` returns all ideas at `status='new'`; apply originator filtering before triaging:
- Primarily process ideas in your own originator namespace: `{human}-*` (where `{human}` is the current human's name), including `{human}` and `{human}-cpo`.
- You may surface broader ideas if relevant, but default to own-originator first.

Capture, at minimum, each candidate idea's `title`, `description`, `flags`, `clarification_notes`, `originator`, and `created_at`.

---

## Phase 2: Triage Each Idea

For each idea selected for triage:

1. Read the full `title`, `description`, `flags`, `clarification_notes`, and `originator`.
2. Refine if needed via `update_idea`:
   - Improve the description for clarity
   - Add or correct tags
3. Set `priority` (`low` | `medium` | `high` | `urgent`) based on urgency signals, strategic fit, and originator intent.
4. Set `suggested_exec` (`cpo`, `cto`, `cmo`, or a contractor name).
5. Mark the idea as triaged with `update_idea(..., status='triaged')`.

> **Content-level duplicate checking is mandatory.** When evaluating whether an idea overlaps with an existing feature or idea, you MUST compare the actual description, scope, and requirements of both — not just titles. Title similarity alone is insufficient and has caused false 'already exists' conclusions in the past. Two ideas can share a title but be fundamentally different in scope; two ideas can have different titles but be identical in substance. Always read the full description of candidate duplicates before making any duplicate determination. If you cannot read the full content of a candidate duplicate, do not conclude it is or is not a duplicate.

Use `query_features` (and, when needed, inbox context) to validate overlap at content level before recommending promotion.

---

## Phase 3: Present Recommendations

Present triaged ideas in a concise decision list for the human. For each idea:
- Show title, priority, and suggested_exec
- Give one recommendation: `promote`, `park`, or `reject`
- Show any `flags` or `clarification_notes` needing human attention

For every `promote` recommendation, include an explicit promote target:
- `feature` (must include project target)
- `job`
- `research`

A promote recommendation without a target type is invalid. Never say only "promote."

Use one of these exact forms:
- `Recommend: promote → feature (project: {project_name})`
- `Recommend: promote → job`
- `Recommend: promote → research`

Wait for explicit human approval before calling `promote_idea`.

---

## Phase 4: Execute Approvals

After the human approves promote recommendations, call `promote_idea`.

Prerequisites:
1. The idea must be at status `triaged` before calling `promote_idea` — ideas at status `new` cannot be promoted. Always verify triage completion first.
2. If promoting to `feature`, `project_id` is required — never call `promote_idea` with `promote_to='feature'` without a `project_id`. If no `project_id` is available, ask the human which project to promote to first.

Execute only what the human explicitly approved.

---

## Inbox Hygiene

During standup or when running triage:
- Report the count of ideas with `status='new'`
- Flag ideas older than 7 days still at `status='new'` (name them)
- Mention the count of parked ideas if > 0

---

## Rules

- Only triage ideas in your originator namespace by default
- Never call `promote_idea` without explicit human approval
- Perform content-level duplicate checking before any promote recommendation
- Every promote recommendation must specify `feature`, `job`, or `research`
- An idea must be triaged before `promote_idea` can be called
- `project_id` is required when promoting to `feature`

---

## MCP Tools Used

| Tool | Purpose | When |
|------|---------|------|
| query_ideas | Fetch new ideas from inbox | Phase 1 |
| update_idea | Refine idea, set priority, mark triaged | Phase 2 |
| promote_idea | Promote idea to feature/job/research | Phase 4 |
| query_features | Check if idea overlaps with existing features (content-level) | Phase 2 duplicate check |
