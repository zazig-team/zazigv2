status: pass
summary: Broke "Retry Failed Uploads" into 2 jobs covering error state propagation and retry button UI
jobs_created: 2
dependency_depth: 2

## Jobs

1. b7ccaff1-db33-4f07-9ecd-1b99f58b1686 — Add upload error state to mobile onboarding photo upload service (medium, no deps)
2. a285b180-562c-414c-a9ec-d772dd653f3d — Add retry button and error message to upload failure state UI (simple, depends on job 1)

## Dependency Graph

```
[b7ccaff1] Add upload error state  →  [a285b180] Add retry button UI
```

## Notes

The feature targets the iOS v3 onboarding photo upload screen. No existing retry UI or structured error propagation was found in the codebase. Job 1 establishes reliable error state emission from the upload service; Job 2 consumes it to render the retry button + error message and re-triggers the upload on tap.
