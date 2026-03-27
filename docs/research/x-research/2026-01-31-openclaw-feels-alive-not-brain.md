---
url: https://x.com/clairevo/status/2017741569521271175
author: "@clairevo"
author_name: "claire vo 🖤"
date: 2026-01-31
fetched: 2026-02-22T08:59:41Z
type: tweet
tweet_count: 1
likes: 413
retweets: 44
replies: 28
---

# @clairevo

## Why OpenClaw feels alive even though it's not (this AI has a heartbeat but not a brain)

Everyone is losing their minds over @openclaw
You've seen the posts. You message it, it replies. Cool, I guess. Then you don't message it, and it...does more things?
It taught itself a skill?  It coded overnight? It bought you a car? It calls you on the phone??!

WTAF?
It is sentient?
Is it so over?
Despite what you hear on @moltbook, the AI apo-claw-ypse 🦞 isn't here. Well...not yet.
But then why does OpenClaw feel so damn alive?
It's time for me to tell you about its heartbeat.
What OpenClaw actually is
I feel like I need to explain a little bit about how OpenClaw actually works for you to understand how it's designed to feel alive. But before I do, you should def read this:

BUT tl;dr: OpenClaw is an agent runtime with a Gateway in front of it.
The Gateway is the thing that makes OpenClaw feel like it's always "on." It's why you need that MacBook mini that doesn't power off. It's that thing running in the terminal.
Your gateway doesn't think, it doesn't reason, and it doesn't decide anything all that interesting. What it does is sit there continuously, accepting inputs and deciding where they belong.
The Gateway takes each input, routes it to an agent, runs the agent, and sends the output wherever it's supposed to go. That is how every agent in OpenClaw gets kicked off: via input.
BUT, you have to understand OpenClaw treats many different things  as "input"--not just texts / chats / terminal messages. Once you get that, the "alive" feeling starts to make a lot more sense.
System of life: the different ways OpenClaw kicks off agents to do work
Everything OpenClaw does starts with an input. Chat messages are the most obvious one, but they're only a small part of the picture.
Below are the main ways inputs enter the system, and what each one actually does:
Messages: human-triggered input
Inbound messages from Slack, Discord, Telegram, and other channels are the most obvious kind of input. This is some of the "magic" of OpenClaw - you can just chat with it from whatever channel you want.
This is the simplest to understand input: you chat, it replies.

Some of the magic "feeling" of the chat input comes from the way your messages are handled.
Each message is routed to one agent and one session. If that session is already running, the message waits its turn in the session queue. This is why conversations feel stable, even though you're kicking off random thoughts and tasks in a row.
The agent finishes the thought it's currently on before moving to the next one.
You get updates when they're ready.
Things feel conversational.
Heartbeat: ticking off tasks
What is a heartbeat: A heartbeat is a timer that fires on a regular interval.
In most systems, that might be every second, every few seconds, or every minute. The exact number doesn't matter as much as the idea: the system wakes up on a schedule and checks what's ready to run.
A heartbeat in OpenClaw is a scheduled agent run that happens on a regular timer — like every 30 minutes by default — so your agent can proactively check for things that need attention. The Gateway handles the heartbeat scheduling.
The heartbeat is configured with an interval — by default 30 minutes.
On each tick, OpenClaw runs a normal agent turn in the main session. Basically treating it the same as any other inbound message.
Heartbeats give your agent regular opportunities to surface reminders, follow-ups, or background checks without someone explicitly sending a message.
Every heartbeat can be configured with:
every: how often the heartbeat should run (e.g., "30m"). Set to "0m" to disable completely.
target: where any outbound message from a heartbeat should go (like a channel). "last" (the most recent channel) is the default.
prompt: the exact text the model should see for heartbeat runs; this is sent as the equivalent of a user message.
includeReasoning: if enabled, heartbeats send an extra "Reasoning:" message explaining why they did something.
Heartbeats let OpenClaw agents do proactive work: check inboxes, review reminders, ping users on loose ends, etc. Each heartbeat is just another agent turn scheduled by the Gateway's timer.
This is what makes OpenClaw feel proactive. With a heartbeat, your agent can keep moving even when nobody is interacting with it.
Crons: put your OpenClaw on the clock
What is a cron? A cron is a way to say: at this time, do something.
In normal software, you might say "run this job every day at 9am" or "run this every 10 minutes."
When you schedule a cron in OpenClaw, you're not asking it to "do work later." You're telling it to create an event at a specific moment in the future.

