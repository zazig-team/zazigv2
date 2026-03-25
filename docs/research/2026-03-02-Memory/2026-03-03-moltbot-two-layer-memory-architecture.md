---
url: https://x.com/lucatac0/status/2016698608700063880
author: "@lucatac0"
author_name: "Luis Catacora"
date: 2026-01-29
fetched: 2026-03-03T08:39:29Z
type: tweet
tweet_count: 1
likes: 191
retweets: 10
replies: 18
---

# @lucatac0

> TIL there are actually two layers of memory in Moltbot:
>
> 1. Basic file-based memory (on by default):
>
> ~/clawd/USER.md — grows as you interact
> ~/clawd/memory/ directory — stores persistent context
>
> This is just markdown files the agent reads on each conversation
>
> 2. Vector search memory (off by default):
>
> Needs an embedding provider (OpenAI, Gemini, or local via node-llama-cpp)
> Uses SQLite with sqlite-vec for fast similarity search
>
> To enable vector memory search, you'd add something like:
>
> {
>  "agents": {
>  "defaults": {
>  "memorySearch": {
>  "provider": "gemini",
>  "model": "gemini-embedding-001"
>  }
>  }
>  }
> }

---
*191 likes | 10 retweets | 18 replies | [Original](https://x.com/lucatac0/status/2016698608700063880)*
