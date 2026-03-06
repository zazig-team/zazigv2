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

# Use temp dir for large JSON — avoids bash argument length limits
TMPDIR_SYNC="$(mktemp -d)"
trap 'rm -rf "${TMPDIR_SYNC}"' EXIT

log() {
  echo "[sync-prod-to-staging] $*"
}

run_sql_query() {
  local project_ref="$1"
  local sql_file="$2"

  curl -sS -X POST "${SUPABASE_API_BASE}/${project_ref}/database/query" \
    -H "Authorization: Bearer ${SUPABASE_ACCESS_TOKEN}" \
    -H "Content-Type: application/json" \
    --data @<(jq -nc --rawfile query "${sql_file}" '{query: $query}')
}

# Convenience wrapper for inline SQL strings
run_sql() {
  local project_ref="$1"
  local sql="$2"
  local tmp="${TMPDIR_SYNC}/inline_sql.tmp"

  printf '%s' "${sql}" > "${tmp}"
  run_sql_query "${project_ref}" "${tmp}"
}

assert_no_api_errors() {
  local response_file="$1"
  local context="$2"
  local errors

  if ! jq -e . >/dev/null 2>&1 < "${response_file}"; then
    log "ERROR: Invalid JSON response for: ${context}"
    log "Response body:"
    cat "${response_file}" >&2
    exit 1
  fi

  errors="$(
    jq -c '
      if type == "object" then
        ([.error?, .message?] + (if (.errors? | type) == "array" then .errors else [] end))
        | map(select(. != null and . != ""))
        | map(select(. | tostring | test("Failed|error|Error|entity too large|ThrottlerException"; "i")))
      elif type == "array" then
        [ .[]? | select(type == "object" and .error? != null and .error? != "") | .error ]
      else
        []
      end
    ' < "${response_file}"
  )"

  if [[ "${errors}" != "[]" ]]; then
    log "ERROR: Supabase API returned errors for: ${context}"
    echo "${errors}" | jq .
    exit 1
  fi
}

extract_rows_to_file() {
  local response_file="$1"
  local output_file="$2"

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
  ' < "${response_file}" > "${output_file}"
}

query_rows_to_file() {
  local project_ref="$1"
  local sql="$2"
  local context="$3"
  local output_file="$4"
  local response_file="${TMPDIR_SYNC}/response.json"

  run_sql "${project_ref}" "${sql}" > "${response_file}"
  assert_no_api_errors "${response_file}" "${context}"
  extract_rows_to_file "${response_file}" "${output_file}"
}

verify_hardcoded_company_id() {
  local response_file="${TMPDIR_SYNC}/discovery.json"
  local rows_file="${TMPDIR_SYNC}/discovery_rows.json"

  log "Discovering zazig company IDs in production for validation..."
  run_sql "${SUPABASE_PRODUCTION_PROJECT_REF}" "${DISCOVERY_SQL}" > "${response_file}"
  assert_no_api_errors "${response_file}" "discover zazig company ids in production"
  extract_rows_to_file "${response_file}" "${rows_file}"

  log "Production company candidates from discovery query:"
  jq . < "${rows_file}"

  if ! jq -e --arg id "${ZAZIG_COMPANY_ID}" 'map(.id) | index($id) != null' >/dev/null < "${rows_file}"; then
    log "ERROR: Hardcoded ZAZIG_COMPANY_ID (${ZAZIG_COMPANY_ID}) not found in discovery query results."
    exit 1
  fi

  log "Validated hardcoded ZAZIG_COMPANY_ID=${ZAZIG_COMPANY_ID}"
}

delete_table_rows_from_staging() {
  local table="$1"
  local response_file="${TMPDIR_SYNC}/delete_response.json"

  log "Deleting staging rows from ${table} for company ${ZAZIG_COMPANY_ID}..."
  run_sql "${SUPABASE_STAGING_PROJECT_REF}" \
    "DELETE FROM public.${table} WHERE company_id = '${ZAZIG_COMPANY_ID}'" \
    > "${response_file}"
  assert_no_api_errors "${response_file}" "delete ${table} rows in staging"
}

