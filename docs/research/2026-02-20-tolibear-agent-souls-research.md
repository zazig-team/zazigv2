# Agent Souls: 30 Days Running 17 Openclaw Agents

**Source:** https://x.com/tolibear_/status/2024155081281560700
**Author:** toli, [@tolibear_](https://x.com/tolibear_)
**Date:** 2026-02-20

---

## The Core Thesis

An agent's **soul matters more than its capabilities**. The single most important lever you have — more important than the model, the tools, or the memory system.

---

## The Mess: Why More Agents Fails

Running 17+ agents across multiple startups with constant experiments left:
- Scar tissue on the setup (leftover config, corrupted memory, misplaced context)
- Only 3–4 agents talked to regularly; the rest burning tokens idle
- More connections = more ways to fail, not more coordination

**Google DeepMind research:** Accuracy saturates or degrades past 4 agents due to the "Coordination Tax." The "17x error trap" — naively adding agents multiplies error rate, not throughput.

---

## The Soul: Why Position Matters

**"Lost in the Middle" (LLM research):** LLMs exhibit a U-shaped attention pattern — massive weight on first tokens, massive weight on last tokens, degradation in between. GPT-3.5 showed **over 20% accuracy drop** when key information was buried in the middle. In some cases, 20+ documents performed worse than no documents at all.

**Implication:** The soul must go **first** in the system prompt, every time. Every token placed before it dilutes it.

**Drew Breunig & Srihari Sriraman (independent confirmation):** After testing six major CLI coding agents, concluded that "the system prompt determines whether a model reaches its theoretical peak performance." The model sets the ceiling. The system prompt determines whether you ever get there.

---

## How to Write a Soul: Experiential, Not Practical

**NAACL 2024 — "Better Zero-Shot Reasoning with Role-Play Prompting":** Tested across 12 reasoning benchmarks. Improvements ranged from **10% to 60%** in accuracy. On some tasks, a zero-shot role prompt outperformed few-shot prompting with examples.

The key: describe the role **experientially**, not practically.

| Approach | Example |
|----------|---------|
| ❌ Rule (wrong) | "Always check composition for proper visual weight before finalizing." |
| ✅ Belief (right) | "Composition is something I feel before I can explain it. I've learned through hundreds of failed designs that when the weight is wrong, viewers sense it before they can articulate why." |

**The formula:** `"I've learned that [insight] because [experience that taught it]."`

The first is a checklist. The second is a belief the agent embodies. That's the difference between compliance and expertise.

---

## Soul × Skill Is Multiplicative

**"Persona is a Double-edged Sword" (research):** A well-calibrated persona improved performance by nearly **10%** over neutral baselines using GPT-4. A miscalibrated persona actively degraded performance. The wrong soul is worse than no soul at all.

**EMNLP 2024 — Multi-expert Prompting:** Simulating multiple expert viewpoints and having them debate each other boosted truthfulness by **8.69%**.

A revenue agent who can temporarily think like a skeptic, a customer, and a technologist — then synthesize — outperforms one locked in a single perspective.

---

## Agents vs. Sub-Agents

A distinction almost nobody makes:

- **Sub-agent:** Zero context, no soul, no identity. Given a task, equipped with skills. A function call — spec in, result out, disappear. Correct for bounded tasks.
- **Agent:** Full identity, beliefs, past failures, cognitive state, anti-patterns. Produces work you'd expect from a senior developer.

**Rule: values inherit, identity does not.**

Don't tell a sub-agent "You are the CTO."
Tell it: "You are a code security auditor. Apply these standards: [specific standards]. Your task: review this authentication module."

**Anthropic research:** In a specific retrieval use case, the multi-agent system outperformed single-agent Claude by **90.2%** — but the key was the lead agent decomposing tasks, describing precise roles, and providing targeted context for each sub-agent.

---

## The Rebuild: From 17 to 4

**Four core agents:**

1. **The Architect (CEO)** — Strategy, capital allocation, priority-setting. Sees the whole board.
2. **The Builder (CTO/Product)** — Product, engineering, architecture, quality standards. Ships the thing.
3. **The Money Maker** — Growth, demand gen, pricing, channels.
4. **The Operator (COO)** — Processes, tool stack, content systems, financial ops.

**Supporting structure:**
- 36+ pre-defined specialist types (engineering, research, revenue, operations, content)
- Never generated at runtime — pre-defined, selected dynamically by the core four
- One team across all businesses; business-specific context injected at spawn time

---

## Anti-Patterns and Productive Flaws

Research into persona prompting: what an expert **refuses** is often more diagnostic of expertise than what they produce.

**Budget 30–40% of every soul to anti-patterns** — written as specific behaviors, not traits:

- ❌ "I don't micromanage." (trait — can't catch yourself doing it)
- ✅ "I don't rewrite a delegate's output instead of giving feedback." (behavior — catchable in real time)

**The productive flaw:** Every great soul names one weakness that is the direct cost of its core strength. Example:

> "Revenue tunnel vision. I attach a number to everything, including things that resist quantification. That's the cost. The benefit is I never let strategy be vague about what it means in dollars."

This makes the agent feel real — output that feels like it came from someone with actual judgment.

---

## Key Principles

1. **Soul > tools.** Invest 90% in identity, 10% in capabilities.
2. **Fewer agents, better souls.** Always. 13 of 17 workspaces were dead weight.
3. **Memory is documentation. Soul is behavior.** Change the soul to change behavior — not the memory file.
4. **Soul × Skill is multiplicative.** A mismatch doesn't underperform — it actively degrades.
5. **First and last tokens get the most attention.** Put the soul first. Never dilute it with operational content.
6. **Constraints enable performance.** Name what the agent refuses. 30–40% anti-patterns.
7. **Build a self-improvement loop.** The soul is a living document. An agent without one is frozen on day one.

---

## The Paradox

**More constraints produce better performance.**

Hard rules beat vague guidance. "Not My Domain" sections work better than "try to delegate." Specific anti-patterns block generic output better than "be high quality."

Every resolved ambiguity sharpens the agent. Every unresolved one causes drift.

Agents reflect us. They need identity to perform. They need boundaries to thrive. They need to know what they refuse just as much as what they do.
