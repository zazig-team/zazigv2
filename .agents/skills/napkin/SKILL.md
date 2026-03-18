---
name: napkin
description: |
  Maintain a per-repo napkin file that tracks mistakes, corrections, user
  preferences, codebase quirks, and patterns that work. Always active — every
  session, unconditionally. Read the napkin before doing anything. Write to it
  continuously as you work. Log your own mistakes, not just user corrections.
  The napkin lives at `.Codex/napkin.md` in each repo. When a napkin entry
  proves universally valuable, graduate it to a formal skill via
  continuous-learning.
author: Tom Weaver
version: 1.0.0
date: 2026-02-09
---

# Napkin

You maintain a per-repo markdown file that tracks mistakes, corrections, and
patterns. You read it before doing anything and update it as you work —
whenever you learn something worth recording.

**This skill is always active. Every session. No trigger required.**

---

## Session Start: Read Your Notes

First thing, every session — read `.Codex/napkin.md` before doing anything
else. Internalize what's there and apply it silently. Don't announce that you
read it. Don't say "I've reviewed the napkin." Just apply what you know.

If no napkin exists yet, create one at `.Codex/napkin.md`:

```markdown
# Napkin

## Corrections
| Date | Source | What Went Wrong | What To Do Instead |
|------|--------|----------------|-------------------|

## User Preferences
- (accumulate here as you learn them)

## Codebase Gotchas
- (repo-specific quirks, unusual patterns, non-obvious conventions)

## Patterns That Work
- (approaches that succeeded, especially non-obvious ones)

## Patterns That Don't Work
- (approaches that failed and why)

## Domain Notes
- (project/domain context that matters)
```

Adapt sections to fit the repo. A mobile app repo might need a "Device Quirks"
section. A monorepo might need per-package notes. Design something you can
usefully consume.

---

## Continuous Updates

Update the napkin as you work, not just at session boundaries. Write to it
whenever you learn something worth recording:

- **You hit an error and figure out why.** Log it immediately.
- **The user corrects you.** Log what you did and what they wanted instead.
- **You catch your own mistake.** Log it. Your mistakes matter more than user
  corrections — you know what went wrong internally.
- **You try something and it fails.** Log the approach and why it didn't work.
- **You try something and it works well.** Log the pattern.
- **You discover a codebase quirk.** Log it under Codebase Gotchas — things
  like "tests must run sequentially" or "this API returns paginated objects,
  not arrays" or "env vars are loaded from .env.local, not .env".
- **You re-read the napkin mid-task** because you're about to do something
  you've gotten wrong before. Good. Do this.

The napkin is working memory that persists across sessions, not a journal you
write in once.

---

## What to Log

Log anything that would change your behavior if you read it next session:

- **Your own mistakes**: wrong assumptions, bad approaches, misread code,
  failed commands, incorrect fixes you had to redo.
- **User corrections**: anything the user told you to do differently.
- **Codebase gotchas**: unexpected repo structure, non-standard conventions,
  things that look like one thing but are actually another.
- **Tool/environment surprises**: build quirks, CI behavior, deployment
  gotchas, dependency oddities.
- **Preferences**: how the user likes things done — style, structure, process,
  communication style.
- **What worked**: approaches that succeeded, especially non-obvious ones.

**Be specific.** "Made an error" is useless. "Assumed `createUser` takes
`(name, id)` but signature is `(id, name)` — this codebase doesn't follow
conventional arg ordering" is actionable.

---

## Napkin Maintenance

Every 5-10 sessions, or when the file exceeds ~150 lines, consolidate:

- Merge redundant entries into a single rule.
- Promote repeated corrections to User Preferences.
- Remove entries that are now captured as top-level rules.
- Archive resolved or outdated notes.
- Keep total length under 200 lines of high-signal content.

A 50-line napkin of hard-won rules beats a 500-line log of raw entries.

---

## Graduation Path

When a napkin entry proves **universally valuable** (not just repo-specific),
graduate it:

1. **Repeated across repos** → Promote to a formal skill via
   `continuous-learning`. A napkin entry that appears in 3+ repos is a skill
   candidate.
2. **Error + misleading message** → Create a targeted skill with the exact
   error string in the description so it surfaces automatically.
3. **User preference that applies everywhere** → Add to `~/.Codex/AGENTS.md`
   or the user's global auto-memory instead.

After graduating, keep a one-line reference in the napkin pointing to the
skill, then remove the detailed entry.

---

## Examples

**Self-caught mistake** — you misread a function signature:

```markdown
| 2026-02-09 | self | Passed (name, id) to createUser but signature is (id, name) | Check function signatures before calling — this codebase doesn't follow conventional arg ordering |
```

**User correction** — import style:

```markdown
| 2026-02-09 | user | Used relative imports | This repo uses absolute imports from `src/` — always |
```

**Codebase gotcha** — discovered during exploration:

```markdown
## Codebase Gotchas
- API responses from `/api/users` return `{ data: User[], meta: Pagination }`, not a raw array — always destructure `.data`
- Tests use a custom `renderWithProviders` helper, not plain `render` from testing-library
- The `build` script must run before `test:e2e` — e2e tests hit the built output
```

**Later in the session** — you re-read the napkin before editing another file
and use absolute imports without being told. That's the loop working.
