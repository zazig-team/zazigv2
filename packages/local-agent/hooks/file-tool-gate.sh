#!/bin/bash
# file-tool-gate.sh — PreToolUse hook for Read/Write/Edit/Grep/Glob (zazigv2 local agent)
#
# Auto-approves file operations for unattended agent execution.
# Blocks access to .env files and ~/.zazig/ config directory.
#
# Hook protocol:
#   - Reads JSON from stdin (tool_name, tool_input)
#   - Outputs JSON with permissionDecision: "allow" | "deny"
#   - Exit 0 with no output = defer to normal permission prompt
#   - Exit 0 with deny JSON = block the operation
#   - Exit 0 with allow JSON = auto-approve

set -euo pipefail

INPUT=$(cat)
TOOL_NAME=$(echo "$INPUT" | jq -r '.tool_name')

# Extract file path based on tool type
FILE_PATH=""
if [[ "$TOOL_NAME" =~ ^(Read|Write|Edit)$ ]]; then
  FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // .tool_input.path // ""')
elif [[ "$TOOL_NAME" =~ ^(Grep|Glob)$ ]]; then
  FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.path // ""')
fi

# --- DENY: .env files (sensitive credentials) ---
if [[ -n "$FILE_PATH" ]]; then
  BASENAME=$(basename "$FILE_PATH")
  if [[ "$BASENAME" == .env || "$BASENAME" == .env.* ]]; then
    jq -n '{hookSpecificOutput:{hookEventName:"PreToolUse",permissionDecision:"deny",permissionDecisionReason:".env file access blocked by file-tool-gate"}}'
    exit 0
  fi
fi

# --- DENY: ~/.zazig/ directory (engine config) ---
if [[ -n "$FILE_PATH" ]]; then
  # Expand ~ and $HOME for comparison
  EXPANDED_PATH="$FILE_PATH"
  EXPANDED_PATH="${EXPANDED_PATH/#\~/$HOME}"
  if [[ "$EXPANDED_PATH" == "$HOME/.zazig/"* || "$EXPANDED_PATH" == "$HOME/.zazig" ]]; then
    jq -n '{hookSpecificOutput:{hookEventName:"PreToolUse",permissionDecision:"deny",permissionDecisionReason:"~/.zazig/ access blocked by file-tool-gate"}}'
    exit 0
  fi
fi

# --- ALLOW: everything else ---
jq -n '{hookSpecificOutput:{hookEventName:"PreToolUse",permissionDecision:"allow",permissionDecisionReason:"Safe file operation auto-approved by file-tool-gate"}}'
exit 0
