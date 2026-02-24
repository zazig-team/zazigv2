STATUS: COMPLETE
CARD: 1.10
BRANCH: cpo/personality-subagent-prompt
FILES: supabase/migrations/042_personality_sub_agent_compiler.sql, supabase/functions/orchestrator/index.ts
TESTS: Lint 0 errors; shared+orchestrator build clean; executor tests 9/9 pass
NOTES: Sub-agent personality prompt compiled and sent end-to-end. Pre-existing test failures unrelated.

---

# CPO Report — Card 1.10: Compile and send subAgentPrompt in StartJob

## Summary
Wired the sub-agent personality prompt end-to-end: a new DB compiler function produces a stripped-down prompt (core beliefs, anti-patterns, root constraints only), the trigger auto-compiles it alongside the full personality prompt, and the orchestrator sends it as `subAgentPrompt` in StartJob messages. The local agent (PR #54, already merged) writes this to `subagent-personality.md` in the job workspace for Task-tool sub-agents to inherit.

## Files Changed

### supabase/migrations/042_personality_sub_agent_compiler.sql (new)
- Adds `compiled_sub_agent_prompt` column to `exec_personalities`
- Creates `compile_personality_prompt_sub_agent(uuid)` function — compiles only Standards (core beliefs), Patterns to Reject (anti-patterns), Constraints (root constraints)
- Updates `trigger_compile_personality()` to call both compilers
- Backfills existing personality rows

### supabase/functions/orchestrator/index.ts
- Fetches `compiled_sub_agent_prompt` alongside `compiled_prompt` in personality query
- Declares `subAgentPrompt` variable at same scope as `rolePrompt`, `roleSkills`, `personalityPrompt`
- Includes `subAgentPrompt` in StartJob message for non-persistent jobs (same gating as personalityPrompt)

## Tests
- `npm run lint` — 0 errors (22 pre-existing warnings)
- `npm run build` — shared + orchestrator pass; local-agent has pre-existing workspace linking issue
- `npm test` — executor tests pass (9/9 including subAgentPrompt workspace tests); pre-existing failures in shared (pipeline status arrays) and local-agent (git rebase tests) unrelated to this change
