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

## How to Invoke

Use the Bash tool with this pattern:

```bash
source ~/.nvm/nvm.sh && nvm use 22 && source ~/.zshrc && gemini -y -o text "YOUR PROMPT HERE"
```

### Flags Explained
- `-y` (yolo mode): Auto-approves tool use so it runs non-interactively
- `-o text`: Returns plain text output (use `-o json` for structured data)

### For Tasks Requiring File Access

Gemini CLI has access to the current working directory. For file-related tasks:

```bash
source ~/.nvm/nvm.sh && nvm use 22 && source ~/.zshrc && cd /path/to/project && gemini -y -o text "Review the code in src/main.ts and suggest improvements"
```

### For Long-Running Tasks

Run in background and check output later:

```bash
source ~/.nvm/nvm.sh && nvm use 22 && source ~/.zshrc && gemini -y -o text "Your complex task" &
```

## Example Invocations

**Get a code review:**
```bash
source ~/.nvm/nvm.sh && nvm use 22 && source ~/.zshrc && gemini -y -o text "Review this function for bugs and improvements: $(cat src/utils.ts)"
```

**Research a topic:**
```bash
source ~/.nvm/nvm.sh && nvm use 22 && source ~/.zshrc && gemini -y -o text "What are the best practices for implementing rate limiting in Node.js APIs?"
```

**Second opinion on architecture:**
```bash
source ~/.nvm/nvm.sh && nvm use 22 && source ~/.zshrc && gemini -y -o text "I'm building a CLI tool that needs plugin support. What architecture patterns would you recommend?"
```

## Output Handling

- Gemini's response comes back as the stdout of the bash command
- Parse and summarize the response for the user
- If Gemini's output is very long, extract the key points
- Always attribute insights to Gemini when sharing with the user

## Important Notes

- Gemini CLI requires Node.js 22+ (already configured)
- The CLI has its own tool access (file read/write, web search, etc.)
- Gemini may have different knowledge or perspectives than Claude
- Use for genuine second opinions, not just to validate your own answers
