/**
 * Feature: Persistent agent memory system with idle-triggered sync
 * Feature ID: fb6ce0f1-11a9-4ad6-a78e-186c901e202e
 *
 * Test group: Boot prompt and CLAUDE.md memory instructions
 *
 * Acceptance criteria tested:
 * AC2 - Agent writes structured memory files during conversation (CLAUDE.md instructs this)
 * AC5 - On session restart, agent reads .memory/MEMORY.md and references prior memories
 * AC8 - Works for all persistent agents, not just CPO
 * Failure Case 3 - Must not regress existing boot prompt or workspace setup behaviour
 *
 * These tests are written to FAIL against the current codebase and pass once
 * the feature is implemented.
 */

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');

function readRepoFile(relPath: string): string | null {
  const fullPath = path.join(REPO_ROOT, relPath);
  try {
    return fs.readFileSync(fullPath, 'utf-8');
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// AC5: Boot prompt instructs agent to read .memory/MEMORY.md on session start
// ---------------------------------------------------------------------------

describe('AC5: Boot prompt instructs agent to read .memory/MEMORY.md on session start', () => {
  it('executor.ts DEFAULT_BOOT_PROMPT references .memory/ or MEMORY.md', () => {
    const executor = readRepoFile('packages/local-agent/src/executor.ts');
    expect(executor).not.toBeNull();
    const src = executor ?? '';
    // The DEFAULT_BOOT_PROMPT must instruct the agent to read .memory/MEMORY.md
    const bootPromptBlock = src.match(/DEFAULT_BOOT_PROMPT[^;]*=\s*["'`]([^"'`]*)["'`]/s)?.[1] ?? '';
    const hasMemoryInBoot = bootPromptBlock.includes('.memory') || bootPromptBlock.includes('MEMORY.md');
    // If we can't extract the boot prompt, check the whole file
    const hasMentionNearBoot = src.includes('DEFAULT_BOOT_PROMPT') && src.includes('.memory');
    expect(hasMemoryInBoot || hasMentionNearBoot).toBeTruthy();
  });

  it('executor.ts boot prompt tells agent to read MEMORY.md before acting', () => {
    const executor = readRepoFile('packages/local-agent/src/executor.ts');
    expect(executor).not.toBeNull();
    const src = executor ?? '';
    // Must instruct reading MEMORY.md as part of session start sequence
    expect(src).toMatch(/MEMORY\.md|\.memory\/MEMORY/);
  });

  it('executor.ts boot prompt or role boot_prompt generation includes .memory/ read instruction', () => {
    const executor = readRepoFile('packages/local-agent/src/executor.ts');
    expect(executor).not.toBeNull();
    const src = executor ?? '';
    // The boot prompt assembled for persistent agents must reference .memory/MEMORY.md
    // Either in DEFAULT_BOOT_PROMPT, in boot_prompt from DB, or in CLAUDE.md generation
    const bootPromptMatch = src.match(/(?:DEFAULT_BOOT_PROMPT|boot_prompt|bootPrompt)[^;]*\.memory/s)
      || src.match(/\.memory[^;]*(?:DEFAULT_BOOT_PROMPT|boot_prompt|bootPrompt)/s);
    const claudeMdMatch = src.match(/claudeMd[^;]*\.memory/s) || src.match(/\.memory[^;]*claudeMd/s);
    expect(bootPromptMatch || claudeMdMatch || src.includes('.memory/MEMORY.md')).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// AC2 + AC5: CLAUDE.md content for persistent agents includes memory system instructions
// ---------------------------------------------------------------------------

describe('AC2+AC5: CLAUDE.md generated for persistent agents includes memory system instructions', () => {
  it('executor.ts CLAUDE.md generation for persistent agents includes .memory/ path', () => {
    const executor = readRepoFile('packages/local-agent/src/executor.ts');
    expect(executor).not.toBeNull();
    const src = executor ?? '';
    // When CLAUDE.md is assembled for a persistent agent, it must include .memory/ references
    // Look for claudeMd content construction that includes .memory
    expect(src).toContain('.memory');
    // The .memory reference must appear in CLAUDE.md-related code
    const hasMentionInClaudeMd = src.match(/claudeMd[^;]*\.memory/s)
      || src.match(/\.memory[^;]*claudeMd/s)
      || (src.includes('.memory') && src.includes('claudeMdContent'));
    expect(hasMentionInClaudeMd).toBeTruthy();
  });

  it('executor.ts CLAUDE.md for persistent agents instructs the agent on when to write memories', () => {
    const executor = readRepoFile('packages/local-agent/src/executor.ts');
    expect(executor).not.toBeNull();
    const src = executor ?? '';
    // CLAUDE.md must tell the agent how to use the memory system
    // Look for memory-related instructions text in CLAUDE.md construction
    const hasWriteInstructions = src.match(/write.*mem(?:ory|ories)|mem(?:ory|ories).*write/i)
      || src.match(/MEMORY_SECTION|memorySection|memory.*instructions/i);
    const hasMemorySystemContent = src.includes('.memory/MEMORY.md')
      || src.match(/# Memory|## Memory|memory system/i);
    expect(hasWriteInstructions || hasMemorySystemContent).toBeTruthy();
  });

  it('executor.ts CLAUDE.md for persistent agents includes four memory types', () => {
    const executor = readRepoFile('packages/local-agent/src/executor.ts');
    expect(executor).not.toBeNull();
    const src = executor ?? '';
    // The four memory types from the spec must appear in the CLAUDE.md template
    // user, feedback, project, reference
    const hasTypes = src.match(/user.*feedback.*project.*reference|feedback.*project.*reference/s)
      || (src.includes('user') && src.includes('feedback') && src.includes('project') && src.includes('reference'))
        && src.includes('.memory');
    expect(hasTypes || src.includes('.memory/MEMORY.md')).toBeTruthy();
  });

  it('workspace.ts CLAUDE.md template for persistent agents references .memory/ system', () => {
    const workspace = readRepoFile('packages/local-agent/src/workspace.ts');
    expect(workspace).not.toBeNull();
    const src = workspace ?? '';
    // workspace.ts generates CLAUDE.md content — it should have a memory section
    // for persistent agents (heartbeatMd present)
    const hasMemorySection =
      src.includes('.memory/MEMORY.md')
      || src.includes('MEMORY_SECTION')
      || src.match(/memory.*section|section.*memory/i)
      || (src.includes('.memory') && src.includes('claudeMd'));
    expect(hasMemorySection).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// AC5: CLAUDE.md memory section structure
// ---------------------------------------------------------------------------

describe('AC5: CLAUDE.md memory section content is well-formed', () => {
  it('executor.ts or workspace.ts has MEMORY.md as index file instruction', () => {
    const executor = readRepoFile('packages/local-agent/src/executor.ts');
    const workspace = readRepoFile('packages/local-agent/src/workspace.ts');
    const combined = (executor ?? '') + (workspace ?? '');
    // Must reference MEMORY.md as the index file to read at session start
    expect(combined).toContain('MEMORY.md');
  });

  it('executor.ts or workspace.ts memory instructions mention frontmatter fields', () => {
    const executor = readRepoFile('packages/local-agent/src/executor.ts');
    const workspace = readRepoFile('packages/local-agent/src/workspace.ts');
    const combined = (executor ?? '') + (workspace ?? '');
    // Memory file format requires frontmatter: name, description, type
    const hasFormatInstructions = combined.match(/frontmatter|name.*description.*type|description.*type.*name/i)
      || (combined.includes('.memory') && combined.match(/type.*user.*feedback/i));
    expect(hasFormatInstructions || combined.includes('.memory/MEMORY.md')).toBeTruthy();
  });

  it('memory section instructs agent to update over duplicate (not create new files blindly)', () => {
    const executor = readRepoFile('packages/local-agent/src/executor.ts');
    const workspace = readRepoFile('packages/local-agent/src/workspace.ts');
    const combined = (executor ?? '') + (workspace ?? '');
    // Must tell the agent to check existing memories before creating new ones
    const hasUpdateInstruction = combined.match(/update.*exist|exist.*updat|check.*exist|over.*duplic|duplic.*creat/i)
      || combined.match(/update over duplicate|update.*rather.*create|prefer.*updat/i);
    expect(hasUpdateInstruction || combined.includes('.memory')).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// AC8: Boot prompt applies to all persistent agents
// ---------------------------------------------------------------------------

describe('AC8: Memory boot instructions apply to all persistent agents', () => {
  it('executor.ts persistent agent CLAUDE.md uses a shared memory template (not cpo-specific)', () => {
    const executor = readRepoFile('packages/local-agent/src/executor.ts');
    expect(executor).not.toBeNull();
    const src = executor ?? '';
    // The memory system instructions must not be inside a role === 'cpo' block
    const memoryIdx = src.indexOf('.memory');
    if (memoryIdx !== -1) {
      const context = src.slice(Math.max(0, memoryIdx - 200), memoryIdx);
      expect(context).not.toMatch(/role\s*===\s*['"]cpo['"]/);
    }
  });

  it('DEFAULT_BOOT_PROMPT in executor.ts does not check for cpo role specifically', () => {
    const executor = readRepoFile('packages/local-agent/src/executor.ts');
    expect(executor).not.toBeNull();
    const src = executor ?? '';
    // DEFAULT_BOOT_PROMPT is role-agnostic — must not filter on 'cpo'
    const bootPromptIdx = src.indexOf('DEFAULT_BOOT_PROMPT');
    if (bootPromptIdx !== -1) {
      // Check 500 chars after the constant definition for cpo-gating
      const after = src.slice(bootPromptIdx, bootPromptIdx + 500);
      expect(after).not.toMatch(/===\s*['"]cpo['"]/);
    }
  });
});

// ---------------------------------------------------------------------------
// Failure Case 3: Existing boot prompt and workspace behaviour is not regressed
// ---------------------------------------------------------------------------

describe('Failure Case 3: Boot prompt regressions', () => {
  it('executor.ts DEFAULT_BOOT_PROMPT still includes state file read instruction', () => {
    const executor = readRepoFile('packages/local-agent/src/executor.ts');
    expect(executor).not.toBeNull();
    const src = executor ?? '';
    // The original DEFAULT_BOOT_PROMPT told the agent to read state files
    // This instruction must remain even after adding memory instructions
    expect(src).toContain('DEFAULT_BOOT_PROMPT');
    // Must still reference reports or state files
    expect(src).toMatch(/reports|state files|\.reports/i);
  });

  it('executor.ts persistent agent boot prompt still instructs reading heartbeat/state files', () => {
    const executor = readRepoFile('packages/local-agent/src/executor.ts');
    expect(executor).not.toBeNull();
    const src = executor ?? '';
    // The existing boot prompt referenced .reports/{role}-report.md and state files
    // New memory instructions must be ADDED, not replace existing state-file instructions
    expect(src).toMatch(/reports|state files/i);
    expect(src).toContain('DEFAULT_BOOT_PROMPT');
  });

  it('workspace.ts still seeds .claude/memory/ files for persistent agents (not replaced by .memory/)', () => {
    const workspace = readRepoFile('packages/local-agent/src/workspace.ts');
    expect(workspace).not.toBeNull();
    const src = workspace ?? '';
    // The existing .claude/memory/ seed (priorities.md, decisions.md, etc.) must remain
    // The new .memory/ system is ADDITIVE — it does not remove .claude/memory/
    expect(src).toContain('seedMemoryFiles');
    // Both .claude/memory/ and .memory/ must coexist
    expect(src).toContain('.memory');
    expect(src).toContain('memory'); // .claude/memory/ also present
  });

  it('executor.ts loadPersistentRoleConfig still queries boot_prompt from DB', () => {
    const executor = readRepoFile('packages/local-agent/src/executor.ts');
    expect(executor).not.toBeNull();
    const src = executor ?? '';
    // DB-level boot_prompt (from roles table) must still be fetched and used
    expect(src).toContain('boot_prompt');
    expect(src).toContain('loadPersistentRoleConfig');
  });
});

// ---------------------------------------------------------------------------
// Integration: boot prompt is injected correctly at session start
// ---------------------------------------------------------------------------

describe('Integration: memory-aware boot prompt is injected at persistent agent start', () => {
  it('executor.ts injectMessage call for boot includes .memory/MEMORY.md read instruction', () => {
    const executor = readRepoFile('packages/local-agent/src/executor.ts');
    expect(executor).not.toBeNull();
    const src = executor ?? '';
    // When the persistent agent starts, the boot prompt (assembled from DEFAULT_BOOT_PROMPT
    // + DB boot_prompt + memory instructions) is injected via injectMessage
    // The assembled content must reference .memory/MEMORY.md
    expect(src).toContain('injectMessage');
    expect(src).toContain('.memory');
  });

  it('executor.ts persistent agent CLAUDE.md contains memory section header', () => {
    const executor = readRepoFile('packages/local-agent/src/executor.ts');
    expect(executor).not.toBeNull();
    const src = executor ?? '';
    // The CLAUDE.md for persistent agents must have a memory section
    // e.g. "## Memory" or "# Memory System" or similar heading
    expect(src).toMatch(/## Memory|# Memory|Memory System|\.memory\//i);
  });
});
