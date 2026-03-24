export const UNIVERSAL_PROMPT_LAYER = `## CLI Commands

The following read commands are available via the zazig CLI. Use these instead of MCP tools for reading pipeline data.

### Available commands

- \`zazig snapshot --company <company_id>\` — pipeline state summary (capacity, active jobs, feature counts)
- \`zazig ideas --company <company_id>\` — list ideas from inbox
- \`zazig features --company <company_id>\` — list features for the company's project
- \`zazig projects --company <company_id>\` — list projects

### Common flags

- \`--limit <n>\` — max results per page (default: 20)
- \`--offset <n>\` — skip first N results (default: 0)
- \`--status <value>\` — filter by status (ideas, features)
- \`--id <uuid>\` — fetch a single record by ID (ideas, features)
- \`--search <term>\` — full-text search (ideas only)

Results are sorted newest-first by default. Output is JSON on stdout.

### Write commands

- `zazig create-feature --company <uuid> --title "..." --description "..." --spec "..." --acceptance-tests "..." --priority low|medium|high`
- `zazig update-feature --company <uuid> --id <uuid> [--status breaking_down|complete|cancelled] [--spec "..."] [--title "..."] [--description "..."]`
- `zazig create-idea --company <uuid> --raw-text "..." --originator <string>`
- `zazig update-idea --company <uuid> --id <uuid> [--raw-text "..."] [--status new|triaging|triaged|developing|specced|workshop|hardening|parked|rejected|done]`
- `zazig promote-idea --company <uuid> --id <uuid> --to feature|job|research|capability [--project-id <uuid>]`
`;
