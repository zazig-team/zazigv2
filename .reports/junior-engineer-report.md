status: fail
summary: Added desktop IPC plumbing for saving dropped attachments to ~/.zazigv2/attachments and returning the absolute saved path to the renderer, but could not complete commit due git object-store write restrictions.
files_changed:
  - packages/desktop/src/main/ipc-channels.ts
  - packages/desktop/src/main/preload.ts
  - packages/desktop/src/main/index.ts
failure_reason: Git operations are blocked in this environment (`unable to create temporary file` / `Operation not permitted` when writing to `.git/objects`), so `git add` and commit could not be completed.
