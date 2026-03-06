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
readonly ZAZIG_COMPANY_ID="00000000-0000-0000-0000-000000000001"
readonly DISCOVERY_SQL="SELECT id FROM companies WHERE name ILIKE '%zazig%' LIMIT 5"
readonly SYNC_DRY_RUN="${SYNC_DRY_RUN:-0}"
readonly SYNC_DAYS="${SYNC_DAYS:-7}"
readonly BATCH_SIZE=20

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

    .[0] | keys_unsorted as $cols
    | ($cols | join(", ")) as $col_list
    | "INSERT INTO public.\($table) (\($col_list)) VALUES (" +
        ($cols | map(value_sql(.; .)) | join(", ")) +
      ");"
    ,
    (.[1:][] |
      to_entries as $entries
      | "INSERT INTO public.\($table) (" +
          ($entries | map(.key) | join(", ")) +
        ") VALUES (" +
          ($entries | map(value_sql(.key; .value)) | join(", ")) +
        ");"
    )
  ' <<<"${rows_json}"
}

# Build batched SQL: groups N insert statements into one API call
batch_insert_rows() {
  local table="$1"
  local rows_json="$2"
  local row_count
  local types_map
  local batch_sql=""
  local batch_count=0
  local total_batches=0

  row_count="$(jq -r 'length' <<<"${rows_json}")"
  if [[ "${row_count}" -eq 0 ]]; then
    log "No ${table} rows to insert; skipping."
    return
  fi

  types_map="$(fetch_column_types_map "${table}")"
  log "Inserting ${row_count} ${table} rows into staging (batch size=${BATCH_SIZE})..."

  while IFS= read -r insert_sql; do
    [[ -z "${insert_sql}" ]] && continue
    batch_sql+="${insert_sql}"$'\n'
    batch_count=$((batch_count + 1))

    if [[ ${batch_count} -ge ${BATCH_SIZE} ]]; then
      total_batches=$((total_batches + 1))
      assert_no_api_errors \
        "$(run_sql_query "${SUPABASE_STAGING_PROJECT_REF}" "${batch_sql}")" \
        "insert batch ${total_batches} into ${table}"
      log "  batch ${total_batches}: ${batch_count} rows inserted"
      batch_sql=""
      batch_count=0
    fi
  done < <(build_insert_statements "${table}" "${rows_json}" "${types_map}")

  # Flush remaining rows
  if [[ ${batch_count} -gt 0 ]]; then
    total_batches=$((total_batches + 1))
    assert_no_api_errors \
      "$(run_sql_query "${SUPABASE_STAGING_PROJECT_REF}" "${batch_sql}")" \
      "insert batch ${total_batches} into ${table}"
    log "  batch ${total_batches}: ${batch_count} rows inserted"
  fi

  log "Inserted ${row_count} ${table} rows in ${total_batches} batches."
}

main() {
  local features_rows
  local feature_ids
  local ideas_rows
  local jobs_rows

  log "Starting prod -> staging zazig data sync."
  log "Hardcoded ZAZIG_COMPANY_ID=${ZAZIG_COMPANY_ID}"
  log "SYNC_DAYS=${SYNC_DAYS}"
  log "SYNC_DRY_RUN=${SYNC_DRY_RUN}"

  verify_hardcoded_company_id

  # --- Read from production (recent data only) ---
  log "Step 1/3: Reading recent rows from production (last ${SYNC_DAYS} days)..."

  features_rows="$(query_rows \
    "${SUPABASE_PRODUCTION_PROJECT_REF}" \
    "SELECT row_to_json(t) FROM (SELECT * FROM public.features WHERE company_id = '${ZAZIG_COMPANY_ID}' AND created_at >= NOW() - INTERVAL '${SYNC_DAYS} days') t" \
    "read recent features from production"
  )"

  # Extract feature IDs for FK-safe job query
  feature_ids="$(jq -r '[.[].id] | join("'\'','\''")'  <<<"${features_rows}")"

  if [[ -n "${feature_ids}" ]]; then
    jobs_rows="$(query_rows \
      "${SUPABASE_PRODUCTION_PROJECT_REF}" \
      "SELECT row_to_json(t) FROM (SELECT * FROM public.jobs WHERE company_id = '${ZAZIG_COMPANY_ID}' AND feature_id IN ('${feature_ids}')) t" \
      "read jobs for recent features from production"
    )"
  else
    jobs_rows="[]"
  fi

  ideas_rows="$(query_rows \
    "${SUPABASE_PRODUCTION_PROJECT_REF}" \
    "SELECT row_to_json(t) FROM (SELECT * FROM public.ideas WHERE company_id = '${ZAZIG_COMPANY_ID}' AND created_at >= NOW() - INTERVAL '${SYNC_DAYS} days') t" \
    "read recent ideas from production"
  )"

  log "Production row counts (last ${SYNC_DAYS} days):"
  log "  features=$(jq -r 'length' <<<"${features_rows}")"
  log "  ideas=$(jq -r 'length' <<<"${ideas_rows}")"
  log "  jobs=$(jq -r 'length' <<<"${jobs_rows}")"

  if [[ "${SYNC_DRY_RUN}" == "1" || "${SYNC_DRY_RUN}" == "true" || "${SYNC_DRY_RUN}" == "TRUE" ]]; then
    log "Dry-run enabled; skipping Step 2 (delete) and Step 3 (insert)."
    log "Dry-run complete."
    return
  fi

  # --- Delete existing staging data ---
  log "Step 2/3: Deleting staging rows in FK-safe order (jobs -> ideas -> features)..."
  delete_table_rows_from_staging "jobs"
  delete_table_rows_from_staging "ideas"
  delete_table_rows_from_staging "features"

  # --- Insert into staging (batched) ---
  log "Step 3/3: Inserting staging rows in FK-safe order (features -> ideas -> jobs)..."
  batch_insert_rows "features" "${features_rows}"
  batch_insert_rows "ideas" "${ideas_rows}"
  batch_insert_rows "jobs" "${jobs_rows}"

  log "Sync complete."
}

main "$@"
