#!/bin/bash
# setup-hooks.sh — Install zazigv2 local-agent hooks into ~/.claude/settings.json
#
# Idempotent: safe to run multiple times. Uses jq to merge hook entries
# without clobbering existing user settings.
#
# Prerequisites: jq (brew install jq)
#
# What it does:
#   1. Copies bash-gate.sh and file-tool-gate.sh to ~/.claude/hooks/zazigv2/
#   2. Merges PreToolUse hook entries into ~/.claude/settings.json
#   3. Adds deny rules for dangerous commands to permissions
#   4. Adds trust entries for common agent working directories

set -euo pipefail

# ---------------------------------------------------------------------------
# Resolve paths
# ---------------------------------------------------------------------------

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HOOKS_SRC_DIR="$(cd "$SCRIPT_DIR/../hooks" && pwd)"
CLAUDE_DIR="$HOME/.claude"
SETTINGS_FILE="$CLAUDE_DIR/settings.json"
HOOKS_DEST_DIR="$CLAUDE_DIR/hooks/zazigv2"

# ---------------------------------------------------------------------------
# Preflight checks
# ---------------------------------------------------------------------------

if ! command -v jq &>/dev/null; then
  echo "ERROR: jq is required. Install it with: brew install jq"
  exit 1
fi

if [[ ! -f "$HOOKS_SRC_DIR/bash-gate.sh" ]]; then
  echo "ERROR: bash-gate.sh not found at $HOOKS_SRC_DIR/bash-gate.sh"
  exit 1
fi

if [[ ! -f "$HOOKS_SRC_DIR/file-tool-gate.sh" ]]; then
  echo "ERROR: file-tool-gate.sh not found at $HOOKS_SRC_DIR/file-tool-gate.sh"
  exit 1
fi

# ---------------------------------------------------------------------------
# Step 1: Copy hook scripts
# ---------------------------------------------------------------------------

echo "Installing hook scripts to $HOOKS_DEST_DIR..."
mkdir -p "$HOOKS_DEST_DIR"
cp "$HOOKS_SRC_DIR/bash-gate.sh" "$HOOKS_DEST_DIR/bash-gate.sh"
cp "$HOOKS_SRC_DIR/file-tool-gate.sh" "$HOOKS_DEST_DIR/file-tool-gate.sh"
chmod +x "$HOOKS_DEST_DIR/bash-gate.sh"
chmod +x "$HOOKS_DEST_DIR/file-tool-gate.sh"
echo "  -> bash-gate.sh installed"
echo "  -> file-tool-gate.sh installed"

# ---------------------------------------------------------------------------
# Step 2: Ensure settings.json exists
# ---------------------------------------------------------------------------

mkdir -p "$CLAUDE_DIR"
if [[ ! -f "$SETTINGS_FILE" ]]; then
  echo "{}" > "$SETTINGS_FILE"
  echo "Created $SETTINGS_FILE"
fi

# ---------------------------------------------------------------------------
# Step 3: Merge hooks and permissions into settings.json
# ---------------------------------------------------------------------------

echo "Merging zazigv2 hooks into $SETTINGS_FILE..."

BASH_GATE_PATH="$HOOKS_DEST_DIR/bash-gate.sh"
FILE_GATE_PATH="$HOOKS_DEST_DIR/file-tool-gate.sh"

# Build the new settings using jq:
# - Add deny rules (deduplicated)
# - Add/update PreToolUse hooks for zazigv2 (identified by path containing "zazigv2")
# - Preserve all existing hooks that aren't zazigv2 hooks
TEMP_FILE=$(mktemp)

jq --arg bash_gate "$BASH_GATE_PATH" \
   --arg file_gate "$FILE_GATE_PATH" \
   '
  # --- Permissions: ensure deny rules exist ---
  .permissions //= {} |
  .permissions.deny //= [] |
  .permissions.deny |= (
    . + [
      "Bash(rm -rf *)",
      "Bash(git push --force*)",
      "Bash(git push -f *)",
      "Bash(git reset --hard*)",
      "Bash(git clean -f*)"
    ] | unique
  ) |

  # --- Hooks: merge zazigv2 PreToolUse hooks ---
  .hooks //= {} |
  .hooks.PreToolUse //= [] |

  # Remove any existing zazigv2 hook entries (idempotent update)
  .hooks.PreToolUse |= [
    .[] | select(
      (.hooks // []) | all(.command | test("zazigv2") | not)
    )
  ] |

  # Add file-tool-gate hook entry
  .hooks.PreToolUse += [{
    "_comment": "zazigv2: auto-approve file operations except .env and ~/.zazig/",
    "matcher": "Read|Write|Edit|Grep|Glob",
    "hooks": [{
      "type": "command",
      "command": $file_gate
    }]
  }] |

  # Add bash-gate hook entry
  .hooks.PreToolUse += [{
    "_comment": "zazigv2: auto-approve bash commands, block destructive ops",
    "matcher": "Bash",
    "hooks": [{
      "type": "command",
      "command": $bash_gate
    }]
  }]
' "$SETTINGS_FILE" > "$TEMP_FILE"

# Validate the generated JSON before overwriting
if jq empty "$TEMP_FILE" 2>/dev/null; then
  mv "$TEMP_FILE" "$SETTINGS_FILE"
  echo "  -> hooks merged into settings.json"
else
  echo "ERROR: Generated invalid JSON. Settings file not modified."
  rm -f "$TEMP_FILE"
  exit 1
fi

# ---------------------------------------------------------------------------
# Step 4: Trust prompt bypass for agent working directories
# ---------------------------------------------------------------------------

# Claude Code stores trust decisions in ~/.claude/projects/
# We create allowlist entries for common agent working directories
# so agents don't get blocked by "Do you trust this directory?" prompts

echo "Setting up trust entries for agent working directories..."

TRUST_DIRS=(
  "$HOME/.zazigv2/worktrees"
)

for DIR in "${TRUST_DIRS[@]}"; do
  # Claude Code stores trust per-project in ~/.claude/projects/<hashed-path>/settings.local.json
  # The path is encoded by replacing / with - and removing the leading -
  ENCODED_PATH=$(echo "$DIR" | sed 's|/|-|g' | sed 's|^-||')
  TRUST_DIR="$CLAUDE_DIR/projects/$ENCODED_PATH"
  TRUST_FILE="$TRUST_DIR/settings.local.json"

  mkdir -p "$TRUST_DIR"
  if [[ ! -f "$TRUST_FILE" ]]; then
    echo '{}' > "$TRUST_FILE"
  fi

  # Mark as trusted (allowedTools is the key Claude Code checks)
  jq '.isTrusted = true' "$TRUST_FILE" > "$TEMP_FILE" 2>/dev/null || echo '{"isTrusted": true}' > "$TEMP_FILE"
  mv "$TEMP_FILE" "$TRUST_FILE"
  echo "  -> trusted: $DIR"
done

# ---------------------------------------------------------------------------
# Done
# ---------------------------------------------------------------------------

echo ""
echo "Setup complete. zazigv2 hooks installed:"
echo "  Bash gate:  $BASH_GATE_PATH"
echo "  File gate:  $FILE_GATE_PATH"
echo "  Settings:   $SETTINGS_FILE"
echo ""
echo "Restart Claude Code for hooks to take effect."
