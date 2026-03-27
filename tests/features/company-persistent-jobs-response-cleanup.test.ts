/**
 * Feature: Replace bundled projects in company-persistent-jobs with CLI-sourced projects
 *
 * AC4, AC5
 */

import { beforeAll, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');

const EDGE_FILE = 'supabase/functions/company-persistent-jobs/index.ts';

function readRepoFile(relPath: string): string | null {
  const fullPath = path.join(REPO_ROOT, relPath);
  try {
    return fs.readFileSync(fullPath, 'utf-8');
  } catch {
    return null;
  }
}

function extractMappedJobObject(source: string): string {
  const mapStart = source.indexOf('const result = roles.map');
  if (mapStart === -1) return '';

  const returnStart = source.indexOf('return {', mapStart);
  if (returnStart === -1) return '';

  const openBrace = source.indexOf('{', returnStart);
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

describe('company-persistent-jobs response shape cleanup', () => {
  let content: string | null;

  beforeAll(() => {
    content = readRepoFile(EDGE_FILE);
  });

  it('edge function file exists', () => {
    expect(content, `${EDGE_FILE} not found`).not.toBeNull();
  });

  it('still queries active projects from DB for prompt assembly', () => {
    expect(content).toContain('.from("projects")');
    expect(content).toContain('.eq("status", "active")');
  });

  it('no longer includes projects on each returned job object', () => {
    const mappedJobObject = extractMappedJobObject(content ?? '');

    expect(mappedJobObject).not.toMatch(/\bprojects\s*:/);
  });

  it('still includes project/repo prompt sections in prompt_stack_minus_skills', () => {
    expect(content).toContain('### Projects');
    expect(content).toContain('### Local Repos');
    expect(content).toContain('Repo path: `./repos/${p.name}/`');
    expect(content).toContain('git -C ./repos/${p.name} log master..{branch}');
    expect(content).toContain('git -C ./repos/${p.name} show {branch}:path/to/file');
    expect(content).toContain('git -C ./repos/${p.name} status');
    expect(content).toContain('parts.push(companyContext);');
  });
});
