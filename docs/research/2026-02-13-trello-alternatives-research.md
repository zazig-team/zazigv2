# Trello Alternatives Research — 2026-02-13

## Problem Statement

The current Trello MCP server is causing severe context consumption issues in our agent workflow:

- **Context cost**: A single `get_cards_by_list_id` call with full fields returns ~3,702 tokens per list (measured)
- **Standup overhead**: Reading 10 boards × 6 columns = 222K tokens consumed just to generate a standup
- **Session crashes**: Bulk Trello operations in the CPO thread have caused session crashes due to context exhaustion
- **Wasted tokens**: We only use ~20% of Trello's functionality, but pay for 100% of the API response payload

**Measured overhead** (8 cards in "Done" list):
- Full Trello API response: 13,776 bytes → 3,702 tokens
- Minimal fields (`id,name,idList,labels,desc`): 3,660 bytes → 941 tokens
- **Waste**: 75% of tokens are unused fields

## Options Evaluated

### Option 1: Thin Trello CLI Wrapper

**How it works:**
Write a bash/Python CLI wrapper around the Trello REST API that accepts minimal parameters and returns only essential fields using the `fields` query parameter.

Example:
```bash
trello-lite cards list-id <listId> --fields id,name,idList,labels
```

The wrapper would:
1. Accept high-level commands (get-cards, move-card, add-comment)
2. Call Trello REST API with explicit `fields=` parameter
3. Return minimal JSON (just what was requested)
4. Use `jq` or Python json parsing to strip response down further if needed

**Estimated context savings:**
- Current MCP: ~3,702 tokens per list
- With fields param: ~941 tokens per list
- **Savings: 75%** (measured with actual API calls)
- Standup cost drops from 222K → 56K tokens

**Effort to build:**
- **Time**: 4-6 hours
- Bash script with curl + jq: 2-3 hours
- Python CLI with argparse + requests: 4-6 hours (more maintainable)
- Covers core operations: read cards/lists, move cards, add comments, labels

**Pros:**
- ✅ Keep existing Trello boards (zero migration)
- ✅ Tom's UI stays the same
- ✅ 75% token savings is significant
- ✅ Quick to build
- ✅ No new tools for Tom to learn
- ✅ Maintains Trello as source of truth

**Cons:**
- ⚠️ Still hitting Trello API (rate limits: 100 requests/10sec, 300/5min)
- ⚠️ Still ~941 tokens per list (better but not optimal)
- ⚠️ Doesn't solve fundamental issue (cloud API dependency)
- ⚠️ Need to maintain wrapper script

