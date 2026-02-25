Refactored executor.ts to support multiple simultaneous persistent agents (CPO, CTO, etc.) via a role-keyed Map, replacing the single `persistentJobId` scalar.

## What was done

### packages/local-agent/src/executor.ts
- Added `ActivePersistentAgent` interface with fields: `role`, `tmuxSession`, `jobId`, `companyId`, `heartbeatTimer`, `startedAt`
- Replaced three scalar fields (`persistentJobId`, `persistentJobRole`, `persistentHeartbeatTimer`) with `private readonly persistentAgents = new Map<string, ActivePersistentAgent>()`
- Updated `QueuedMessage` interface to carry `sessionName` and `startedAt` so injections are decoupled from the map
- Updated `handlePersistentJob`: registers each agent in the map keyed by role; heartbeat timer stored on the agent entry
- Updated `handleMessageInbound`: routes by `msg.role` when present; falls back to the sole running agent for single-role backward compatibility; logs a warning and skips injection if no matching agent exists
- Updated `enqueueMessage` / `processMessageQueue` / `injectMessage`: session name and startedAt are passed through the queue rather than looked up from a scalar field
- Updated `clearPersistentAgent(role?: string)`: accepts an optional role to clear one agent, or clears all agents when called with no argument (used by `stopAll`)
- Updated `handleStopJob`, `onJobTimeout`, `onJobEnded`: find the persistent agent entry by jobId and remove only the matching role from the map

### packages/shared/src/messages.ts
- Added optional `role?: string` field to `MessageInbound` interface so the orchestrator can specify which persistent agent receives each message

## No issues
Both packages compile cleanly. The two pre-existing test failures in executor.test.ts (settings permissions and workspace-creation guard) are unrelated to this change and were present on master before this work.
