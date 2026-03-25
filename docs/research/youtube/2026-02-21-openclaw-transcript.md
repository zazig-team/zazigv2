# OpenClaw: Inputs, Cues, and a Loop
*Retrieved: February 21, 2026*

---

OpenClaw isn't sentient. It doesn't think. It doesn't reason. It's just inputs, cues, and a loop. But you've seen the videos — agents calling their owners at 3:00 a.m., agents texting people's wives and having full conversations, agents that browse Twitter overnight and improve themselves. A hundred thousand GitHub stars in 3 days. Everyone's losing their minds. So why does it feel so alive? The answer is simpler than you think. And once you understand it, you can build your own.

---

## The Viral Phenomenon

This guy's OpenClaw agent got itself a Toio phone number overnight, connected to a voice API, and called him at 3:00 a.m. without being asked. This one set up his agent to text his wife "Good morning." 24 hours later, they were having full conversations — and he wasn't even involved.

OpenClaw hit a hundred thousand GitHub stars in 3 days. That's one of the fastest growing repositories in GitHub history. Wired covered it. Forbes covered it. In the reactions, people are genuinely asking if this thing's sentient. If we've crossed some kind of threshold. If this is the beginning of something we can't control.

Here's the thing — I get the excitement. When I first saw these demos, I had the same reaction. But when I started asking how it actually works, the answer isn't magic. It's elegant engineering.

---

## What OpenClaw Actually Is

First, let's get the basics out of the way. OpenClaw is an open source AI assistant created by Peter Steinberger, the founder of PSPDFKit. The technical description is simple: OpenClaw is an agent runtime with a gateway in front of it. That's it.

A gateway that routes inputs to agents. The agents do the work. The gateway manages the traffic.

The gateway is the key to understanding everything. It's a long-running process that sits on your machine, constantly accepting connections. It connects to your messaging apps — WhatsApp, Telegram, Discord, iMessage, Slack — and routes messages to AI agents that can actually do things on your computer.

But here's what most people miss: **the gateway doesn't think.** It doesn't reason. It doesn't decide anything interesting. All it does is accept inputs and route them to the right place.

OpenClaw treats many different things as input — not just your chat messages. Once you understand what counts as an input, the whole "alive feeling" starts to make more sense.

---

## The 5 Input Types

There are five types of input. When you combine them, you get a system that looks autonomous. But it's not. It's just reactive.

Everything OpenClaw does starts with an input: messages from humans, heartbeats from a timer, cron jobs on a schedule, hooks from internal state changes, and webhooks from external systems. There's also one bonus — agents can message other agents.

### 1. Messages

Messages are the obvious one. You send a text — whether it's WhatsApp, iMessage, or Slack. The gateway receives it and routes it to an agent, and then you get a response. This is what most people think of when they imagine AI assistants. You talk, it responds.

One nice detail: sessions are per channel. So if you message on WhatsApp and then also ping it on Slack, those are going to be separate sessions with separate contexts. But within one conversation, if you fire off three requests while the agent is still busy, they queue up and process in order. No jumbled responses. It just finishes one thought before moving on to the next.

### 2. Heartbeats

Here's where things get interesting. A heartbeat is just a timer. By default, it fires every 30 minutes. When it fires, the gateway schedules an agent turn just like it would a chat message. You configure what it does — you write the prompt.

Think about what this means. Every 30 minutes, the timer fires and sends the agent a prompt. That prompt might say: "Check my inbox for anything urgent. Review my calendar. Look for overdue tasks." The agent doesn't decide on its own to check these things. It's responding to instructions just like any other message.

It uses its tools — email access, calendar access, whatever you've connected — gathers the information, and reports back. If nothing needs attention, it responds with a special token: `heartbeat_ok`. The system suppresses it; you never see it. But if something is urgent, you get a ping.

You can configure the interval, the prompt it uses, and even the hours it's active. But the core idea is simple: **time itself becomes an input.**

This is the secret sauce. This is why OpenClaw feels so proactive. The agent keeps doing things even when you're not talking to it. But it's not really thinking. It's just responding to timer events that you've preconfigured.

### 3. Cron Jobs

Cron jobs give you more control than heartbeats. Instead of a regular interval, you can specify exactly when they fire and what instructions to send.

Some examples:
- At 9:00 a.m. every day, check my email and flag anything urgent.
- Every Monday at 3 p.m., review my calendar for the week and remind me of conflicts.
- At midnight, browse my Twitter feed and save some interesting posts.

