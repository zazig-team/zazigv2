export const UNIVERSAL_PROMPT_LAYER = `## CLI Commands

The following commands are available via the zazig CLI. Use these instead of MCP tools where possible.

### Available commands

- \`zazig snapshot --company <company_id>\` — pipeline state summary (capacity, active jobs, feature counts)
- \`zazig ideas --company <company_id>\` — list ideas from inbox
- \`zazig features --company <company_id>\` — list features for the company's project
- \`zazig jobs --company <company_id>\` — list jobs with optional filters
- \`--id <uuid>\` — fetch a single job by ID
- \`--feature-id <uuid>\` — filter jobs by feature
- \`--status <value>\` — filter by status (queued, executing, complete, failed, etc.)
- \`--limit <n>\` — max results per page (default: 20)
- \`--offset <n>\` — skip first N results (default: 0)
- \`zazig projects --company <company_id>\` — list projects
- \`zazig batch-create-jobs --company <company_id> --feature-id <feature_id> --jobs <json>\` — create jobs for a feature
- \`zazig batch-create-jobs --company <company_id> --feature-id <feature_id> --jobs-file <path>\` — create jobs for a feature using a JSON file

### Common flags

- \`--limit <n>\` — max results per page (default: 20)
- \`--offset <n>\` — skip first N results (default: 0)
- \`--status <value>\` — filter by status (ideas, features)
- \`--id <uuid>\` — fetch a single record by ID (ideas, features)
- \`--search <term>\` — full-text search (ideas only)

Results are sorted newest-first by default. Output is JSON on stdout.

**Run \`zazig <command> --help\` for full usage, required fields, and JSON schemas.**

### Write commands

- \`zazig batch-create-jobs --company <uuid> --feature-id <uuid> --jobs '<json array>'\` — create jobs for a feature in batch
- \`zazig batch-create-jobs --company <uuid> --feature-id <uuid> --jobs-file <path>\` — alternative for large payloads (write JSON to a temp file and pass the path)
`;
