status: pass
summary: Merged feat/spec-writer-resilience-retry-stuck-devel-4ad84741 into master via squash — adds recoverMissingSpecDevelopingIdeas to orchestrator for retry-stuck-development resilience.
merge_method: squash
conflicts_resolved: yes

Conflicts resolved:
- supabase/functions/orchestrator/index.ts: merged master's auto-enrich and additional recoverStaleDevelopingIdeas steps into the orchestrator heartbeat sequence
- .Codex/napkin.md: combined feature branch and master napkin content (merge conflict on each of 2 master advances during merge)

Additional fixes applied:
- Restored packages/webui/src/global.css and packages/webui/src/pages/Ideas.tsx to master's state after auto-merge incorrectly reverted master's additions; these files were not part of the intended PR diff
- Two successive master advances (3e479db, 212957f) required two merge iterations before PR was marked mergeable
