# CPO Report — Phase 5: Workspace Assembly

## Summary
Added role-scoped workspace assembly to the zazigv2 executor so that ALL workers — persistent and ephemeral — get properly configured workspaces with role-scoped MCP tools, CLAUDE.md, and settings. Previously only persistent jobs got full workspace setup; ephemeral jobs ran bare `claude -p` with no MCP access.

## Agent Team Summary
- **Team composition**: 3 agents (workspace-module, executor-integration, test-writer), all general-purpose
- **Contract chain**: workspace-module → executor-integration → test-writer
  - workspace-module delivered: `WorkspaceConfig` interface, `generateMcpConfig()`, `generateAllowedTools()`, `setupJobWorkspace()` exports
  - executor-integration consumed those exports to refactor handlePersistentJob and add ephemeral workspace setup
  - test-writer consumed both to write 20 tests (9 workspace + 11 executor)
- **Files per teammate**:
  - workspace-module: `packages/local-agent/src/workspace.ts` (new)
  - executor-integration: `packages/local-agent/src/executor.ts` (modified)
  - test-writer: `packages/local-agent/src/workspace.test.ts` (new), `packages/local-agent/src/executor.test.ts` (modified)
- **Agent Teams value assessment**: Moderate value — the task had clear layer boundaries that made parallel work feasible. The workspace-module agent could work independently, and the test-writer could start on workspace.test.ts while executor-integration was still working. The sequential dependency for executor.test.ts additions meant full parallelism wasn't achievable.

## Changes

### packages/local-agent/src/workspace.ts (NEW)
- `WorkspaceConfig` interface — configuration for workspace setup
- `ROLE_ALLOWED_TOOLS` constant — maps 8 roles to their allowed MCP tool names
- `generateMcpConfig()` — returns `.mcp.json` structure for zazig-messaging MCP server
- `generateAllowedTools()` — returns `mcp__zazig-messaging__`-prefixed tool names for a role
- `setupJobWorkspace()` — creates complete workspace directory: `.mcp.json`, `CLAUDE.md`, `.claude/settings.json`, skill files

### packages/local-agent/src/executor.ts (MODIFIED)
- Added `import { setupJobWorkspace } from "./workspace.js"`
- Refactored `handlePersistentJob` to use `setupJobWorkspace()` instead of inline file writes (net -8 lines)
- Added ephemeral workspace setup in `handleStartJob` (step 3d): creates workspace at `~/.zazigv2/job-{jobId}/` when `msg.role` is present
- Modified `spawnTmuxSession()` to accept optional `cwd` parameter, passes `-c` to tmux
- Non-fatal: workspace creation failure for ephemeral jobs logs a warning and falls back to bare execution
- Backward compatible: jobs without `role` field continue to work exactly as before

### packages/local-agent/src/workspace.test.ts (NEW)
- 9 tests covering `generateAllowedTools`, `generateMcpConfig`, and `setupJobWorkspace`
- Tests skill injection, missing skill warning, empty skills array

### packages/local-agent/src/executor.test.ts (MODIFIED)
- Added "JobExecutor — ephemeral workspace setup" describe block (2 tests)
- Tests: ephemeral job WITH role gets workspace files, WITHOUT role does not

## Testing
- All 20 tests pass (9 workspace + 11 executor)
- TypeScript compiles clean (`tsc --noEmit` zero errors)
- Role scoping verified: breakdown-specialist gets only `query_features` and `batch_create_jobs`

## Decisions Made
- Workspace creation failure for ephemeral jobs is non-fatal (warning + fallback to bare execution)
- Skill files sourced from `projects/skills/` relative to `process.cwd()`
- Skill directory convention: `.claude/skills/{skillName}/SKILL.md` (matches Claude Code's expectations)
- `ROLE_ALLOWED_TOOLS` uses raw tool names; prefix added in `generateAllowedTools()` for cleaner mapping