Each cron is a scheduled event with its own prompt. When the time hits, the event fires, the prompt gets sent to the agent, and the agent executes.

Remember the guy whose agent started texting his wife? He set up a cron job. "Good morning" at 8 a.m. "Good night" at 10 p.m. Random check-ins during the day. The agent wasn't deciding to text her. A cron event fired. The agent processed it. The action happened to be "send a message." Simple as that.

### 4. Hooks

Hooks are for internal state changes — the system itself triggers these events. When a gateway fires up, it fires a hook. When an agent begins a task, there's another hook. When you issue a command like "stop," there's a hook. It's very much event-driven development.

This is how OpenClaw manages itself. It can save memory on reset, run setup instructions on startup, or modify context before an agent runs.

### 5. Webhooks

Webhooks have been around for a long time. They allow external systems to talk to one another. When an email hits your inbox, a webhook might fire — notifying OpenClaw about it. A Slack reaction comes in, another webhook fires. A Jira ticket gets created, another webhook.

OpenClaw can receive webhooks from basically anything. Slack, Discord, GitHub — they all have webhooks. So now your agent doesn't just respond to you; it responds to your entire digital life. Email comes in, agent processes it. Calendar event approaches, agent reminds you. Jira ticket assigned, agent can start researching.

### Bonus: Agent-to-Agent Messages

OpenClaw supports multi-agent setups. You can have separate agents with isolated workspaces, and you can enable them to pass messages between each other. Each agent can have different profiles — for example, a research agent and a writing agent. When agent A finishes its job, it can queue up work for agent B. It can look like collaboration, but again, it's just messages entering queues.

---

## Deconstructing the "3 a.m. Call"

Let's go back to the most dramatic example: the agent that called its owner at 3:00 a.m.

From the outside, this looks like autonomous behavior. The agent decided to get a phone number. It decided to call. It waited until 3:00 a.m.

But here's what actually happened under the hood. At some point, some event fired — maybe a cron, maybe a heartbeat. The event entered the queue. The agent processed it. Based on whatever instructions it had and the available tools, it acquired a Toyo phone number and made the call.

The owner didn't ask for this in the moment, but somewhere in the setup, the behavior was enabled. **Time produced an event. The event kicked off the agent. The agent followed its instructions.**

Nothing was thinking overnight. Nothing was deciding.

---

## The Formula Revealed

Put it all together and here's what you get:

- **Time** creates events through heartbeats and crons.
- **Humans** create events through messages.
- **External systems** create events through webhooks.
- **Internal state changes** create events through hooks.
- **Agents** create events for other agents.

All of them enter a queue. The queue gets processed. Agents execute. State persists.

And that last part — state — is key. OpenClaw stores its memory as local markdown files: your preferences, your conversation history, context from previous sessions. So when the agent wakes up on a heartbeat, it remembers what you talked about yesterday. It's not learning in real time. It's reading from files you could open in a text editor.

The loop just continues. From the outside, that looks like sentience — a system that acts on its own, that makes decisions, that seems alive. But really, it's inputs, cues, and a loop.

---

## Security Reality Check

OpenClaw can do all of this because it has deep access to your system. It can run shell commands, read and write files, execute scripts, and control your browser.

Cisco's security team analyzed the OpenClaw ecosystem and found that 26% of the 31,000 available skills contain at least one vulnerability. They called it — and this is a direct quote — "a security nightmare."

The risks are real:
- Prompt injection through emails or documents
- Malicious skills in the marketplace
- Credential exposure
- Command misinterpretation that deletes files you didn't mean to

OpenClaw's own documentation says there's no perfectly secure setup.

This is powerful precisely because it has access — and access cuts both ways. If you're going to run this, run it on a secondary machine using isolated accounts. Limit the skills you enable. Monitor the logs.

If you want to try it out without giving it full access to your machine, Railway has a one-click deployment that runs in an isolated container.

---

## The Takeaway

OpenClaw isn't magic. It's a well-designed system with four components:

1. **Time** that produces events
2. **Events** that trigger agents
3. **State** that persists across interactions
4. **A loop** that keeps processing

You can build this architecture yourself. You don't need OpenClaw specifically. You need a way to schedule events, queue them, and then process them with an LLM and maintain state.

This pattern is going to show up everywhere. Every AI agent framework that feels alive is doing some version of this — heartbeats, crons, webhooks, event loops. Understanding this architecture means you can evaluate these tools intelligently, build your own, and you won't get caught up in the hype when the next one goes viral.
