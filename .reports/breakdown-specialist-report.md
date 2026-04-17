status: pass
summary: Broke "Add quiet hours settings to suppress push notifications" into 6 jobs covering DB migration, iOS service, SwiftUI UI, settings nav, notification guard, and extension integration
jobs_created: 6
dependency_depth: 4

## Job List

| # | Job ID | Title | Complexity | Depends On |
|---|--------|-------|------------|------------|
| 0 | d00d8636-5372-464b-814a-97b8e3fa8aca | Supabase migration: add quiet_hours column to user_preferences | simple | — |
| 1 | 7772a639-91af-4d24-a233-39b77120161b | iOS: implement QuietHoursService (load/save/isQuietNow) | medium | temp:0 |
| 2 | 8eee95e0-4903-4636-a0fd-79ea326f355e | iOS: implement QuietHoursSettingsView (SwiftUI settings UI) | complex | temp:1 |
| 3 | fccda12b-3a1c-4706-b250-925aa13212b5 | iOS: add QuietHoursSettingsView to Settings navigation stack | simple | temp:2 |
| 4 | 72454fef-6055-4448-8130-79fdc1e2a2b6 | iOS: add isQuietNow() guard to Realtime pipeline notification dispatch | medium | temp:1 |
| 5 | a5a5165b-8654-469f-b642-9ac997f1d63f | iOS: mirror quiet hours to App Group UserDefaults for Notification Service Extension | medium | temp:1 |

## Dependency Graph

```
[0] Supabase migration
      └─[1] QuietHoursService
              ├─[2] QuietHoursSettingsView
              │       └─[3] Settings navigation integration
              ├─[4] Realtime notification guard
              └─[5] Notification Service Extension App Group mirror
```

Max chain: 0 → 1 → 2 → 3 = depth 4

## Acceptance Test Coverage

- AT-1 (defaults off): Jobs 0, 2
- AT-2 (persist to Supabase): Jobs 1, 2
- AT-3 (suppress during window): Jobs 4, 5
- AT-4 (surface outside window): Job 4
- AT-5 (midnight-spanning): Jobs 1, 4
- AT-6 (immediate effect, no restart): Jobs 1, 3, 5
- AT-7 (disable clears entries): Jobs 2, 4
- AT-8 (all-day suppression): Job 1
- AT-9 (RLS isolation): Job 0
- AT-10 (multiple entries same day): Job 1
- AT-11 (Weeknights preset): Job 2
- AT-12 (Weekends preset): Job 2
