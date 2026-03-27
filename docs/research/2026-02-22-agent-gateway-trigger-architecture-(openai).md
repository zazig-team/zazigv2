# 2026-02-22 Research on Agent Gateway and Trigger Architectures (openai)

## Scope, method, and what counts as “verified”

This report focuses on how “gateway mechanisms” (the control-plane boundary between the outside world and an agent runtime) and “trigger events” (inputs that wake or steer the agent loop) are being designed in the OpenClaw ecosystem and close derivatives—especially OpenClaw itself, Nano Claw variants, and Zero Claw—drawing primarily on practitioner discourse from the last ~90 days (roughly 2025-11-24 to 2026-02-22) across **entity["company","GitHub","code hosting platform"]** issues/discussions and operational docs, plus a small number of public engineering writeups where they capture failure reports and implementation constraints rather than marketing. citeturn17view0turn13view0turn11view0turn23view0turn26view0

“Verified” here means: directly supported by upstream documentation, repository READMEs, or concrete bug reports/issue threads with reproducible details. Forward-looking statements are explicitly labelled at the start of the sentence as **[Inference]**, **[Speculation]**, or **[Unverified]** per your constraints.

## Gateway and trigger architectures in practice

OpenClaw, Nano Claw (in both “minimal fork” and “container-first personal assistant” flavours), and Zero Claw all converge on a recognisable architecture: a long-running gateway process that owns session state and routing, and a tool-capable agent loop that is woken by inbound events (messages, cron/heartbeat ticks, hooks/webhooks, or internal lifecycle events). The interesting differences are *where triggers are defined*, *how they are chained*, and *what constitutes a “boundary crossing” event that requires extra gating*. citeturn14view3turn17view0turn13view0turn12view1turn23view0

image_group{"layout":"carousel","aspect_ratio":"16:9","query":["OpenClaw gateway architecture diagram WebSocket control plane","NanoClaw container isolation architecture diagram WhatsApp polling loop SQLite","ZeroClaw architecture diagram trait driven runtime"] ,"num_per_query":1}

### Trigger surfaces and what they look like operationally

OpenClaw’s docs explicitly frame the Gateway as the “single source of truth” for sessions, routing, and channel connections, with multiple event sources feeding it: inbound channel messages, scheduled automation (cron), periodic polling (heartbeat), and external webhooks that can enqueue “system events” or run isolated agent turns. citeturn14view3turn17view0turn14view1turn21view0

The webhook design is especially revealing about “trigger formalisation”: OpenClaw’s Gateway exposes endpoints that (a) enqueue a system event for the main session and optionally wake the heartbeat immediately, or (b) run an isolated agent turn and then post a summary back into the main session; it also supports mapping arbitrary payloads to actions via config-defined mappings and optional JS/TS transforms, with explicit constraints to prevent directory traversal/escape and controls like request `sessionKey` overrides being disabled by default. citeturn21view0

OpenClaw’s cron subsystem is similarly explicit about triggers and chains: cron jobs run *inside the Gateway process*; they persist to `~/.openclaw/cron/jobs.json`; and they support two execution styles—“main session” jobs that enqueue a system event and are processed on the next heartbeat, versus “isolated” jobs that run in a dedicated `cron:<jobId>` session and then optionally announce or webhook-deliver results. The docs also show first-class “wake now vs next-heartbeat” semantics and describe retry backoff and idempotency/announce retry logic as part of reliable trigger delivery. citeturn14view1turn25view0

NanoClaw (qwibitai/nanoclaw) defines a different trigger surface: a WhatsApp input/output pipeline where messages are ingested (via a Baileys-based WhatsApp integration), persisted in SQLite, and fed into a polling loop that drives an agent container running the Anthropic Agents SDK; in this design, the “gateway” is less a multi-client WS control plane and more an orchestrator loop plus routing/IPC. The README calls out per-group message queues with concurrency limits, a task scheduler, and IPC via the filesystem. citeturn13view0turn28view1

