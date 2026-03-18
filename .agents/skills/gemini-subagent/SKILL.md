---
name: gemini-subagent
description: Use Gemini CLI as a subagent for tasks that benefit from a second AI perspective, parallel research, or when the user explicitly requests Gemini's input
---

# Gemini CLI Subagent

Invoke Google's Gemini CLI to get a second AI perspective or delegate tasks.

## When to Use

- User explicitly asks for Gemini's opinion or help
- You want a second perspective on a complex problem
- Parallel research tasks where another AI can help
- Code review from a different model's viewpoint
- Brainstorming where diverse AI perspectives add value

## Environment Setup

Gemini CLI requires Node.js 22+. Every invocation needs this preamble:

```bash
source ~/.nvm/nvm.sh && nvm use 22 && source ~/.zshrc
```

### Key Flags
- `-y` (yolo mode): Auto-approves tool use so it runs non-interactively
- `-o text`: Returns plain text output (use `-o json` for structured data)

## How to Invoke

```bash
source ~/.nvm/nvm.sh && nvm use 22 && source ~/.zshrc && gemini -y -o text "YOUR PROMPT HERE"
```

For file-related tasks, `cd` to the project first:

```bash
source ~/.nvm/nvm.sh && nvm use 22 && source ~/.zshrc && cd /path/to/project && gemini -y -o text "Review the code in src/main.ts"
```

For long-running tasks, run in background:

```bash
source ~/.nvm/nvm.sh && nvm use 22 && source ~/.zshrc && gemini -y -o text "Your complex task" &
```

## Examples

```bash
# Code review
source ~/.nvm/nvm.sh && nvm use 22 && source ~/.zshrc && gemini -y -o text "Review this function for bugs: $(cat src/utils.ts)"

# Research
source ~/.nvm/nvm.sh && nvm use 22 && source ~/.zshrc && gemini -y -o text "Best practices for rate limiting in Node.js APIs?"

# Architecture second opinion
source ~/.nvm/nvm.sh && nvm use 22 && source ~/.zshrc && gemini -y -o text "Recommend architecture patterns for a CLI tool with plugin support"
```

## Output Handling

- Gemini's response comes back as the stdout of the bash command
- Parse and summarize the response for the user
- If Gemini's output is very long, extract the key points
- Always attribute insights to Gemini when sharing with the user

## Important Notes

- Gemini CLI requires Node.js 22+ (already configured)
- The CLI has its own tool access (file read/write, web search, etc.)
- Gemini may have different knowledge or perspectives than Codex
- Use for genuine second opinions, not just to validate your own answers
