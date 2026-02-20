#!/bin/bash
# bash-gate.sh — PreToolUse hook for Bash commands (zazigv2 local agent)
#
# Auto-approves safe bash commands for unattended agent execution.
# Blocks destructive operations. Falls through (defers to settings.json)
# for ambiguous commands.
#
# Hook protocol:
#   - Reads JSON from stdin (tool_name, tool_input.command)
#   - Outputs JSON with permissionDecision: "allow" | "deny"
#   - Exit 0 with no output = defer to normal permission prompt
#   - Exit 0 with deny JSON = block the command
#   - Exit 0 with allow JSON = auto-approve

set -euo pipefail

INPUT=$(cat)
COMMAND=$(echo "$INPUT" | jq -r '.tool_input.command')

# --- DENY: force push ---
if echo "$COMMAND" | grep -qE 'git push (--force|-f )'; then
  jq -n '{hookSpecificOutput:{hookEventName:"PreToolUse",permissionDecision:"deny",permissionDecisionReason:"Force push blocked by bash-gate"}}'
  exit 0
fi

# --- DENY: git reset --hard ---
if echo "$COMMAND" | grep -qE 'git reset --hard'; then
  jq -n '{hookSpecificOutput:{hookEventName:"PreToolUse",permissionDecision:"deny",permissionDecisionReason:"git reset --hard blocked by bash-gate"}}'
  exit 0
fi

# --- DENY: rm -rf outside the current worktree ---
# Allow rm -rf within the working directory (e.g. cleaning build artifacts),
# but block rm -rf targeting paths outside it (/, /usr, ~, etc.)
if echo "$COMMAND" | grep -qE '(^|\s|&&|\|\||;)\s*rm\s+(-[a-zA-Z]*r[a-zA-Z]*f|--recursive\s+--force|-[a-zA-Z]*f[a-zA-Z]*r)\b'; then
  # Check if the rm targets a path outside common safe directories
  # Allow: rm -rf node_modules, rm -rf dist, rm -rf .cache, rm -rf build
  if ! echo "$COMMAND" | grep -qE 'rm\s+-rf\s+(node_modules|dist|\.cache|build|\.next|\.turbo|coverage|tmp|\.tmp|\.parcel-cache|out)\b'; then
    jq -n '{hookSpecificOutput:{hookEventName:"PreToolUse",permissionDecision:"deny",permissionDecisionReason:"rm -rf blocked — only safe targets (node_modules, dist, build, etc.) allowed"}}'
    exit 0
  fi
fi

# --- DENY: commands touching ~/.zazig/ (engine config) ---
if echo "$COMMAND" | grep -qE '(~|HOME|\$HOME)/\.zazig/'; then
  jq -n '{hookSpecificOutput:{hookEventName:"PreToolUse",permissionDecision:"deny",permissionDecisionReason:"Commands touching ~/.zazig/ blocked by bash-gate"}}'
  exit 0
fi

# --- DENY: commands touching production credentials ---
if echo "$COMMAND" | grep -qiE '(production|prod)\s*(cred|secret|key|token|password)'; then
  jq -n '{hookSpecificOutput:{hookEventName:"PreToolUse",permissionDecision:"deny",permissionDecisionReason:"Production credential access blocked by bash-gate"}}'
  exit 0
fi

# --- ASK: other destructive commands — fall through to normal prompt ---
if echo "$COMMAND" | grep -qE '(^|\s|&&|\|\||;)\s*(npm publish|pkill|kill -9|ssh)\b'; then
  exit 0
fi

# --- ALLOW: everything else ---
jq -n '{hookSpecificOutput:{hookEventName:"PreToolUse",permissionDecision:"allow",permissionDecisionReason:"Auto-approved by bash-gate"}}'
exit 0
