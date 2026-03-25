---
name: x-scan
description: "Use when the user asks to scan X/Twitter, search for tweets, monitor trending discussions, or gather social media intelligence from X. Also use when agents need recent X data for competitive analysis, sentiment monitoring, or market research. Triggers: 'scan X', 'search twitter', 'x-scan', 'what's trending on X', 'twitter search', 'X posts about', 'tweets about', 'what are people saying about'."
---

# X-Scan

Search X (Twitter) for recent posts via the v2 API. Returns posts from the last 7 days with engagement metrics. Retweets are excluded by default to reduce noise.

## When to Use

- Market research — what are people saying about a product, feature, or category
- Competitive monitoring — track competitor mentions, launches, announcements
- Trending discussions — surface active conversations around a topic
- Sentiment analysis — gauge reaction to a product, event, or decision
- User discovery — find voices in a space (`from:username` queries)

## When NOT to Use

- Historical analysis beyond 7 days (Basic tier only searches last 7 days)
- High-volume data export (15k posts/month cap)
- Real-time streaming or webhooks
- Questions answerable from training data or local files

## CLI Reference

```bash
x-scan "query"                        # Search X (last 7 days, no retweets)
x-scan "query" --since 1d             # Narrow to last 1 day
x-scan "query" --lang en              # English only
x-scan "query" --retweets             # Include retweets (excluded by default)
x-scan "query" --no-replies           # Exclude replies
x-scan "query" --min-likes 10         # Client-side engagement filter
x-scan "query" --min-retweets 5       # Client-side engagement filter
x-scan "query" --limit 50             # Max results (default 25, max 100)
x-scan "query" --sort likes           # Sort: likes|retweets|replies|date
x-scan "query" --compact              # One-line-per-post for agents
x-scan "query" --json                 # Raw JSON for pipeline consumption
x-scan "query" --save                 # Save to docs/research/signal/
x-scan "query" --no-cache             # Bypass 15-minute cache
x-scan --budget                       # Show monthly usage stats
```

## Quick Examples

```bash
# What are people saying about AI agents?
x-scan "AI agents" --lang en --limit 25

# Track a competitor (last 24h)
x-scan "from:anthropic" --since 1d --compact

# High-engagement SaaS discussions
x-scan "saas pricing" --min-likes 50 --sort retweets --no-replies

# Pipeline-ready JSON output
x-scan "cursor IDE" --json | jq '.tweets[].text'

# Save results for later analysis
x-scan "real-time collaboration tools" --save --lang en
```

## Research Loop (Agentic)

When doing deep research (not a quick one-off search), follow this loop to get comprehensive results from a limited 7-day window:

### Step 1: Decompose the Question into 3-5 Queries

Turn the research question into targeted searches using X search operators:

- **Core query**: Direct keywords for the topic
- **Expert voices**: `from:` specific known experts or companies
- **Pain points**: Keywords like `(broken OR bug OR issue OR migration)`
- **Positive signal**: Keywords like `(shipped OR love OR fast OR launched)`
- **Linked resources**: Use `has:links` to find posts sharing articles/repos

**X search operators available:**
- `from:username` — posts by a specific user
- `to:username` — replies to a specific user
- `OR` — match any term (must be uppercase)
- `-keyword` — exclude a term
- `"exact phrase"` — exact match
- `#hashtag` — hashtag search
- `has:links` — posts containing URLs
- `has:media` — posts with images/video
- `url:domain.com` — posts linking to a domain
- `lang:en` — language filter (BCP-47)
- `-is:retweet` — exclude retweets (auto-added)
- `-is:reply` — exclude replies

### Step 2: Run Searches and Assess Signal

Run each query. After each, evaluate:

- **Signal or noise?** If too noisy, add `-is:reply`, use `--min-likes`, narrow keywords.
- **Too few results?** Broaden with `OR`, remove restrictive operators, try `--since 7d`.
- **Key voices?** If someone interesting appears, follow up with `from:username`.
- **Linked resources?** High-engagement posts with links often point to blog posts, GitHub repos, or docs worth fetching with `web_fetch`.

### Step 3: Deep-Dive Linked Content

When posts link to valuable resources (GitHub repos, blog posts, docs):
- Use `web_fetch` to read the linked content
- Prioritize links that multiple tweets reference or come from high-engagement posts

### Step 4: Synthesize by Theme

Group findings by theme, not by query. Structure:

```markdown
### [Theme/Finding Title]

[1-2 sentence summary of what the discourse shows]

- @username: "[key quote]" (N likes) [Link](url)
- @username2: "[different perspective]" (N likes) [Link](url)

Resources shared:
- [Resource title](url) — what it is and why it's relevant
```

### Step 5: Save Results

Use `--save` to write to `docs/research/signal/` for the pipeline, or save your synthesis manually.

### Refinement Heuristics

| Problem | Fix |
|---------|-----|
| Too much noise | Add `--no-replies`, use `--sort likes`, narrow keywords |
| Too few results | Broaden with `OR`, try `--since 7d`, remove restrictive operators |
| Spam/crypto noise | Add `-airdrop -giveaway -whitelist -$` to query |
| Expert takes only | Use `from:` or `--min-likes 50` |
| Substance over hot takes | Add `has:links` to find posts sharing resources |

## Environment & API Keys

Auth is via `X_BEARER_TOKEN` env var. **Doppler-only** — no .env fallback.

```bash
# Check if key exists
echo $X_BEARER_TOKEN | head -c 5

# If missing, use Doppler to inject it:
doppler run --project zazig --config prd -- x-scan "query"

# Or export for the session:
export X_BEARER_TOKEN=$(doppler secrets get X_BEARER_TOKEN --project zazig --config prd --plain)
```

| Env Var | Doppler Location | Purpose |
|---------|-----------------|---------|
| `X_BEARER_TOKEN` | `zazig/prd` | API authentication (required) |
| `X_API_KEY` | `zazig/prd` | App key (for reference, not used by CLI) |
| `X_API_SECRET` | `zazig/prd` | App secret (for reference, not used by CLI) |

Agent sessions launched via `scripts/launch-*.sh` with Doppler have these injected automatically.

## Budget Awareness

X API Basic tier: **15,000 posts/month** ($200/mo).

- Always check `x-scan --budget` before large scans
- `--limit 5` still consumes 10 from budget (API minimum is 10 per request)
- Budget tracks API-fetched count (pre-filter), not post-filter count
- Budget resets automatically on month boundary
- Warning printed at 80% usage, hard stop at 100%
- **Cache saves budget**: identical queries within 15 minutes are served from cache (use `--no-cache` to bypass)

Budget file: `~/.local/share/zazig-{instance_id}/x-scan-usage.json`

## Constraints

- **7-day window only** — Basic tier cannot search older posts
- **512-char query limit** — complex queries may need simplification
- **No streaming** — point-in-time search only
- **Client-side engagement filtering** — `--min-likes`/`--min-retweets` filter after fetch (still uses budget)
- **Rate limits** — 450 requests/15min on Basic tier; tool retries on 429
- **Retweets excluded by default** — use `--retweets` to include them
