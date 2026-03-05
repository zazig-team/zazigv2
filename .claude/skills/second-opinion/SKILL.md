---
name: second-opinion
description: |
  Get a second opinion on a recommendation from another AI model. Use when the user
  wants to validate advice, cross-check a suggestion, or get an independent perspective.
  Trigger phrases: "second opinion", "/second-opinion", "check with codex", "ask another model".
  Defaults to codex-delegate but supports other models.
author: Tom Weaver
version: 1.0.0
date: 2026-02-14
user_invocable: true
---

# Second Opinion

Send the most recent recommendation or suggestion to another model for independent review.

## How It Works

1. Extract the recommendation/suggestion from the current conversation context
2. Frame it as a review prompt for the second model
3. Send it and return the independent assessment

## Arguments

- No args: uses `codex-delegate investigate` (default)
- `--model <name>`: use a specific codex model (passed to `codex-delegate -m`)
- `gemini`: use Gemini via `gemini-subagent`
- `ollama <model>`: use a local Ollama model

## Execution

### Step 1: Extract the Recommendation

Look back through the conversation and identify the most recent recommendation, suggestion, or proposed approach that was given to the user. Summarise it clearly and concisely — include the specific advice, the reasoning, and any code snippets or file paths involved.

### Step 2: Build the Review Prompt

Construct a prompt for the second model using this template:

```
You are an independent senior engineer giving a second opinion.

A colleague has made the following recommendation:

---
{extracted recommendation}
---

Context: {brief project/codebase context relevant to the recommendation}

Please review this recommendation independently. Consider:
1. Is the approach sound? Are there correctness issues?
2. Are there better alternatives the colleague may have missed?
3. Are there risks, edge cases, or gotchas with this approach?
4. Would you do anything differently?

Be direct. If the recommendation is solid, say so briefly. If you disagree, explain why with specifics.
```

### Step 3: Send to the Model

**Default (codex-delegate):**
```bash
codex-delegate investigate --dir "<relevant-repo-path>" --timeout 300 "<prompt>"
```

If the user passed `--model`, add `-m <model>` to the codex-delegate call.

**Gemini:**
```bash
gemini-subagent ask "<prompt>"
```
Use `-m gemini-3.1-pro-preview` for heavier reasoning tasks.

**Ollama:**
```bash
echo '<prompt>' | ollama run <model>
```

### Step 4: Present the Result

Show the user:
1. Which model was consulted
2. The second opinion verbatim
3. A brief synthesis: where the models agree, where they differ, and your own take on who's right

## Important

- Don't editorialize the recommendation when extracting it — present it faithfully
- If the recommendation involves code, include the relevant code in the prompt
- If there's no clear recommendation in the recent conversation, ask the user what they'd like a second opinion on