ZeroClaw’s trigger surfaces are visible from its CLI and runtime split: it distinguishes `gateway` (webhook + WhatsApp HTTP gateway), `daemon` (a supervised runtime bundling gateway + channels + optional heartbeat/scheduler), and explicit `cron` management commands; it also documents a channel runtime that watches `config.toml` and hot-applies provider/model/reliability settings on subsequent inbound messages. citeturn12view1turn23view0

### What “trigger chains” look like: linear, branching, and nested

OpenClaw provides a fairly concrete model of trigger chains as structured, multi-step pipelines with resilient delivery:

- A webhook “wake” → enqueue system event → (optional) immediate heartbeat → agent run on heartbeat prompt.
- A cron (main-session) → enqueue system event → heartbeat → agent run.
- A cron (isolated) → dedicated session run → announce summary to main + channel.

These are linear multi-step chains, but OpenClaw also formalises branching via **sub-agents**, including nested sub-agent depth (main → orchestrator sub-agent → worker sub-sub-agent) and an explicit “announce chain” that propagates results upward level-by-level. It also describes “tool policy by depth” and a cascade-stop mechanism (`/stop` stops spawned sub-agents and cascades). citeturn25view0turn24search2turn14view1turn21view0

ZeroClaw’s trigger chains are less fully documented in one place, but the repo README establishes a trait-driven decomposition (providers/channels/tools/memory/tunnel/heartbeat) and the CLI reference shows an explicit “emergency stop” capability (`estop`) that can globally kill, network-kill, domain-block, or tool-freeze—suggesting a control-plane concept where chain execution can be halted by system-level triggers rather than only per-tool denials. citeturn23view0turn12view1turn23view0  
[Inference] Because `estop` has “resume” mechanics and optional OTP gating, it effectively acts as a gateway-level trigger override (a higher-priority event that changes what subsequent tool calls are permitted), not just a user command. citeturn12view1

NanoClaw’s chain structure is heavily influenced by its container-first loop: inbound WhatsApp messages are processed through a per-group queue, run inside isolated containers with per-group memory files, and then routed back outward; scheduled jobs re-enter this same container-runner path. The project’s own README names the key boundary objects—`group-queue`, `container-runner`, `task-scheduler`, and `ipc`—which is typical of a single-process orchestrator that multiplexes multiple “agent instances” by container isolation. citeturn13view0turn28view1

## Evolution from OpenClaw to Nano Claw to Zero Claw

### Architectural inflection points

OpenClaw presents itself as a broad, multi-channel gateway with a WS control plane and a large operational surface (channels, tools, cron/webhooks, nodes, a web Control UI), relying heavily on an explicit config model and structured workspace files (`AGENTS.md`, `SOUL.md`, `USER.md`, etc.) as prompt-injected operating instructions and memory. citeturn17view0turn20view1turn24search9turn4view0

NanoClaw (qwibitai/nanoclaw) is a *reaction* to that breadth: its stated design goal is to reduce “configuration sprawl” and make the system understandable enough to safely customise directly, moving “customisation” from declarative config toward code changes and “skills” that transform the codebase. Its README explicitly frames OpenClaw’s security model as “application-level allowlists/pairing” whereas NanoClaw’s security primitive is OS/container isolation: agents run inside Linux containers (Apple Container on macOS or Docker), with only explicitly mounted directories visible. citeturn13view0turn4view0turn13view0

ZeroClaw is a different kind of reaction: it positions itself as a “runtime operating system for agentic workflows” with “secure-by-default runtime” and everything pluggable via traits, implemented as a small Rust binary intended for low-memory environments. Its README emphasises explicit allowlists, strict sandboxing, workspace scoping, and default localhost binding; it also documents concrete trait boundaries for channels, tools, memory, runtime adapters, and tunnels. citeturn11view0turn23view0turn12view0

