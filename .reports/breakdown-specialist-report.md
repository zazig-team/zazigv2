status: pass
summary: Broke file-locking feature into 2 parallel jobs covering CLI credentials.ts and local-agent connection.ts
jobs_created: 2
dependency_depth: 1

## Jobs

| # | ID | Title | Complexity | Depends On |
|---|-----|-------|-----------|-----------|
| 1 | 9a143836-926d-47c6-8e45-5804e46a7527 | Add file locking to CLI credentials.ts | medium | — |
| 2 | 61a680fd-9d77-4261-b7c4-abefcbe6d8cd | Add file locking to local-agent connection.ts | medium | — |

## Dependency Graph

```
[Job 1: CLI credentials.ts]    [Job 2: local-agent connection.ts]
         (independent)                    (independent)
```

Both jobs are root-level — they touch separate packages and can be executed in parallel. At runtime they coordinate via the shared lock file (`~/.zazigv2/credentials.lock`), but no code dependency exists between them at implementation time.

## Notes

- Lock file path is `~/.zazigv2/credentials.lock` in both jobs — same constant so both processes contend on the same advisory lock.
- CLI lock timeout behaviour: log warning + throw (CLI must surface errors to user).
- Daemon lock timeout behaviour: log warning + skip write (daemon must not crash on timeout).
- Both jobs require rebuilding the release bundles (`releases/zazig.mjs` and `releases/zazig-agent.mjs`) via `node scripts/bundle.js` — not direct edits to the .mjs files.
