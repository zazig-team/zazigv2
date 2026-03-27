/**
 * Feature: MCP to CLI — replace send_message with zazig send-message-to-human
 *
 * AC2: zazig send-message-to-human --help prints usage with all flags documented
 * AC3: CLI calls the agent-message edge function and posts to the default Slack channel
 * AC4: CLI supports --conversation-id for threaded replies
 *
 * Tests FAIL against the current codebase (the command file does not exist yet).
 */

import { describe, it, expect, beforeAll } from 'vitest';
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

const COMMAND_FILE = 'packages/cli/src/commands/send-message-to-human.ts';
const INDEX_FILE = 'packages/cli/src/index.ts';

// ---------------------------------------------------------------------------
// AC2 + AC3 + AC4: CLI command file exists with correct structure
// ---------------------------------------------------------------------------

describe('CLI command: send-message-to-human.ts (AC2, AC3, AC4)', () => {
  let content: string | null;

  beforeAll(() => {
    content = readRepoFile(COMMAND_FILE);
  });

  it('file exists at packages/cli/src/commands/send-message-to-human.ts', () => {
    expect(
      content,
      `${COMMAND_FILE} not found. ` +
        'Create this file implementing the zazig send-message-to-human command.',
    ).not.toBeNull();
  });

  // AC2: --help documents all flags
  describe('--help output (AC2)', () => {
    it('implements a printHelp() function or --help flag handler', () => {
      expect(content).toMatch(/printHelp|--help|help.*flag/i);
    });

    it('documents --company flag in help text', () => {
      expect(content).toMatch(/--company/);
    });

    it('documents --text flag in help text', () => {
      expect(content).toMatch(/--text/);
    });

    it('documents --conversation-id flag in help text', () => {
      expect(content).toMatch(/--conversation-id/);
    });

    it('documents --job-id flag in help text', () => {
      expect(content).toMatch(/--job-id/);
    });
  });

  // AC3: Calls agent-message edge function
  describe('calls agent-message edge function (AC3)', () => {
    it('references the agent-message edge function endpoint', () => {
      expect(content).toContain('agent-message');
    });

    it('uses fetch() to call the edge function — not an MCP client', () => {
      expect(content).toContain('fetch(');
      expect(content).not.toMatch(/import.*mcp|mcpClient|zazig-messaging/i);
    });

    it('uses POST method', () => {
      expect(content).toMatch(/method:\s*['"]POST['"]/);
    });

    it('sends Authorization Bearer header', () => {
      expect(content).toMatch(/Authorization.*Bearer|Bearer.*accessToken|Bearer.*token/i);
    });

    it('sends apikey header', () => {
      expect(content).toContain('apikey');
    });

    it('requires --company flag (uuid, required)', () => {
      // company flag must be required — should appear in argument parsing and validation
      expect(content).toMatch(/company/);
    });

    it('requires --text flag (string, required)', () => {
      expect(content).toMatch(/['"` ]text['"`]/);
    });
  });

  // AC4: --conversation-id for threaded replies
  describe('--conversation-id support for threaded replies (AC4)', () => {
    it('parses --conversation-id flag', () => {
      expect(content).toMatch(/conversation.id|conversationId/i);
    });

    it('includes conversationId in the request body when provided', () => {
      // The CLI must forward the conversation-id to the edge function body
      expect(content).toMatch(/conversationId|conversation_id/);
    });

    it('--conversation-id is optional (defaults to company default channel)', () => {
      // The flag must be optional — the file should not throw/fail when it's absent.
      // Proxy: it should use a conditional or optional check before including it.
      expect(content).toMatch(
        /conversation.id.*\?|if.*conversation|optional|undefined|\.?conversationId/i,
      );
    });
  });

  // AC4 extension: --job-id for threading context
  describe('--job-id flag (optional threading context)', () => {
    it('parses --job-id flag', () => {
      expect(content).toMatch(/job.id|jobId/i);
    });
  });

  // General CLI hygiene
  describe('CLI hygiene', () => {
    it('exits 0 on success', () => {
      expect(content).toMatch(/process\.exit\(0\)|exitCode\s*=\s*0/);
    });

    it('writes error to stderr and exits 1 on failure', () => {
      expect(content).toMatch(/process\.stderr\.write|stderr/);
      expect(content).toMatch(/process\.exit\(1\)|exitCode\s*=\s*1/);
    });
  });
});

// ---------------------------------------------------------------------------
// AC2: CLI index.ts registers send-message-to-human command
// ---------------------------------------------------------------------------

describe('CLI index.ts registers send-message-to-human (AC2)', () => {
  let content: string | null;

  beforeAll(() => {
    content = readRepoFile(INDEX_FILE);
  });

  it('index.ts exists', () => {
    expect(content, `${INDEX_FILE} not found`).not.toBeNull();
  });

  it('registers "send-message-to-human" case in command dispatch', () => {
    expect(content).toMatch(/case\s+['"]send-message-to-human['"]/);
  });

  it('imports or references send-message-to-human command module', () => {
    expect(content).toMatch(/send-message-to-human/);
  });
});