[Inference] The “evolution” here is less a linear lineage (OpenClaw → Nano/Zero) and more a community-driven bifurcation: one branch pursues *minimalism via code comprehensibility and container isolation* (NanoClaw), while another pursues *minimalism via a typed, trait-driven runtime and security-by-default gating* (ZeroClaw). citeturn13view0turn11view0turn23view0

### Explicit skill injection vs behavioural emergence

OpenClaw’s “skills” model is largely operationalised as tools and scripts made available to the agent through a structured environment (bundled/managed/workspace skills) and tool policy controls in config; its identity and behavioural constraints are represented as workspace markdown files that are injected into the system prompt. This is explicit “skill injection” in the sense that the runtime decides what tools exist and what context enters the prompt; the model then decides how to use them within those boundaries. citeturn20view2turn7search3turn7search7turn24search9

NanoClaw’s “skills over features” stance shifts the locus: rather than shipping a large plugin framework, it encourages contributor-authored “skills” that modify the user’s fork (sometimes deterministically, sometimes via Claude Code instructions). The “skills engine” debate in its issue tracker highlights this tension explicitly: a contributor calls out that `/add-telegram`-style skills appear to modify source files via 3-way merges rather than loading runtime plugins, raising merge-conflict and UX concerns and questioning whether the approach is foundational or experimental. citeturn27view0turn13view0turn28view2

ZeroClaw tries to straddle both: its README describes “skills” as TOML manifests + `SKILL.md` instructions, and the CLI reference says `skills install` performs a static security audit before accepting a skill. This is an explicit attempt to keep extension mechanics while enforcing gateway-level safety checks at install time (shifting risk left). citeturn12view1turn23view0

### Context persistence: from “soul files” to hot-path privacy problems

OpenClaw’s memory model is deliberately file-based: official templates describe `SOUL.md` as identity and continuity, `AGENTS.md` as operating instructions, daily `memory/YYYY-MM-DD.md` logs, and a curated `MEMORY.md` that should only load in the “main session” for security reasons. The official `AGENTS.md` template explicitly warns not to load `MEMORY.md` in shared contexts (e.g., group chats) because it contains personal context that should not leak. citeturn20view1turn7search11turn4view0

Practitioner discourse shows this model breaking in exactly the way you’d expect: a February 2026 bug report states that OpenClaw injects the full bootstrap context (including `USER.md`, `SOUL.md`, `MEMORY.md`, etc.) into the system prompt even for non-owner senders on public-facing channels, and that the `senderIsOwner` flag gates tool access but not bootstrap file visibility—creating a privacy boundary failure where strangers can receive responses informed by the owner’s private context. citeturn16view0

NanoClaw adopts “per-group CLAUDE.md memory” and container-isolated filesystems to avoid cross-group leakage, but it hits a different persistence stress point: “context rot” as sessions approach context window limits. A request asks for exposing the equivalent of `/new` or `/compact` as an MCP tool per container, but immediately flags the boundary risk: an untrusted group user could wipe the group agent’s short-term memory. citeturn13view0turn28view0

ZeroClaw exposes persistence more as a pluggable “memory backend” and relies on explicit sandbox/file policy controls (workspace-only by default, forbidden paths, command allowlists) to prevent memory tooling from becoming a host-exfiltration vector. It also explicitly builds rate limiting (“max actions per hour” / “cost per day”) into the security policy, shifting persistence from “files as memory” to “memory as subsystem under a policy object.” citeturn12view0turn23view0turn22search6

## Autonomy escalation and boundary crossing

### How “permission boundaries” are expressed

OpenClaw’s gating stack is unusually explicit and layered:

