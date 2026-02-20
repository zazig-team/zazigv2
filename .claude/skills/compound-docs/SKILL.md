---
name: compound-docs
description: Use when you've solved a non-trivial problem and want to capture it as searchable team knowledge. Creates problem-solution documentation (different from continuous-learning which creates skills).
---

# Compound Documentation

Capture solved problems as searchable documentation. Each solution compounds your team's knowledge.

**Core principle:** Problems solved once shouldn't need solving again. Document the problem, context, decision, and solution.

## Compound Docs vs Continuous Learning

| Aspect | compound-docs | continuous-learning |
|--------|---------------|---------------------|
| **Output** | Problem-solution documents | Reusable skills |
| **Purpose** | "We solved X using Y" | "Here's how to do X" |
| **Focus** | Why we made decisions | How to repeat a process |
| **Searchable by** | Problem symptoms, errors | Task type, technique |

**Use compound-docs when:** You solved a specific problem with context that matters.

**Use continuous-learning when:** You discovered a reusable technique or pattern.

## When to Compound

After solving any problem where:
- The solution required investigation (not obvious from docs)
- The context matters (why this approach, not just what)
- Someone might hit this again (including future you)
- There were tradeoffs or decisions made

## Document Structure

```markdown
# [Problem Title]

**Date:** YYYY-MM-DD
**Tags:** [searchable tags: error messages, technologies, symptoms]

## Problem
[What was the issue? Include exact error messages, symptoms, behaviors]

## Context
[Why did this happen? What were we trying to do? What constraints existed?]

## Investigation
[What did you try? What didn't work? What led to the solution?]

## Solution
[What fixed it? Be specific - include code, config, commands]

## Decision Rationale
[Why this approach? What alternatives were considered? What tradeoffs?]

## Prevention
[How to avoid this in the future? What would have caught this earlier?]
```

## Storage Location

Store compound docs in your project:

```
docs/
  compound/
    YYYY-MM-DD-problem-title.md
```

Or for personal/cross-project knowledge:

```
~/.claude/compound/
  YYYY-MM-DD-problem-title.md
```

## Tagging for Searchability

Include in the Tags field:
- Exact error messages (quoted)
- Technology names (React, Rails, PostgreSQL)
- Symptom keywords (slow, timeout, crash, 500)
- Component names (auth, checkout, api)

**Good tags:** `"ECONNREFUSED", PostgreSQL, connection pooling, timeout`

**Bad tags:** `database, error, fix`

## Quick Capture Template

When you've just solved something, capture immediately:

```markdown
# [Quick title]

**Date:** [today]
**Tags:** [error message], [tech], [symptom]

## Problem
[Paste exact error or describe symptom]

## Solution
[What fixed it - be specific]

## Why
[1-2 sentences on why this works]
```

Expand later if the problem recurs or deserves deeper documentation.

## Example

```markdown
# PostgreSQL Connection Pool Exhaustion

**Date:** 2026-01-20
**Tags:** "PG::ConnectionBad", Rails, Sidekiq, connection pool

## Problem
Production 500 errors: `PG::ConnectionBad: could not obtain a connection from the pool within 5.000 seconds`

## Context
Sidekiq workers (5 × 25 threads = 125) sharing web pool (20 connections).

## Solution
Separate database pool for Sidekiq in `config/database.yml` + `config/initializers/sidekiq.rb`.

## Why
Separate pools let each component have appropriate resources without reducing throughput or upgrading DB plan.
```

**Note:** Sanitize any real credentials or connection strings before saving.

## Integration with Workflow

**After solving a non-trivial problem:**
1. Ask: "Would this help someone (including future me)?"
2. If yes, create compound doc immediately (quick capture)
3. Expand later if it proves valuable

**Weekly review:**
- Scan recent compound docs
- Identify patterns that should become skills
- Archive docs for problems that were one-time

**When hitting a problem:**
1. Search compound docs first: `grep -r "error message" docs/compound/`
2. Check if you've solved this before
3. Update existing doc if you learn more
