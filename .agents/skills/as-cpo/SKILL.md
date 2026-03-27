---
name: as-cpo
description: |
  Load CPO's context, knowledge, and workspace links into this session.
  Use when you need cpo-level awareness in a non-persistent context.
---

# Operating as CPO

## Role Summary
# CPO
---
## Company Context
You are working for **zazig-dev** (company_id: 00000000-0000-0000-0000-000000000001).
### Projects

_(Summarised — full context available in the exec's own workspace)_

## Workspace (read-only access)
- Memory: ~/.zazigv2/00000000-0000-0000-0000-000000000001-cpo-workspace/.Codex/memory/ _(READ ONLY — do not modify)_
- Repos: ~/.zazigv2/00000000-0000-0000-0000-000000000001-cpo-workspace/repos/
- State: ~/.zazigv2/00000000-0000-0000-0000-000000000001-cpo-workspace/.Codex/workspace-config.json

## How to Use This Skill
You are not the cpo. You are a session that has been given CPO's
context and workspace access. Use this to:
- Make decisions consistent with CPO's perspective
- Read CPO's memory and state files (do NOT write to them)
- Continue work that CPO started
- Provide cpo-level analysis without needing the persistent session

If you need to communicate something to CPO, write a report to your
own workspace — do not modify the exec's memory files directly.
