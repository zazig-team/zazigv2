<img src="https://r2cdn.perplexity.ai/pplx-full-logo-primary-dark%402x.png" style="height:64px;margin-right:32px"/>

# deep research. Deep Research: Agentic Memory — State of the Art, Patterns, and Architecture

We're building an AI agent platform (zazig) where persistent agents (CPO, CTO, CMO) run across multiple sessions on behalf of a company. Each agent has: a role prompt (who they are), skills (how they work), doctrines (what they believe), and canons (what they've studied). What they don't have yet is memory — the ability to learn, retain, and recall information across sessions.
Research the following:
Memory taxonomies in agentic systems — what kinds of memory do agents need? (episodic, semantic, procedural, working). How do leading frameworks (LangChain/LangGraph, CrewAI, AutoGen, OpenAI Agents SDK, Letta/MemGPT, Zep) categorise and implement these? What's the emerging consensus, and where do they disagree?
Persistent memory architectures — how do production systems store and retrieve agent memories? Vector stores vs structured databases vs hybrid approaches. What are the trade-offs in retrieval accuracy, latency, and context window management? How do systems handle memory that grows unboundedly over months/years?
Memory consolidation and forgetting — how do systems decide what to remember and what to forget? Importance scoring, recency decay, compression, summarisation. What happens when memories conflict? How is memory quality maintained over time?
Cross-session continuity — how do agents maintain coherent identity and context across sessions that may be days or weeks apart? What gets injected proactively vs retrieved on demand? How do you handle the cold-start problem (new session, thousands of memories, limited context window)?
Multi-agent shared memory — when multiple agents serve the same company, what should be shared vs private? How do you prevent one agent's memories from polluting another's context? What's the interaction between individual agent memory and company-level knowledge?
Memory and the knowledge stack — we already have doctrines (beliefs), canons (reference knowledge), and skills (procedures). Where does memory fit? Is it a separate layer or does it feed into the existing three? How do you prevent memory from duplicating or contradicting doctrines/canons?
What's actually working in production — skip the theoretical. Which companies/projects have shipped persistent agent memory that works well at scale? What patterns emerged from real usage? What failed?
Output format: Structured report with clear sections. For each area: what the consensus is, where there's disagreement, specific implementations worth studying, and concrete recommendations for zazig's architecture. Include links to papers, repos, and documentation.

Agentic systems require structured memory to enable learning and persistence across sessions, drawing from human-inspired taxonomies like working (short-term context), episodic (experiences), semantic (facts), and procedural (skills).[^1][^2]

## Memory Taxonomies

Consensus centers on four core types: working memory for immediate context, episodic for past events, semantic for knowledge facts, and procedural for skills and routines. Frameworks like LangChain/LangGraph use short-term (thread checkpoints) and long-term (stores) without explicit episodic/semantic splits, focusing on session persistence. CrewAI adds entity memory alongside short/long-term; AutoGen relies on message lists; OpenAI SDK handles session memory automatically; Letta/MemGPT tiers core/archival/recall; Zep uses temporal graphs.[^3][^4][^5][^6][^7][^8][^2][^9][^1]

Disagreements arise on granularity—some (Letta) emphasize OS-like tiers for unbounded growth, others (CrewAI) prioritize entity extraction. Study Letta's tiered system (github.com/letta-ai/letta) and LangGraph docs (langchain.com/docs).[^4][^7][^10][^3]

**Zazig recommendation:** Adopt the four-type taxonomy, mapping episodic/semantic to vector retrieval and procedural to skills integration for CPO/CTO/CMO roles.

## Persistent Architectures

Hybrid vector (semantic search) + structured DBs (facts/logs) dominates for balancing fuzzy recall and precision. Vectors excel in accuracy/latency for large-scale retrieval but struggle with unbounded growth; structured DBs ensure auditability but slow on semantics; hybrids mitigate via compute-storage separation (e.g., Milvus). Context windows managed by tiered loading (core always-in, archival on-demand).[^11][^10][^12][^13]

LangGraph uses InMemorySaver/Postgres; CrewAI ChromaDB/SQLite; Letta vector DB + DB history; Zep precomputes embeddings. Trade-offs: Vectors fast (~ms) but embedding costs rise; DBs cheaper long-term.[^10][^9][^14][^3][^4]

**Zazig recommendation:** Hybrid Pinecone/Weaviate (vectors) + Postgres (structured) per agent, with auto-tiering to cap context at 128k tokens. See Letta repo (github.com/letta-ai/letta).[^10]

## Consolidation and Forgetting

Systems score via recency, importance (e.g., outcome success), and decay; compress via summarization or eviction. Conflicts resolved by timestamps or agent arbitration; quality via periodic reflection/re-ranking. Letta archives important info autonomously; Zep precomputes summaries; decay multiplies similarity by exponential time-factor.[^7][^9][^15][^16]

Disagreement: Proactive compression (Letta) vs. lazy decay (vectors).[^15][^10]

**Zazig recommendation:** Implement recency-importance scoring with weekly summarization jobs; flag conflicts for human review in company doctrines.

## Cross-Session Continuity