- **Ingress gating** (who can trigger the agent): DM pairing/allowlists and group allowlists/mention gating are documented as independent layers, with clear ordering and warnings against “dmPolicy=open” and “groupPolicy=open” except as a last resort. citeturn4view0turn17view0  
- **Tool policy gating** (what tools exist for a run): global allow/deny lists, tool profiles, and provider-specific narrowing prevent disallowed tools from being sent to model providers at all. citeturn7search3  
- **Sandboxing and elevated execution**: OpenClaw distinguishes sandbox tool policy from “elevated mode” that forces `exec` onto host and can optionally skip approvals (`/elevated full`), with explicit resolution order (inline directive → session override → global default). citeturn7search7turn7search9turn7search5  
- **Exec approvals**: a host-side interlock where commands can return “approval-pending,” and the execution host decides (policy + allowlist + optional user approval), with deny as the fallback if UI isn’t available. citeturn7search1turn7search5

In ZeroClaw, autonomy escalation is primarily captured as explicitly named autonomy levels—ReadOnly, Supervised, Full—plus workspace isolation, path traversal blocking, command allowlisting, forbidden paths, and rate limiting (actions/hour and cost/day caps). Importantly, it also introduces `estop` as a control-plane mechanism to kill or freeze capabilities at runtime. citeturn12view0turn12view1turn23view0

NanoClaw’s core boundary crossing decision is structural: it prefers container isolation rather than a rich app-level policy framework, asserting that “bash access is safe because commands run inside the container, not on your host,” and that isolation is per group with only that directory mounted. This shifts the meaning of “escalation” from “permission to use tool X” to “permission to mount resource Y into a container.” citeturn13view0turn28view2

### What “escalation moments” look like to builders

In practitioner terms, escalation points map to a handful of repeating transitions:

**From passive assistant → active executor**  
OpenClaw: enabling high-risk tools (`exec`, `browser`, `web_fetch`, `web_search`) and/or turning on elevated host execution. The security docs explicitly argue that system prompts are not a security boundary and that enforcement comes from tool policy, approvals, sandboxing, and channel allowlists. citeturn7search11turn7search1turn7search7  
ZeroClaw: increasing autonomy from ReadOnly to Supervised/Full, widening `allowed_commands` and relaxing `workspace_only`, and enabling scheduler/cron mutation tools—all of which are treated as security-policy decisions rather than “prompt rules.” citeturn12view0turn12view1turn23view0

**From suggestion → modification → deployment**  
OpenClaw documents patterns where tools can write/edit/apply patches and run commands, but the ecosystem discourse shows builders wanting stronger, non-prompt-based path segmentation: a February 2026 feature request asks for per-agent file path allowlists/denylists precisely because SOUL.md guardrails varied by model and could be bypassed, including via agent-to-agent requests. citeturn19search23  
ZeroClaw’s security model is built around enforcing these constraints at the tool layer (path checks, workspace scoping, command policy), but issue threads show how small parsing or layering mistakes can defeat intended autonomy semantics (e.g., semicolon parsing inside quoted strings causing “full autonomy” to behave like supervised+blocked). citeturn22search0turn12view0

### Safety constraints versus reactivity: what’s being optimised

OpenClaw’s automation model (cron/heartbeat/webhooks/hooks) is optimised for reactivity—“wake now” and immediate heartbeat triggering are first-class—and for operational resilience (announce retries, idempotency keys, backoff). citeturn14view1turn25view0turn21view0  
But its issue tracker shows direct friction: config changes triggering double SIGUSR1 restarts via watcher rules can cause unnecessary disruption and even stall cron scheduling, suggesting that “reactivity to config change events” can become harmful when the gateway restarts too eagerly. citeturn15view4turn15view3

ZeroClaw is explicitly making “reactivity” a controlled variable: it hot-applies only a small subset of config fields during channel runtime and appears to treat broader changes as requiring controlled restarts or supervised flows; meanwhile, it is adding safety levers like `estop` and built-in static audits for skills install, moving toward “fail fast / refuse unsafe by default.” citeturn12view1turn23view0turn12view0

