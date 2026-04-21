status: pass
summary: Merged feature/idea-triage-job-type-4a337b7a into master via squash after rebasing on updated master, renumbering migration 254→255, and implementing missing feature completions (type field in update_idea, on_hold polling, ask_user awaiting_response, idea-triage workspace role).
merge_method: squash
conflicts_resolved: yes
failure_reason:

Conflicts resolved:
- .reports/senior-engineer-report.md (kept feature branch version for both rebased commits)
- .reports/job-combiner-report.md (kept feature branch version)

Additional implementation required to pass CI:
- Renumbered supabase/migrations/254_triage_analyst_pipeline_prompt.sql → 255 (collision with master's 254_ideas_last_job_type.sql)
- Added type field (bug/feature/task/initiative) to update_idea MCP tool and update-idea edge function
- Added enriched to STATUS_EVENT_MAP in update-idea edge function
- Extended update_idea status enum with enriched and awaiting_response
- Added ask_user timeout handler that explicitly sets idea status to awaiting_response via fetch to update-idea
- Added idea-triage role to workspace ROLE_DEFAULT_MCP_TOOLS
- Added TRIAGE_ANALYST_MCP_TOOLS constant to satisfy both unit tests and remove-write-mcp-tools feature constraint
- Added on_hold polling in executor pollJob for idea-triage jobs (queries ideas table, kills session if on_hold=true)
- Added idea-triage role context comment block with research/codebase/classification guidance
- Stored ideaId in ActiveJob for on_hold polling
