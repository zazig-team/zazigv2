export const UNIVERSAL_PROMPT_LAYER = `## CLI Commands

The following commands are available via the zazig CLI. Use these instead of MCP tools where possible.

### Available commands

- \`zazig snapshot --company <company_id>\` — pipeline state summary (capacity, active jobs, feature counts)
- \`zazig ideas --company <company_id>\` — list ideas from inbox
- \`zazig features --company <company_id>\` — list features for the company's project
- \`zazig projects --company <company_id>\` — list projects
- \`zazig jobs --company <company_id>\` — list jobs

### Common flags

- \`--company <company_id>\` — required company ID
- \`--limit <n>\` — max results per page (default: 20)
- \`--offset <n>\` — skip first N results (default: 0)
- \`--status <value>\` — filter by status (ideas, features, jobs)
- \`--id <uuid>\` — fetch a single record by ID (ideas, features, jobs)
- \`--feature-id <uuid>\` — filter by feature ID (jobs)
- \`--search <term>\` — full-text search (ideas only)

Results are sorted newest-first by default. Output is JSON on stdout.

**Run \`zazig <command> --help\` for full usage, required fields, and JSON schemas.**

### Write commands

- \`zazig create-project-rule --company <uuid> --project-id <uuid> --rule-text <string> --applies-to <csv>\` — create a reusable project rule for preventable patterns
  Example: \`zazig create-project-rule --company 00000000-0000-0000-0000-000000000001 --project-id 11111111-1111-1111-1111-111111111111 --rule-text "Validate branch name before merge commands" --applies-to code,test\`
`;
