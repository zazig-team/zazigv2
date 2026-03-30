status: pass
summary: Broke TUI Phase 1d feature into 5 jobs covering AlertsFeed, LocalStatus, PipelineSummary, CriticalBanner, and Sidebar components
jobs_created: 5
dependency_depth: 2

## Jobs

1. acc251b0-0e96-4796-bcf1-b47ebe69a91c — Implement AlertsFeed component (simple, no deps)
2. bddde231-a016-4521-b691-4fc837e6f429 — Implement LocalStatus component (simple, no deps)
3. e6ad70d5-63db-48f4-9f4d-6bf42243aba3 — Implement PipelineSummary component (simple, no deps)
4. 99ee1818-85c5-424a-b3a6-005fde56751a — Implement CriticalBanner component (medium, no deps)
5. 824b4973-8c3f-4789-83d2-3804e8d0e19e — Implement Sidebar component and wire subcomponents (medium, depends on jobs 1-3)

## Dependency Graph

AlertsFeed ──┐
LocalStatus ──┼──► Sidebar
PipelineSummary ─┘

CriticalBanner (independent — renders between TopBar and MainArea, not inside Sidebar)

## Notes

- Jobs 1–4 are parallelisable with no dependencies
- Job 5 (Sidebar) depends on jobs 1, 2, 3 — max dependency depth is 2
- CriticalBanner is independent; it sits outside the Sidebar in the layout
