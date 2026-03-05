---
name: multi-agent-review
description: Use when code review is needed and you want comprehensive multi-perspective analysis. Dispatches 4 specialized review agents in parallel (security, performance, architecture, simplicity) for thorough coverage.
---

# Multi-Agent Review

Comprehensive code review using 4 specialized agents in parallel, each focused on different quality dimensions.

**Core principle:** A single reviewer misses things. Four specialized perspectives catch different categories of issues.

## When to Use

- After completing a major feature (before merge)
- When reviewing code that touches security, performance, or architecture
- When you want thorough review, not quick sanity check
- Before merging to main/production branches

**For quick reviews:** Use `superpowers:code-reviewer` instead.

## Handling Large Diffs

If your diff is >1000 lines, consider:
1. **Filter by path:** `git diff origin/main -- src/feature/` to focus on specific areas
2. **Split by concern:** Review security-critical files separately from UI changes
3. **Summary mode:** For very large PRs, review changed file list + spot-check critical files

Large diffs risk hitting context limits and produce less focused reviews.

## The 4 Review Agents

| Agent | Focus |
|-------|-------|
| `security-reviewer` | Vulnerabilities, injection, auth, secrets |
| `performance-reviewer` | N+1, memory, algorithms, scalability |
| `architecture-reviewer` | SOLID, coupling, patterns, boundaries |
| `simplicity-reviewer` | Over-engineering, clarity, maintainability |

## How to Run

**Step 1: Get the diff context**

```bash
BASE_SHA=$(git merge-base HEAD origin/main)
HEAD_SHA=$(git rev-parse HEAD)

# Use secure temp file (not world-readable /tmp)
DIFF_FILE=$(mktemp)
git diff $BASE_SHA $HEAD_SHA > "$DIFF_FILE"
```

Or for specific files:
```bash
DIFF_FILE=$(mktemp)
git diff origin/main -- src/path/to/files > "$DIFF_FILE"
```

**Cleanup after review:** `rm "$DIFF_FILE"`

**Step 2: Dispatch all 4 agents in parallel**

Use 4 Agent tool calls in a single message:

```
Task 1: security-reviewer
Task 2: performance-reviewer
Task 3: architecture-reviewer
Task 4: simplicity-reviewer
```

Each agent prompt should include:
- The diff or file contents to review
- Context about what was implemented
- Any specific concerns or areas to focus on

**Step 3: Synthesize findings**

After all 4 agents return, create unified report:

```markdown
## Multi-Agent Review Summary

### Critical (Must Fix)
[Issues from any agent rated Critical]

### Important (Should Fix)
[High priority issues across all dimensions]

### Suggestions
[Lower priority improvements]

### Strengths
[What the agents found well-done]

### Verdict
[Ready to merge / Needs work / Major concerns]
```

## Prompt Template for Each Agent

```
Review the following code changes:

**Context:** [What was implemented and why]

**Files changed:**
[List key files]

**Diff:**
```
[paste diff or key sections]
```

Focus on [agent's specialty]. Identify issues, rate severity, and provide specific recommendations.
```

## Integration with Workflows

**After executing-plans:** Run multi-agent-review before marking complete.

**Before merge:** Required for main/production branches.

**After major refactoring:** Catch issues introduced by structural changes.

## Red Flags from Each Agent

**Security:** Any Critical finding = block merge.

**Performance:** N+1 queries or O(n²) in hot paths = block merge.

**Architecture:** Circular dependencies or major coupling issues = discuss before merge.

**Simplicity:** Over-engineering = refactor before merge (code should earn its complexity).

## Example

```
You: I've completed the user authentication feature. Let me run multi-agent review.

[Get diff]
BASE_SHA=$(git merge-base HEAD origin/main)
git diff $BASE_SHA HEAD > /tmp/review-diff.txt

[Dispatch 4 agents in parallel with Agent tool]

[Agents return findings]

Security: 1 Critical (password comparison timing), 2 Medium
Performance: 0 Critical, 1 suggestion (add index)
Architecture: 0 Critical, good separation noted
Simplicity: 1 concern (over-abstracted token service)

You: Fixing the critical timing issue and simplifying the token service before merge.
```
