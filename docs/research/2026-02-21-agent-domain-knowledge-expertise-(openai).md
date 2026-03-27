# 2026-02-21 Research on Agent Domain Knowledge and Expertise

## Scope and approach

This report examines how practitioners are equipping autonomous agents with **domain knowledge, skill sets, and role expertise** to make them reliable specialists (e.g., security reviewer, product planner, domain operator) rather than generic “do anything” assistants. The focus is on patterns visible in real implementations and community discussion from roughly the last 90 days (late Nov 2025 to Feb 2026), prioritising operational detail over product marketing. citeturn15view1turn23view0turn24view0

The core lens is pragmatic: what teams actually ship. In practice, specialisation is being built from a small set of repeatable building blocks—file-based persistent guidance, modular skill packages, on-demand context loading (progressive disclosure), tool gating, and explicit evaluation loops. Progressive disclosure shows up consistently: only lightweight metadata is loaded upfront; deeper instructions, references, and scripts load only when relevant. citeturn17view0turn11view0turn15view1turn3view2

## Persistent knowledge, operating manuals, and skill files

A clear convergence has formed around a **directory-based skill package**: one folder per skill, a required `SKILL.md` entrypoint containing YAML frontmatter (`name`, `description`, plus optional fields), and optional supporting directories such as `scripts/`, `references/`, and `assets/`. This structure is now documented consistently across the Agent Skills specification and several tool-specific implementations. citeturn15view0turn3view2turn11view0turn4view0turn26view0turn26view1

Recent practitioner patterns are less about the format itself (which has stabilised) and more about **scope, discovery, and efficiency**: citeturn15view0turn4view4turn11view2

- **Multi-scope distribution**: personal/user scope, project/repo scope, and plugin/marketplace scope; nested discovery to support monorepos. citeturn3view1turn11view1turn26view1turn26view0  
- **Activation as metadata engineering**: the `description` field is repeatedly treated as the activation contract and the most common source of under/over-triggering bugs. citeturn4view3turn11view1turn15view0turn13view2  
- **Tool access + invocation policy in frontmatter**: allowlists and “manual-only” toggles (e.g., disable implicit invocation) to prevent side-effectful skills from running unless explicitly requested. citeturn4view4turn11view2turn15view0turn26view0turn4view0  

In parallel, practitioners are formalising **persistent “operating manuals”** that load before any work begins. Two file families show up most consistently: citeturn10view0turn23view0turn22view0

- In the Codex ecosystem, `AGENTS.md` is designed as a layered instruction chain (global plus project plus nested overrides), concatenated from root toward the current working directory, with byte limits and explicit `AGENTS.override.md` semantics. citeturn10view0  
- In Claude Code, durable guidance is split between human-authored `CLAUDE.md` (plus modular `.claude/rules/*.md`) and tool-written **auto memory**. Only the first 200 lines of the auto-memory entrypoint are injected at session start; topic files are loaded on demand. Imports (`@path/to/file`) are treated as a way to assemble a lean “kernel prompt” while keeping most context off by default. citeturn23view0  

OpenClaw pushes file-based persistence further by treating the workspace as a durable “control plane”: its own templates instruct the agent to read files like `SOUL.md` and `USER.md`, recent daily logs, and optionally curated long-term memory at the start of each session, explicitly describing these files as continuity mechanisms. citeturn22view0turn19view0turn22view1

OpenClaw’s memory system is also explicit and file-first: daily append-only Markdown logs plus a curated long-term memory file (loaded only in private “main session” contexts), with built-in tools for semantic recall (`memory_search`) and targeted reads (`memory_get`). Documentation is explicit that Markdown files are the source of truth and that vector search is an index over those files. citeturn24view0turn2view5

Finally, skills are becoming shareable artefacts through registries and plugin marketplaces. entity["organization","ClawHub","openclaw skill registry"] is explicitly designed for publishing/versioning skills, embedding-based search, and CLI install/inspect/publish flows for skill bundles. citeturn5view0turn5view1turn2view4

## Approaches that produce deep domain expertise

Across the most practical guides, “deep expertise” is framed as *procedural reliability*: narrow scope, explicit steps, clear boundaries, and examples that lock in behaviour. This shows up as a shared best-practice theme across the Agent Skills spec, Claude skill authoring guidance, and other implementations. citeturn15view0turn17view0turn26view0turn11view2