**Trello API Documentation:**
The Trello REST API supports a `fields` parameter accepting comma-separated field names for all resources. This allows requesting only specific data instead of full object payloads. See [Trello API Introduction](https://developer.atlassian.com/cloud/trello/guides/rest-api/api-introduction/).

---

### Option 2: GitHub Projects v2

**How it works:**
GitHub Projects v2 uses GraphQL API, allowing precise field selection. Each project board would be a GitHub Project linked to a repo.

Example query (selective fields):
```graphql
{
  organization(login: "trwpang") {
    projectV2(number: 1) {
      items(first: 20) {
        nodes {
          id
          fieldValueByName(name: "Status") {
            ... on ProjectV2ItemFieldSingleSelectValue {
              name
            }
          }
          content {
            ... on Issue {
              title
              number
            }
          }
        }
      }
    }
  }
}
```

CLI usage:
```bash
gh api graphql -f query='...'
```

**Estimated context savings:**
- GitHub GraphQL (selective): ~300 tokens per query (estimated based on field control)
- **Savings: 92%** vs current Trello MCP
- Standup cost: 222K → 18K tokens

**Migration effort:**
- **Time**: 16-24 hours total
- Script to export Trello boards to GitHub Projects: 8-12 hours
- Testing and validation: 4-6 hours
- Dashboard integration updates: 4-6 hours

**Pros:**
- ✅ 92% token savings (GraphQL precision)
- ✅ Already on GitHub ecosystem
- ✅ `gh` CLI is mature and well-documented
- ✅ Native integration with issues/PRs
- ✅ Free for private repos
- ✅ Version control alignment (code + project management in one place)

**Cons:**
- ⚠️ Tom loses Trello's visual board UI (GitHub Projects UI is less polished)
- ⚠️ Migration risk (10 boards, ~100s of cards)
- ⚠️ Learning curve for Tom (different UI/UX)
- ⚠️ GitHub Projects v2 API limitations: can't programmatically create Status field, limited timeline events
- ⚠️ Need to rewrite dashboard Trello queries

**Technical notes:**
- Status field is `ProjectV2SingleSelectField` in GraphQL
- Must query field IDs and option IDs first, then query items
- No REST API for Projects v2 (GraphQL only)
- See [GitHub Projects API docs](https://docs.github.com/en/issues/planning-and-tracking-with-projects/automating-your-project/using-the-api-to-manage-projects)

---

### Option 3: Linear

**How it works:**
Linear is a modern project management tool with a GraphQL API designed for minimal payloads. Each project would be a Linear team with custom workflows.

Example query:
```graphql
{
  issues(filter: { team: { key: { eq: "INK" } }, state: { name: { eq: "In Progress" } } }) {
    nodes {
      id
      title
      state { name }
      labels { nodes { name } }
    }
  }
}
```

**Estimated context savings:**
- Linear GraphQL (selective): ~250 tokens per query (estimated)
- **Savings: 93%** vs current Trello MCP
- Standup cost: 222K → 15K tokens

**Migration effort:**
- **Time**: 20-30 hours total
- Trello export + Linear import script: 10-15 hours
- Testing and validation: 6-8 hours
- Dashboard integration: 4-7 hours

**Pros:**
- ✅ 93% token savings (best-in-class GraphQL API)
- ✅ Built for developer workflows (keyboard shortcuts, CLI-friendly)
- ✅ Modern UI (better than Trello)
- ✅ Official TypeScript SDK (strongly typed)
- ✅ Excellent API documentation
- ✅ Fast performance (built for speed)

**Cons:**
- ⚠️ **Cost**: $8/user/month (Standard plan) = $8/mo for Tom
- ⚠️ Migration risk (10 boards, ~100s of cards)
- ⚠️ Tom needs to learn new tool
- ⚠️ Another SaaS dependency
- ⚠️ Overkill for our simple workflow (we don't need sprints, cycles, etc.)

**Technical notes:**
- Official SDK: `@linear/sdk` (TypeScript)
- Auth: Personal API tokens with Bearer header
- Complexity budget: 0.1 points per property, 1 point per object, connections multiply by pagination limit
- See [Linear API docs](https://linear.app/developers/graphql)

---

### Option 4: Local JSON/SQLite Board

**How it works:**
Replace cloud boards with local storage:
- **Option 4A**: JSON files per project in `~/.local/share/trw-projects/boards/{project}.json`
- **Option 4B**: SQLite database at `~/.local/share/trw-projects/boards.db`

CLI wrapper:
```bash
# Read cards from a column
board-cli cards ink "In Progress"

# Move card
board-cli move <card-id> "Review"

# Add comment
board-cli comment <card-id> "Fixed search bug"
```

**Estimated context savings:**
- Local JSON read: ~50 tokens per operation (just the data, no API envelope)
- **Savings: 99%** vs current Trello MCP
- Standup cost: 222K → 3K tokens

**Effort to build:**
- **JSON version**: 6-8 hours
  - CLI script with CRUD operations: 4-5 hours
  - Trello data migration: 2-3 hours
- **SQLite version**: 12-16 hours
  - Schema design: 2-3 hours
  - CLI with SQLite queries: 6-8 hours
  - Trello data migration: 4-5 hours

**Pros:**
- ✅ **99% token savings** (local reads are minimal)
- ✅ Instant operations (no API latency)
- ✅ No rate limits
- ✅ No SaaS dependency
- ✅ Version controllable (JSON files can be committed)
- ✅ Free forever

**Cons:**
- ❌ **Tom loses visual board UI** (major usability hit)
- ❌ No web interface for Tom to review boards
- ❌ Concurrency issues if multiple agents write simultaneously (need file locking or transactions)
- ❌ No audit trail (unless we build it)
- ❌ No mobile access
- ❌ Backup/sync becomes our responsibility

**Technical notes:**
- JSON: Simple `jq`-based CLI or Python with `json` module
- SQLite: Schema with `boards`, `columns`, `cards`, `labels`, `comments` tables
- File locking: Use `flock` (Linux/Mac) or Python `fcntl` for write safety
- Sync: One-way Trello → local (read Trello, cache locally, agents use cache)

---

### Option 5: Custom Thin MCP Server

**How it works:**
Build a custom MCP server that wraps the Trello REST API but returns minimal payloads. The MCP server acts as a translation layer:

1. Agent calls MCP tool: `get_cards_by_list_id(list_id="abc", fields=["id","name","labels"])`
2. MCP server calls Trello API with `fields=id,name,labels` parameter
3. MCP server returns minimal JSON to agent

Alternative: Custom MCP backed by SQLite (local storage, MCP interface).

**Estimated context savings:**
- Thin Trello wrapper MCP: ~941 tokens per list (same as Option 1)
- SQLite-backed MCP: ~50 tokens per operation (same as Option 4)
- **Savings: 75% (Trello) or 99% (SQLite)**

**Effort to build:**
- **Thin Trello MCP**: 8-12 hours
  - MCP server boilerplate (TypeScript/Python): 3-4 hours
  - Tool definitions (get_cards, move_card, etc.): 3-4 hours
  - Testing with Claude Desktop: 2-4 hours
- **SQLite-backed MCP**: 16-24 hours
  - MCP server + SQLite integration: 8-12 hours
  - Data migration: 4-6 hours
  - Testing: 4-6 hours

**Pros:**
- ✅ Native MCP integration (no CLI wrapper needed)
- ✅ Can control exact payload size
- ✅ Thin wrapper: keeps Trello UI for Tom
- ✅ SQLite version: 99% token savings
- ✅ Reusable across all agents

**Cons:**
- ⚠️ More complex than bash wrapper (need to maintain MCP server)
- ⚠️ Thin wrapper still depends on Trello API
- ⚠️ SQLite version loses Trello UI
- ⚠️ Need to learn MCP SDK (but [tutorials exist](https://modelcontextprotocol.io/docs/develop/build-server) for TypeScript/Python, 10-minute basic server setup)

**Technical notes:**
- MCP SDKs: `@modelcontextprotocol/sdk` (TypeScript), `mcp` (Python)
- Transport: STDIO (for Claude Desktop) or HTTP/SSE (for web clients)
- Basic server: ~100 lines of code (tools + handlers)
- See [Build an MCP server tutorial](https://modelcontextprotocol.io/docs/develop/build-server)

---

### Option 6: Hybrid (Local Cache + Trello Sync)

**How it works:**
Keep Trello as the "pretty UI" for Tom, but agents use a local SQLite cache for reads:

1. **Background sync**: Cron job (every 5 minutes) pulls Trello boards → SQLite cache
2. **Agent reads**: Agents query local SQLite (fast, minimal tokens)
3. **Agent writes**: Agents write directly to Trello via thin wrapper (or queue for batch sync)
4. **Conflict resolution**: Last-write-wins with timestamp tracking

Architecture:
```
Trello (source of truth for Tom)
   ↕ (sync every 5 min)
SQLite cache (source of truth for agents)
   ↕ (read/write)
Agents
```

**Estimated context savings:**
- Agent reads from SQLite: ~50 tokens per operation
- Agent writes to Trello: ~941 tokens per operation (via thin wrapper)
- **Savings: 99% for reads, 75% for writes**
- Standup cost: 222K → 3K tokens (all reads)

**Effort to build:**
- **Time**: 20-30 hours total
- SQLite schema + sync script: 8-12 hours
- Cron job + conflict resolution: 4-6 hours
- CLI for agents (read local, write Trello): 4-6 hours
- Testing: 4-6 hours

**Pros:**
- ✅ **Best of both worlds**: Tom keeps Trello UI, agents get minimal tokens
- ✅ 99% savings on reads (most operations)
- ✅ Eventual consistency (good enough for our workflow)
- ✅ No migration (Trello stays as-is)
- ✅ Backup built-in (SQLite cache is a snapshot)

**Cons:**
- ⚠️ Complexity: sync logic, conflict resolution, monitoring
- ⚠️ Stale reads (up to 5 min lag)
- ⚠️ Write conflicts if Tom and agents edit same card simultaneously (rare but possible)
- ⚠️ Need to maintain sync daemon
- ⚠️ Two sources of truth (Trello = canonical, SQLite = cache)

**Technical notes:**
- Sync: `trello-sync.py` runs via cron, diffs Trello → SQLite, updates changed cards
- Conflict detection: Store Trello `dateLastActivity` in SQLite, compare on sync
- Write-through: Agents write to Trello, sync job picks up changes on next cycle
- Monitoring: Log sync errors, alert if sync fails for >15 minutes

---

## Recommendation

**Top pick: Option 1 (Thin Trello CLI Wrapper) + Option 6 (Hybrid) as future evolution**

### Phase 1: Thin Wrapper (immediate, low-risk)
- **Build now**: 4-6 hours
- **Result**: 75% token savings (222K → 56K per standup)
- **Risk**: Minimal (keeps Trello as-is, just optimizes API calls)
- **Implementation**:
  ```bash
  # Python CLI wrapper
  trello-lite cards <list-id> --fields id,name,idList,labels,desc
  trello-lite move <card-id> <list-id>
  trello-lite comment <card-id> "message"
  ```

### Phase 2: Hybrid Cache (if Phase 1 insufficient)
- **Build later**: 20-30 hours (only if standup is still too heavy)
- **Result**: 99% token savings for reads (222K → 3K per standup)
- **Risk**: Medium (sync complexity, but Trello UI preserved)
- **Trigger**: If 56K tokens per standup is still causing issues

### Why NOT the others?

- **Option 2 (GitHub Projects)**: Tom loses Trello UI, 16-24h migration, significant UX change
- **Option 3 (Linear)**: $8/mo cost, 20-30h migration, overkill for simple workflow
- **Option 4 (Local JSON/SQLite)**: Tom loses visual board entirely (dealbreaker)
- **Option 5 (Custom MCP)**: More complex than bash wrapper, same savings as Option 1

### Decision criteria
1. **Preserve Tom's workflow**: Trello UI must stay (rules out Options 4, and makes 2/3 risky)
2. **Maximize token savings**: 75% is good, 99% is better (Options 1 → 6 progression)
3. **Minimize risk**: Start simple (Option 1), evolve if needed (Option 6)
4. **Minimize cost**: Free solutions preferred (rules out Option 3 Linear)

---

## Migration Path

### Phase 1: Thin Trello Wrapper (Week 1)

**Day 1-2: Build CLI wrapper** (4-6 hours)
```bash
# Create ~/bin/trello-lite
#!/usr/bin/env python3
import argparse
import requests
import json
import os

TRELLO_API_KEY = os.environ['TRELLO_API_KEY']
TRELLO_TOKEN = os.environ['TRELLO_TOKEN']
BASE_URL = 'https://api.trello.com/1'

def get_cards(list_id, fields):
    """Get cards from a list with minimal fields"""
    url = f"{BASE_URL}/lists/{list_id}/cards"
    params = {
        'key': TRELLO_API_KEY,
        'token': TRELLO_TOKEN,
        'fields': ','.join(fields)
    }
    resp = requests.get(url, params=params)
    return resp.json()

def move_card(card_id, list_id):
    """Move a card to a different list"""
    url = f"{BASE_URL}/cards/{card_id}"
    params = {
        'key': TRELLO_API_KEY,
        'token': TRELLO_TOKEN,
        'idList': list_id
    }
    resp = requests.put(url, params=params)
    return resp.json()

# ... (add comment, labels, etc.)
```

**Day 3: Update agent dispatch scripts**
- Replace Trello MCP calls with `trello-lite` CLI calls
- Update dashboard queries to use wrapper
- Test with 1-2 projects

**Day 4: Rollout**
- Update all agent task templates
- Update CPO standup script
- Monitor token usage (expect 75% reduction)

### Phase 2: Hybrid Cache (Optional, if needed)

**Week 2-3: Build sync system** (20-30 hours)

**Step 1**: SQLite schema
```sql
CREATE TABLE boards (id TEXT PRIMARY KEY, name TEXT, updated_at TIMESTAMP);
CREATE TABLE lists (id TEXT PRIMARY KEY, board_id TEXT, name TEXT, position INTEGER);
CREATE TABLE cards (
  id TEXT PRIMARY KEY,
  list_id TEXT,
  name TEXT,
  description TEXT,
  labels TEXT, -- JSON array
  trello_updated_at TIMESTAMP,
  synced_at TIMESTAMP
);
CREATE TABLE comments (id TEXT PRIMARY KEY, card_id TEXT, text TEXT, created_at TIMESTAMP);
```

**Step 2**: Sync script (`trello-sync.py`)
- Fetch all boards from Trello
- For each board: fetch lists, cards, comments
- Diff with SQLite (compare `trello_updated_at` vs `synced_at`)
- Update changed cards, insert new cards, mark deleted cards
- Run every 5 minutes via cron

**Step 3**: Update CLI to read from SQLite
```bash
trello-lite cards <list-id>  # reads from SQLite now
trello-lite move <card-id> <list-id>  # still writes to Trello
```

**Step 4**: Monitoring
- Add sync health check to dashboard
- Alert if sync fails for >15 minutes
- Log all conflicts (card changed in both Trello and cache)

---

## Token Cost Summary

| Solution | Standup Cost | Savings | Build Effort | Migration Risk |
|----------|-------------|---------|--------------|----------------|
| **Current (Trello MCP)** | 222K tokens | Baseline | - | - |
| **Option 1: Thin Wrapper** | 56K tokens | 75% | 4-6 hours | Low |
| **Option 2: GitHub Projects** | 18K tokens | 92% | 16-24 hours | Medium |
| **Option 3: Linear** | 15K tokens | 93% | 20-30 hours | Medium |
| **Option 4: Local SQLite** | 3K tokens | 99% | 12-16 hours | High (lose UI) |
| **Option 5: Custom MCP (thin)** | 56K tokens | 75% | 8-12 hours | Low |
| **Option 5: Custom MCP (SQLite)** | 3K tokens | 99% | 16-24 hours | High (lose UI) |
| **Option 6: Hybrid Cache** | 3K tokens | 99% | 20-30 hours | Medium |

---

## Sources

- [Trello REST API Introduction](https://developer.atlassian.com/cloud/trello/guides/rest-api/api-introduction/)
- [Trello API Rate Limits](https://developer.atlassian.com/cloud/trello/guides/rest-api/rate-limits/)
- [GitHub Projects API Documentation](https://docs.github.com/en/issues/planning-and-tracking-with-projects/automating-your-project/using-the-api-to-manage-projects)
- [Linear API Documentation](https://linear.app/developers/graphql)
- [Linear API Essentials](https://rollout.com/integration-guides/linear/api-essentials)
- [Plane.so API Documentation](https://developers.plane.so)
- [Shortcut REST API v3](https://developer.shortcut.com/api/rest/v3)
- [Model Context Protocol: Build an MCP Server](https://modelcontextprotocol.io/docs/develop/build-server)
- [Build MCP Server with TypeScript](https://hackteam.io/blog/build-your-first-mcp-server-with-typescript-in-under-10-minutes/)
- [Taskwarrior Documentation](https://taskwarrior.org/docs/)
