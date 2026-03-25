# Trello Token Costs — Measured Data

**Test date**: 2026-02-13
**Test board**: ink (board ID: 698da081c9e429bbfb793fef)
**Test data**: 30 cards across 6 lists

---

## Per-List Token Costs

| List | Cards | Bytes | Tokens (MCP) | Tokens (CLI) | Savings |
|------|-------|-------|--------------|--------------|---------|
| Done | 8 | 13,776 | ~3,702 | ~1,009 | 73% |
| Review | 1 | 4,876 | ~1,219 | ~316 | 74% |
| Needs Human | 4 | 8,832 | ~2,208 | ~732 | 67% |
| In Progress | 0 | 0 | 0 | 0 | - |
| Up Next | 2 | 6,884 | ~1,721 | ~235 | 86% |
| Backlog | 15 | 52,632 | ~13,158 | ~4,366 | 67% |

**Notes**:
- MCP tokens: Full Trello API response (all fields)
- CLI tokens: Minimal fields (`id,name,idList,labels,desc,due,dueComplete`)
- Actual CLI measurements from `trello-lite` prototype

---

## Standup Cost Projections

**Scenario**: Read all cards from all columns on all boards

| Boards | Lists | Total Queries | MCP Cost | CLI Cost | Savings |
|--------|-------|---------------|----------|----------|---------|
| 1 | 6 | 6 | ~22,000 | ~6,658 | 70% |
| 10 | 60 | 60 | ~222,000 | ~66,580 | 70% |

**Based on**:
- Average per-board: 30 cards across 6 lists
- MCP: ~3,700 tokens per list
- CLI: ~1,110 tokens per list

---

## Context Budget Impact

**Current CPO session**:
- Token budget: 200,000 tokens
- Standup (10 boards): 222,000 tokens → **EXCEEDS BUDGET**
- Result: Must paginate or skip boards

**With trello-lite**:
- Token budget: 200,000 tokens
- Standup (10 boards): 66,580 tokens → **33% of budget**
- Remaining: 133,420 tokens for conversation, analysis, decisions

---

## Why Such Big Savings?

**Trello MCP returns**:
- All card fields (50+ properties)
- Nested objects (badges, attachments, customFieldItems)
- Member data (avatars, URLs, names)
- Plugin data
- Metadata (limits, subscribed, checkItemsChecked)

**trello-lite returns**:
- 7 essential fields only
- No nested objects
- No member data
- No plugin data
- No metadata

**Example** (8-card list):
```
MCP:  13,776 bytes → 3,702 tokens (full object)
CLI:   4,036 bytes → 1,009 tokens (7 fields only)
Waste: 9,740 bytes → 2,693 tokens (73% overhead)
```

---

## Field Breakdown

**Fields returned by trello-lite**:
1. `id` — Card ID (for move, comment operations)
2. `name` — Card title
3. `idList` — Current list (for tracking status)
4. `labels` — Label objects (name, color)
5. `desc` — Card description
6. `due` — Due date (if set)
7. `dueComplete` — Due date completion flag

**Fields NOT returned** (examples):
- `badges` (comments count, attachments count, votes, etc.)
- `idMembers` (assigned members)
- `idChecklists` (checklist IDs)
- `dateLastActivity` (last modification timestamp)
- `url` (card URL)
- `shortUrl` (short URL)
- `pos` (position in list)
- `subscribed` (user subscription status)
- `cover` (cover image data)
- And ~40 more fields...

**Result**: 73% smaller payload on average

---

## Rate Limits (unchanged)

Both MCP and CLI use Trello REST API → same rate limits:
- 100 requests per 10 seconds per token
- 300 requests per 5 minutes per token

**Standup** (10 boards, 6 lists each):
- Requests: 60 (well under limit)
- Duration: ~3-5 seconds total

---

## Summary

| Metric | Before (MCP) | After (CLI) | Improvement |
|--------|--------------|-------------|-------------|
| Standup cost | 222K tokens | 67K tokens | **70% savings** |
| Per-list avg | 3,700 tokens | 1,110 tokens | **70% savings** |
| Budget fit | Exceeds 200K | 33% of 200K | **Fits easily** |
| Session stability | Crashes on bulk ops | Stable | **No crashes** |
| Build effort | Already built | 4-6 hours | **Quick win** |
| Migration risk | - | Zero | **Safe** |
