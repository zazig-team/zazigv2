status: pass

## Test Files Created

### 1. `tests/features/persistent-agent-memory-workspace-setup.test.ts`
- AC1: workspace.ts creates .memory/ directory and MEMORY.md for persistent agents
- AC6: existing memory files never overwritten (existsSync guard)
- AC8: memory setup is not role-gated to CPO only
- Failure Case 2: .memory/ recreated on next start if manually deleted
- Failure Case 3: existing workspace setup (CLAUDE.md, .mcp.json, settings.json) not regressed
- Unit: setupJobWorkspace() gated on heartbeatMd presence (persistent-agent-only)
- **11 test cases**

### 2. `tests/features/persistent-agent-memory-idle-sync.test.ts`
- AC3: executor.ts has 5-minute idle threshold, sync prompt text, tmux send-keys injection
- AC4: lastMemorySyncAt tracker prevents repeated nudges; reset on activity
- AC7: sync prompt covers decisions/preferences/corrections/context; "do nothing" case
- Failure Case 1: nudge gated on confirmed inactivity; does not fire while agent is active
- Unit: idle sync nudge fires once after 5min+ idle, not before, not if already synced
- **14 test cases**

### 3. `tests/features/persistent-agent-memory-boot-prompt.test.ts`
- AC5: DEFAULT_BOOT_PROMPT references .memory/MEMORY.md read instruction
- AC2+AC5: CLAUDE.md generated for persistent agents includes memory system instructions
- AC5: MEMORY.md as index file, frontmatter format, update-over-duplicate instruction
- AC8: boot instructions are not CPO-specific
- Failure Case 3: original boot prompt (state files/reports), .claude/memory/, DB boot_prompt all preserved
- Integration: boot prompt injected via injectMessage includes .memory/ reference
- **14 test cases**

## Total: 3 files, 39 test cases

## Notes
- All tests are written to FAIL against the current codebase (no `.memory/`, no `lastMemorySyncAt`, no sync prompt in executor.ts/workspace.ts)
- `package.json` test script not modified — vitest.config.ts already includes `features/**/*.test.ts`
- Tests use structural source-file inspection pattern consistent with existing feature tests in `tests/features/`