fetch_column_types_map() {
  local table="$1"
  local response_file="${TMPDIR_SYNC}/coltypes_response.json"
  local rows_file="${TMPDIR_SYNC}/coltypes_rows.json"

  run_sql "${SUPABASE_STAGING_PROJECT_REF}" \
    "SELECT column_name, udt_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = '${table}' ORDER BY ordinal_position" \
    > "${response_file}"
  assert_no_api_errors "${response_file}" "load staging column types for ${table}"
  extract_rows_to_file "${response_file}" "${rows_file}"

  jq -c 'reduce .[] as $row ({}; .[$row.column_name] = $row.udt_name)' < "${rows_file}"
}

batch_insert_rows() {
  local table="$1"
  local rows_file="$2"
  local row_count
  local types_map
  local batch_file="${TMPDIR_SYNC}/${table}_batch.sql"
  local response_file="${TMPDIR_SYNC}/${table}_batch_response.json"
  local total_batches=0
  local offset=0

  row_count="$(jq -r 'length' < "${rows_file}")"
  if [[ "${row_count}" -eq 0 ]]; then
    log "No ${table} rows to insert; skipping."
    return
  fi

  # Coalesce NULL text to empty string for ideas table (staging has NOT NULL constraint)
  if [[ "${table}" == "ideas" ]]; then
    jq '[.[] | .text //= ""]' < "${rows_file}" > "${rows_file}.tmp" && mv "${rows_file}.tmp" "${rows_file}"
  fi

  # Jobs have large context/raw_log fields — use smaller batches
  local effective_batch=${BATCH_SIZE}
  if [[ "${table}" == "jobs" ]]; then
    effective_batch=3
  fi

  types_map="$(fetch_column_types_map "${table}")"
  log "Inserting ${row_count} ${table} rows into staging (batch size=${effective_batch})..."

  while [[ ${offset} -lt ${row_count} ]]; do
    total_batches=$((total_batches + 1))
    local batch_rows=$((row_count - offset))
    if [[ ${batch_rows} -gt ${effective_batch} ]]; then
      batch_rows=${effective_batch}
    fi

    jq -r --arg table "${table}" --argjson types "${types_map}" \
      --argjson offset "${offset}" --argjson limit "${batch_rows}" '
      def sqlesc: gsub("'"'"'"; "''");

      def scalar_sql($v):
        if $v == null then "NULL"
        elif ($v | type) == "boolean" then (if $v then "TRUE" else "FALSE" end)
        elif ($v | type) == "number" then ($v | tostring)
        else "'"'"'" + (($v | tostring) | sqlesc) + "'"'"'"
        end;

      def array_elem_sql($v):
        if $v == null then "NULL"
        elif ($v | type) == "boolean" then (if $v then "TRUE" else "FALSE" end)
        elif ($v | type) == "number" then ($v | tostring)
        else "'"'"'" + (($v | tostring) | sqlesc) + "'"'"'"
        end;

      def array_sql($base; $v):
        if ($v | length) == 0 then "ARRAY[]::" + $base + "[]"
        else "ARRAY[" + (($v | map(array_elem_sql(.))) | join(", ")) + "]::" + $base + "[]"
        end;

      def json_sql($target; $v):
        "'"'"'" + (($v | tojson) | sqlesc) + "'"'"'::" + $target;

      def value_sql($key; $value):
        ($types[$key] // "") as $udt
        | if $value == null then "NULL"
          elif ($udt | startswith("_")) then
            if ($value | type) == "array" then array_sql(($udt | ltrimstr("_")); $value)
            else "NULL"
            end
          elif ($udt == "json" or $udt == "jsonb") then json_sql($udt; $value)
          elif (($value | type) == "object" or ($value | type) == "array") then json_sql("jsonb"; $value)
          else scalar_sql($value)
          end;

      .[$offset:$offset+$limit]
      | map(
          to_entries as $entries
          | "INSERT INTO public.\($table) (" +
              ($entries | map(.key) | join(", ")) +
            ") VALUES (" +
              ($entries | map(value_sql(.key; .value)) | join(", ")) +
            ") ON CONFLICT (id) DO NOTHING;"
        )
      | join("\n")
    ' < "${rows_file}" > "${batch_file}"

    run_sql_query "${SUPABASE_STAGING_PROJECT_REF}" "${batch_file}" > "${response_file}"

    assert_no_api_errors "${response_file}" "insert batch ${total_batches} into ${table}"
    log "  batch ${total_batches}: ${batch_rows} rows inserted"

    offset=$((offset + batch_rows))

    # Small delay between batches to avoid rate limiting
    sleep 1
  done

  log "Inserted ${row_count} ${table} rows in ${total_batches} batches."
}

main() {
  local features_file="${TMPDIR_SYNC}/features.json"
  local ideas_file="${TMPDIR_SYNC}/ideas.json"
  local jobs_file="${TMPDIR_SYNC}/jobs.json"
  local feature_ids

  log "Starting prod -> staging zazig data sync."
  log "Hardcoded ZAZIG_COMPANY_ID=${ZAZIG_COMPANY_ID}"
  log "SYNC_DAYS=${SYNC_DAYS}"
  log "SYNC_DRY_RUN=${SYNC_DRY_RUN}"

  verify_hardcoded_company_id

  # --- Read from production (recent data only) ---
  log "Step 1/3: Reading recent rows from production (last ${SYNC_DAYS} days)..."

  # Features created in last N days
  query_rows_to_file \
    "${SUPABASE_PRODUCTION_PROJECT_REF}" \
    "SELECT row_to_json(t) FROM (SELECT * FROM public.features WHERE company_id = '${ZAZIG_COMPANY_ID}' AND created_at >= NOW() - INTERVAL '${SYNC_DAYS} days') t" \
    "read recent features from production" \
    "${features_file}"

  # Extract feature IDs for FK-safe queries
  feature_ids="$(jq -r '[.[].id] | map("'\''" + . + "'\''") | join(",")' < "${features_file}")"

  # Ideas referenced by those features (via source_idea_id) + ideas for those features
  if [[ -n "${feature_ids}" ]]; then
    # Get source_idea_ids from features
    local source_idea_ids
    source_idea_ids="$(jq -r '[.[].source_idea_id // empty] | unique | map("'\''" + . + "'\''") | join(",")' < "${features_file}")"

    local ideas_where="company_id = '${ZAZIG_COMPANY_ID}' AND (id IN (${feature_ids})"
    if [[ -n "${source_idea_ids}" ]]; then
      ideas_where="${ideas_where} OR id IN (${source_idea_ids})"
    fi
    ideas_where="${ideas_where})"

    query_rows_to_file \
      "${SUPABASE_PRODUCTION_PROJECT_REF}" \
      "SELECT row_to_json(t) FROM (SELECT * FROM public.ideas WHERE ${ideas_where}) t" \
      "read ideas for recent features from production" \
      "${ideas_file}"

    # Jobs belonging to those features
    query_rows_to_file \
      "${SUPABASE_PRODUCTION_PROJECT_REF}" \
      "SELECT row_to_json(t) FROM (SELECT * FROM public.jobs WHERE company_id = '${ZAZIG_COMPANY_ID}' AND feature_id IN (${feature_ids})) t" \
      "read jobs for recent features from production" \
      "${jobs_file}"
  else
    echo "[]" > "${ideas_file}"
    echo "[]" > "${jobs_file}"
  fi

  log "Production row counts (last ${SYNC_DAYS} days):"
  log "  features=$(jq -r 'length' < "${features_file}")"
  log "  ideas=$(jq -r 'length' < "${ideas_file}")"
  log "  jobs=$(jq -r 'length' < "${jobs_file}")"

  if [[ "${SYNC_DRY_RUN}" == "1" || "${SYNC_DRY_RUN}" == "true" || "${SYNC_DRY_RUN}" == "TRUE" ]]; then
    log "Dry-run enabled; skipping Step 2 (delete) and Step 3 (insert)."
    log "Dry-run complete."
    return
  fi

  # --- Delete existing staging data ---
  log "Step 2/3: Deleting staging rows in FK-safe order (jobs -> features -> ideas)..."
  delete_table_rows_from_staging "jobs"
  delete_table_rows_from_staging "features"
  delete_table_rows_from_staging "ideas"

  # --- Insert into staging (batched, file-based) ---
  log "Step 3/3: Inserting staging rows in FK-safe order (ideas -> features -> jobs)..."
  batch_insert_rows "ideas" "${ideas_file}"
  batch_insert_rows "features" "${features_file}"
  batch_insert_rows "jobs" "${jobs_file}"

  log "Sync complete."
}

main "$@"
