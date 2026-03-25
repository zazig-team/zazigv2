#!/usr/bin/env bash
# check-prompt-freshness.sh — SessionStart hook for persistent agent workspaces
#
# Compares the current role prompt in the DB against a stored hash.
# If the prompt has changed, refreshes CLAUDE.md and warns the agent.
#
# Fast path (no change): 1 REST call + 1 hash comparison (~50ms)
# Mismatch path: 2 REST calls + file writes
#
# Required env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
# Required files: .role, .prompt-hash (written during workspace setup)

set -euo pipefail

# ---------------------------------------------------------------------------
# Read workspace metadata
# ---------------------------------------------------------------------------

ROLE=$(cat .role 2>/dev/null) || exit 0          # no .role = not a managed workspace
STORED_HASH=$(cat .prompt-hash 2>/dev/null) || STORED_HASH=""

if [ -z "${SUPABASE_URL:-}" ] || [ -z "${SUPABASE_SERVICE_ROLE_KEY:-}" ]; then
  exit 0  # missing env — skip silently
fi

# ---------------------------------------------------------------------------
# Fetch current role prompt from Supabase REST API
# ---------------------------------------------------------------------------

RESPONSE=$(curl -sf -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  "$SUPABASE_URL/rest/v1/roles?name=eq.$ROLE&select=id,name,prompt" 2>/dev/null) || exit 0

PROMPT=$(echo "$RESPONSE" | jq -r '.[0].prompt // empty')
[ -z "$PROMPT" ] && exit 0  # role not found — skip silently

CURRENT_HASH=$(echo -n "$PROMPT" | shasum -a 256 | cut -d' ' -f1)

# ---------------------------------------------------------------------------
# Fast path — no change
# ---------------------------------------------------------------------------

[ "$CURRENT_HASH" = "$STORED_HASH" ] && exit 0

# ---------------------------------------------------------------------------
# Mismatch — rewrite CLAUDE.md
# ---------------------------------------------------------------------------

ROLE_ID=$(echo "$RESPONSE" | jq -r '.[0].id // empty')
ROLE_NAME=$(echo "$RESPONSE" | jq -r '.[0].name // empty')
COMPANY_ID=$(cat .company-id 2>/dev/null) || COMPANY_ID=""

# Fetch personality (optional — not all roles have one)
PERSONALITY=""
if [ -n "$COMPANY_ID" ] && [ -n "$ROLE_ID" ]; then
  PERSONALITY=$(curl -sf -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
    -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
    "$SUPABASE_URL/rest/v1/exec_personalities?role_id=eq.$ROLE_ID&company_id=eq.$COMPANY_ID&select=compiled_prompt" \
    2>/dev/null | jq -r '.[0].compiled_prompt // empty') || PERSONALITY=""
fi

# Assemble CLAUDE.md (mirrors handlePersistentJob structure)
{
  UPPER_ROLE=$(echo "$ROLE_NAME" | tr '[:lower:]' '[:upper:]')
  echo "# $UPPER_ROLE"
  if [ -n "$PERSONALITY" ]; then
    printf "\n%s" "$PERSONALITY"
  fi
  printf "\n\n---\n\n%s" "$PROMPT"
  if [ -f .claude/.file-writing-rules ]; then
    printf "\n\n---\n\n"
    cat .claude/.file-writing-rules
  fi
} > CLAUDE.md

# Update stored hash
echo "$CURRENT_HASH" > .prompt-hash

echo "⚠️ Prompt updated since last session. CLAUDE.md refreshed — restart to pick up changes." >&2
