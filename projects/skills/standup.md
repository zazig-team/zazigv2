# /standup

**Role:** CPO
**Type:** Operational
**Target:** < 10 seconds, < 30 lines output

## Execution

Run: `zazig standup --company <company_id> --json`

Parse the JSON. Present the standup to the human using this format:

## Standup — {date}

**Inbox:** {new} new ideas awaiting triage
**Pipeline:** {active} active | {backlog} backlog | {failed} failed | {complete} complete

(Then list Active, Failed, Stuck, Recently completed sections — omit empty ones.)

Append the most relevant 1-2 items from the recommendations array.

## Rules

- If CLI fails, report error and suggest checking CLI auth
- No IDs, no UUIDs — human-readable titles only
- At session start, present as part of greeting — don't announce "running standup"
- After standup, yield to the human
