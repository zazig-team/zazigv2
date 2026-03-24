export const UNIVERSAL_PROMPT_LAYER = `## CLI Commands

The following commands are available via the zazig CLI. Use these instead of MCP tools where possible.

### Available commands

- \`zazig snapshot --company <company_id>\` — pipeline state summary (capacity, active jobs, feature counts)
- \`zazig ideas --company <company_id>\` — list ideas from inbox
- \`zazig features --company <company_id>\` — list features for the company's project
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
`;