Proactive injection of core persona/doctrines; on-demand retrieval of top-k episodic memories via query embedding. Cold-start solved by session handoffs (summaries of last state) and relevance filtering to fit windows. LangGraph threads resume via ID; Letta searches archival on load.[^17][^18][^19][^3][^10]

**Zazig recommendation:** Use thread IDs for sessions; preload role prompt + top-5 company memories; handoff summaries at session end. Reference LangGraph checkpoints (docs.langchain.com).[^3]

## Multi-Agent Shared Memory

Private per-agent (experiences) vs. shared company-level (facts, outcomes); graphs control access. Prevent pollution via namespaces or permissions; interaction: private feeds personal reasoning, shared for collaboration. Collaborative Memory paper uses tiers with bipartite access graphs.[^20][^21]

**Zazig recommendation:** Private episodic/procedural per CPO/CTO/CMO; shared semantic for company knowledge. Use RBAC graphs to isolate.

## Memory and Knowledge Stack

Memory as dynamic layer atop static doctrines (beliefs), canons (references), skills (procedures)—feeds updates without overriding. Prevents duplication by retrieval-augmented prompts checking canons first; contradictions trigger consolidation.[^21][^22]

**Zazig recommendation:** Separate layer: Inject doctrines/canons always, retrieve memories on-demand, validate against canons.

## Production Implementations

Google ADK + Milvus scales to millions of vectors with user isolation; healthcare AutoGen agents personalize via hybrid memory. Letta/Zep in enterprise pilots handle unbounded growth; failures include context bloat without decay, solved by compaction (95% continuity gain). Patterns: Append-only logs, hybrid stores; failed: Single vector-only (hallucinations).[^8][^12][^13][^23][^24]

**Zazig recommendation:** Start with Letta for prototyping (letta.com/docs), migrate to ADK/Milvus hybrid for scale; monitor with compaction metrics. Papers: MemGPT (arxiv.org/abs/2310.08560), Zep (arxiv.org/abs/2501.13956).[^8]
<span style="display:none">[^25][^26][^27][^28][^29][^30]</span>

<div align="center">⁂</div>

[^1]: https://www.linkedin.com/posts/williamyangxs_the-four-types-of-memory-working-episodic-activity-7276101657342459904-mJhu

[^2]: https://micheallanham.substack.com/p/memory-architecture-for-production

[^3]: https://docs.langchain.com/oss/python/langgraph/add-memory

[^4]: https://www.geeksforgeeks.org/artificial-intelligence/memory-in-crewai/

[^5]: https://dev.to/foxgem/ai-agent-memory-a-comparative-analysis-of-langgraph-crewai-and-autogen-31dp

[^6]: https://developers.openai.com/cookbook/examples/agents_sdk/session_memory

[^7]: https://tersesystems.com/blog/2025/02/14/adding-memory-to-llms-with-letta/

[^8]: https://arxiv.org/html/2501.13956v1

[^9]: https://help.getzep.com/v2/memory

[^10]: https://rywalker.com/research/letta

[^11]: https://www.trixlyai.com/blog/technical-14/building-memory-in-ai-agents-design-patterns-and-datastores-that-enable-long-term-intelligence-87

[^12]: https://www.youtube.com/watch?v=4nQ8i_uNHWA

[^13]: https://milvus.io/blog/how-to-build-productionready-ai-agents-with-longterm-memory-using-google-adk-and-milvus.md

[^14]: https://github.com/syntax-syndicate/zep-ai-memory-foundation

[^15]: https://blogs.oracle.com/developers/agent-memory-why-your-ai-has-amnesia-and-how-to-fix-it

[^16]: https://www.ifaamas.org/Proceedings/aamas2012/papers/2F_1.pdf

[^17]: https://supermemory.ai/blog/how-to-add-conversational-memory-to-llms-using-langchain/

[^18]: https://blakelink.us/posts/session-handoff-protocol-solving-ai-agent-continuity-in-complex-projects/

[^19]: https://www.linkedin.com/posts/jazmiahenry_ai-agents-face-a-cold-start-problem-once-activity-7246526062216560640-PeZH

[^20]: https://arxiv.org/html/2505.18279v1

[^21]: https://www.interspect.ai/blog/inside-the-mind-of-an-ai-agent-memory-reasoning-skills-and-tools

[^22]: https://www.letta.com/blog/agent-memory

[^23]: https://sparkco.ai/blog/persistent-memory-strategies-for-advanced-ai-agents

[^24]: https://x.com/TheValueist/status/2020496276194750498

[^25]: https://sparkco.ai/blog/deep-dive-into-crewai-memory-systems

[^26]: https://github.com/cpacker/MemGPT/discussions/421

[^27]: http://newamerica.org/oti/briefs/ai-agents-and-memory/

[^28]: https://playbooks.com/skills/xfstudio/skills/agent-memory-systems

[^29]: https://sparkco.ai/blog/persistent-memory-for-ai-agents-comparing-pag-memorymd-and-sqlite-approaches

[^30]: https://www.reddit.com/r/AI_Agents/comments/1quz5ra/how_are_you_handling_persistent_memory_across/

