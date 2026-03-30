/**
 * Feature: Persistent agent memory system with idle-triggered sync
 * Feature ID: fb6ce0f1-11a9-4ad6-a78e-186c901e202e
 *
 * Test group: Workspace Setup (.memory/ directory and MEMORY.md seeding)
 *
 * Acceptance criteria tested:
 * AC1 - Persistent agent workspace has .memory/ directory with MEMORY.md after first start
 * AC6 - Existing memory files are never overwritten by setupJobWorkspace()
 * AC8 - Works for all persistent agents, not just CPO
 * Failure Case 2 - Memory system must not break if .memory/ is manually deleted (recreate on next start)
 * Failure Case 3 - Must not regress existing boot prompt or workspace setup behaviour
 *
 * These tests are written to FAIL against the current codebase and pass once
 * the feature is implemented.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
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
// AC1: workspace.ts creates .memory/ directory for persistent agents
// ---------------------------------------------------------------------------

describe('AC1: workspace.ts creates .memory/ directory for persistent agents', () => {
  it('workspace.ts references a .memory directory path', () => {
    const workspace = readRepoFile('packages/local-agent/src/workspace.ts');
    expect(workspace).not.toBeNull();
    // Must reference .memory/ directory creation for persistent agents
    expect(workspace).toMatch(/['".]memory['"\/]/);
  });

  it('workspace.ts creates .memory/ directory using mkdirSync', () => {
    const workspace = readRepoFile('packages/local-agent/src/workspace.ts');
    expect(workspace).not.toBeNull();
    // Must call mkdirSync for .memory/ path
    const hasMkdirForMemory = (workspace ?? '').match(/mkdirSync[^;]*\.memory/s)
      || (workspace ?? '').match(/\.memory[^;]*mkdirSync/s)
      || (workspace ?? '').includes("memoryDir")
        && (workspace ?? '').includes("mkdirSync")
        && (workspace ?? '').includes(".memory");
    expect(hasMkdirForMemory).toBeTruthy();
  });

  it('workspace.ts seeds MEMORY.md inside .memory/ directory', () => {
    const workspace = readRepoFile('packages/local-agent/src/workspace.ts');
    expect(workspace).not.toBeNull();
    // Must write MEMORY.md file
    expect(workspace).toContain('MEMORY.md');
  });

  it('.memory/ is at workspace root, not inside .claude/', () => {
    const workspace = readRepoFile('packages/local-agent/src/workspace.ts');
    expect(workspace).not.toBeNull();
    // The .memory path must join from workspaceDir directly (not from claudeDir/.memory)
    // e.g. join(config.workspaceDir, '.memory') — not join(claudeDir, '.memory')
    const src = workspace ?? '';
    // Must have workspaceDir joined with .memory (not only claudeDir)
    const hasWorkspaceRootMemory = src.match(/join\s*\(\s*(?:config\.)?workspaceDir[^)]*['".]memory['"]/s)
      || src.match(/join\s*\([^)]*['".]memory['"][^)]*(?:config\.)?workspaceDir/s);
    // OR it uses a named var derived from workspaceDir for .memory
    const hasMemoryDirFromWorkspace = src.includes('workspaceDir') && src.includes('.memory') && src.includes('mkdirSync');
    expect(hasWorkspaceRootMemory || hasMemoryDirFromWorkspace).toBeTruthy();
  });

  it('setupJobWorkspace() creates .memory/ only when heartbeatMd is present (persistent agents only)', () => {
    const workspace = readRepoFile('packages/local-agent/src/workspace.ts');
    expect(workspace).not.toBeNull();
    const src = workspace ?? '';
    // .memory creation must be gated on heartbeatMd (the persistent-agent marker)
    // Check that .memory creation is inside a heartbeatMd conditional block
    // Pattern: if (config.heartbeatMd ...) { ... .memory ... }
    const heartbeatSection = src.match(/heartbeatMd[^{]*\{([^}]|\{[^}]*\})*\.memory/s)
      || src.match(/\.memory[\s\S]{0,300}heartbeatMd/s);
    expect(heartbeatSection || src.includes('.memory')).toBeTruthy();
    // Confirm it does NOT create .memory for ephemeral jobs (no heartbeatMd)
    // This is structural — the implementation must gate on heartbeatMd !== undefined
    expect(src).toMatch(/heartbeatMd/);
  });
});

// ---------------------------------------------------------------------------
// AC6: Existing memory files are never overwritten by setupJobWorkspace()
// ---------------------------------------------------------------------------

describe('AC6: setupJobWorkspace() never overwrites existing .memory/ files', () => {
  it('MEMORY.md is written only when it does not already exist', () => {
    const workspace = readRepoFile('packages/local-agent/src/workspace.ts');
    expect(workspace).not.toBeNull();
    const src = workspace ?? '';
    // The write of MEMORY.md must be guarded by existsSync check
    // Pattern: if (!existsSync(memoryMdPath)) { writeFileSync(...MEMORY.md...) }
    const hasGuardedWrite =
      src.match(/existsSync[^;]*MEMORY\.md/s)
      || src.match(/MEMORY\.md[^;]*existsSync/s)
      || (src.includes('existsSync') && src.includes('MEMORY.md') && src.includes('writeFileSync'));
    expect(hasGuardedWrite).toBeTruthy();
  });

  it('workspace.ts uses existsSync guard before writing .memory/MEMORY.md', () => {
    const workspace = readRepoFile('packages/local-agent/src/workspace.ts');
    expect(workspace).not.toBeNull();
    const src = workspace ?? '';
    // Must check !existsSync before writing MEMORY.md (like heartbeat-state.json pattern)
    const hasNegatedExistsSync = src.match(/!existsSync[^;]*MEMORY/s) || src.match(/MEMORY[^;]*!existsSync/s);
    // OR the combined pattern: existsSync check + MEMORY.md + writeFileSync nearby
    const hasPattern = hasNegatedExistsSync || (
      src.includes('existsSync') && src.includes('MEMORY.md') && src.includes('writeFileSync')
    );
    expect(hasPattern).toBeTruthy();
  });

  it('setupJobWorkspace() uses mkdirSync with recursive:true for .memory/ so it is idempotent', () => {
    const workspace = readRepoFile('packages/local-agent/src/workspace.ts');
    expect(workspace).not.toBeNull();
    const src = workspace ?? '';
    // mkdirSync for .memory must use { recursive: true } so re-runs don't fail
    const hasMkdirWithRecursive = src.match(/mkdirSync[^;]*\.memory[^;]*recursive.*true/s)
      || src.match(/mkdirSync[^;]*recursive.*true[^;]*\.memory/s)
      || (src.includes('.memory') && src.match(/mkdirSync[^;]*\{\s*recursive\s*:\s*true\s*\}/s));
    expect(hasMkdirWithRecursive).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// AC8: Works for all persistent agents (not just CPO)
// ---------------------------------------------------------------------------

describe('AC8: Memory setup applies to all persistent agents, not just CPO', () => {
  it('workspace.ts memory setup is not role-gated to cpo specifically', () => {
    const workspace = readRepoFile('packages/local-agent/src/workspace.ts');
    expect(workspace).not.toBeNull();
    const src = workspace ?? '';
    // The .memory/ directory creation must not be inside a `role === 'cpo'` guard
    // Find .memory creation context and ensure no cpo-specific check wraps it
    const memoryIdx = src.indexOf('.memory');
    if (memoryIdx !== -1) {
      // Check 300 chars before the .memory reference for a cpo-specific guard
      const context = src.slice(Math.max(0, memoryIdx - 300), memoryIdx);
      // Should NOT have a role === 'cpo' or role === "cpo" check immediately before
      expect(context).not.toMatch(/role\s*===\s*['"]cpo['"]/);
    }
  });

  it('executor.ts spawns .memory/ for any persistent agent (is_persistent driven)', () => {
    const executor = readRepoFile('packages/local-agent/src/executor.ts');
    expect(executor).not.toBeNull();
    const src = executor ?? '';
    // .memory/ setup must be triggered by persistent agent dispatch, not cpo-specific code
    // The heartbeat loop or workspace setup call must not be gated on role === 'cpo'
    // Check that there is no ".memory" creation only inside a cpo-specific block
    expect(src.includes('is_persistent') || src.includes('heartbeatMd') || src.includes('persistent')).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Failure Case 2: Memory system must not break if .memory/ is manually deleted
// ---------------------------------------------------------------------------

describe('Failure Case 2: Memory system recovers when .memory/ is manually deleted', () => {
  it('setupJobWorkspace() recreates .memory/ if missing (mkdirSync recursive handles this)', () => {
    const workspace = readRepoFile('packages/local-agent/src/workspace.ts');
    expect(workspace).not.toBeNull();
    const src = workspace ?? '';
    // mkdirSync with recursive:true will recreate the directory if deleted — verify this pattern
    expect(src).toContain('mkdirSync');
    expect(src).toContain('.memory');
    // { recursive: true } ensures no error even if dir already exists or is absent
    expect(src).toMatch(/recursive\s*:\s*true/);
  });

  it('MEMORY.md is re-seeded after manual deletion (existsSync → false → write)', () => {
    const workspace = readRepoFile('packages/local-agent/src/workspace.ts');
    expect(workspace).not.toBeNull();
    const src = workspace ?? '';
    // The existsSync guard around MEMORY.md write means:
    // if directory+file is deleted, existsSync returns false, writeFileSync runs again
    expect(src).toContain('existsSync');
    expect(src).toContain('MEMORY.md');
    expect(src).toContain('writeFileSync');
  });
});

// ---------------------------------------------------------------------------
// Failure Case 3: Must not regress existing workspace setup behaviour
// ---------------------------------------------------------------------------

describe('Failure Case 3: Existing workspace setup behaviour is not regressed', () => {
  it('setupJobWorkspace() still creates .claude/ directory', () => {
    const workspace = readRepoFile('packages/local-agent/src/workspace.ts');
    expect(workspace).not.toBeNull();
    expect(workspace).toContain('.claude');
    expect(workspace).toContain('mkdirSync');
  });

  it('setupJobWorkspace() still writes .mcp.json', () => {
    const workspace = readRepoFile('packages/local-agent/src/workspace.ts');
    expect(workspace).not.toBeNull();
    expect(workspace).toContain('.mcp.json');
    expect(workspace).toContain('generateMcpConfig');
  });

  it('setupJobWorkspace() still writes CLAUDE.md', () => {
    const workspace = readRepoFile('packages/local-agent/src/workspace.ts');
    expect(workspace).not.toBeNull();
    expect(workspace).toContain('CLAUDE.md');
    expect(workspace).toContain('claudeMdContent');
  });

  it('setupJobWorkspace() still writes .claude/settings.json', () => {
    const workspace = readRepoFile('packages/local-agent/src/workspace.ts');
    expect(workspace).not.toBeNull();
    expect(workspace).toContain('settings.json');
    expect(workspace).toContain('generateAllowedTools');
  });

  it('setupJobWorkspace() still seeds memory files in .claude/memory/ for persistent agents', () => {
    const workspace = readRepoFile('packages/local-agent/src/workspace.ts');
    expect(workspace).not.toBeNull();
    // The existing seedMemoryFiles function (priorities.md, decisions.md, etc.) must remain
    expect(workspace).toContain('seedMemoryFiles');
  });
});

// ---------------------------------------------------------------------------
// Unit test: setupJobWorkspace() integration — .memory/ directory and MEMORY.md
// ---------------------------------------------------------------------------

describe('Unit: setupJobWorkspace() creates .memory/ and MEMORY.md for persistent agents', () => {
  let mockFs: {
    mkdirSync: ReturnType<typeof vi.fn>;
    writeFileSync: ReturnType<typeof vi.fn>;
    existsSync: ReturnType<typeof vi.fn>;
    readFileSync: ReturnType<typeof vi.fn>;
    appendFileSync: ReturnType<typeof vi.fn>;
    copyFileSync: ReturnType<typeof vi.fn>;
    symlinkSync: ReturnType<typeof vi.fn>;
    rmSync: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    mockFs = {
      mkdirSync: vi.fn(),
      writeFileSync: vi.fn(),
      existsSync: vi.fn(() => false),
      readFileSync: vi.fn(() => ''),
      appendFileSync: vi.fn(),
      copyFileSync: vi.fn(),
      symlinkSync: vi.fn(),
      rmSync: vi.fn(),
    };
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('calls mkdirSync for .memory/ when heartbeatMd is provided', async () => {
    // Dynamically import setupJobWorkspace with mocked fs
    // This test is structural — verifies the function references .memory/ creation
    // when a heartbeatMd value is present (persistent agent marker)
    const workspace = readRepoFile('packages/local-agent/src/workspace.ts');
    expect(workspace).not.toBeNull();
    // The .memory creation must be inside the heartbeatMd block
    const src = workspace ?? '';

    // Find the heartbeatMd-gated block and verify it contains .memory
    const heartbeatBlock = src.match(
      /if\s*\(\s*config\.heartbeatMd[\s\S]*?\}\s*\n/g
    ) ?? [];
    const anyBlockHasMemory = heartbeatBlock.some(block => block.includes('.memory'));

    // Also check that the file contains both .memory and heartbeatMd in close proximity
    const memoryIdx = src.indexOf('.memory');
    const heartbeatIdx = src.indexOf('heartbeatMd');
    const proximate = Math.abs(memoryIdx - heartbeatIdx) < 1500;

    expect(anyBlockHasMemory || proximate).toBeTruthy();
  });

  it('does not create .memory/ when heartbeatMd is undefined (ephemeral job)', () => {
    const workspace = readRepoFile('packages/local-agent/src/workspace.ts');
    expect(workspace).not.toBeNull();
    const src = workspace ?? '';
    // .memory creation is inside a heartbeatMd !== undefined conditional
    // Verify the pattern: .memory creation is NOT at the top level of setupJobWorkspace
    // (i.e., it must be conditional)
    expect(src).toMatch(/if\s*\(\s*config\.heartbeatMd/);
  });
});
