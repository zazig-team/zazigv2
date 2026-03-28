status: pass
summary: Extended `zazig start` preflight checks to validate required CLI tools and versions with resilient parsing, collect and report all required failures together, and preserve existing Claude/Codex behavior.
files_changed:
  - packages/cli/src/commands/start.ts
failure_reason:
