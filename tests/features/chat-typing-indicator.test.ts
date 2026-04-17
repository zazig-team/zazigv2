/**
 * Feature: Chat Typing Indicator (featureId: 92f81468-fb92-41ec-8cc5-2f55fb18e0cd)
 *
 * Tests encode the expected acceptance criteria for the Chat Typing Indicator feature.
 * These tests are written to FAIL against the current codebase — the feature does not
 * exist yet. They will pass once the feature is implemented.
 *
 * Acceptance criteria (inferred from feature title and system patterns):
 *
 * AC1 — Schema: A migration adds typing indicator support to the messages/conversations
 *        system (new table or column).
 * AC2 — Utility: A typing indicator utility module exists that manages debounced
 *        typing state, with set/clear/timeout semantics.
 * AC3 — Protocol: The message protocol exports a TypingIndicator message type
 *        (or equivalent) that the webui and agent can exchange.
 * AC4 — Realtime: Typing indicator state updates are published over Supabase Realtime
 *        so that all subscribers receive live typing status changes.
 * AC5 — Timeout: The typing indicator automatically expires after a configurable
 *        idle timeout (default: 5 seconds) with no further keystrokes.
 * AC6 — Send clears indicator: Submitting a message clears the typing indicator
 *        for that conversation immediately.
 */

import { describe, it, expect, beforeAll, vi, afterEach } from 'vitest';
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

function findMigration(pattern: RegExp): string | null {
  const migrationsDir = path.join(REPO_ROOT, 'supabase/migrations');
  let files: string[];
  try {
    files = fs.readdirSync(migrationsDir);
  } catch {
    return null;
  }
  for (const f of files.sort()) {
    const content = readRepoFile(`supabase/migrations/${f}`);
    if (content && pattern.test(content)) return content;
  }
  return null;
}

// ---------------------------------------------------------------------------
// AC1 — Schema: migration adds typing indicator support
// ---------------------------------------------------------------------------

describe('Chat Typing Indicator — AC1: Database schema', () => {
  it('a migration exists that creates or alters a typing_indicators table or adds a typing column', () => {
    const migration = findMigration(/typing_indicator|is_typing|typing_at|typing_state/i);
    expect(
      migration,
      'No migration found that adds typing indicator support. ' +
        'Create a migration that adds a typing_indicators table or typing column.',
    ).not.toBeNull();
  });

  it('the typing indicator schema includes a conversation_id or job_id reference', () => {
    const migration = findMigration(/typing_indicator|is_typing|typing_at/i);
    expect(migration).not.toBeNull();
    expect(migration).toMatch(/conversation_id|job_id/i);
  });

  it('the typing indicator schema includes a participant identifier (role or user_id)', () => {
    const migration = findMigration(/typing_indicator|is_typing|typing_at/i);
    expect(migration).not.toBeNull();
    expect(migration).toMatch(/role|user_id|participant/i);
  });

  it('the typing indicator schema includes a timestamp column for expiry tracking', () => {
    const migration = findMigration(/typing_indicator|is_typing|typing_at/i);
    expect(migration).not.toBeNull();
    expect(migration).toMatch(/typed_at|typing_at|updated_at|expires_at|timestamp/i);
  });

  it('the typing_indicators table is added to the Supabase Realtime publication', () => {
    const migration = findMigration(/typing_indicator|is_typing|typing_at/i);
    expect(migration).not.toBeNull();
    expect(migration).toMatch(
      /supabase_realtime.*typing|typing.*supabase_realtime|ADD TABLE.*typing/i,
    );
  });
});

// ---------------------------------------------------------------------------
// AC2 — Utility: typing indicator module with set/clear/timeout semantics
// ---------------------------------------------------------------------------

const TYPING_UTIL_CANDIDATES = [
  'packages/shared/src/typing-indicator.ts',
  'packages/webui/src/lib/typing-indicator.ts',
  'packages/webui/src/hooks/useTypingIndicator.ts',
  'packages/cli/src/lib/typing-indicator.ts',
];

describe('Chat Typing Indicator — AC2: Utility module', () => {
  let content: string | null = null;
  let foundPath: string | null = null;

  beforeAll(() => {
    for (const candidate of TYPING_UTIL_CANDIDATES) {
      const c = readRepoFile(candidate);
      if (c) {
        content = c;
        foundPath = candidate;
        break;
      }
    }
  });

  it('a typing indicator utility module or hook exists', () => {
    expect(
      content,
      `No typing indicator module found. Expected one of:\n${TYPING_UTIL_CANDIDATES.join('\n')}`,
    ).not.toBeNull();
  });

  it('exports a function or class to signal that typing has started', () => {
    expect(content).toMatch(
      /setTyping|startTyping|notifyTyping|markTyping|typingStarted|export.*typing/i,
    );
  });

  it('exports a function or class to clear or stop the typing indicator', () => {
    expect(content).toMatch(
      /clearTyping|stopTyping|typingStopped|resetTyping|clearIndicator/i,
    );
  });

  it('implements debounce or idle-timeout logic (AC5: auto-expiry after idle)', () => {
    expect(content).toMatch(/debounce|setTimeout|clearTimeout|idle.*timeout|timeout.*idle/i);
  });

  it('references a default idle timeout value (e.g. 5000 ms)', () => {
    // 5000ms is the standard typing indicator timeout
    expect(content).toMatch(/5000|5_000|TYPING_TIMEOUT|IDLE_TIMEOUT|DEFAULT_TIMEOUT/i);
  });
});

// ---------------------------------------------------------------------------
// AC3 — Protocol: message protocol includes typing indicator type
// ---------------------------------------------------------------------------

const MESSAGES_TS = 'packages/shared/src/messages.ts';

describe('Chat Typing Indicator — AC3: Protocol message type', () => {
  let content: string | null;

  beforeAll(() => {
    content = readRepoFile(MESSAGES_TS);
  });

  it('messages.ts exists (baseline sanity)', () => {
    expect(content).not.toBeNull();
  });

  it('exports a TypingIndicator type or typing_indicator message type', () => {
    expect(content).toMatch(
      /TypingIndicator|typing_indicator|TypingState|TypingStatus/i,
    );
  });

  it('the typing indicator message includes a conversationId or jobId field', () => {
    expect(content).toMatch(/conversationId|conversation_id|jobId|job_id/);
  });

  it('the typing indicator message includes a role or participant field', () => {
    expect(content).toMatch(/role|participant|from|userId/);
  });

  it('the typing indicator message includes an isTyping boolean field', () => {
    expect(content).toMatch(/isTyping|is_typing|typing:\s*boolean/);
  });
});

// ---------------------------------------------------------------------------
// AC4 — Realtime: RLS policy allows realtime subscription to typing indicators
// ---------------------------------------------------------------------------

describe('Chat Typing Indicator — AC4: Realtime policy', () => {
  it('a migration adds RLS policy for authenticated read on typing_indicators', () => {
    const migration = findMigration(/typing_indicator|is_typing/i);
    expect(migration).not.toBeNull();
    expect(migration).toMatch(
      /POLICY.*typing|authenticated.*typing|typing.*authenticated|ROW LEVEL SECURITY.*typing/i,
    );
  });
});

// ---------------------------------------------------------------------------
// AC5 — Timeout: typing indicator self-clears after idle period (unit logic)
// ---------------------------------------------------------------------------

describe('Chat Typing Indicator — AC5: Auto-expiry timeout (pure logic)', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('typing indicator clears itself after idle timeout using timers', async () => {
    vi.useFakeTimers();

    // Dynamically import the typing indicator utility — will fail until implemented
    let mod: { createTypingIndicator?: (opts: { timeoutMs: number; onExpire: () => void }) => { setTyping: () => void; clearTyping: () => void; dispose: () => void } };
    try {
      mod = await import('../../packages/shared/src/typing-indicator.js');
    } catch {
      try {
        mod = await import('../../packages/webui/src/lib/typing-indicator.js');
      } catch {
        // Module does not exist yet — test will fail as expected
        expect(
          null,
          'typing-indicator module not found. Implement it at packages/shared/src/typing-indicator.ts or packages/webui/src/lib/typing-indicator.ts',
        ).not.toBeNull();
        return;
      }
    }

    expect(mod.createTypingIndicator, 'createTypingIndicator must be exported').toBeDefined();

    const onExpire = vi.fn();
    const indicator = mod.createTypingIndicator!({ timeoutMs: 5000, onExpire });

    indicator.setTyping();
    expect(onExpire).not.toHaveBeenCalled();

    // Advance past the idle timeout
    await vi.advanceTimersByTimeAsync(5100);
    expect(onExpire).toHaveBeenCalledOnce();

    indicator.dispose();
  });

  it('typing indicator resets the timeout when setTyping is called again within the window', async () => {
    vi.useFakeTimers();

    let mod: { createTypingIndicator?: (opts: { timeoutMs: number; onExpire: () => void }) => { setTyping: () => void; clearTyping: () => void; dispose: () => void } };
    try {
      mod = await import('../../packages/shared/src/typing-indicator.js');
    } catch {
      try {
        mod = await import('../../packages/webui/src/lib/typing-indicator.js');
      } catch {
        expect(
          null,
          'typing-indicator module not found',
        ).not.toBeNull();
        return;
      }
    }

    const onExpire = vi.fn();
    const indicator = mod.createTypingIndicator!({ timeoutMs: 5000, onExpire });

    indicator.setTyping();
    await vi.advanceTimersByTimeAsync(3000); // 3s in — not yet expired
    indicator.setTyping(); // reset the timer
    await vi.advanceTimersByTimeAsync(3000); // 3s more — should NOT have expired yet (total 6s but timer reset)
    expect(onExpire).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(2100); // now past the reset window
    expect(onExpire).toHaveBeenCalledOnce();

    indicator.dispose();
  });
});

// ---------------------------------------------------------------------------
// AC6 — Send clears indicator: clearTyping() fires immediately on message send
// ---------------------------------------------------------------------------

describe('Chat Typing Indicator — AC6: Send message clears indicator', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('clearTyping() cancels the pending timeout and fires onExpire immediately', async () => {
    vi.useFakeTimers();

    let mod: { createTypingIndicator?: (opts: { timeoutMs: number; onExpire: () => void }) => { setTyping: () => void; clearTyping: () => void; dispose: () => void } };
    try {
      mod = await import('../../packages/shared/src/typing-indicator.js');
    } catch {
      try {
        mod = await import('../../packages/webui/src/lib/typing-indicator.js');
      } catch {
        expect(
          null,
          'typing-indicator module not found',
        ).not.toBeNull();
        return;
      }
    }

    const onExpire = vi.fn();
    const indicator = mod.createTypingIndicator!({ timeoutMs: 5000, onExpire });

    indicator.setTyping();
    expect(onExpire).not.toHaveBeenCalled();

    // Simulate: user hits Send — should clear immediately
    indicator.clearTyping();
    expect(onExpire).toHaveBeenCalledOnce();

    // Advancing past the original timeout should NOT fire onExpire a second time
    await vi.advanceTimersByTimeAsync(6000);
    expect(onExpire).toHaveBeenCalledTimes(1);

    indicator.dispose();
  });

  it('webui chat input calls clearTyping on message submit', () => {
    // Check that the webui chat input component references clearTyping or stopTyping on submit
    const candidates = [
      'packages/webui/src/components/ChatInput.tsx',
      'packages/webui/src/components/MessageInput.tsx',
      'packages/webui/src/pages/Chat.tsx',
      'packages/webui/src/components/ConversationView.tsx',
      'packages/webui/src/components/JobChat.tsx',
    ];

    let found = false;
    for (const candidate of candidates) {
      const content = readRepoFile(candidate);
      if (content && /clearTyping|stopTyping|clearIndicator|typing.*submit|submit.*typing/i.test(content)) {
        found = true;
        break;
      }
    }

    expect(
      found,
      'No webui chat component found that calls clearTyping/stopTyping on message submit. ' +
        `Expected one of:\n${candidates.join('\n')}`,
    ).toBe(true);
  });
});
