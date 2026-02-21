---
name: x-to-md
description: "Use when the user wants to save, capture, or archive a tweet or thread as markdown. Triggers: 'save this tweet', 'capture this thread', 'x-to-md', 'convert tweet to markdown', 'archive this post', 'grab this tweet', 'save this X post'."
---

# X-to-MD

Capture tweets and threads as clean markdown research documents with YAML frontmatter.

## When to Use

- User shares a tweet URL and wants it saved as a research document
- Archiving interesting threads for later reference
- Building a research library from X/Twitter content
- Capturing a tweet before it might be deleted

## When NOT to Use

- Searching for tweets (use `x-scan` instead)
- Bulk capture of many tweets (budget impact)
- Tweets older than 7 days (thread detection uses search/recent)

## Workflow

### Step 1: Choose Destination

Before fetching, ask the user where to save the result using AskUserQuestion:

- **Question:** "Where should I save this tweet?"
- **Options:**
  1. Current project (`docs/research/x-research/` in cwd)
  2. A different project (then ask which one)

Default to the current project if the user doesn't specify.

### Step 2: Fetch the tweet

```bash
# With Doppler (required for API auth):
doppler run --project zazig --config prd -- x-to-md "URL"

# If X_BEARER_TOKEN is already in env:
x-to-md "URL"

# Single tweet only (saves budget):
x-to-md "URL" --no-thread
```

The tool outputs clean markdown to **stdout** and status messages to **stderr**.

### Step 3: Review the Output

Read the markdown output. The tool:
- **Filters threads to self-replies only** — author's thread continuation, not replies to commenters
- **Fetches linked external content** — blog posts, articles, etc. are inlined as "Linked Content"
- **Strips X-internal URLs** — x.com/i/article/ and tweet links are removed from text

**If the tweet links to an X Article** (`x.com/i/article/...`): The tool cannot fetch X Articles (they're behind auth). Open the URL in a browser, copy the article text, and paste it into the markdown file manually. Or use WebFetch to try to grab the content.

### Step 4: Generate a Descriptive Title

Create a kebab-case title (3-6 words) that describes the **topic**, not the author or tweet ID.

Good titles:
- `ai-agent-memory-architecture`
- `startup-pricing-lessons`
- `react-server-components-tradeoffs`

Bad titles:
- `karpathy-tweet` (author name, not topic)
- `interesting-thread` (too vague)
- `1234567890` (tweet ID)

### Step 5: Save the File

Save to `{project-root}/docs/research/x-research/YYYY-MM-DD-{title}.md` using the destination from Step 1.

```bash
# Example:
~/Documents/GitHub/zazigv2/docs/research/x-research/2026-02-21-ai-agent-memory-architecture.md
```

Create the `docs/research/x-research/` directory if it doesn't exist.

## CLI Reference

```bash
x-to-md "https://x.com/user/status/123"             # Fetch + auto-detect thread
x-to-md "https://x.com/user/status/123" --no-thread  # Single tweet only
x-to-md --budget                                     # Show shared usage stats
```

## Output Format

The tool produces markdown with YAML frontmatter:

```yaml
---
url: https://x.com/username/status/1234567890
author: "@username"
author_name: "Display Name"
date: 2026-02-21
fetched: 2026-02-21T14:30:00Z
type: tweet | thread
tweet_count: 1 | N
likes: 1234
retweets: 567
replies: 89
---
```

## Budget Awareness

This tool shares the **15,000 posts/month** budget pool with `x-scan`.

| Action | Budget cost |
|--------|------------|
| Single tweet (`--no-thread`) | 1 post |
| Tweet + thread check (no thread found) | 11 posts |
| N-tweet thread | 1 + max(N, 10) posts |

Always check budget before large captures:
```bash
x-to-md --budget
```

## Environment & Auth

Auth is via `X_BEARER_TOKEN` env var. **Doppler-only** -- no .env fallback.

```bash
# Inject via Doppler:
doppler run --project zazig --config prd -- x-to-md "URL"

# Or export for the session:
export X_BEARER_TOKEN=$(doppler secrets get X_BEARER_TOKEN --project zazig --config prd --plain)
```

## Constraints

- Thread detection uses search/recent (7-day limit) -- older threads may be incomplete
- Threads only include self-replies (author continuing their own thread), not replies to commenters
- X-internal URLs (tweets, articles, moments) are stripped from text
- External URLs are fetched and inlined as "Linked Content" when possible
- X Articles (`x.com/i/article/`) cannot be fetched (behind auth) -- requires manual copy
- Budget is shared with x-scan -- coordinate usage
