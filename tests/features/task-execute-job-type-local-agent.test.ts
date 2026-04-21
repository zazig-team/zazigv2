/**
 * Feature: task-execute job type — local agent pickup and lifecycle
 *
 * Static analysis tests covering:
 * - shared validator accepts cardType='task-execute'
 * - executor routes to task-executor and scratch workspace behavior
 * - ZAZIG_IDEA_ID propagation to workspace MCP env
 * - pollJob on_hold handling for task-execute jobs
 * - workspace MCP defaults for task-executor role
 */

import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');

const VALIDATORS_FILE = path.join(REPO_ROOT, 'packages', 'shared', 'src', 'validators.ts');
const EXECUTOR_FILE = path.join(REPO_ROOT, 'packages', 'local-agent', 'src', 'executor.ts');
const WORKSPACE_FILE = path.join(REPO_ROOT, 'packages', 'local-agent', 'src', 'workspace.ts');

function readSource(filePath: string): string {
  try {
    return fs.readFileSync(filePath, 'utf-8');
  } catch {
    return '';
  }
}

// ---------------------------------------------------------------------------
// AC: isStartJob() accepts cardType='task-execute'
// ---------------------------------------------------------------------------

describe("isStartJob() accepts messages with cardType='task-execute'", () => {
  let validatorsSource = '';

  beforeAll(() => {
    validatorsSource = readSource(VALIDATORS_FILE);
  });

  it('validators.ts exists and is non-empty', () => {
    expect(
      validatorsSource,
      'packages/shared/src/validators.ts is missing or empty.',
    ).not.toBe('');
  });

  it("isStartJob cardType allowlist includes 'task-execute'", () => {
    expect(validatorsSource).toMatch(/isStartJob[\s\S]{0,1800}task-execute/s);
  });
});

// ---------------------------------------------------------------------------
// AC: Executor routes task-execute to task-executor + scratch workspace
// ---------------------------------------------------------------------------

describe('Executor routes task-execute jobs to task-executor in scratch workspace flow', () => {
  let executorSource = '';

  beforeAll(() => {
    executorSource = readSource(EXECUTOR_FILE);
  });

  it('executor.ts exists and is non-empty', () => {
    expect(
      executorSource,
      'packages/local-agent/src/executor.ts is missing or empty.',
    ).not.toBe('');
  });

  it("branches on cardType === 'task-execute'", () => {
    expect(executorSource).toMatch(/cardType\s*===\s*["']task-execute["']/);
  });

  it("defaults task-execute jobs to role 'task-executor'", () => {
    expect(executorSource).toMatch(/isTaskExecuteJob[\s\S]{0,180}["']task-executor["']/s);
  });

  it('task-executor is marked as no-code-context role (scratch workspace path)', () => {
    expect(executorSource).toMatch(/NO_CODE_CONTEXT_ROLES[\s\S]{0,500}["']task-executor["']/s);
    expect(executorSource).toMatch(/buildScratchWorkspaceDir\(this\.companyId,\s*roleName,\s*jobId\)/);
  });
});

// ---------------------------------------------------------------------------
// AC: ZAZIG_IDEA_ID injected into workspace env from job context
// ---------------------------------------------------------------------------

describe('ZAZIG_IDEA_ID environment propagation for task-execute jobs', () => {
  let executorSource = '';
  let workspaceSource = '';

  beforeAll(() => {
    executorSource = readSource(EXECUTOR_FILE);
    workspaceSource = readSource(WORKSPACE_FILE);
  });

  it('executor resolves ideaId for task-execute jobs and forwards it to workspace setup', () => {
    expect(executorSource).toMatch(/isTaskExecuteJob/);
    expect(executorSource).toMatch(/resolveIdeaId\(msg\)/);
    expect(executorSource).toMatch(/setupJobWorkspace\([\s\S]{0,400}ideaId/s);
  });

  it('workspace generateMcpConfig maps ideaId to ZAZIG_IDEA_ID env variable', () => {
    expect(workspaceSource).toMatch(/ZAZIG_IDEA_ID/);
    expect(workspaceSource).toMatch(/\.\.\.\(env\.ideaId\s*\?\s*\{\s*ZAZIG_IDEA_ID:\s*env\.ideaId\s*\}\s*:\s*\{\}\)/);
  });
});

// ---------------------------------------------------------------------------
// AC: pollJob handles on_hold=true for task-execute (kill + settle)
// ---------------------------------------------------------------------------

describe('pollJob() handles on_hold for task-execute jobs', () => {
  let executorSource = '';

  beforeAll(() => {
    executorSource = readSource(EXECUTOR_FILE);
  });

  it('pollJob checks on_hold for idea-triage/task-execute cards', () => {
    expect(executorSource).toMatch(/pollJob[\s\S]{0,2200}job\.cardType === "idea-triage" \|\| job\.cardType === "task-execute"/s);
    expect(executorSource).toMatch(/select\(["']on_hold["']\)/);
  });

  it('on_hold=true path kills tmux session and settles the job', () => {
    const onHoldBlock = executorSource.match(
      /if\s*\(ideaRow\?\.on_hold\)[\s\S]{0,1400}/,
    );
    expect(onHoldBlock).not.toBeNull();
    expect(onHoldBlock![0]).toMatch(/killTmuxSession/);
    expect(onHoldBlock![0]).toMatch(/sendJobFailed/);
    expect(onHoldBlock![0]).toMatch(/settleJob/);
  });
});

// ---------------------------------------------------------------------------
// AC: task-executor MCP tools configured in workspace.ts
// ---------------------------------------------------------------------------

describe('workspace.ts task-executor MCP defaults', () => {
  let workspaceSource = '';

  beforeAll(() => {
    workspaceSource = readSource(WORKSPACE_FILE);
  });

  it('workspace.ts exists and is non-empty', () => {
    expect(
      workspaceSource,
      'packages/local-agent/src/workspace.ts is missing or empty.',
    ).not.toBe('');
  });

  it("defines TASK_EXECUTOR_MCP_TOOLS with ask_user and update_idea", () => {
    const taskToolsBlock = workspaceSource.match(
      /const TASK_EXECUTOR_MCP_TOOLS\s*=\s*\[[^\]]+\]/s,
    );
    expect(taskToolsBlock).not.toBeNull();
    expect(taskToolsBlock![0]).toMatch(/ask_user/);
    expect(taskToolsBlock![0]).toMatch(/update_idea/);
  });

  it("maps both 'task-executor' and legacy 'task-execute' role keys to task tools", () => {
    expect(workspaceSource).toMatch(/["']task-executor["']\s*:\s*TASK_EXECUTOR_MCP_TOOLS/);
    expect(workspaceSource).toMatch(/["']task-execute["']\s*:\s*TASK_EXECUTOR_MCP_TOOLS/);
  });
});