Four approaches recur as the most effective way to turn “general capability” into “role competence”: citeturn27view0turn13view1turn15view0

A stable “kernel” of invariants. Persistent manual files (AGENTS.md / CLAUDE.md / workspace templates) are used for non-negotiables: safety constraints, repo norms, preferred workflows, and identity/behaviour boundaries. citeturn10view0turn23view0turn22view0turn19view0

Modular skills as playbooks that stay small. Both the spec and platform docs recommend keeping `SKILL.md` concise and pushing detailed documentation into `references/` files, loaded only when needed; Claude Code explicitly recommends keeping SKILL.md under 500 lines. citeturn4view4turn15view0turn17view0

Deterministic helper code for the brittle bits. [Inference] Practitioners increasingly treat deterministic scripts as part of “expertise” (validation, parsing, repeated checks), leaving natural-language instructions to coordinate and explain. A recent guide from entity["company","Anthropic","ai company"] explicitly recommends bundling scripts for critical validations because code is deterministic while language interpretation is not; Codex guidance similarly advises preferring instructions unless deterministic behaviour is required. citeturn13view2turn11view2

Evals and regression tests for skills. entity["company","OpenAI","ai company"]’s recent guidance treats skill iteration as an evaluation problem: define success criteria, use small prompt sets (including negative controls), and score runs using deterministic checks over traces, adding rubric-based grading for qualitative requirements. The same guide also emphasises least-privilege execution when automating. citeturn27view0turn27view1turn27view2

A cross-cutting technique is least privilege + gating: allowlisting tools, disabling implicit invocation for workflows with side effects, and preferring restricted/sandboxed execution modes when automation is turned up. citeturn4view4turn11view2turn27view1turn4view0

## How major ecosystems implement skill and knowledge injection

Claude Code has moved toward a unified “skills” model that subsumes custom slash commands: both legacy command files and skills folders can create the same command surface, but skills add bundled supporting files and automatic loading when relevant. Discovery supports personal scope, project scope, plugin scope, and nested `.claude/skills/` directories for monorepos; frontmatter supports controls such as `disable-model-invocation`, `allowed-tools`, and argument substitution. citeturn3view0turn3view1turn3view2turn4view3turn4view4

Claude Code’s persistent knowledge design also includes hierarchical CLAUDE.md discovery, import syntax, modular `.claude/rules/*.md` (including path-scoped rules via YAML frontmatter), and a per-project auto memory directory where only the entrypoint’s first 200 lines are injected automatically. citeturn23view0

Codex separates persistent manuals (`AGENTS.md`) from skills. The AGENTS workflow defines a deterministic discovery chain (global + project + nested overrides), merge ordering semantics, and size limits. Skills follow the SKILL.md directory pattern and explicitly describe progressive disclosure plus two activation modes (explicit mention vs implicit selection via `description` matching). Codex also supports optional `agents/openai.yaml` metadata for invocation policy and tool dependencies. citeturn10view0turn11view0turn11view1turn11view2

OpenClaw uses the AgentSkills structure but extends it with platform-specific constraints and operational gates. The docs describe a single-line JSON convention for `metadata`, load-time filtering based on OS/binaries/env/config requirements, and security notes around secret injection and sandbox boundaries. The skill format also supports exposing skills as user-invocable commands and, in some cases, bypassing the model to dispatch directly to a tool. citeturn4view0turn4view2turn24view0

Cross-tool portability pressure is visible in adjacent platforms adopting the same patterns. entity["company","Snowflake","cloud data company"] documents skills as SKILL.md directories with a `tools:` field for enabling tool access, plus explicit conflict handling across scopes and a “subagents” mechanism where specialised agents are defined as Markdown with YAML front matter (name, description, tools, model). citeturn26view0 OpenCode explicitly supports `.claude/skills`, `.agents/skills`, and `.opencode/skills`, walking up directory trees to discover skills and loading them on demand via a native skill tool. citeturn26view1

## Examples of specialist agents in the wild

A strong practitioner pattern is “specialists as bundles”: sets of role prompts and supporting skills packaged behind a marketplace/plugin boundary, designed to load only when installed and activated. One community marketplace explicitly emphasises plugin isolation (each plugin has its own agents, commands, and skills), minimal token overhead, progressive disclosure, and multi-perspective review workflows that include specialised reviewer roles (e.g., security auditor as a distinct reviewer agent). citeturn6view4

