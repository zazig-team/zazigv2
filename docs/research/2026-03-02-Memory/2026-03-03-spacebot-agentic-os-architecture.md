---
url: https://x.com/jamiepine/status/2023631346434798060
author: "@jamiepine"
author_name: "Jamie Pine"
date: 2026-02-17
fetched: 2026-03-03T08:45:26Z
type: tweet
tweet_count: 1
likes: 1507
retweets: 125
replies: 127
---

# @jamiepine

> This is my take on the perfect AI assistant.
>
> A Rust-based agentic operating system designed to scale for large Slack and Discord communities. The channel is the ambassador to the human. Branches think. Workers execute. Nothing ever blocks.
>
> Meet Spacebot 🟣
>
> The biggest issue with OpenClaw is when it's doing work, it can't talk to you. Spacebot's architecture fixes this by design the conversation layer never touches tools. It delegates thinking to branches and heavy tasks to workers, so it's always responsive even with 100 people talking at once.
>
> Dump your memory files, notes, documents and chat histories into a folder — Spacebot turns them into structured memories automatically. Eight typed memory categories, graph associations, hybrid search. Not markdown files. Not vibes in a vector database.
>
> Built-in @OpenCode workers for deep coding sessions. Browser automation. Brave web search. Cron jobs. A skill system compatible with your existing OpenClaw skills. And a gorgeous control UI at [spacebot.sh](http://spacebot.sh).
>
> The cortex oversees the whole system — auditing memories, actioning goals and todos. You teach your Spacebot by talking to it. Structure and speed over config files and markdown.
>
> Self-hosting is a single Rust binary. Or one-click cloud deploy at [spacebot.sh](http://spacebot.sh).
>
> This is for teams, communities, and personal assistants. It will blow you away.
>
> ⭐️ [github.com/spacedriveapp/…](http://github.com/spacedriveapp/spacebot)
---

## Linked Content

### Source: http://spacebot.sh

Spacebot — The AI Operating System For Teams

##
Spacebot

Thinks, executes, and responds — concurrently, not sequentially.
Built for large teams and communities.

Deploy on spacebot.sh
Self-host

S

D

Overview

Channels

Memories

Workers

Cortex

Cron

Config

## dev-general

just now

24 active members

2:41poscarcan spacebot handle rate limiting across providers?

2:41pbotYep, with automatic fallback.

2:42pmayawhat happens when context fills up mid-conversation?

2:42pbotCompactor summarizes at 80%. Never blocks.

2:43poscardoes it support streaming responses?

2:43pbotYeah.

2:44plenahow do branches differ from workers?

2:44pbotBranches clone context. Workers start fresh.

2:45pmayacan I run multiple agents on a single instance?

## design-review

just now

8 active members

11:20ajamesthe new sidebar collapsed state looks solid, ship it

11:20abotMerging.

11:21aalexcan we add keyboard shortcuts for tab switching?

11:21abotSure, cmd+1-7.

11:22ajamesthe cortex chat panel needs a resize handle

11:22abotOn it.

11:23aalexwhat about mobile responsive for the channel cards?

11:23abotAlready handled.

11:24ajamesnice. make the platform badges slightly smaller

## support-tickets

just now

142 active members

4:15puser_291my bot stopped responding after I changed the model

4:15pbotWhich model?

4:16puser_291switched from claude to gpt-4o

4:16pbotOpenAI key isn't set. Run `spacebot secrets set openai_api_key`.

4:17puser_388how do I export my memory store?

4:17pbotCopy the SQLite db from your data directory.

4:18puser_291that fixed it, thanks!

4:18pbotNice.

4:19puser_512is there a way to clear all memories for an agent?

## infrastructure

just now

6 active members

9:05adevops-kimdeploy to staging failed, docker build timeout

9:05abotAdding cargo chef layer for dep caching.

9:06adevops-kimalso the health check endpoint returns 503 during startup

9:06abotExpected. Set initialDelaySeconds to 5.

9:07asarahcan we get metrics exported to prometheus?

9:07abotAlready there — /metrics endpoint.

9:08adevops-kimwhat port does the webhook listener use?

9:08abot3100.

9:09asarahperfect, I'll wire it into grafana

## product-ideas

just now

31 active members

6:30pjamiewhat if cron jobs could trigger based on memory changes?

6:30pbotI like it. Reactive cron.

6:31pnatcould we do agent-to-agent messaging?

6:31pbotWould need a routing layer on top of the shared memory store.

6:32pjamiethe cortex should be able to spawn its own workers

6:32pbotPhase 3.

6:33pnatwhat about voice channels?

6:33pbotDoable — same adapter interface, just add STT/TTS.

6:34pjamiewe should let extensions register custom tools

## daily-standup

just now

12 active members

10:00amarcostandup: finished the memory search refactor yesterday

10:00abotNice. Any regressions?

10:01alisaI'm working on the branch timeout logic today

10:01abotCheck MaxTurnsError — Rig returns chat history for partial results.

10:02amarcoalso found a bug where compaction drops the last summary

10:02abotOff-by-one in the tier 2 threshold.

10:03alisashould branches inherit the channel's max_turns?

10:03abotNo — branches default to 10, channels to 5.

10:04amarcomakes sense. shipping the fix now

## An opinionated architecture for agentic computing

## Workers work.

Workerw-3291

WorkerScraping Stripe API changelog

Workerdone

browserfile

Workers get a fresh prompt and the right tools. No conversation context — just focused execution.

Workerw-3292

WorkerUpdating webhook handler

Workerdone

shellfileexec

Workers report status back to the channel through the event bus. The channel sees live updates without polling.

Channel#dev-general

oscarcan you research what changed in the Stripe API and update our webhook handler?

botOn it — let me pull context and get a worker on this.

mayaalso, are we still on for the deploy at 3?

botYes — staging is green. I'll run the final checks before 3.

oscarcool. make sure we handle the new payment_intent.requires_action event

botAlready on it — the worker is scraping the latest changelog now.

branch result

Oscar prefers Stripe v2 webhook format. Last integration used checkout sessions 3 weeks ago. Team policy requires signature verification on all endpoints.

mayadid we ever set up the retry logic for failed webhooks?

botNot yet, I'll do that now.

w-3291 result

Stripe API v2024-12 changelog scraped. 3 new event types identified: payment_intent.requires_action, invoice.overdue, charge.dispute.funds_withdrawn.

w-3292 result

Webhook handler updated. Added signature verification, exponential backoff retry logic, and handlers for all 3 new event types.

botDone. Scraped the Stripe API v2024-12 changelog — 3 new event types found (payment_intent.requires_action, invoice.overdue, charge.dispute.funds_withdrawn). Webhook handler updated with signature verification, exponential backoff retry logic, and handlers for all 3 events.

Branchb-0847

BranchRecalling Stripe integration context

Branchdone

memory_recallchannel_recall

Searching 847 memories...

Found 3 relevant facts

Synthesizing conclusion...

Branches clone the full conversation context to think deeply. They recall memories and return only the conclusion.

## Branches think.

## Nothing blocks.

## Channel

The user-facing ambassador. One per conversation. Has soul, identity, personality. Talks to the user. Delegates everything else.

## Branch

A fork of the channel's context that goes off to think. Has the channel's full history. Returns only the conclusion.

## Worker

Does real work. Gets a task and the right tools. No personality, no conversation context — just focused execution.

## Compactor

A programmatic monitor that watches context size. Triggers tiered compaction asynchronously at 80%, 85%, and 95% thresholds.

-->

## Cortex

The agent's inner monologue. Generates a memory bulletin for every conversation. Supervises workers and branches. Maintains the memory graph. Detects cross-channel patterns. Interactive admin chat for direct system access.

-->

## Memory

Eight typed memory kinds in a graph database. Vector + full-text hybrid search. The cortex synthesizes a briefing — raw results never touch the conversation.

-->

## The perfect assistant

Out of the box, with everything you need to create a fleet of capable AI employees.

FactPrefDecisionIdentityEventGoal

## Memory Graph

Eight memory types (Fact, Preference, Decision, Identity, Event, Observation, Goal, Todo) with graph edges connecting them. Hybrid recall via vector + full-text search. The cortex generates a periodic briefing instead of dumping raw results into context.

Discord

Slack

Telegram

## Multi-Platform

Native adapters for Discord, Slack, and Telegram. Message coalescing batches rapid-fire bursts. Threading, reactions, file attachments, typing indicators, and per-channel permissions.

terminal

## Task Execution

Shell, file, exec, browser, and web search tools. Workers are pluggable — built-in workers handle most tasks, or spawn OpenCode for deep coding sessions with LSP awareness. Both support interactive follow-ups.

complex reasoning

claude-opus

scored heavy

## Smart Model Routing

Process-type defaults (channels get the best conversational model, workers get cheap and fast). Task-type overrides. Prompt complexity scoring routes simple requests to cheaper models automatically. Fallback chains handle rate limits.

inbox-check*/30 * * * *firing

daily-digest0 9 * * *idle

sync-repos*/15 * * * *idle

## Scheduling

Cron jobs with natural language scheduling. "Check my inbox every 30 minutes" becomes a job with a delivery target. Active hours support with midnight wrapping. Circuit breaker auto-disables after 3 consecutive failures.

C

community-bot

friendly, casual

Discord

D

dev-assistant

direct, technical

Slack

R

research-agent

thorough, autonomous

Background

## Multi-Agent

Run multiple agents on one instance. Each with its own workspace, databases, identity, and cortex. A friendly community bot on Discord, a no-nonsense dev assistant on Slack, a research agent for background tasks. One binary, one deploy.

##
It already knows.

The Cortex sees across every conversation, every memory, every running process.
It synthesizes what the agent knows into a pre-computed briefing that every conversation inherits — so nothing starts cold.

#general#dev#support#design#ops#random#alerts#feedback#research#staging#deploys#onboardIdentityRecentDecisionsImportantPreferencesGoalsEventsObservations

Memory Bulletinrefreshed 3m ago

James is the primary user. Prefers concise communication, dislikes over-engineering.

## Memory Bulletin

Every 60 minutes, the Cortex queries the memory graph across 8 dimensions and synthesizes a concise briefing.
Every conversation reads it on every turn — lock-free, zero-copy.

## Association Loop

Continuously scans memories for embedding similarity and builds graph edges between related knowledge.
Facts link to decisions. Events link to goals. The graph grows smarter on its own.

## Cortex Chat

A persistent admin line directly to the Cortex. Full tool access — memory, shell, browser, web search, workers.
One conversation per agent, accessible from anywhere.

##
Drop files. Get memories.

Dump text files into the ingest folder — notes, docs, logs, markdown, whatever.
Spacebot chunks them, runs each chunk through an LLM with memory tools, and produces
typed, graph-connected memories automatically.

No manual tagging. No reformatting. The LLM reads each chunk, classifies the content,
recalls related memories to avoid duplicates, and saves distilled knowledge with
importance scores and graph associations.

## Migrating from OpenClaw?

Drop your MEMORY.md
and daily logs into the ingest folder — Spacebot extracts structured memories and wires them into the graph.
Skills go in the skills folder and are compatible out of the box.

.md  .txt  .json  .yaml  .csv  .log  .toml  .xml  .html  .rst

Ingestion~/ingest/

MEMORY.md12.4 KB0/4 chunks

Extracted memories

## What they're saying

@richiemcilroy

Founder @Cap

Using spacebot.sh from @jamiepine

@devabdultech

get spacebot.sh for your team today!!!

@zach_sndr

I think you need to check this beautiful RUST orchestration for agents. (I have it on my VPS)

spacebot.sh

I've moved my openclaw into and actively trying to build our marketing layer here.

@tobi

CEO @Shopify

very nice indeed

@thotsonrecord

GRAPH CENTRIC AGENTS WILL PREVAIL... Ray Kurzweil's 2029 happens THIS year

@HeyZohaib

Product @neoncommerce

you’ve solved a big number of problems out of the box. rooting for you and spacebot!

@stripeyhorse

spacebot replies so much faster than openclaw - using the same providers and same api keys..

@azapsoul

Built for teams and communities is an insane selling point. Personal agents are cool but having an agent help your entire classroom, family group or friend group is sooo useful too. Idk why other agents don't focus on this!

@tylersookochoff

There IS a better way to do memory. And Spacebot is it. Early days, but it just makes sense.

@michaelgrant

So a friend and I started down our path of personal agentic AI, of course looking at openclaw. But fortunately, our research surfaced a much better option: Spacebot. Dramatically better in all respects, including architecture, security, functionality, etc.

@zach_sndr

Coupled with your novel memory architecture- spacebot is a powerhouse from the get go!

People be thinking I'm being paid to say all this, but I'm just a fan of spacebot 😬

@dingyi

卧槽我收回昨晚的话，这个由 spacedrive 团队创造的 spacebot 看起来也很牛逼，设计还是一如既往的好看。可以订阅，也可以 self-host 完全免费。

今年真正好的 OpenClaw 替代品会越来越多的。

spacebot.sh

@richiemcilroy

Founder @Cap

Using spacebot.sh from @jamiepine

@devabdultech

get spacebot.sh for your team today!!!

@zach_sndr

I think you need to check this beautiful RUST orchestration for agents. (I have it on my VPS)

spacebot.sh

I've moved my openclaw into and actively trying to build our marketing layer here.

@tobi

CEO @Shopify

very nice indeed

@thotsonrecord

GRAPH CENTRIC AGENTS WILL PREVAIL... Ray Kurzweil's 2029 happens THIS year

@HeyZohaib

Product @neoncommerce

you’ve solved a big number of problems out of the box. rooting for you and spacebot!

@stripeyhorse

spacebot replies so much faster than openclaw - using the same providers and same api keys..

@azapsoul

Built for teams and communities is an insane selling point. Personal agents are cool but having an agent help your entire classroom, family group or friend group is sooo useful too. Idk why other agents don't focus on this!

@tylersookochoff

There IS a better way to do memory. And Spacebot is it. Early days, but it just makes sense.

@michaelgrant

So a friend and I started down our path of personal agentic AI, of course looking at openclaw. But fortunately, our research surfaced a much better option: Spacebot. Dramatically better in all respects, including architecture, security, functionality, etc.

@zach_sndr

Coupled with your novel memory architecture- spacebot is a powerhouse from the get go!

People be thinking I'm being paid to say all this, but I'm just a fan of spacebot 😬

@dingyi

卧槽我收回昨晚的话，这个由 spacedrive 团队创造的 spacebot 看起来也很牛逼，设计还是一如既往的好看。可以订阅，也可以 self-host 完全免费。

今年真正好的 OpenClaw 替代品会越来越多的。

spacebot.sh

@richiemcilroy

Founder @Cap

Using spacebot.sh from @jamiepine

@tobi

CEO @Shopify

very nice indeed

@stripeyhorse

spacebot replies so much faster than openclaw - using the same providers and same api keys..

@michaelgrant

So a friend and I started down our path of personal agentic AI, of course looking at openclaw. But fortunately, our research surfaced a much better option: Spacebot. Dramatically better in all respects, including architecture, security, functionality, etc.

@richiemcilroy

Founder @Cap

Using spacebot.sh from @jamiepine

@tobi

CEO @Shopify

very nice indeed

@stripeyhorse

spacebot replies so much faster than openclaw - using the same providers and same api keys..

@michaelgrant

So a friend and I started down our path of personal agentic AI, of course looking at openclaw. But fortunately, our research surfaced a much better option: Spacebot. Dramatically better in all respects, including architecture, security, functionality, etc.

@devabdultech

get spacebot.sh for your team today!!!

@thotsonrecord

GRAPH CENTRIC AGENTS WILL PREVAIL... Ray Kurzweil's 2029 happens THIS year

@azapsoul

Built for teams and communities is an insane selling point. Personal agents are cool but having an agent help your entire classroom, family group or friend group is sooo useful too. Idk why other agents don't focus on this!

@zach_sndr

Coupled with your novel memory architecture- spacebot is a powerhouse from the get go!

People be thinking I'm being paid to say all this, but I'm just a fan of spacebot 😬

@devabdultech

get spacebot.sh for your team today!!!

@thotsonrecord

GRAPH CENTRIC AGENTS WILL PREVAIL... Ray Kurzweil's 2029 happens THIS year

@azapsoul

Built for teams and communities is an insane selling point. Personal agents are cool but having an agent help your entire classroom, family group or friend group is sooo useful too. Idk why other agents don't focus on this!

@zach_sndr

Coupled with your novel memory architecture- spacebot is a powerhouse from the get go!

People be thinking I'm being paid to say all this, but I'm just a fan of spacebot 😬

@zach_sndr

I think you need to check this beautiful RUST orchestration for agents. (I have it on my VPS)

spacebot.sh

I've moved my openclaw into and actively trying to build our marketing layer here.

@HeyZohaib

Product @neoncommerce

you’ve solved a big number of problems out of the box. rooting for you and spacebot!

@tylersookochoff

There IS a better way to do memory. And Spacebot is it. Early days, but it just makes sense.

@dingyi

卧槽我收回昨晚的话，这个由 spacedrive 团队创造的 spacebot 看起来也很牛逼，设计还是一如既往的好看。可以订阅，也可以 self-host 完全免费。

今年真正好的 OpenClaw 替代品会越来越多的。

spacebot.sh

@zach_sndr

I think you need to check this beautiful RUST orchestration for agents. (I have it on my VPS)

spacebot.sh

I've moved my openclaw into and actively trying to build our marketing layer here.

@HeyZohaib

Product @neoncommerce

you’ve solved a big number of problems out of the box. rooting for you and spacebot!

@tylersookochoff

There IS a better way to do memory. And Spacebot is it. Early days, but it just makes sense.

@dingyi

卧槽我收回昨晚的话，这个由 spacedrive 团队创造的 spacebot 看起来也很牛逼，设计还是一如既往的好看。可以订阅，也可以 self-host 完全免费。

今年真正好的 OpenClaw 替代品会越来越多的。

spacebot.sh

## Built in Rust, for the long run.

Spacebot isn't a chatbot — it's an orchestration layer for autonomous AI processes. That's infrastructure, and infrastructure should be machine code.

Multiple AI processes sharing mutable state, spawning tasks, and making decisions without human oversight. Rust's strict type system and compiler enforce correctness at build time. The result is a single binary with no runtime dependencies, no garbage collector pauses, and predictable resource usage. No Docker, no server processes, no microservices.

RS Rust

TK Tokio

SQ SQLite

LD LanceDB

RD redb

FE FastEmbed

SV Serenity

CO Chromiumoxide

## Every major provider, built in.

First-class support for 10 LLM providers with automatic routing, fallbacks, and rate limit handling.

Anthropic

OpenAI

OpenRouter

Groq

Mistral

DeepSeek

Fireworks

Together

xAI

Zhipu

Anthropic

OpenAI

OpenRouter

Groq

Mistral

DeepSeek

Fireworks

Together

xAI

Zhipu

## Hosted or self-hosted, your call.

Pick managed cloud for speed, or self-host with priority support and SLAs. Same core product, different deployment model.

Hosted Cloud

Self-Hosted

Monthly    Annual (25% off)

## Pod

For personal use

$29 /mo Billed at $264/year

✓
1 hosted instance

✓
2 shared vCPU, 1GB RAM per instance

✓
3 agents per instance

✓
10GB storage

✓
1 dashboard seat

✓
All messaging platforms

Get Started

Most Popular

## Outpost

For power users

$59 /mo Billed at $528/year

✓
2 hosted instances

✓
2 shared vCPU, 1.5GB RAM per instance

✓
6 agents per instance

✓
40GB storage

✓
2 dashboard seats

✓
Priority support

Get Started

## Nebula

For teams

$129 /mo Billed at $1,164/year

✓
5 hosted instances

✓
2 performance vCPU, 4GB RAM per instance

✓
12 agents per instance

✓
80GB storage

✓
5 dashboard seats

✓
Priority support

Get Started

## Titan

For enterprise

$499 /mo Billed at $4,488/year

✓
10 hosted instances

✓
4 performance vCPU, 8GB RAM per instance

✓
Unlimited agents per instance

✓
250GB storage

✓
10 dashboard seats

✓
Dedicated support, SLA, SSO

Get Started

## Community

Self-hosted open source

$0 /mo

✓
Unlimited self-hosted agents

✓
Community Discord support

✓
BYO infrastructure and keys

✓
Manual upgrades

View on GitHub

## Basic Support

For production self-host teams

$59 /mo Billed at $528/year

✓
Priority support response targets

✓
Shared support channel

✓
Bug fix prioritization

Start support plan

Popular for teams

## Priority Support

For teams that need fast responses

$299 /mo Billed at $2,688/year

✓
Dedicated support channel

✓
Fastest response times

✓
Bug fix prioritization

✓
Deployment architecture review

✓
Direct engineer access

Start support plan

## Enterprise Contract

For regulated or large-scale deployments

Custom

✓
SLA options and escalation path

✓
SSO/SAML and security reviews

✓
Dedicated support channel and onboarding

✓
Managed updates on your infrastructure

Contact sales

## Bring your own keys

Connect your own API keys from any LLM provider — Anthropic, OpenAI, OpenRouter, and more. Bundled LLM credits are coming soon.

## Dashboard seats

Seats are for the control plane — agent config, memory, conversations. End users on Discord, Slack, or Telegram don't need one. Extra seats $20/mo. Agent caps are per hosted instance, not account-wide.

## Enterprise migration path

Start in hosted cloud, then move to self-host with support contracts as your compliance and procurement requirements evolve.

## What you are paying for

Spacebot is open source. Support plans give your team access to shared or dedicated channels, response targets, and deployment guidance.

## Deployment support

We can work with your team on AWS, GCP, Fly, bare metal, or private networks. You keep control of runtime, data, and access boundaries.

## Security and procurement

Enterprise contracts can include SLAs, procurement workflows, and security reviews for internal approvals.

All plans include Discord, Slack & Telegram · hybrid memory search · coding & browser workers · cron jobs · daily backups

Self-hosted support starts at $59/mo for basic coverage or $299/mo for priority access. Enterprise contracts available for larger organizations. Runtime costs stay in your cloud account.

All plans currently require your own LLM API keys (BYOK). Bundled LLM credits will be included with every plan in a future update.

Pre-Launch

## You're early

We're waiting on Stripe approval to enable payments. Drop your email and we'll notify you the moment plans go live.

Notify me

You're on the list. We'll reach out when pricing goes live.

Something went wrong. Please try again.

No spam. One email when we launch.

## Self host with one command.

Single binary. No runtime dependencies. No microservices. Everything runs from one container.

terminal

$ docker run -d \

--name spacebot \

-v spacebot-data:/data \

-p 19898:19898 \

ghcr.io/spacedriveapp/spacebot:latest

Web UI at localhost:19898
— add an API key in Settings and you're live.

Build from source &rarr;
|
Docker Compose &rarr;
|
Quickstart guide &rarr;

### Source: http://spacebot.sh

Spacebot — The AI Operating System For Teams

##
Spacebot

Thinks, executes, and responds — concurrently, not sequentially.
Built for large teams and communities.

Deploy on spacebot.sh
Self-host

S

D

Overview

Channels

Memories

Workers

Cortex

Cron

Config

## dev-general

just now

24 active members

2:41poscarcan spacebot handle rate limiting across providers?

2:41pbotYep, with automatic fallback.

2:42pmayawhat happens when context fills up mid-conversation?

2:42pbotCompactor summarizes at 80%. Never blocks.

2:43poscardoes it support streaming responses?

2:43pbotYeah.

2:44plenahow do branches differ from workers?

2:44pbotBranches clone context. Workers start fresh.

2:45pmayacan I run multiple agents on a single instance?

## design-review

just now

8 active members

11:20ajamesthe new sidebar collapsed state looks solid, ship it

11:20abotMerging.

11:21aalexcan we add keyboard shortcuts for tab switching?

11:21abotSure, cmd+1-7.

11:22ajamesthe cortex chat panel needs a resize handle

11:22abotOn it.

11:23aalexwhat about mobile responsive for the channel cards?

11:23abotAlready handled.

11:24ajamesnice. make the platform badges slightly smaller

## support-tickets

just now

142 active members

4:15puser_291my bot stopped responding after I changed the model

4:15pbotWhich model?

4:16puser_291switched from claude to gpt-4o

4:16pbotOpenAI key isn't set. Run `spacebot secrets set openai_api_key`.

4:17puser_388how do I export my memory store?

4:17pbotCopy the SQLite db from your data directory.

4:18puser_291that fixed it, thanks!

4:18pbotNice.

4:19puser_512is there a way to clear all memories for an agent?

## infrastructure

just now

6 active members

9:05adevops-kimdeploy to staging failed, docker build timeout

9:05abotAdding cargo chef layer for dep caching.

9:06adevops-kimalso the health check endpoint returns 503 during startup

9:06abotExpected. Set initialDelaySeconds to 5.

9:07asarahcan we get metrics exported to prometheus?

9:07abotAlready there — /metrics endpoint.

9:08adevops-kimwhat port does the webhook listener use?

9:08abot3100.

9:09asarahperfect, I'll wire it into grafana

## product-ideas

just now

31 active members

6:30pjamiewhat if cron jobs could trigger based on memory changes?

6:30pbotI like it. Reactive cron.

6:31pnatcould we do agent-to-agent messaging?

6:31pbotWould need a routing layer on top of the shared memory store.

6:32pjamiethe cortex should be able to spawn its own workers

6:32pbotPhase 3.

6:33pnatwhat about voice channels?

6:33pbotDoable — same adapter interface, just add STT/TTS.

6:34pjamiewe should let extensions register custom tools

## daily-standup

just now

12 active members

10:00amarcostandup: finished the memory search refactor yesterday

10:00abotNice. Any regressions?

10:01alisaI'm working on the branch timeout logic today

10:01abotCheck MaxTurnsError — Rig returns chat history for partial results.

10:02amarcoalso found a bug where compaction drops the last summary

10:02abotOff-by-one in the tier 2 threshold.

10:03alisashould branches inherit the channel's max_turns?

10:03abotNo — branches default to 10, channels to 5.

10:04amarcomakes sense. shipping the fix now

## An opinionated architecture for agentic computing

## Workers work.

Workerw-3291

WorkerScraping Stripe API changelog

Workerdone

browserfile

Workers get a fresh prompt and the right tools. No conversation context — just focused execution.

Workerw-3292

WorkerUpdating webhook handler

Workerdone

shellfileexec

Workers report status back to the channel through the event bus. The channel sees live updates without polling.

Channel#dev-general

oscarcan you research what changed in the Stripe API and update our webhook handler?

botOn it — let me pull context and get a worker on this.

mayaalso, are we still on for the deploy at 3?

botYes — staging is green. I'll run the final checks before 3.

oscarcool. make sure we handle the new payment_intent.requires_action event

botAlready on it — the worker is scraping the latest changelog now.

branch result

Oscar prefers Stripe v2 webhook format. Last integration used checkout sessions 3 weeks ago. Team policy requires signature verification on all endpoints.

mayadid we ever set up the retry logic for failed webhooks?

botNot yet, I'll do that now.

w-3291 result

Stripe API v2024-12 changelog scraped. 3 new event types identified: payment_intent.requires_action, invoice.overdue, charge.dispute.funds_withdrawn.

w-3292 result

Webhook handler updated. Added signature verification, exponential backoff retry logic, and handlers for all 3 new event types.

botDone. Scraped the Stripe API v2024-12 changelog — 3 new event types found (payment_intent.requires_action, invoice.overdue, charge.dispute.funds_withdrawn). Webhook handler updated with signature verification, exponential backoff retry logic, and handlers for all 3 events.

Branchb-0847

BranchRecalling Stripe integration context

Branchdone

memory_recallchannel_recall

Searching 847 memories...

Found 3 relevant facts

Synthesizing conclusion...

Branches clone the full conversation context to think deeply. They recall memories and return only the conclusion.

## Branches think.

## Nothing blocks.

## Channel

The user-facing ambassador. One per conversation. Has soul, identity, personality. Talks to the user. Delegates everything else.

## Branch

A fork of the channel's context that goes off to think. Has the channel's full history. Returns only the conclusion.

## Worker

Does real work. Gets a task and the right tools. No personality, no conversation context — just focused execution.

## Compactor

A programmatic monitor that watches context size. Triggers tiered compaction asynchronously at 80%, 85%, and 95% thresholds.

-->

## Cortex

The agent's inner monologue. Generates a memory bulletin for every conversation. Supervises workers and branches. Maintains the memory graph. Detects cross-channel patterns. Interactive admin chat for direct system access.

-->

## Memory

Eight typed memory kinds in a graph database. Vector + full-text hybrid search. The cortex synthesizes a briefing — raw results never touch the conversation.

-->

## The perfect assistant

Out of the box, with everything you need to create a fleet of capable AI employees.

FactPrefDecisionIdentityEventGoal

## Memory Graph

Eight memory types (Fact, Preference, Decision, Identity, Event, Observation, Goal, Todo) with graph edges connecting them. Hybrid recall via vector + full-text search. The cortex generates a periodic briefing instead of dumping raw results into context.

Discord

Slack

Telegram

## Multi-Platform

Native adapters for Discord, Slack, and Telegram. Message coalescing batches rapid-fire bursts. Threading, reactions, file attachments, typing indicators, and per-channel permissions.

terminal

## Task Execution

Shell, file, exec, browser, and web search tools. Workers are pluggable — built-in workers handle most tasks, or spawn OpenCode for deep coding sessions with LSP awareness. Both support interactive follow-ups.

complex reasoning

claude-opus

scored heavy

## Smart Model Routing

Process-type defaults (channels get the best conversational model, workers get cheap and fast). Task-type overrides. Prompt complexity scoring routes simple requests to cheaper models automatically. Fallback chains handle rate limits.

inbox-check*/30 * * * *firing

daily-digest0 9 * * *idle

sync-repos*/15 * * * *idle

## Scheduling

Cron jobs with natural language scheduling. "Check my inbox every 30 minutes" becomes a job with a delivery target. Active hours support with midnight wrapping. Circuit breaker auto-disables after 3 consecutive failures.

C

community-bot

friendly, casual

Discord

D

dev-assistant

direct, technical

Slack

R

research-agent

thorough, autonomous

Background

## Multi-Agent

Run multiple agents on one instance. Each with its own workspace, databases, identity, and cortex. A friendly community bot on Discord, a no-nonsense dev assistant on Slack, a research agent for background tasks. One binary, one deploy.

##
It already knows.

The Cortex sees across every conversation, every memory, every running process.
It synthesizes what the agent knows into a pre-computed briefing that every conversation inherits — so nothing starts cold.

#general#dev#support#design#ops#random#alerts#feedback#research#staging#deploys#onboardIdentityRecentDecisionsImportantPreferencesGoalsEventsObservations

Memory Bulletinrefreshed 3m ago

James is the primary user. Prefers concise communication, dislikes over-engineering.

## Memory Bulletin

Every 60 minutes, the Cortex queries the memory graph across 8 dimensions and synthesizes a concise briefing.
Every conversation reads it on every turn — lock-free, zero-copy.

## Association Loop

Continuously scans memories for embedding similarity and builds graph edges between related knowledge.
Facts link to decisions. Events link to goals. The graph grows smarter on its own.

## Cortex Chat

A persistent admin line directly to the Cortex. Full tool access — memory, shell, browser, web search, workers.
One conversation per agent, accessible from anywhere.

##
Drop files. Get memories.

Dump text files into the ingest folder — notes, docs, logs, markdown, whatever.
Spacebot chunks them, runs each chunk through an LLM with memory tools, and produces
typed, graph-connected memories automatically.

No manual tagging. No reformatting. The LLM reads each chunk, classifies the content,
recalls related memories to avoid duplicates, and saves distilled knowledge with
importance scores and graph associations.

## Migrating from OpenClaw?

Drop your MEMORY.md
and daily logs into the ingest folder — Spacebot extracts structured memories and wires them into the graph.
Skills go in the skills folder and are compatible out of the box.

.md  .txt  .json  .yaml  .csv  .log  .toml  .xml  .html  .rst

Ingestion~/ingest/

MEMORY.md12.4 KB0/4 chunks

Extracted memories

## What they're saying

@richiemcilroy

Founder @Cap

Using spacebot.sh from @jamiepine

@devabdultech

get spacebot.sh for your team today!!!

@zach_sndr

I think you need to check this beautiful RUST orchestration for agents. (I have it on my VPS)

spacebot.sh

I've moved my openclaw into and actively trying to build our marketing layer here.

@tobi

CEO @Shopify

very nice indeed

@thotsonrecord

GRAPH CENTRIC AGENTS WILL PREVAIL... Ray Kurzweil's 2029 happens THIS year

@HeyZohaib

Product @neoncommerce

you’ve solved a big number of problems out of the box. rooting for you and spacebot!

@stripeyhorse

spacebot replies so much faster than openclaw - using the same providers and same api keys..

@azapsoul

Built for teams and communities is an insane selling point. Personal agents are cool but having an agent help your entire classroom, family group or friend group is sooo useful too. Idk why other agents don't focus on this!

@tylersookochoff

There IS a better way to do memory. And Spacebot is it. Early days, but it just makes sense.

@michaelgrant

So a friend and I started down our path of personal agentic AI, of course looking at openclaw. But fortunately, our research surfaced a much better option: Spacebot. Dramatically better in all respects, including architecture, security, functionality, etc.

@zach_sndr

Coupled with your novel memory architecture- spacebot is a powerhouse from the get go!

People be thinking I'm being paid to say all this, but I'm just a fan of spacebot 😬

@dingyi

卧槽我收回昨晚的话，这个由 spacedrive 团队创造的 spacebot 看起来也很牛逼，设计还是一如既往的好看。可以订阅，也可以 self-host 完全免费。

今年真正好的 OpenClaw 替代品会越来越多的。

spacebot.sh

@richiemcilroy

Founder @Cap

Using spacebot.sh from @jamiepine

@devabdultech

get spacebot.sh for your team today!!!

@zach_sndr

I think you need to check this beautiful RUST orchestration for agents. (I have it on my VPS)

spacebot.sh

I've moved my openclaw into and actively trying to build our marketing layer here.

@tobi

CEO @Shopify

very nice indeed

@thotsonrecord

GRAPH CENTRIC AGENTS WILL PREVAIL... Ray Kurzweil's 2029 happens THIS year

@HeyZohaib

Product @neoncommerce

you’ve solved a big number of problems out of the box. rooting for you and spacebot!

@stripeyhorse

spacebot replies so much faster than openclaw - using the same providers and same api keys..

@azapsoul

Built for teams and communities is an insane selling point. Personal agents are cool but having an agent help your entire classroom, family group or friend group is sooo useful too. Idk why other agents don't focus on this!

@tylersookochoff

There IS a better way to do memory. And Spacebot is it. Early days, but it just makes sense.

@michaelgrant

So a friend and I started down our path of personal agentic AI, of course looking at openclaw. But fortunately, our research surfaced a much better option: Spacebot. Dramatically better in all respects, including architecture, security, functionality, etc.

@zach_sndr

Coupled with your novel memory architecture- spacebot is a powerhouse from the get go!

People be thinking I'm being paid to say all this, but I'm just a fan of spacebot 😬

@dingyi

卧槽我收回昨晚的话，这个由 spacedrive 团队创造的 spacebot 看起来也很牛逼，设计还是一如既往的好看。可以订阅，也可以 self-host 完全免费。

今年真正好的 OpenClaw 替代品会越来越多的。

spacebot.sh

@richiemcilroy

Founder @Cap

Using spacebot.sh from @jamiepine

@tobi

CEO @Shopify

very nice indeed

@stripeyhorse

spacebot replies so much faster than openclaw - using the same providers and same api keys..

@michaelgrant

So a friend and I started down our path of personal agentic AI, of course looking at openclaw. But fortunately, our research surfaced a much better option: Spacebot. Dramatically better in all respects, including architecture, security, functionality, etc.

@richiemcilroy

Founder @Cap

Using spacebot.sh from @jamiepine

@tobi

CEO @Shopify

very nice indeed

@stripeyhorse

spacebot replies so much faster than openclaw - using the same providers and same api keys..

@michaelgrant

So a friend and I started down our path of personal agentic AI, of course looking at openclaw. But fortunately, our research surfaced a much better option: Spacebot. Dramatically better in all respects, including architecture, security, functionality, etc.

@devabdultech

get spacebot.sh for your team today!!!

@thotsonrecord

GRAPH CENTRIC AGENTS WILL PREVAIL... Ray Kurzweil's 2029 happens THIS year

@azapsoul

Built for teams and communities is an insane selling point. Personal agents are cool but having an agent help your entire classroom, family group or friend group is sooo useful too. Idk why other agents don't focus on this!

@zach_sndr

Coupled with your novel memory architecture- spacebot is a powerhouse from the get go!

People be thinking I'm being paid to say all this, but I'm just a fan of spacebot 😬

@devabdultech

get spacebot.sh for your team today!!!

@thotsonrecord

GRAPH CENTRIC AGENTS WILL PREVAIL... Ray Kurzweil's 2029 happens THIS year

@azapsoul

Built for teams and communities is an insane selling point. Personal agents are cool but having an agent help your entire classroom, family group or friend group is sooo useful too. Idk why other agents don't focus on this!

@zach_sndr

Coupled with your novel memory architecture- spacebot is a powerhouse from the get go!

People be thinking I'm being paid to say all this, but I'm just a fan of spacebot 😬

@zach_sndr

I think you need to check this beautiful RUST orchestration for agents. (I have it on my VPS)

spacebot.sh

I've moved my openclaw into and actively trying to build our marketing layer here.

@HeyZohaib

Product @neoncommerce

you’ve solved a big number of problems out of the box. rooting for you and spacebot!

@tylersookochoff

There IS a better way to do memory. And Spacebot is it. Early days, but it just makes sense.

@dingyi

卧槽我收回昨晚的话，这个由 spacedrive 团队创造的 spacebot 看起来也很牛逼，设计还是一如既往的好看。可以订阅，也可以 self-host 完全免费。

今年真正好的 OpenClaw 替代品会越来越多的。

spacebot.sh

@zach_sndr

I think you need to check this beautiful RUST orchestration for agents. (I have it on my VPS)

spacebot.sh

I've moved my openclaw into and actively trying to build our marketing layer here.

@HeyZohaib

Product @neoncommerce

you’ve solved a big number of problems out of the box. rooting for you and spacebot!

@tylersookochoff

There IS a better way to do memory. And Spacebot is it. Early days, but it just makes sense.

@dingyi

卧槽我收回昨晚的话，这个由 spacedrive 团队创造的 spacebot 看起来也很牛逼，设计还是一如既往的好看。可以订阅，也可以 self-host 完全免费。

今年真正好的 OpenClaw 替代品会越来越多的。

spacebot.sh

## Built in Rust, for the long run.

Spacebot isn't a chatbot — it's an orchestration layer for autonomous AI processes. That's infrastructure, and infrastructure should be machine code.

Multiple AI processes sharing mutable state, spawning tasks, and making decisions without human oversight. Rust's strict type system and compiler enforce correctness at build time. The result is a single binary with no runtime dependencies, no garbage collector pauses, and predictable resource usage. No Docker, no server processes, no microservices.

RS Rust

TK Tokio

SQ SQLite

LD LanceDB

RD redb

FE FastEmbed

SV Serenity

CO Chromiumoxide

## Every major provider, built in.

First-class support for 10 LLM providers with automatic routing, fallbacks, and rate limit handling.

Anthropic

OpenAI

OpenRouter

Groq

Mistral

DeepSeek

Fireworks

Together

xAI

Zhipu

Anthropic

OpenAI

OpenRouter

Groq

Mistral

DeepSeek

Fireworks

Together

xAI

Zhipu

## Hosted or self-hosted, your call.

Pick managed cloud for speed, or self-host with priority support and SLAs. Same core product, different deployment model.

Hosted Cloud

Self-Hosted

Monthly    Annual (25% off)

## Pod

For personal use

$29 /mo Billed at $264/year

✓
1 hosted instance

✓
2 shared vCPU, 1GB RAM per instance

✓
3 agents per instance

✓
10GB storage

✓
1 dashboard seat

✓
All messaging platforms

Get Started

Most Popular

## Outpost

For power users

$59 /mo Billed at $528/year

✓
2 hosted instances

✓
2 shared vCPU, 1.5GB RAM per instance

✓
6 agents per instance

✓
40GB storage

✓
2 dashboard seats

✓
Priority support

Get Started

## Nebula

For teams

$129 /mo Billed at $1,164/year

✓
5 hosted instances

✓
2 performance vCPU, 4GB RAM per instance

✓
12 agents per instance

✓
80GB storage

✓
5 dashboard seats

✓
Priority support

Get Started

## Titan

For enterprise

$499 /mo Billed at $4,488/year

✓
10 hosted instances

✓
4 performance vCPU, 8GB RAM per instance

✓
Unlimited agents per instance

✓
250GB storage

✓
10 dashboard seats

✓
Dedicated support, SLA, SSO

Get Started

## Community

Self-hosted open source

$0 /mo

✓
Unlimited self-hosted agents

✓
Community Discord support

✓
BYO infrastructure and keys

✓
Manual upgrades

View on GitHub

## Basic Support

For production self-host teams

$59 /mo Billed at $528/year

✓
Priority support response targets

✓
Shared support channel

✓
Bug fix prioritization

Start support plan

Popular for teams

## Priority Support

For teams that need fast responses

$299 /mo Billed at $2,688/year

✓
Dedicated support channel

✓
Fastest response times

✓
Bug fix prioritization

✓
Deployment architecture review

✓
Direct engineer access

Start support plan

## Enterprise Contract

For regulated or large-scale deployments

Custom

✓
SLA options and escalation path

✓
SSO/SAML and security reviews

✓
Dedicated support channel and onboarding

✓
Managed updates on your infrastructure

Contact sales

## Bring your own keys

Connect your own API keys from any LLM provider — Anthropic, OpenAI, OpenRouter, and more. Bundled LLM credits are coming soon.

## Dashboard seats

Seats are for the control plane — agent config, memory, conversations. End users on Discord, Slack, or Telegram don't need one. Extra seats $20/mo. Agent caps are per hosted instance, not account-wide.

## Enterprise migration path

Start in hosted cloud, then move to self-host with support contracts as your compliance and procurement requirements evolve.

## What you are paying for

Spacebot is open source. Support plans give your team access to shared or dedicated channels, response targets, and deployment guidance.

## Deployment support

We can work with your team on AWS, GCP, Fly, bare metal, or private networks. You keep control of runtime, data, and access boundaries.

## Security and procurement

Enterprise contracts can include SLAs, procurement workflows, and security reviews for internal approvals.

All plans include Discord, Slack & Telegram · hybrid memory search · coding & browser workers · cron jobs · daily backups

Self-hosted support starts at $59/mo for basic coverage or $299/mo for priority access. Enterprise contracts available for larger organizations. Runtime costs stay in your cloud account.

All plans currently require your own LLM API keys (BYOK). Bundled LLM credits will be included with every plan in a future update.

Pre-Launch

## You're early

We're waiting on Stripe approval to enable payments. Drop your email and we'll notify you the moment plans go live.

Notify me

You're on the list. We'll reach out when pricing goes live.

Something went wrong. Please try again.

No spam. One email when we launch.

## Self host with one command.

Single binary. No runtime dependencies. No microservices. Everything runs from one container.

terminal

$ docker run -d \

--name spacebot \

-v spacebot-data:/data \

-p 19898:19898 \

ghcr.io/spacedriveapp/spacebot:latest

Web UI at localhost:19898
— add an API key in Settings and you're live.

Build from source &rarr;
|
Docker Compose &rarr;
|
Quickstart guide &rarr;

### Source: http://github.com/spacedriveapp/spacebot

GitHub - spacedriveapp/spacebot: An AI agent for teams, communities, and multi-user environments.

Skip to content

You signed in with another tab or window. Reload to refresh your session.
You signed out in another tab or window. Reload to refresh your session.
You switched accounts on another tab or window. Reload to refresh your session.

Dismiss alert

{{ message }}

spacedriveapp

/

spacebot

Public

Notifications
You must be signed in to change notification settings

Fork
215

Star
1.5k

An AI agent for teams, communities, and multi-user environments.

spacebot.sh

## License

View license

1.5k
stars

215
forks

Branches

Tags

Activity

Star

Notifications
You must be signed in to change notification settings

## spacedriveapp/spacebot

main

BranchesTags

Go to file

CodeOpen more actions menu

## Folders and files

NameNameLast commit message

Last commit date

## Latest commit

## History

860 Commits

860 Commits

.agents/skills

.agents/skills

.cargo

.cargo

.githooks

.githooks

.github

.github

docs

docs

examples

examples

interface

interface

migrations

migrations

nix

nix

prompts/en

prompts/en

scripts

scripts

src

src

tests

tests

.dockerignore

.dockerignore

.envrc

.envrc

.gitignore

.gitignore

AGENTS.md

AGENTS.md

Cargo.lock

Cargo.lock

Cargo.toml

Cargo.toml

Dockerfile

Dockerfile

LICENSE

LICENSE

METRICS.md

METRICS.md

README.md

README.md

RUST_STYLE_GUIDE.md

RUST_STYLE_GUIDE.md

TODO

TODO

build.rs

build.rs

docker-entrypoint.sh

docker-entrypoint.sh

flake.lock

flake.lock

flake.nix

flake.nix

fly.staging.toml

fly.staging.toml

fly.toml

fly.toml

justfile

justfile

View all files

## Repository files navigation

## Spacebot

An AI agent for teams, communities, and multi-user environments.

Thinks, executes, and responds — concurrently, not sequentially.

Never blocks. Never forgets.

spacebot.sh •
How It Works •
Architecture •
Quick Start •
Tech Stack •
Docs

One-click deploy with spacebot.sh — connect your Discord, Slack, Telegram, or Twitch, configure your agent, and go. No self-hosting required.

## The Problem

Most AI agent frameworks run everything in a single session. One LLM thread handles conversation, thinking, tool execution, memory retrieval, and context compaction — all in one loop. When it's doing work, it can't talk to you. When it's compacting, it goes dark. When it retrieves memories, raw results pollute the context with noise.

OpenClaw does have subagents, but handles them poorly and there's no enforcement to their use. The session is the bottleneck for everything.

Spacebot splits the monolith into specialized processes that only do one thing, and delegate everything else.

## Built for Teams and Communities

Most AI agents are built for one person in one conversation. Spacebot is built for many people working together — a Discord community with hundreds of active members, a Slack workspace with teams running parallel workstreams, a Telegram group coordinating across time zones.

This is why the architecture exists. A single-threaded agent breaks the moment two people talk at once. Spacebot's delegation model means it can think about User A's question, execute a task for User B, and respond to User C's small talk — all at the same time, without any of them waiting on each other.

For communities — drop Spacebot into a Discord server. It handles concurrent conversations across channels and threads, remembers context about every member, and does real work (code, research, file operations) without going dark. Fifty people can interact with it simultaneously.

For fast-moving channels — when messages are flying in, Spacebot doesn't try to respond to every single one. A message coalescing system detects rapid-fire bursts, batches them into a single turn, and lets the LLM read the room — it picks the most interesting thing to engage with, or stays quiet if there's nothing to add. Configurable debounce timing, automatic DM bypass, and the LLM always knows which messages arrived together.

For teams — connect it to Slack. Each channel gets a dedicated conversation with shared memory. Spacebot can run long coding sessions for one engineer while answering quick questions from another. Workers handle the heavy lifting in the background while the channel stays responsive.

For multi-agent setups — run multiple agents on one instance. A community bot with a friendly personality on Discord, a no-nonsense dev assistant on Slack, and a research agent handling background tasks. Each with its own identity, memory, and security permissions. One binary, one deploy.

## Deploy Your Way

Method
What You Get

spacebot.sh
One-click hosted deploy. Connect your platforms, configure your agent, done.

Self-hosted
Single Rust binary. No Docker, no server dependencies, no microservices. Clone, build, run.

Docker
Container image with everything included. Mount a volume for persistent data.

## Capabilities

## Task Execution

Workers come loaded with tools for real work:

Shell — run arbitrary commands with configurable timeouts

File — read, write, and list files with auto-created directories

Exec — run specific programs with arguments and environment variables

OpenCode — spawn a full coding agent as a persistent worker with codebase exploration, LSP awareness, and deep context management

Browser — headless Chrome automation with an accessibility-tree ref system. Navigate, click, type, screenshot, manage tabs — the LLM addresses elements by short refs (e0, e1) instead of fragile CSS selectors

Brave web search — search the web with freshness filters, localization, and configurable result count

## Messaging

Native adapters for Discord, Slack, Telegram, Twitch, and Webchat with full platform feature support:

Message coalescing — rapid-fire messages are batched into a single LLM turn with timing context, so the agent reads the room instead of spamming replies

File attachments — send and receive files, images, and documents

Rich messages — embeds/cards, interactive buttons, select menus, and polls (Discord). Block Kit messages and slash commands (Slack)

Threading — automatic thread creation for long conversations

Reactions — emoji reactions on messages

Typing indicators — visual feedback while the agent is thinking

Message history backfill — reads recent conversation context on first message

Per-channel permissions — guild, channel, and DM-level access control, hot-reloadable

Webchat — embeddable portal chat with SSE streaming, per-agent session isolation

## Memory

Not markdown files. Not unstructured blocks in a vector database. Spacebot's memory is a typed, graph-connected knowledge system — and this opinionated structure is why agents are productive out of the box.

Every memory has a type, an importance score, and graph edges connecting it to related memories. The agent doesn't just "remember things" — it knows the difference between a fact it learned, a decision that was made, a goal it's working toward, and a preference the user expressed. This structure is what lets the cortex synthesize a useful briefing instead of dumping raw search results into context.

Eight memory types — Fact, Preference, Decision, Identity, Event, Observation, Goal, Todo

Graph edges — RelatedTo, Updates, Contradicts, CausedBy, PartOf

Hybrid recall — vector similarity + full-text search merged via Reciprocal Rank Fusion

Memory import — dump files into the ingest/ folder and Spacebot extracts structured memories automatically. Supports text, markdown, and PDF files. Migrating from OpenClaw? Drop your markdown memory files in and walk away.

Cross-channel recall — branches can read transcripts from other conversations

Memory bulletin — the cortex generates a periodic briefing of the agent's knowledge, injected into every conversation

Warmup readiness contract — branch/worker/cron dispatch checks ready_for_work (warm state + embedding ready + fresh bulletin), records cold-dispatch metrics, and triggers background forced warmup without blocking channels

## Scheduling

Cron jobs created and managed from conversation or config:

Natural scheduling — "check my inbox every 30 minutes" becomes a cron job with a delivery target

Strict wall-clock schedules — use cron expressions for exact local-time execution (for example, 0 9 * * * for 9:00 every day)

Legacy interval compatibility — existing interval_secs jobs still run and remain configurable

Configurable timeouts — per-job timeout_secs to cap execution time (defaults to 120s)

Active hours — restrict jobs to specific time windows (supports midnight wrapping)

Circuit breaker — auto-disables after 3 consecutive failures

Full agent capabilities — each job gets a fresh channel with branching and workers

## Model Routing

Four-level routing system that picks the right model for every LLM call. Structural routing handles the common case — process types and task types are known at spawn time. Prompt-level routing handles the rest, scoring user messages to downgrade simple requests to cheaper models automatically.

Process-type defaults — channels get the best conversational model, workers get something fast and cheap, compactors get the cheapest tier

Task-type overrides — a coding worker upgrades to a stronger model, a summarization worker stays cheap

Prompt complexity scoring — lightweight keyword scorer classifies user messages into three tiers (light/standard/heavy) and routes to the cheapest model that can handle it. Scores the user message only — system prompts and context are excluded. <1ms, no external calls

Fallback chains — when a model returns 429 or 502, the next model in the chain takes over automatically

Rate limit tracking — 429'd models are deprioritized across all agents for a configurable cooldown

Per-agent routing profiles — eco, balanced, or premium presets that shift what models each tier maps to. A budget agent routes simple messages to free models while a premium agent stays on opus

[defaults.routing]
channel = "anthropic/claude-sonnet-4"
worker = "anthropic/claude-haiku-4.5"

[defaults.routing.task_overrides]
coding = "anthropic/claude-sonnet-4"

[defaults.routing.prompt_routing]
enabled = true
process_types = ["channel", "branch"]

[defaults.routing.fallbacks]
"anthropic/claude-sonnet-4" = ["anthropic/claude-haiku-4.5"]

Z.ai (GLM) example — use GLM models directly with a GLM Coding Plan subscription:

[llm]
zhipu_key = "env:ZHIPU_API_KEY"

[defaults.routing]
channel = "zhipu/glm-4.7"
worker = "zhipu/glm-4.7"

[defaults.routing.task_overrides]
coding = "zhipu/glm-4.7"

Ollama example — run against a local Ollama instance:

[llm]
ollama_base_url = "http://localhost:11434"

[defaults.routing]
channel = "ollama/gemma3"
worker = "ollama/gemma3"

[defaults.routing.task_overrides]
coding = "ollama/qwen3"

Custom provider example — add any OpenAI-compatible or Anthropic-compatible endpoint:

[llm.provider.my-provider]
api_type = "openai_completions"  # or "openai_chat_completions", "openai_responses", "anthropic"
base_url = "https://my-llm-host.example.com"
api_key = "env:MY_PROVIDER_KEY"

[defaults.routing]
channel = "my-provider/my-model"

Additional built-in providers include Kilo Gateway, OpenCode Go, NVIDIA, MiniMax, Moonshot AI (Kimi), and Z.AI Coding Plan — configure with kilo_key, opencode_go_key, nvidia_key, minimax_key, moonshot_key, or zai_coding_plan_key in [llm].

## Skills

Extensible skill system integrated with skills.sh:

skills.sh registry — install any skill from the public ecosystem with one command

CLI management — spacebot skill add owner/repo to install, list, remove, and inspect skills

Worker injection — skills are injected into worker system prompts for specialized tasks

Bundled resources — scripts, references, and assets packaged with skills

OpenClaw compatible — drop in existing OpenClaw skills, or any skill from skills.sh

Install skills from the registry:

spacebot skill add vercel-labs/agent-skills
spacebot skill add anthropics/skills/pdf
spacebot skill list

## MCP Integration

Connect workers to external MCP (Model Context Protocol) servers for arbitrary tool access -- databases, APIs, SaaS products, custom integrations -- without native Rust implementations:

Per-agent config — each agent declares its own MCP servers in config.toml

Both transports — stdio (subprocess) for local tools, streamable HTTP for remote servers

Automatic tool discovery — tools are discovered via the MCP protocol and registered on worker ToolServers with namespaced names ({server}_{tool})

Automatic retry — failed connections retry in the background with exponential backoff (5s initial, 60s cap, 12 attempts). A broken server never blocks agent startup

Hot-reloadable — add, remove, or change servers in config and they reconcile live

API management — full CRUD API under /api/mcp/ for managing server definitions and monitoring connection status programmatically

[[mcp_servers]]
name = "filesystem"
transport = "stdio"
command = "npx"
args = ["-y", "@modelcontextprotocol/server-filesystem", "/workspace"]

[[mcp_servers]]
name = "sentry"
transport = "http"
url = "https://mcp.sentry.io"
headers = { Authorization = "Bearer ${SENTRY_TOKEN}" }

## Security

Spacebot runs autonomous LLM processes that execute arbitrary shell commands and spawn subprocesses. Security isn't an add-on — it's a layered system designed so that no single failure exposes credentials or breaks containment.

## Credential Isolation

Secrets are split into two categories: system (LLM API keys, messaging tokens — never exposed to subprocesses) and tool (CLI credentials like GH_TOKEN — injected as env vars into workers). The category is auto-assigned based on the secret name, or set explicitly.

Environment sanitization — every subprocess starts with a clean environment (--clearenv on Linux, env_clear() everywhere else). Only safe baseline vars (PATH, HOME, LANG), tool-category secrets, and explicit passthrough_env entries are present. System secrets never enter any subprocess

Secret store — credentials live in a dedicated redb database, not in config.toml. Config references secrets by alias (anthropic_key = "secret:ANTHROPIC_API_KEY"), so the config file is safe to display, screenshot, or cat

Encryption at rest — optional AES-256-GCM encryption with a master key derived via Argon2id. The master key lives in the OS credential store (macOS Keychain, Linux kernel keyring) — never on disk, never in an env var, never accessible to worker subprocesses

Keyring isolation — on Linux, workers are spawned with a fresh empty session keyring via pre_exec. Even without the sandbox, workers cannot access the parent's kernel keyring where the master key lives

Output scrubbing — all tool secret values are redacted from worker output before it reaches channels or LLM context. A rolling buffer handles secrets split across stream chunks. Channels see [REDACTED], never raw values

Worker secret management — workers can store credentials they obtain (API keys from account creation, OAuth tokens) via the secret_set tool. Stored secrets are immediately available to future workers

## Process Containment

Process sandbox — shell and exec tools run inside OS-level filesystem containment. On Linux, bubblewrap creates a mount namespace where the entire filesystem is read-only except the agent's workspace and configured writable paths. On macOS, sandbox-exec enforces equivalent restrictions via SBPL profiles. Kernel-enforced, not string-filtered

Dynamic sandbox mode — sandbox settings are hot-reloadable. Toggle via the dashboard or API without restarting the agent

Workspace isolation — file tools canonicalize all paths and reject anything outside the agent's workspace. Symlinks that escape are blocked

Leak detection — a hook scans every tool argument before execution and every tool result after execution for secret patterns (API keys, tokens, PEM private keys) across plaintext, URL-encoded, base64, and hex encodings. Leaked secrets in arguments skip the tool call; leaked secrets in output terminate the agent

Library injection blocking — the exec tool blocks dangerous environment variables (LD_PRELOAD, DYLD_INSERT_LIBRARIES, NODE_OPTIONS, etc.) that could hijack child process loading

SSRF protection — the browser tool blocks requests to cloud metadata endpoints, private IPs, loopback, and link-local addresses

Identity file protection — writes to SOUL.md, IDENTITY.md, and USER.md are blocked at the application level

Durable binary storage — tools/bin directory on PATH survives hosted rollouts. Workers are instructed to install binaries there instead of ephemeral package manager locations

[agents.sandbox]
mode = "enabled"                              # "enabled" (default) or "disabled"
writable_paths = ["/home/user/projects/myapp"] # additional writable dirs beyond workspace
passthrough_env = ["CUSTOM_VAR"]              # forward specific env vars to workers

## How It Works

Five process types. Each does one job.

## Channels

The user-facing LLM process — the ambassador to the human. One per conversation (Discord thread, Slack channel, Telegram DM, etc). Has soul, identity, and personality. Talks to the user. Delegates everything else.

A channel does not: execute tasks directly, search memories itself, or do any heavy tool work. It is always responsive — never blocked by work, never frozen by compaction.

When it needs to think, it branches. When it needs work done, it spawns a worker.

## Branches

A fork of the channel's context that goes off to think. Has the channel's full conversation history — same context, same memories, same understanding. Operates independently. The channel never sees the working, only the conclusion.

User A: "what do you know about X?"
→ Channel branches (branch-1)

User B: "hey, how's it going?"
→ Channel responds directly: "Going well! Working on something for A."

Branch-1 resolves: "Here's what I found about X: [curated memories]"
→ Channel sees the branch result on its next turn
→ Channel responds to User A with the findings

Multiple branches run concurrently. First done, first incorporated. Each branch forks from the channel's context at creation time, like a git branch.

## Workers

Independent processes that do jobs. Get a specific task, a focused system prompt, and task-appropriate tools. No channel context, no soul, no personality.

Fire-and-forget — do a job and return a result. Summarization, file operations, one-shot tasks.

Interactive — long-running, accept follow-up input from the channel. Coding sessions, multi-step tasks.

User: "refactor the auth module"
→ Branch spawns interactive coding worker
→ Branch returns: "Started a coding session for the auth refactor"

User: "actually, update the tests too"
→ Channel routes message to active worker
→ Worker receives follow-up, continues with its existing context

Workers are pluggable. Any process that accepts a task and reports status can be a worker.

Built-in workers come with shell, file, exec, and browser tools out of the box. They can write code, run commands, manage files, browse the web — enough to build a whole project from scratch.

OpenCode workers are a built-in integration that spawns a full OpenCode coding agent as a persistent subprocess. OpenCode brings its own codebase exploration, LSP awareness, and context management — purpose-built for deep coding sessions. When a user asks for a complex refactor or a new feature, the channel can spawn an OpenCode worker that maintains a rich understanding of the codebase across the entire session. Both built-in and OpenCode workers support interactive follow-ups.

## The Compactor

Not an LLM process. A programmatic monitor per channel that watches context size and triggers compaction before the channel fills up.

Threshold
Action

>80%
Background compaction (summarize oldest 30%)

>85%
Aggressive compaction (summarize oldest 50%)

>95%
Emergency truncation (hard drop, no LLM)

Compaction workers run alongside the channel without blocking it. Summaries stack chronologically at the top of the context window.

## The Cortex

The agent's inner monologue. The only process that sees across all channels, workers, and branches simultaneously. Generates a memory bulletin — a periodically refreshed, LLM-curated briefing of the agent's knowledge injected into every conversation. Supervises running processes (kills hanging workers, cleans up stale branches). Maintains the memory graph (decay, pruning, merging near-duplicates, cross-channel consolidation). Detects patterns across conversations and creates observations. Also provides a direct interactive admin chat with full tool access for system inspection and manual intervention.

## Architecture

User sends message
→ Channel receives it
→ Branches to think (has channel's context)
→ Branch recalls memories, decides what to do
→ Branch might spawn a worker for heavy tasks
→ Branch returns conclusion
→ Branch deleted
→ Channel responds to user

Channel context hits 80%
→ Compactor notices
→ Spins off a compaction worker
→ Worker summarizes old context + extracts memories
→ Compacted summary swaps in
→ Channel never interrupted

## What Each Process Gets

Process
Type
Tools
Context

Channel
LLM
Reply, branch, spawn workers, route
Conversation + compaction summaries

Branch
LLM
Memory recall, memory save, spawn workers
Fork of channel's context

Worker
Pluggable
Shell, file, exec, browser (configurable)
Fresh prompt + task description

Compactor
Programmatic
Monitor context, trigger workers
N/A

Cortex
LLM + Programmatic
Memory, consolidation, system monitor
Entire agent scope

## Memory System

Memories are structured objects, not files. Every memory is a row in SQLite with typed metadata and graph connections, paired with a vector embedding in LanceDB.

Eight types — Fact, Preference, Decision, Identity, Event, Observation, Goal, Todo

Graph edges — RelatedTo, Updates, Contradicts, CausedBy, PartOf

Hybrid search — Vector similarity + full-text search, merged via Reciprocal Rank Fusion

Three creation paths — Branch-initiated, compactor-initiated, cortex-initiated

Importance scoring — Access frequency, recency, graph centrality. Identity memories exempt from decay.

## Cron Jobs

Scheduled recurring tasks. Each cron job gets a fresh short-lived channel with full branching and worker capabilities.

Multiple cron jobs run independently on wall-clock schedules (or legacy intervals)

Stored in the database, created via config, conversation, or programmatically

Cron expressions execute against the resolved cron timezone for predictable local-time firing

Per-job timeout_secs to cap execution time

Circuit breaker auto-disables after 3 consecutive failures

Active hours support with midnight wrapping

## Multi-Agent

Each agent is an independent entity with its own workspace, databases, identity files, cortex, and messaging bindings. All agents share one binary, one tokio runtime, and one set of API keys.

## Spacedrive Integration (Future)

Spacebot is the AI counterpart to Spacedrive — an open source cross-platform file manager built on a virtual distributed filesystem. Both projects are independent and fully functional on their own, but complementary by design. Spacedrive indexes files across all your devices, clouds, and platforms with content-addressed identity, semantic search, and local AI analysis. Spacebot brings autonomous reasoning, memory, and task execution. Together, an agent that can think, remember, and act — backed by terabytes of queryable data across every device you own.

Read the full vision in the roadmap.

## Quick Start

## Prerequisites

Rust 1.85+ (rustup)

An LLM API key from any supported provider (Anthropic, OpenAI, OpenRouter, Kilo Gateway, Z.ai, Groq, Together, Fireworks, DeepSeek, xAI, Mistral, NVIDIA, MiniMax, Moonshot AI, OpenCode Zen, OpenCode Go) — or use spacebot auth login for Anthropic OAuth

## Build and Run

git clone https://github.com/spacedriveapp/spacebot
cd spacebot
cargo build --release

## Minimal Config

Create config.toml:

[llm]
openrouter_key = "env:OPENROUTER_API_KEY"

[defaults.routing]
channel = "anthropic/claude-sonnet-4"
worker = "anthropic/claude-sonnet-4"

[[agents]]
id = "my-agent"

[messaging.discord]
token = "env:DISCORD_BOT_TOKEN"

[[bindings]]
agent_id = "my-agent"
channel = "discord"
guild_id = "your-discord-guild-id"

# Optional: route a named adapter instance
[[bindings]]
agent_id = "my-agent"
channel = "discord"
adapter = "ops"

spacebot                      # start as background daemon
spacebot start --foreground   # or run in the foreground
spacebot stop                 # graceful shutdown
spacebot restart              # stop + start
spacebot status               # show pid and uptime
spacebot auth login           # authenticate via Anthropic OAuth

The binary creates all databases and directories automatically on first run. See the quickstart guide for more detail.

## Authentication

Spacebot supports Anthropic OAuth as an alternative to static API keys. Use your Claude Pro, Max, or API Console subscription directly:

spacebot auth login             # OAuth via Claude Pro/Max (opens browser)
spacebot auth login --console   # OAuth via API Console
spacebot auth status            # show credential status and expiry
spacebot auth refresh           # manually refresh the access token
spacebot auth logout            # remove stored credentials

OAuth tokens are stored in anthropic_oauth.json and auto-refresh transparently before each API call. When OAuth credentials are present, they take priority over a static ANTHROPIC_API_KEY.

## Tech Stack

Layer
Technology

Language
Rust (edition 2024)

Async runtime
Tokio

LLM framework
Rig v0.30 — agentic loop, tool execution, hooks

Relational data
SQLite (sqlx) — conversations, memory graph, cron jobs

Vector + FTS
LanceDB — embeddings (HNSW), full-text (Tantivy), hybrid search (RRF)

Key-value
redb — settings, encrypted secrets

Embeddings
FastEmbed — local embedding generation

Crypto
AES-256-GCM — secret encryption at rest

Discord
Serenity — gateway, cache, events, rich messages, interactions

Slack
slack-morphism — Socket Mode, events, Block Kit, slash commands, streaming via message edits

Telegram
teloxide — long-poll, media attachments, group/DM support

Twitch
twitch-irc — chat integration with trigger prefix

Browser
Chromiumoxide — headless Chrome via CDP

CLI
Clap — command line interface

No server dependencies. Single binary. All data lives in embedded databases in a local directory.

## Documentation

Doc
Description

Quick Start
Setup, config, first run

Config Reference
Full config.toml reference

Agents
Multi-agent setup and isolation

Memory
Memory system design

Tools
All available LLM tools

Compaction
Context window management

Cortex
Memory bulletin and system observation

Cron Jobs
Scheduled recurring tasks

Routing
Model routing and fallback chains

Secrets
Credential storage, encryption, and output scrubbing

Sandbox
Process containment and environment sanitization

Messaging
Adapter architecture (Discord, Slack, Telegram, Twitch, Webchat, webhook)

Discord Setup
Discord bot setup guide

Browser
Headless Chrome for workers

MCP
External tool servers via Model Context Protocol

OpenCode
OpenCode as a worker backend

Philosophy
Why Rust

## Why Rust

Spacebot isn't a chatbot — it's an orchestration layer for autonomous AI processes running concurrently, sharing memory, and delegating to each other. That's infrastructure, and infrastructure should be machine code.

Rust's strict type system and compiler mean there's one correct way to express something. When multiple AI processes share mutable state and spawn tasks without human oversight, "the compiler won't let you do that" is a feature. The result is a single binary with no runtime dependencies, no garbage collector pauses, and predictable resource usage.

Read the full argument in docs/philosophy.

## Contributing

Contributions welcome. Read RUST_STYLE_GUIDE.md before writing any code, and AGENTS.md for the full implementation guide.

Fork the repo

Create a feature branch

Install just (https://github.com/casey/just) if it is not already available (for example: brew install just or cargo install just --locked)

Run ./scripts/install-git-hooks.sh once (installs pre-commit formatting hook)

Make your changes

Run just preflight and just gate-pr

Submit a PR

Formatting is still enforced in CI, but the hook catches it earlier by running cargo fmt --all before each commit. just gate-pr mirrors the CI gate and includes migration safety, compile checks, and test verification.

## License

FSL-1.1-ALv2 — Functional Source License, converting to Apache 2.0 after two years. See LICENSE for details.

## About

An AI agent for teams, communities, and multi-user environments.

spacebot.sh

## Topics

agent

ai

## Resources

Readme

## License

View license

##         Uh oh!

There was an error while loading. Please reload this page.

Activity

Custom properties

## Stars

1.5k
stars

## Watchers

10
watching

## Forks

215
forks

Report repository

##
Releases
18

v0.2.2

Latest

Mar 1, 2026

+ 17 releases

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

Rust
76.8%

TypeScript
20.0%

Jinja
1.8%

Nix
0.5%

Shell
0.5%

SCSS
0.3%

Other
0.1%

You can’t perform that action at this time.


---
*1,507 likes | 125 retweets | 127 replies | [Original](https://x.com/jamiepine/status/2023631346434798060)*

