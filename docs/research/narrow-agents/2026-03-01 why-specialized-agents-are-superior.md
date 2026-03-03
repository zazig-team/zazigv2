# Why Specialized Agents are Superior
### How I Built an OpenClaw Superteam

*by Riley Brown*
https://www.youtube.com/watch?v=ISb0nrlNoKQ

---

## Introduction

Over the past two weeks, I've been building hundreds of different AI agent workflows, mostly using OpenClaw, but also Manis, Clawed Code, and Perplexity Computer, which just came out. My biggest realization through this process is that companies are going to have very narrow AI agents that operate as a team. My current plan is to build 15 high-quality AI agents that run our entire growth division here at vibco.dev.

In this piece, I want to explain why I believe that narrow agents are the future, and why I'll be using OpenClaw for this project.

---

## The Agents We Tested

The main four agents we tested were OpenClaw, Manis, Claude Code, and Perplexity Computer.

**Perplexity Computer** is actually really interesting — you can switch from search to computer mode, give it a single task, and it spins up a sandboxed computer running in the cloud. Whatever it creates opens up in a side panel. It's like ChatGPT with a computer.

**Manis** works the same way and has been around a lot longer. It was the first general agent tool released where every task you put in has access to a computer. You can literally view Manis's computer: it can create files, edit files, and do many different things. If you run five tasks, each one gets its own computer instance — a kind of command center for agents with computer access.

This is cool for certain things, but it's not what we want. I don't believe this will be the most useful form of AI agents.

---

## Why OpenClaw is Different

The most useful type of AI agent will be something like **OpenClaw** — an AI agent that runs on one dedicated computer. (Mac Minis are literally sold out right now because so many people are running OpenClaw on them.)

What OpenClaw did was put an AI agent on a computer and give it:

- **Good memory** — structured and persistent
- **Easily-added skills** — modular markdown-based skill files
- **A gateway** — so you can chat with it from Telegram, WhatsApp, Discord, Slack, and other tools you already use

This is why OpenClaw went viral. It gave an AI agent a computer and then made it accessible through the communication tools people already use every day.

---

## Too Many Skills: What Went Wrong with My First Agent

My first OpenClaw agent had a lot of skills. The most useful ones included:

- A **social media transcript analyzer** using the Supera Data API, which turns any YouTube, Twitter, Instagram, or TikTok link into a transcript
- Control of my **Notion** workspace
- Control of my entire **Google Workspace** (calendar, email, Google Docs, Google Sheets, etc.)
- Access to our **Linear** project tracker
- Control of **Figma** directly on my computer
- Media generation using **FAL**
- Video editing capabilities

What I realized over time is that as the number of skills increased, the dependability of the agent decreased. It stopped using skills at the right time, context got clouded, it didn't use the right integrations, and the agent's "personality" got jumbled.

The conclusion: **you can't add unlimited skills.** The sweet spot is **7 to 10 skills per agent**. Above that, performance drops significantly.

---

## What People Actually Want: Intent, Not a Command Center

The problem with Manis and Perplexity Computer is that they're purely reactive command centers — you have to go to them and ask them to do something. But people want something more like a great employee: someone who gets things done, does things that surprise you in a good way, and makes useful suggestions proactively.

To do those three things, AI agents need **intent** — a defined purpose. Emmet Shear (the interim CEO of OpenAI) tweeted: *"Prompts are so late 2025. We are giving models intents now."* I'd put it slightly differently: we are giving AI agents with computers intents.

When an agent is too general, with too many skills, it's hard to give it real purpose. That's why I want to create a team of narrow OpenClaw agents — each with very specific goals and skills.

---

## Testing Narrow Agents

After two weeks of running various agents in Telegram, it became clear that a focused agent with a specific personality, specific tasks, and a specific rhythm outperforms a generalist every time. When you confine an agent to a narrow focus, everything performs better, and you can target your skills and integrations exactly toward reaching a specific goal.

My favorite agent right now is a **content bot** specific to creating YouTube videos.

---

## A Narrow Agent in Practice: The YouTube Agent

My YouTube agent has one job: help create better YouTube videos. It has three defined goals stored in its files — **subs, views, and conversions**. Every time I ask it to write a script, it knows it's optimizing for those three outcomes.

Having narrow goals makes it easy to verify whether each skill belongs. If a skill doesn't serve the agent's goals, it shouldn't be added. This keeps everything clean and purposeful.

The YouTube agent uses three core skills:

**1. YouTube Research** — powered by two integrations: the SER API (for searching YouTube) and the Supera Data API (for scraping video transcripts).

**2. Thumbnail Generator** — every morning, the agent scrapes my competitors' thumbnails, generates ideas and variations with my face substituted in. This uses the Nano Banana API and requires a context file containing photos of me.

**3. Notion Control** — Notion is where I store all my YouTube scripts, so the agent needs to be able to read and write there.

The path is clear: YouTube agent → optimize for subs, views, conversions → specific skills → specific integrations. Hiring analogy: the best employees aren't the ones with vague, general skills. They're the ones who say, "Here's exactly what I'm good at, and here's exactly how I'll help you reach your goals."

---

## Why Build a Team of Narrow Agents?

### 1. Easy to Duplicate and Remix
When you find a useful narrow agent, it's simple to clone it. Turning a YouTube agent into a TikTok agent or a Substack agent is straightforward. With a massive 50-skill agent, it's much harder to extract just the relevant part.

### 2. Easy to Share with Your Team
I built a journal agent recently and shared the entire OpenClaw setup with my co-founder. He duplicated it in about five minutes. Narrow agents are understandable — and understandable things are shareable.

### 3. Better Context and Memory Architecture
My journal agent runs in Telegram, reaches out to me every 30 minutes (or less, if nothing needs doing), analyzes every meeting and video I make, writes daily journal entries in Notion, and logs everything useful about my business and content.

Every other agent I run has read access to that Notion journal. So the newsletter agent doesn't need to know what I did today — it just reads the journal and drafts accordingly. Each agent keeps its own goals clean while still benefiting from shared context.

### 4. Reviewable and Accountable
When you have narrow goals — say, open rate, subscription rate, and click-through rate for a newsletter agent — evaluation is pass/fail. You can look at the agent and say "you did well" or "you didn't." This makes it easy to cut agents that aren't working. Most agents you build won't be worthwhile. Narrow ones are much easier to evaluate and eliminate.

### 5. Easier Loops and Greater Autonomy
Many of my narrow agents run simple loops: three tasks, repeated every day, triggered at specific times via cron jobs. Because the scope is limited and the goals are clear, they can run autonomously and predictably. A massive generalist agent is much harder to put into a reliable loop.

---

## What's Next

My goal is to build a team of narrow, cloud-hosted OpenClaw agents — each with specific goals, operating together. A few open questions I'll be working through:

- **How do we efficiently run many agents in the cloud at scale?** Two years from now, if each person on the team has 20 agents, that's 200 AI agents to manage.
- **How do we share agents across team members?**
- **How do agents communicate with each other and share memory?** There are ways to pipe useful information between agents — similar to how an engineering team communicates with marketing — and I'll cover this in future content.

Narrow agents that run in the cloud, I believe, are going to win. That's what people will find the most use from, and it's what I'll be building and writing about over the next few months.