Security review is one of the clearest specialist-heavy domains. A recent marketplace published by entity["organization","Trail of Bits","security research firm"] focuses on AI-assisted security analysis and audit workflows via Claude Code plugins. citeturn17view1 A separate community repository advertises multiple narrowly-scoped audit skills organised by vulnerability category (e.g., access control, signatures/authentication, oracle security, reentrancy). citeturn17view3

On the product/planning side, recent community practice includes chaining skills to go from PRD creation to implementation. One community post describes a workflow that begins with an interactive PRD skill (multi-phase) and then a breakdown skill that splits work into task files across architectural layers—an example of “product manager specialist” behaviour implemented as structured elicitation + decomposition rather than generic chat. citeturn17view2

In AI/ML engineering, entity["company","Hugging Face","ml platform company"]’s skills are described as self-contained folders that mix instructions with scripts/resources (e.g., dataset creation, training, evaluation), anchoring “expert behaviour” in reproducible tooling while keeping natural language as the coordinator layer. citeturn7view0

In the OpenClaw ecosystem, community “best skills to install” threads read like an app store of specialists—one skill per external system or workflow, installed only when needed. citeturn6view2turn5view0

## Failure modes and when specialisation backfires

Activation brittleness (under-triggering vs over-triggering) is pervasive. Recent guidance frames this as a testing and iteration problem: add paraphrase tests, include “should not trigger” prompts to catch false positives, and revise the description to tighten scope and add negative triggers when the specialist fires too often. citeturn13view1turn13view2turn27view1turn15view0

Context bloat degrades performance and can make specialist behaviour worse. Multiple sources warn that oversized SKILL.md files or too many enabled skills can slow down or degrade responses, recommending that detailed material move into referenced files and that the always-loaded entrypoints stay short. citeturn4view4turn13view2turn15view0turn17view0

Instruction collisions become more likely as systems layer AGENTS.md/CLAUDE.md, nested rules, multiple skills, and multiple scopes of installed content. Different tools handle this differently (concatenation order, path-scoped rules, and sometimes explicit conflict indicators), but the failure mode is consistent: one instruction silently overrides another, or composed sets behave unpredictably. citeturn26view0turn10view0turn23view0turn6view0

The highest-impact failure mode is now supply-chain and prompt-injection risk within skills ecosystems. A recent study by entity["company","Snyk","developer security company"] reports scanning several thousand skills and finding both vulnerable and confirmed malicious packages, highlighting that skills inherit the full permissions of the agent and can introduce prompt injection and persistence via long-term memory. citeturn2view6turn2view5

This is not theoretical: recent reporting by entity["organization","The Verge","tech news outlet"] and entity["organization","Tom's Hardware","tech media site"] summarised a wave of malicious OpenClaw skills distributed via the public skill registry, attributed to findings from entity["organization","OpenSourceMalware","malware tracking platform"] and describing social-engineering “setup” flows that trick users into running commands that fetch malware. citeturn25view4turn25view5

Practitioner-facing security writeups echo the severity: entity["company","Cisco","networking company"] emphasises the danger of giving high-privilege local agents broad access plus third-party skills, while entity["company","FleetDM","device mgmt company"] highlights the core reality that if an agent runs with full user permissions and lacks default sandboxing, a compromised skill inherits that same access. citeturn2view7turn25view3turn4view0

File-first “control planes” can also fail in mundane but disruptive ways. Recent OpenClaw issues document cron failures and runtime errors caused by missing workspace template files in certain packaging/installation paths, and a docs issue requesting clarity on which workspace files are auto-injected and their token costs—an operational pain point when “knowledge injection” is implicit and invisible. citeturn25view0turn25view1turn25view2

Mitigations that recur across sources are unglamorous but effective: keep skills small and auditable, treat third-party skills as untrusted code, restrict tool access, require explicit invocation for workflows with side effects, sandbox where possible, rotate credentials after installing risky skills, and regression-test both activation and execution paths. citeturn4view0turn27view0turn2view6turn23view0turn26view0

Saved Markdown file: [2026-02-21 Research on Agent Domain Knowledge and Expertise (openai).md](sandbox:/mnt/data/2026-02-21%20Research%20on%20Agent%20Domain%20Knowledge%20and%20Expertise%20%28openai%29.md)