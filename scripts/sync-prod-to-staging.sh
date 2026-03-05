#!/usr/bin/env bash

set -euo pipefail

if [[ $# -ne 0 ]]; then
  echo "This script does not accept arguments. Use environment variables only." >&2
  exit 1
fi

: "${SUPABASE_ACCESS_TOKEN:?SUPABASE_ACCESS_TOKEN is required}"
: "${SUPABASE_PRODUCTION_PROJECT_REF:?SUPABASE_PRODUCTION_PROJECT_REF is required}"
: "${SUPABASE_STAGING_PROJECT_REF:?SUPABASE_STAGING_PROJECT_REF is required}"

readonly SUPABASE_API_BASE="https://api.supabase.com/v1/projects"
readonly ZAZIG_COMPANY_ID="aaaaaaaa-0000-0000-0000-000000000001"
readonly DISCOVERY_SQL="SELECT id FROM companies WHERE name ILIKE '%zazig%' LIMIT 5"
readonly SYNC_DRY_RUN="${SYNC_DRY_RUN:-0}"

log() {
  echo "[sync-prod-to-staging] $*"
}

run_sql_query() {
  local project_ref="$1"
  local sql="$2"
  local payload

  payload="$(jq -nc --arg query "$sql" '{query: $query}')"

  curl -sS -X POST "${SUPABASE_API_BASE}/${project_ref}/database/query" \
    -H "Authorization: Bearer ${SUPABASE_ACCESS_TOKEN}" \
    -H "Content-Type: application/json" \
    --data "${payload}"
}

assert_no_api_errors() {
  local response="$1"
  local context="$2"
  local errors

  if ! jq -e . >/dev/null 2>&1 <<<"${response}"; then
    log "ERROR: Invalid JSON response for: ${context}"
    log "Response body:"
    echo "${response}" >&2
    exit 1
  fi

  errors="$(
    jq -c '
      if type == "object" then
        ([.error?] + (if (.errors? | type) == "array" then .errors else [] end))
        | map(select(. != null and . != ""))
      elif type == "array" then
        [ .[]? | select(type == "object" and .error? != null and .error? != "") | .error ]
      else
        []
      end
    ' <<<"${response}"
  )"

  if [[ "${errors}" != "[]" ]]; then
    log "ERROR: Supabase API returned errors for: ${context}"
    echo "${errors}" | jq .
    exit 1
  fi
}

extract_rows_array() {
  local response="$1"

  jq -c '
    def rows:
      if type == "array" then .
      elif (.result? | type) == "array" then .result
      elif (.data? | type) == "array" then .data
      elif (.rows? | type) == "array" then .rows
      elif (.output? | type) == "array" then .output
      else []
      end;

    rows
    | map(
        if (type == "object" and has("row_to_json")) then
          .row_to_json
        else
          .
        end
      )
  ' <<<"${response}"
}

query_rows() {
  local project_ref="$1"
  local sql="$2"
  local context="$3"
  local response

  response="$(run_sql_query "${project_ref}" "${sql}")"
  assert_no_api_errors "${response}" "${context}"
  extract_rows_array "${response}"
}

verify_hardcoded_company_id() {
  local rows

  log "Discovering zazig company IDs in production for validation..."
  rows="$(query_rows \
    "${SUPABASE_PRODUCTION_PROJECT_REF}" \
    "${DISCOVERY_SQL}" \
    "discover zazig company ids in production"
  )"

  log "Production company candidates from discovery query:"
  echo "${rows}" | jq .

  if ! jq -e --arg id "${ZAZIG_COMPANY_ID}" 'map(.id) | index($id) != null' >/dev/null <<<"${rows}"; then
    log "ERROR: Hardcoded ZAZIG_COMPANY_ID (${ZAZIG_COMPANY_ID}) not found in discovery query results."
    exit 1
  fi

  log "Validated hardcoded ZAZIG_COMPANY_ID=${ZAZIG_COMPANY_ID}"
}

fetch_table_rows_from_prod() {
  local table="$1"
  local sql

  sql="SELECT row_to_json(t) FROM (SELECT * FROM public.${table} WHERE company_id = '${ZAZIG_COMPANY_ID}') t"

  query_rows \
    "${SUPABASE_PRODUCTION_PROJECT_REF}" \
    "${sql}" \
    "read ${table} rows from production"
}

delete_table_rows_from_staging() {
  local table="$1"
  local sql
  local response

  sql="DELETE FROM public.${table} WHERE company_id = '${ZAZIG_COMPANY_ID}'"

  log "Deleting staging rows from ${table} for company ${ZAZIG_COMPANY_ID}..."
  response="$(run_sql_query "${SUPABASE_STAGING_PROJECT_REF}" "${sql}")"
  assert_no_api_errors "${response}" "delete ${table} rows in staging"
}

