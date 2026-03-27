# Per-Type Automation Controls

- **Date:** 2026-03-27
- **Status:** Approved
- **Authors:** Tom Weaver, Claude

## Problem

Auto-triage and auto-spec are company-level booleans — all-or-nothing. Users need per-item-type control (idea, brief, bug, test) to enable automation selectively. The zazig-workers desktop app also needs headless control without loading the WebUI.

## Design

### DB Migration

New columns on `companies`:

```sql
auto_triage_types text[] NOT NULL DEFAULT '{}',
auto_spec_types   text[] NOT NULL DEFAULT '{}'
```

Backfill from existing booleans:
- `auto_triage = true` → `auto_triage_types = '{idea,brief,bug,test}'`
- `auto_triage = false` → `auto_triage_types = '{}'`
- Same for `auto_spec` → `auto_spec_types`

Old boolean columns left in place (no breaking change). All code switches to array columns.

### Orchestrator Changes

`autoTriageNewIdeas()`:
- Replace `WHERE auto_triage = true` with `WHERE array_length(auto_triage_types, 1) > 0`
- Add `AND item_type = ANY(company.auto_triage_types)` to idea fetch query

`autoSpecTriagedIdeas()`:
- Same pattern with `auto_spec_types`

### WebUI Settings Page

Replace each single toggle with four inline toggles:

```
Auto-triage
  [x] Ideas   [x] Briefs   [ ] Bugs   [ ] Tests

Auto-spec
  [x] Ideas   [ ] Briefs   [ ] Bugs   [ ] Tests
```

Existing sliders (batch size, max concurrent, delay) unchanged — shared across all types.

Save logic patches the array columns via Supabase REST.

### CLI Commands

```
zazig auto-triage --enable idea,bug --disable brief,test
zazig auto-triage --status
zazig auto-spec --enable bug --disable idea,brief,test
zazig auto-spec --status
```

- `--enable` adds types to the array
- `--disable` removes types from the array
- `--status` shows current state
- Both `--enable` and `--disable` can be combined in one call
- Works via Supabase REST API (PATCH on `companies` table)
- No new edge function needed

### Implementation Order

1. DB migration (new columns + backfill)
2. Orchestrator update (filter by array)
3. CLI commands (`auto-triage`, `auto-spec`)
4. WebUI Settings page (four toggles per section)
5. Bundle + ship