When that moment arrives, the cron drops an event into the system. That event waits in line like any other input (like a message or heartbeat described above), and on a heartbeat it enters the agent loop.

This is how OpenClaw drives background behavior without a proactive brain. Nothing is thinking overnight. Time simply produces events. And events kick off agents.
Hooks: key events in your lobster's lifecycle
Not all inputs come from the outside. OpenClaw uses hooks to trigger off behavior on state changes within itself (it wakes up, you send it a command, etc.)
What is a hook?  A hook is an event that is run when the system itself changes state: a command is issued, an agent is about to start, or the Gateway finishes starting up.
In OpenClaw, these hooks can be
sent by under behavior (ex: command:stop when a user types /stop)
Sent by agent or gateway lifecycles (ex: agent:bootstrap)
This is how OpenClaw manages itself. Hooks let it save memory on reset, run instructions on startup, or modify context before an agent begins.
Webhooks and external systems
What is a webhook? A webhook is an automated message sent from one application to another in real-time when a specific event occurs.
An email arrives. A webhook fires.
A slack emoji is sent. You get a webhook.
Your smart light might send off a webhook.
You finish an 8 minute mile? Probably can get a webhook.
p.s. a fun list of awesome webhooks are in this github.
Webhooks are how software "pushes" events to other software.
And yep, OpenClaw can receive them. And of course, set itself up to receive them. It also has some built in webhook-like things like polling for discord and gmail pub/sub.
From there, it's no different than anything else. The event enters a session, waits its turn, and runs through the agent loop.
This is how OpenClaw orchestrates your tools. It's simply listening for events from your system, and reminding itself what to do when it "hears" those events.
You get an email, it kicks off an agent. You open a jira task, it starts to code. All webhooks!
Agents talking to agents: the claw to claw network
Finally, your OpenClaw agents can also generate inputs for other agents.
When one agent sends a message to another, it's just enqueuing work into a different active session. This is just like the user-sent messages work. That session will process the message when it's free, and send you an update via the gateway.
Agent-to-agent messaging is how OpenClaw orchestrates complex work. It's pretty clever, but it's not magic.
Putting it together: why your crustacean feels alive
Put all of this together and you get a system that:
Checks that all its "due" tasks are being executed, through a heartbeat
Sets itself a regular schedule through crons
Build routines for it's life based on hooks
Interacts with the outside world via webhooks
And talks to itself via agent-to-agent messaging
Time creates events. Humans create events. Other systems create events. Internal state changes create events.
Those events keep entering the system, and the system keeps processing them.
From the outside, that looks like sentience.
But really: it's inputs, queues, and a loop.
Designing your own agent
Now, to be fair, there is LOTS of super cool stuff in this system. The memory architecture is fairly clever, we love a good skill marketplace, and yolo sudo system access is powerful (to say the least.)
But you don't need all that to build a agent (or agent router) that feels alive, too.
If you're building or working with agent systems, break yourself out of trying to design an "agents that thins" and start mapping out a systems that reacts.
That system should have:
time
events
state
and a reliable execution loop
…and behavior will emerge, even when nobody is watching.
p.s. Want to actually understand how this thing works? Read the docs and try exploring the repo on DeepWiki


---
*413 likes | 44 retweets | 28 replies | [Original](https://x.com/clairevo/status/2017741569521271175)*
