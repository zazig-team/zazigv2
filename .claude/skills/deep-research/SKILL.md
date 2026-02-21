---
name: deep-research
description: "Use when the user asks to research a topic, compare technologies, investigate market trends, or gather current information from the web. Also use when agents need live web research for decision-making, competitive analysis, or technical comparisons. Triggers: 'research', 'deep research', 'investigate', 'what are the latest', 'compare X vs Y', 'current best practices'."
---

# Deep Research

Submit a live web research query to Google Gemini or OpenAI Deep Research. Returns a cited report after 2-30 minutes.

## When to Use

- User asks to research a topic requiring current web information
- Technology comparison or evaluation needed
- Market analysis, competitive intelligence, or landscape questions
- Current best practices that may have changed since your training cutoff
- Any question where live web search adds significant value

## When NOT to Use

- Questions answerable from your training data or local files
- Code generation or debugging (use regular prompting)
- Quick factual lookups (use web search tools instead)

## Provider Selection

| Provider | Best For | Speed | Cost |
|----------|----------|-------|------|
| `gemini` | General research, fast turnaround | 2-5 min | Free tier available |
| `openai` | Deep analysis, complex multi-source synthesis | 5-30 min | $1-3 per call |

## Usage

```bash
deep-research --provider gemini "your research question"
deep-research --provider openai "your research question"
deep-research --provider openai --model o3-deep-research "complex query"
```

`--provider` is required. Additional flags: `--timeout N` (default 600s), `--raw` (preserve citations), `--model` (override default).

## Invocation Pattern

Run as a background Bash command since queries take minutes:

```bash
# From an agent — run and wait for output
deep-research --provider gemini "Compare Supabase vs Firebase for mobile backends in 2026"
```

The tool blocks until complete, printing progress dots. Output goes to stdout. Agents calling this should use it inside a subagent or background task to avoid blocking the main conversation.

## Environment & API Keys

Both providers need an API key in the environment. If the key isn't already set, **inject it from Doppler before calling the tool**. Do NOT fall back to a different provider — resolve the key first.

```bash
# Check if key exists
echo $OPENAI_API_KEY | head -c 5   # or GEMINI_API_KEY

# If missing, use Doppler to inject it:
doppler run --project zazig --config prd -- deep-research --provider openai "your query"

# Or export it for the session:
export OPENAI_API_KEY=$(doppler secrets get OPENAI_API_KEY --project zazig --config prd --plain)
```

| Provider | Env Var | Doppler Location |
|----------|---------|-----------------|
| `gemini` | `GEMINI_API_KEY` | `zazig/prd` |
| `openai` | `OPENAI_API_KEY` | `zazig/prd` |

Agent sessions launched via `scripts/launch-*.sh` have these injected automatically.