NanoClaw’s reactivity is constrained by its polling/streaming SDK loop and IPC design; when that loop mishandles a boundary case (messages arriving after a result but before the async iterator exits), it can silently drop follow-up messages and sit idle until a timeout kills the container. This is the flip side of “simple orchestrator loops”: fewer subsystems, but less room for robust event buffering. citeturn28view1turn13view0

## Failure modes and stress points

### Trigger misfires, stalls, and dropped events

OpenClaw has multiple recent, concrete reports of “trigger → hang → manual restart” failure modes:

- A February 2026 issue reports that when compaction triggers automatically (safeguard mode), the gateway can become unresponsive across Control UI and channels until manually restarted; the report includes timestamps of compaction start, retry, and a 10-minute timeout. citeturn15view2turn14view3  
- A January 2026 issue describes inbound messages (particularly audio) being dropped during gateway restarts triggered by config.apply changes, arguing for restart-surviving queues or restart deferral when messages are pending. citeturn15view3turn15view4  
- A February 2026 bug describes double restarts from `meta.lastTouchedAt` changes due to watcher reload rules defaulting to “restart gateway,” causing repeated SIGUSR1 cycles and the risk of cron scheduler stalling after restart. citeturn15view4turn14view1

NanoClaw’s IPC-drop issue is a crisp example of a trigger boundary bug: the system observes the IPC file and pushes new text into a stream, but there is no active consumer once the SDK has yielded a result; the agent loop can also fail to exit the iterator, leaving the container “stuck waiting” and effectively turning messages into dead letters. citeturn28view1

ZeroClaw’s issue tracker shows early-stage versions of the same class of problems: one report notes that channel message handling used a hardcoded max tool-iteration cap (10) rather than respecting config, creating premature “agent exceeded tool iterations” failures in real-time channel contexts. citeturn22search5turn12view1

### When gateway rules create brittleness or paralysis

OpenClaw’s gating has a consistent critique from within its own docs: system prompts are “soft guidance,” and the more you rely on them for security boundaries, the more fragile you become—especially when reading untrusted content. citeturn7search11turn7search1  
Practitioner requests reflect the same: per-agent file path access control is asked for explicitly because SOUL.md-based instructions are unreliable across models and can be bypassed (including via A2A). citeturn19search23turn25view0

NanoClaw is debating brittleness of *customisation-by-transformation*: the skills-engine / 3-way merge approach risks merge conflicts when users customise the same files skills want to patch, and another issue shows how a skill can embed outdated system-specific code (Apple Container commands) that breaks Docker users—i.e., a “trigger scaffolding” mechanism (skills) that becomes a distribution hazard across heterogeneous environments. citeturn27view0turn28view2

ZeroClaw’s brittleness appears in the boundary between security policy and runtime UX: a bug report shows that, in non-interactive environments, approval prompts can read EOF and deny commands, while command parsing can incorrectly split quoted semicolons—making “full autonomy” unusable in the headless automation scenarios such a runtime is targeting. citeturn22search0turn12view0

### Oscillation between “over-constrained” and “under-constrained” autonomy

[Inference] Across the three ecosystems, the oscillation is visible as a cycle:

1) builders expose more autonomy (tools, scheduling, webhooks, subagents),  
2) real failures and exploits emerge (prompt injection risk, privacy leakage, dropped events, policy bypass),  
3) the community adds tighter default gates (pairing/allowlists, install-time audits, explicit policy checks, emergency-stop),  
4) users then request escape hatches (disable rate limits, reduce approvals, hot-apply config, more automation). citeturn4view0turn16view0turn15view3turn8search17turn22search6turn12view1turn7search1

ZeroClaw’s “disable rate limits” feature request is a clear example of step (4): default action/hour limits are experienced as too restrictive for internal deployments, and users want sentinel values or explicit disable flags. citeturn22search6turn12view0  
OpenClaw’s ecosystem shows the same pressure in different form: calls for self-healing watchdog systems that restart or diagnose gateway failures automatically (including using Claude Code to read logs and attempt fixes) are attempts to preserve autonomy while compensating for reliability gaps. citeturn15view1turn15view0

