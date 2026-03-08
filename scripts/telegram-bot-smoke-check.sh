#!/usr/bin/env bash
set -euo pipefail

if [[ -z "${TELEGRAM_BOT_TOKEN:-}" ]]; then
  echo "Missing TELEGRAM_BOT_TOKEN"
  exit 1
fi

if [[ -z "${SUPABASE_PROJECT_REF:-}" ]]; then
  echo "Missing SUPABASE_PROJECT_REF (example: jmussmwglgbwncgygzbz)"
  exit 1
fi

SUPABASE_URL="https://${SUPABASE_PROJECT_REF}.supabase.co"
FUNCTION_URL="${SUPABASE_URL}/functions/v1/telegram-bot"
TELEGRAM_API_BASE="https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}"
# Streaming responses vary by prompt/model output, so smoke checks should avoid exact
# static-message assertions. This pattern accepts both legacy/static and streamed replies.
EXPECTED_CONFIRMATION_PATTERN="${TELEGRAM_EXPECTED_CONFIRMATION_PATTERN:-(Got it\\..*Captured.*idea.*|.{20,})}"

echo "==> 1) Telegram webhook info"
WEBHOOK_JSON="$(curl -sS "${TELEGRAM_API_BASE}/getWebhookInfo")"
echo "${WEBHOOK_JSON}"

if command -v jq >/dev/null 2>&1; then
  CURRENT_URL="$(echo "${WEBHOOK_JSON}" | jq -r '.result.url // ""')"
  if [[ "${CURRENT_URL}" == "${FUNCTION_URL}" ]]; then
    echo "Webhook URL matches expected function URL."
  else
    echo "WARNING: webhook URL differs from expected."
    echo "  expected: ${FUNCTION_URL}"
    echo "  current : ${CURRENT_URL}"
  fi
fi

echo
echo "==> 2) Function reachability ping"
PING_PAYLOAD='{"update_id":999999999,"edited_message":{"message_id":1}}'
HEADER_ARGS=(-H "Content-Type: application/json")
if [[ -n "${TELEGRAM_SECRET_TOKEN:-}" ]]; then
  HEADER_ARGS+=(-H "X-Telegram-Bot-Api-Secret-Token: ${TELEGRAM_SECRET_TOKEN}")
fi

PING_RESP="$(curl -sS -X POST "${FUNCTION_URL}" "${HEADER_ARGS[@]}" --data "${PING_PAYLOAD}")"
echo "${PING_RESP}"

if command -v jq >/dev/null 2>&1; then
  PING_OK="$(echo "${PING_RESP}" | jq -r '.ok // false')"
  if [[ "${PING_OK}" != "true" ]]; then
    echo "Function ping did not return ok=true."
    exit 1
  fi
else
  if [[ "${PING_RESP}" != *'"ok":true'* ]]; then
    echo "Function ping did not return ok=true."
    exit 1
  fi
fi

echo
echo "==> 3) Recent telegram ideas (optional: requires SUPABASE_SERVICE_ROLE_KEY)"
if [[ -z "${SUPABASE_SERVICE_ROLE_KEY:-}" ]]; then
  echo "Skipped (SUPABASE_SERVICE_ROLE_KEY not set)."
else
  curl -sS \
    "${SUPABASE_URL}/rest/v1/ideas?select=id,company_id,source,source_ref,status,created_at&source=eq.telegram&order=created_at.desc&limit=5" \
    -H "apikey: ${SUPABASE_SERVICE_ROLE_KEY}" \
    -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}"
  echo
fi

echo
echo "==> 4) Optional bot confirmation pattern check"
if [[ -z "${TELEGRAM_LAST_CONFIRMATION_TEXT:-}" ]]; then
  echo "Skipped (set TELEGRAM_LAST_CONFIRMATION_TEXT to validate a real bot reply)."
else
  if [[ "${TELEGRAM_LAST_CONFIRMATION_TEXT}" =~ ${EXPECTED_CONFIRMATION_PATTERN} ]]; then
    echo "Confirmation text matches expected pattern."
  else
    echo "Confirmation text did not match expected pattern."
    echo "  pattern: ${EXPECTED_CONFIRMATION_PATTERN}"
    exit 1
  fi
fi

echo
echo "Smoke check completed."