fetch_column_types_map() {
  local table="$1"
  local rows
  local sql

  sql="SELECT column_name, udt_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = '${table}' ORDER BY ordinal_position"

  rows="$(query_rows \
    "${SUPABASE_STAGING_PROJECT_REF}" \
    "${sql}" \
    "load staging column types for ${table}"
  )"

  jq -c 'reduce .[] as $row ({}; .[$row.column_name] = $row.udt_name)' <<<"${rows}"
}

build_insert_statements() {
  local table="$1"
  local rows_json="$2"
  local types_map="$3"

  jq -r --arg table "${table}" --argjson types "${types_map}" '
    def sqlesc: gsub("'"'"'"; "''");

    def scalar_sql($v):
      if $v == null then
        "NULL"
      elif ($v | type) == "boolean" then
        (if $v then "TRUE" else "FALSE" end)
      elif ($v | type) == "number" then
        ($v | tostring)
      else
        "'"'"'" + (($v | tostring) | sqlesc) + "'"'"'"
      end;

    def array_elem_sql($v):
      if $v == null then
        "NULL"
      elif ($v | type) == "boolean" then
        (if $v then "TRUE" else "FALSE" end)
      elif ($v | type) == "number" then
        ($v | tostring)
      else
        "'"'"'" + (($v | tostring) | sqlesc) + "'"'"'"
      end;

    def array_sql($base; $v):
      if ($v | length) == 0 then
        "ARRAY[]::" + $base + "[]"
      else
        "ARRAY[" + (($v | map(array_elem_sql(.))) | join(", ")) + "]::" + $base + "[]"
      end;

    def json_sql($target; $v):
      "'"'"'" + (($v | tojson) | sqlesc) + "'"'"'::" + $target;

    def value_sql($key; $value):
      ($types[$key] // "") as $udt
      | if $value == null then
          "NULL"
        elif ($udt | startswith("_")) then
          if ($value | type) == "array" then
            array_sql(($udt | ltrimstr("_")); $value)
          else
            "NULL"
          end
        elif ($udt == "json" or $udt == "jsonb") then
          json_sql($udt; $value)
        elif (($value | type) == "object" or ($value | type) == "array") then
          json_sql("jsonb"; $value)
        else
          scalar_sql($value)
        end;

    .[]
    | to_entries as $entries
    | "INSERT INTO public.\($table) (" +
        ($entries | map(.key) | join(", ")) +
      ") VALUES (" +
        ($entries | map(value_sql(.key; .value)) | join(", ")) +
      ");"
  ' <<<"${rows_json}"
}

insert_rows_into_staging() {
  local table="$1"
  local rows_json="$2"
  local row_count
  local types_map

  row_count="$(jq -r 'length' <<<"${rows_json}")"
  if [[ "${row_count}" -eq 0 ]]; then
    log "No ${table} rows found in production for company ${ZAZIG_COMPANY_ID}; skipping insert."
    return
  fi

  types_map="$(fetch_column_types_map "${table}")"
  log "Inserting ${row_count} ${table} rows into staging..."

  while IFS= read -r insert_sql; do
    [[ -z "${insert_sql}" ]] && continue
    assert_no_api_errors \
      "$(run_sql_query "${SUPABASE_STAGING_PROJECT_REF}" "${insert_sql}")" \
      "insert row into ${table} in staging"
  done < <(build_insert_statements "${table}" "${rows_json}" "${types_map}")
}

main() {
  local features_rows
  local ideas_rows
  local jobs_rows

  log "Starting prod -> staging zazig data sync."
  log "Hardcoded ZAZIG_COMPANY_ID=${ZAZIG_COMPANY_ID}"
  log "SYNC_DRY_RUN=${SYNC_DRY_RUN}"

  verify_hardcoded_company_id

  log "Step 1/3: Reading company rows from production..."
  features_rows="$(fetch_table_rows_from_prod "features")"
  ideas_rows="$(fetch_table_rows_from_prod "ideas")"
  jobs_rows="$(fetch_table_rows_from_prod "jobs")"

  log "Production row counts:"
  log "features=$(jq -r 'length' <<<"${features_rows}")"
  log "ideas=$(jq -r 'length' <<<"${ideas_rows}")"
  log "jobs=$(jq -r 'length' <<<"${jobs_rows}")"

  if [[ "${SYNC_DRY_RUN}" == "1" || "${SYNC_DRY_RUN}" == "true" || "${SYNC_DRY_RUN}" == "TRUE" ]]; then
    log "Dry-run enabled; skipping Step 2 (delete) and Step 3 (insert)."
    log "Dry-run complete."
    return
  fi

  log "Step 2/3: Deleting staging rows in FK-safe order (jobs -> ideas -> features)..."
  delete_table_rows_from_staging "jobs"
  delete_table_rows_from_staging "ideas"
  delete_table_rows_from_staging "features"

  log "Step 3/3: Inserting staging rows in FK-safe order (features -> ideas -> jobs)..."
  insert_rows_into_staging "features" "${features_rows}"
  insert_rows_into_staging "ideas" "${ideas_rows}"
  insert_rows_into_staging "jobs" "${jobs_rows}"

  log "Sync complete."
}

main "$@"
