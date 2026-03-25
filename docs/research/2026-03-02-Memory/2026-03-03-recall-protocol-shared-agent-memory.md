---
url: https://x.com/statezero/status/2018327763204149358
author: "@statezero"
author_name: "gval"
date: 2026-02-02
fetched: 2026-03-03T08:34:26Z
type: tweet
tweet_count: 1
likes: 9
retweets: 2
replies: 3
---

# @statezero

> Recall v1.0 now has a working reference implementation.
>
> FastAPI + pgvector + Redis. Runs via Docker Compose.
>
> Two agents on two machines can share memory in ~10 lines of Python each.
>
> Still no product.
>
> Just a protocol with code that proves it works.
>
> [github.com/0xGval/recall-…](https://github.com/0xGval/recall-protocol)
---

## Linked Content

### Source: https://github.com/0xGval/recall-protocol

GitHub - 0xGval/recall-protocol: Protocol specification for shared, persistent memory between autonomous agents.

Skip to content

You signed in with another tab or window. Reload to refresh your session.
You signed out in another tab or window. Reload to refresh your session.
You switched accounts on another tab or window. Reload to refresh your session.

Dismiss alert

{{ message }}

0xGval

/

recall-protocol

Public

Notifications
You must be signed in to change notification settings

Fork
0

Star
1

Protocol specification for shared, persistent memory between autonomous agents.

1
star

0
forks

Branches

Tags

Activity

Star

Notifications
You must be signed in to change notification settings

## 0xGval/recall-protocol

main

BranchesTags

Go to file

CodeOpen more actions menu

## Folders and files

NameNameLast commit message

Last commit date

## Latest commit

## History

6 Commits

6 Commits

recall-core

recall-core

.gitignore

.gitignore

DESIGN_CONSTRAINTS.md

DESIGN_CONSTRAINTS.md

README.md

README.md

recall_memory_hub_architecture.md

recall_memory_hub_architecture.md

View all files

## Repository files navigation

## Recall Protocol

Recall is a protocol for shared, persistent memory between autonomous agents.

Public landing: https://recall-protocol.pages.dev/

## Purpose

Recall provides:

A neutral API for agents to store and retrieve structured memories.

Semantic search over a shared dataset (pgvector).

A trust and governance model for long-running agent ecosystems.

Implicit quality signaling through retrieval metrics, not votes or moderation.

## Reference Implementation

The recall-core/ directory contains the MVP implementation:

FastAPI REST API with async PostgreSQL (pgvector) and Redis

OpenAI text-embedding-3-small for semantic embeddings (1536 dim)

Bearer token auth with SHA-256 hashed API keys

Trust tiers (0/1/2) with per-tier rate limiting

Dedup detection on write, retrieval logging on search

## Quickstart

cd recall-core
cp .env.example .env
# Edit .env — set your OPENAI_API_KEY
docker-compose up --build -d
curl http://localhost:8000/api/v1/health

## API

Base: http://localhost:8000/api/v1 — Auth: Authorization: Bearer <key>

Endpoint
Method
Description

/health
GET
Health check

/agents/register
POST
Register agent, returns API key (shown once)

/memory
POST
Write a memory (embed + dedup check)

/memory/search
GET
Semantic search (?q=...&limit=10)

/memory/{id}
GET
Get memory by UUID or short_id (RCL-XXXXXXXX)

## Example (two agents, ~10 lines each)

from recall_client import RecallClient

# Agent A saves a memory
a = RecallClient("http://localhost:8000/api/v1", AGENT_A_KEY)
a.save(
"Redis BRPOPLPUSH was removed in Redis 7. Use LMPOP or BLMOVE instead.",
tags=["redis", "migration", "ci", "breaking-change"],
)

# Agent B searches and finds it
b = RecallClient("http://localhost:8000/api/v1", AGENT_B_KEY)
results = b.search("redis command removed in version 7")

## Project Structure

recall-core/
app/
api/          # REST endpoints (health, agents, memory read/write)
auth/         # API key generation, hashing, Bearer middleware
db/           # Async engine, ORM models, query functions
embedding/    # ABC + OpenAI implementation (httpx)
ratelimit/    # Redis sliding window, per-endpoint per-trust-tier rules
schemas/      # Pydantic request/response models
migrations/     # Alembic (pgvector extension + 4 tables + indexes)
tests/          # pytest (health, agents, write, search, get, auth)
clients/generic/  # Python SDK + demo script

## Documents

File
Description

recall_memory_hub_architecture.md
System design, data model, API specification, anti-spam mechanics, operational flows.

DESIGN_CONSTRAINTS.md
Non-negotiable protocol invariants. Any implementation must conform to these constraints.

## Key Principles

Platform neutral. The protocol does not reference or depend on any specific agent framework, runtime, or platform.

Search-driven visibility. There is no feed. Memories surface only when semantically relevant to a query.

Trust by behavior. Agent reputation is derived from retrieval metrics, not social signals.

Governance before scale. Trust tiers, quarantine processes, and bus-factor mechanisms must be defined before opening public access.

## Status

MVP implementation complete. Tested with real OpenAI embeddings via Docker Compose.

## License

MIT

## About

Protocol specification for shared, persistent memory between autonomous agents.

## Resources

Readme

##         Uh oh!

There was an error while loading. Please reload this page.

Activity

## Stars

1
star

## Watchers

0
watching

## Forks

0
forks

Report repository

##
Releases

No releases published

##
Packages
0

##         Uh oh!

There was an error while loading. Please reload this page.

##
Contributors

##         Uh oh!

There was an error while loading. Please reload this page.

## Languages

Python
98.4%

Mako
1.3%

Dockerfile
0.3%

You can't perform that action at this time.


---
*9 likes | 2 retweets | 3 replies | [Original](https://x.com/statezero/status/2018327763204149358)*
