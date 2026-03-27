/**
 * Feature: Replace bundled projects in company-persistent-jobs with CLI-sourced projects
 *
 * AC1, AC2, AC3, AC6
 * Failure Cases 1, 2
 */

import { beforeAll, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');

const DAEMON_INDEX = 'packages/local-agent/src/index.ts';
const EXECUTOR = 'packages/local-agent/src/executor.ts';

function readRepoFile(relPath: string): string | null {
  const fullPath = path.join(REPO_ROOT, relPath);
  try {
    return fs.readFileSync(fullPath, 'utf-8');
  } catch {
    return null;
  }
}

function extractBlockFromToken(source: string, token: string): string {
  const tokenStart = source.indexOf(token);
  if (tokenStart === -1) return '';

  const openBrace = source.indexOf('{', tokenStart);
  if (openBrace === -1) return '';

  let depth = 0;
  for (let i = openBrace; i < source.length; i += 1) {
    const char = source[i];
    if (char === '{') depth += 1;
    if (char === '}') depth -= 1;
    if (depth === 0) {
      return source.slice(openBrace + 1, i);
    }
  }

  return '';
}

describe('local-agent daemon startup uses CLI-sourced projects', () => {
  let indexContent: string | null;

  beforeAll(() => {
    indexContent = readRepoFile(DAEMON_INDEX);
  });

  it('index.ts exists', () => {
    expect(indexContent, `${DAEMON_INDEX} must exist`).not.toBeNull();
  });

  it('defines a dedicated CLI project loader helper', () => {
    expect(indexContent).toMatch(/function\s+loadCompanyProjectsFromCli\s*\(/);
  });

  it('calls `zazig projects --company <id>` via execFileSync', () => {
    expect(indexContent).toMatch(
      /execFileSync\(\s*["']zazig["']\s*,\s*\[\s*["']projects["']\s*,\s*["']--company["']\s*,\s*companyId\s*\]/s,
    );
  });

  it('handles CLI failure by warning and returning an empty list (must not crash)', () => {
    const helperBody = extractBlockFromToken(indexContent ?? '', 'function loadCompanyProjectsFromCli');

    expect(helperBody).toContain('console.warn');
    expect(helperBody).toMatch(/zazig\s+projects/i);
    expect(helperBody).toMatch(/return\s*\[\s*\]/);
  });

  it('fetchPersistentAgentDefinitions now returns jobs only', () => {
    expect(indexContent).toMatch(
      /async\s+function\s+fetchPersistentAgentDefinitions\([\s\S]*?\)\s*:\s*Promise<\{\s*jobs:\s*PersistentAgentJobDefinition\[\]\s*\}>/,
    );
  });

  it('removes old company_projects/companyProjects/projects parsing from persistent jobs payload', () => {
    expect(indexContent).not.toContain('company_projects');
    expect(indexContent).not.toContain('companyProjects');
  });

  it('loads projects from CLI during daemon startup and seeds executor + repo bootstrap', () => {
    expect(indexContent).toMatch(/const\s+companyProjects\s*=\s*loadCompanyProjectsFromCli\(companyId\)/);
    expect(indexContent).toMatch(/executor\.setCompanyProjects\(companyProjects\)/);
    expect(indexContent).toContain('Discovered ${companyProjects.length} project repo(s)');
    expect(indexContent).not.toMatch(/\{\s*jobs\s*,\s*companyProjects\s*\}\s*=\s*await\s+fetchPersistentAgentDefinitions/);
  });
});

describe('executor master CI monitor refreshes projects from CLI each poll', () => {
  let executorContent: string | null;

  beforeAll(() => {
    executorContent = readRepoFile(EXECUTOR);
  });

  it('executor.ts exists', () => {
    expect(executorContent, `${EXECUTOR} must exist`).not.toBeNull();
  });

  it('monitorMasterCI refreshes company projects via CLI before reading repo_url', () => {
    const monitorBody = extractBlockFromToken(executorContent ?? '', 'private async monitorMasterCI()');

    expect(monitorBody).toMatch(/refreshCompanyProjectsFromCli|loadCompanyProjectsFromCli/);
    expect(monitorBody).toMatch(/setCompanyProjects|companyProjects\s*=\s*/);
    expect(monitorBody).toContain('/actions/runs?branch=master&event=push&per_page=1');
  });

  it('calls the CLI refresh helper no more than once per poll cycle (no retry loops)', () => {
    const monitorBody = extractBlockFromToken(executorContent ?? '', 'private async monitorMasterCI()');
    const refreshCalls = monitorBody.match(/refreshCompanyProjectsFromCli|loadCompanyProjectsFromCli/g) ?? [];

    expect(refreshCalls.length).toBe(1);
  });
});
