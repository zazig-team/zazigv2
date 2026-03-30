status: pass
summary: Broke TUI Phase 1b feature into 4 jobs covering tmux utility, polling hook, TopBar component, and App.tsx wiring
jobs_created: 4
dependency_depth: 4

## Jobs

1. `74963708-2e82-4519-8721-fb02179c6b45` — Implement src/lib/tmux.ts — session discovery utility (medium, no deps)
2. `12ef67e8-8f53-4a2c-b5b7-475f43c47f20` — Implement src/hooks/useTmuxSessions.ts — polling React hook (simple, depends on job 1)
3. `85d6b1b7-76ec-4af1-b09e-302a060f2eb2` — Implement src/components/TopBar.tsx — agent tab bar component (medium, depends on job 2)
4. `ae654c07-0385-4ff0-8095-d10bb4782ee4` — Wire useTmuxSessions and TopBar into App.tsx (simple, depends on job 3)

## Dependency Graph

```
tmux.ts utility
    └── useTmuxSessions hook
            └── TopBar component
                    └── App.tsx wiring
```

Linear chain, max depth 4. Each job is completable in a single agent session.
