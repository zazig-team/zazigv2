status: pass
summary: Broke feature 83946e93 (desktop drag-and-drop image support) into 2 jobs
jobs_created: 2
dependency_depth: 2

## Jobs

### Job 1 — Add saveAttachment IPC channel (main process + preload)
- ID: 0dfa82af-698e-485f-926d-949bcfc24a98
- Complexity: simple
- depends_on: []
- Files: ipc-channels.ts, preload.ts, index.ts
- Covers: AT-1 (file saved to ~/.zazigv2/attachments/), AT-5 (readable path returned), directory auto-creation

### Job 2 — Add drag-and-drop UI to TerminalPane.tsx
- ID: 455d584c-bc54-4683-8909-55f628535c8c
- Complexity: medium
- depends_on: [0dfa82af-698e-485f-926d-949bcfc24a98]
- Files: TerminalPane.tsx
- Covers: AT-1, AT-2 (overlay on dragover/dragleave), AT-3 (multiple files, space-separated), AT-4 (non-image files), AT-6 (no errors with no active session)

## Dependency Graph

```
[Job 1: IPC backend] ──► [Job 2: TerminalPane UI]
```
