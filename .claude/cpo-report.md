STATUS: COMPLETE
CARD: 699d19c4
BRANCH: cpo/pai-executor
FILES: packages/local-agent/src/executor.ts
TESTS: Typecheck clean (local-agent + shared)
NOTES: Renamed handleStartCpo → handlePersistentJob, role-agnostic dumb pipe.

---

# CPO Report — PAI Executor: rename handleStartCpo to handlePersistentJob

## Summary
Made `handleStartCpo` role-agnostic by renaming to `handlePersistentJob` and removing all CPO-specific hardcoding. The executor is now a dumb pipe: it writes `msg.context` as CLAUDE.md and uses `msg.role` for workspace/session naming.

## Changes (1 file, +47/-124 lines)

### packages/local-agent/src/executor.ts

1. **Deleted `CPO_MESSAGING_INSTRUCTIONS` constant** (~40 lines) — context is now provided by orchestrator via `msg.context`
2. **Deleted `CPO_WORKSPACE_DIR` constant** — workspace dir now derived from `msg.role`
3. **Renamed `handleStartCpo` → `handlePersistentJob`** with new signature `(jobId, msg, slotType)`:
   - Workspace: `~/.zazigv2/${msg.role ?? "agent"}-workspace` (was hardcoded `cpo-workspace`)
   - CLAUDE.md: writes `msg.context ?? ""` (was hardcoded `CPO_MESSAGING_INSTRUCTIONS`)
   - settings.json: auto-approves all 4 MCP tools (`send_message`, `create_feature`, `update_feature`, `query_projects`)
   - tmux session: `${machineId}-${role}` (was `${machineId}-cpo`)
4. **Updated routing** in `handleStartJob`: `cardType === "persistent_agent" || role === "cpo"`, passes full `msg`
5. **Removed `assembleContext` call** for persistent jobs — orchestrator now pre-assembles context
6. **Removed `spawnPersistentCpoSession` export** — spawn logic inlined into `handlePersistentJob`

## Token Usage
- Budget: claude-ok (wrote code directly)
- Approach: Full file read → systematic edits → typecheck → commit + push