## Forward trajectories beyond Zero Claw

### Convergence points that look real (not marketing)

[Inference] The most credible convergence is toward **event-driven, policy-aware agent loops** where triggers are first-class objects and policy is consistently applied at every mutation point (especially scheduling and external triggers). Evidence:

- OpenClaw’s webhook and cron designs already treat “wake mode,” session key policy, and mapping transforms as features requiring explicit security constraints and default-deny posture for risky capabilities (sessionKey overrides, unsafe external content wrappers). citeturn21view0turn14view1  
- ZeroClaw’s recent issues explicitly focus on ensuring cron/schedule tools require autonomy gates and cannot bypass feature flags or command policy checks—i.e., ensuring trigger creation itself is treated as a privileged action. citeturn8search17turn8search5turn12view1  
- NanoClaw discussions about exposing `/new` or `/compact` as tools immediately raise “untrusted users can wipe memory” as a policy problem, not just a feature request—showing the community is internalising that trigger tooling is a boundary surface. citeturn28view0turn27view0

[Inference] A second convergence point is the rise of **kill switches / abort semantics as part of the gateway**, not as an afterthought. OpenClaw documents `/stop` aborting the current run and clearing queued followups (including spawned sub-agents), while ZeroClaw elevates this concept into a multi-level `estop` mechanism that can freeze tools or block domains and require OTP to resume. citeturn24search2turn25view0turn12view1

### Active debates that will shape the next phase

[Inference] The biggest unresolved debate is **declarative orchestration versus code-transform/emergent orchestration**:

- OpenClaw is doubling down on declarative-ish config and operational primitives (cron schemas, webhook mappings, tool profiles, explicit gating layers), while still letting behaviour emerge from prompt-injected workspace files and model choice. citeturn21view0turn14view1turn7search3turn20view1  
- NanoClaw is explicitly anti-“configuration sprawl” and pushes customisation into code changes and skill-driven transformations; the open questions in its issue tracker show real concern about merge-conflict UX and whether deterministic transformations are the “real” mechanism or just scaffolding for Claude Code to modify things. citeturn13view0turn27view0turn28view2  
- ZeroClaw is trying to keep a declarative config core (TOML) while broadening the tool surface and enforcing consistent policy checks; its quick iteration cycle is generating the classic early-runtime bug class where policy and UX get out of sync (headless approval prompts, parsing edge cases). citeturn23view0turn22search0turn8search17

### Credible 6–12 month practitioner predictions

[Speculation] The next 6–12 months will likely see “gateway triggers” formalised into **auditable autonomy contracts**: schedulers/webhooks/subagent spawners will increasingly require explicit declarations of *what they can mutate*, not just *what they can call*, because trigger creation is itself a persistence mechanism that can outlive a single interactive session. (This is a direct response to recent policy-bypass concerns around schedule/cron mutation tools and sessionKey routing.) citeturn21view0turn8search17turn8search5

[Speculation] Expect a stronger separation between “trusted internal triggers” and “untrusted external triggers,” implemented as distinct ingestion pipelines with different default wrappers/sanitisation. OpenClaw already hints at this by treating webhook payloads as untrusted by default and allowing an explicit escape hatch (`allowUnsafeExternalContent`) only per hook mapping. citeturn21view0turn7search11

[Speculation] “Beyond Zero Claw” may look less like a single project and more like a family of ultra-small runtimes plus shared community standards: ZeroClaw’s trait decomposition and NanoClaw’s container-isolation minimalism are two viable “kernel” patterns, and both are being pulled toward interoperability layers (skills registries, standardised audits, provider-agnostic auth profiles). citeturn23view0turn12view1turn13view0