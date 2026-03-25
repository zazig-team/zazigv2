# Recon: taskmaster
*Analyzed: 2026-02-19 | Commit: d394d47 | Compared against: zazig*

## TL;DR

- A Claude Code Stop hook that intercepts before the agent goes idle and forces a completion check
- Core pattern: second-chance gate (`stop_hook_active` flag) is clean and directly borrowable for zazig
- Don't borrow the transcript regex or `/tmp` counter for zazig — both break under multi-agent conditions
- Three missed patterns worth stealing: action-forcing block message, user-intent override clause, env-var operator cap
- Net verdict: small repo, 2-3 high-value ideas, the rest doesn't port cleanly to long-running autonomous agents

---

## Steal List

**1. `stop_hook_active` second-chance state machine** *(high impact)*
When the Stop hook fires, check if `stop_hook_active=true` in the payload. If it is AND no incomplete signals are found, allow the stop. If not, block and prompt. This "already had one review" gate prevents infinite loops without a counter. For zazig: adapt as a before-idle check in each agent's Stop hook — first fire prompts a completion sweep, second fire allows stop if clean.

**2. Before-idle completion gate backed by structured signals** *(high impact)*
The concept of a Stop hook that checks work state before allowing idle is directly valuable for zazig agents. The implementation should NOT use transcript regex (see "We Do Better") — instead check: (a) any Trello cards still In Progress? move them to Review first; (b) any TodoWrite tasks still pending? resolve them. Zazig already has the structured signals; this pattern gives us the gate.

**3. SKILL.md + hook as a bundle** *(medium impact)*
Taskmaster ships a `SKILL.md` alongside the hook so the agent is aware of its own constraint. Zazig's `hooks/` directory has shell scripts but no paired skills. Bundling a SKILL.md with `vpe-keepalive`, `bash-gate`, and future stop hooks makes agents aware of what's constraining them and why.

The deeper principle: **hooks are reactive, skills/manuals are proactive**. Without the skill, a hook fires and the agent is surprised — it reacts, sometimes poorly. With the skill, the agent understands the constraint and satisfies it before the hook fires. The hook becomes a safety net for forgetting, not the primary mechanism. This is why `vpe-keepalive` fires so often: VP-Eng doesn't know why it's being woken up, so it doesn't proactively update its state file. Document the contract → agents follow it → fewer hook firings, cleaner behavior.

For zazig specifically: the equivalent of SKILL.md+hook bundling is an `## Active Hooks` section in each role manual listing what hooks are active, what each checks, and how to satisfy it proactively. Added to all five role manuals as a result of this recon.

**4. Action-forcing block message** *(medium impact)*
The block reason at `check-completion.sh:74` is structured as a numbered DO THIS checklist, not "here's what's missing." Line 78 explicitly tells the agent: if the user changed their mind, treat that as resolved — don't force completion of abandoned work. The distinction between "force execution" vs "describe what's left" is directly applicable to zazig's dispatch prompts.

**5. Operator tunability via env cap** *(low-medium impact)*
`TASKMASTER_MAX` env var controls max continuation cycles. Clean operator safety valve: `TASKMASTER_MAX=1` for minimal, `TASKMASTER_MAX=0` for infinite. Zazig's hooks have no equivalent knob. Worth adding to any loop-guarding hooks.

**6. Continuation label with position** *(low impact)*
`TASKMASTER (2/10)` in the block message tells the agent where it is in its cycle. Low effort to add to any zazig hook prompt. Gives agents loop awareness.

---

## We Do Better

- **Structured task signals vs transcript regex** — Zazig has TaskCreate/TaskUpdate with explicit status fields. Taskmaster reads the last 50 lines of a transcript file with string matching for `"status": "in_progress"`. Under multi-agent, interleaved tmux output this will produce false positives and false negatives. Zazig's structured signals are strictly better.
- **Multi-instance state** — Taskmaster's `/tmp/taskmaster/{session_id}` counter is single-host, lost on restart. Zazig's state dir (`~/.local/share/zazig-{instance_id}/`) is persistent and instance-scoped.
- **Watchdog staleness** — Zazig's two-layer watchdog (session alive + state file freshness) is more robust than a simple counter. A hard cap that fails-open at max can allow premature stop even with unresolved signals.
- **Role-scoped hooks** — Zazig's hook ecosystem is more sophisticated (bash-gate, dcg, keepalive, pre-pr-gate). Taskmaster is a single generic hook with no role awareness.

---

## Architecture Observations

Taskmaster is cleanly scoped: one problem (premature stopping), one script, one SKILL.md, one installer. The `stop_hook_active` flag handling is the most interesting design decision — it turns a stateless hook event into a two-phase state machine without external state. The counter is an escape hatch, not the primary mechanism.

The transcript analysis is its weakest part and is clearly a workaround for not having structured task state. For an interactive single-session tool it's probably fine. For async multi-agent systems it's the wrong approach.

The installer pattern (jq-safe merge into settings.json with manual fallback) is solid and worth copying for any future zazig hook installers.

---

## Codex Second Opinion

**Model:** gpt-5.3-codex (xhigh reasoning)

Codex agreed on intent but pushed back on ordering:

- **HIGH risk flagged**: transcript-tail regex for zazig ("interleaved tmux logs and schema drift will create both false positives and false negatives") — demote to last-resort fallback
- **HIGH risk flagged**: `/tmp` counter for multi-instance ("single host only, weak for distributed agents/restarts") — don't copy directly
- **Three patterns I missed**: action-forcing checklist language (pushes execution not narration), explicit user-intent override clause, operator tunability via env cap

Codex's recommended steal order: stop_hook_active state machine → before-idle gate with structured signals → SKILL+hook bundles → continuation budget with escalation policy → label/telemetry → transcript tail as fallback only.

We agreed on this reorder in the final steal list above.

---

## Raw Notes

- Uninstall script removes hook entry from settings.json via jq — uses `del(.hooks.Stop[] | select(.hooks[].command | contains("check-completion.sh")))`. Worth borrowing as a pattern for any zazig hook uninstaller.
- `set -euo pipefail` throughout — good practice, zazig hooks should use this
- The block message explicitly says "do not just describe what is left, ACTUALLY DO IT" — this is the right framing for any continuation prompt
- Taskmaster doesn't handle the case where it's installed in a project-scoped settings file and a global one — hook may fire twice. Not a zazig concern but worth noting.
- No tests. The behavior relies entirely on the transcript signal parsing being correct. Another reason not to copy the regex approach.
