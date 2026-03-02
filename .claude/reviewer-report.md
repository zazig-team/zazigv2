status: pass
branch: feature/spec-feature-skill-add-background-mode-f-6d4bf773
checks:
  rebase: pass
  tests: skipped
  lint: skipped
  typecheck: skipped
  acceptance: pass
small_fixes:
failure_reason:

---

## Notes

### Rebase
Successfully rebased onto origin/master (stashed unstaged changes to .claude/settings.json, .gitignore, CLAUDE.md first).

### Tests / Lint / Typecheck
Skipped — `node_modules` is not installed in this worktree. All three commands fail with missing binaries/packages (`vitest not found`, `@typescript-eslint/eslint-plugin not found`, `@types/node not found`). This is a pre-existing environment issue. The only file changed on this branch is `projects/skills/spec-feature.md` (a markdown documentation file), which cannot cause test, lint, or typecheck failures.

### Acceptance Criteria

1. ✅ `projects/skills/spec-feature.md` contains a "Background Mode" section — confirmed, located after the interactive Steps 0–7 procedure.

2. ✅ The section clearly defines when to use vs not use background mode:
   - Use when: mid-another-workflow, enough context in conversation, blocking flow would break it
   - Do NOT use: if feature is underspecified and needs human input to resolve ambiguity

3. ✅ The section explicitly instructs the subagent to apply via `update_feature`, not draft files:
   > "Do NOT write to draft files — apply directly to the feature record via `update_feature`."

4. ✅ The section explicitly states the subagent must NOT set status to `ready_for_breakdown`:
   > "Do NOT set `status: ready_for_breakdown` — that remains a human-approval gate, gated by CPO review in the step below."

5. ✅ The section references the same spec structure template used in interactive mode:
   > "Write the spec following the same structure template as Step 3 of interactive mode — Overview, Detailed Requirements, Scope Boundaries, Dependencies, Constraints."

### Failure Cases

1. ✅ Background mode does NOT remove or modify the existing interactive Steps 0–7. Steps 0–7 are intact and unchanged; Background Mode is a new section appended after the procedure.

2. ✅ Does NOT instruct the subagent to set feature status — the Background Mode subagent instructions explicitly prohibit setting `ready_for_breakdown`, and the CPO Review sub-section preserves Step 7 as the human-approval gate.
