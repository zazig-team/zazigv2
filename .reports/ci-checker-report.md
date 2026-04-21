status: failed
failing_checks:
  - name: build-and-test
    conclusion: failure
    url: https://github.com/zazig-team/zazigv2/actions/runs/24732741543/job/72351354191
failure_summary: 1 check(s) failed: build-and-test (failure) — 27 tests failed in 3 files
failure_type: code
fix_attempts: 0

details: |
  The 'build-and-test' check failed with 27 test failures across 3 files:

  1. features/idea-triage-job-type-local-agent.test.ts (11 failures)
     - executor.ts is missing ZAZIG_IDEA_ID (it lives in workspace.ts; tests check executor.ts)
     - executor.ts is missing on_hold polling for idea-triage jobs
     - idea-triage handler doesn't reference role/agent on same line as the job type string
       (regex /idea.triage.*role|role.*idea.triage|triage.*agent/i fails across newlines)

  2. features/idea-triage-job-type-agent-role.test.ts (14 failures)
     - workspace.ts ROLE_DEFAULT_MCP_TOOLS missing 'idea-triage' entry
       (only has 'triage-analyst'; test looks for literal 'idea-triage' key)
     - agent-mcp-server.ts update_idea tool missing: type field (bug/feature/task/initiative),
       enriched and awaiting_response status enum values
     - agent-mcp-server.ts ask_user tool missing awaiting_response on timeout behavior
     - supabase/functions/update-idea/index.ts missing: type field destructuring,
       updates.type assignment, 'enriched' in STATUS_EVENT_MAP

  3. features/remove-write-mcp-tools-workspace.test.ts (2 failures)
     - Conflict: old test asserts update_idea must not be in any ROLE_DEFAULT_MCP_TOOLS entry,
       but new idea-triage feature requires update_idea in the idea-triage role defaults.
       The triage-analyst role already has update_idea, causing these assertions to fail.
