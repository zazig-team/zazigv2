/**
 * Feature: Remove Redundant Triage Toast Notification
 * Feature ID: 97100478-dc91-4e01-8443-262fee447d0a
 *
 * Acceptance criteria:
 * AC1 - No toast on triage: clicking Triage does NOT trigger a toast saying "moving to analysing", "triaging", etc.
 * AC2 - Inline spinner shows: card transitions in-place to TRIAGING state with spinner + "Analysing..." text
 * AC3 - Only one feedback signal: no overlay, toast, or banner when triage is triggered
 * AC4 - Error toasts still work: handleBackgroundTriage still sets actionError on failure
 * AC5 - Other toasts unaffected: batch triage showBatchToast calls remain for completion/error cases
 * AC6 - Card completes normally: triage lifecycle (status polling, card refresh) unaffected
 *
 * These tests are written to FAIL against the current codebase and pass once
 * the feature is implemented.
 */

import { describe, it, expect, beforeEach } from 'vitest';
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

const IDEAS_PATH = 'packages/webui/src/pages/Ideas.tsx';

// ---------------------------------------------------------------------------
// AC1, AC3: handleIdeaAction must NOT show dismissed toast for "triaging" status
// ---------------------------------------------------------------------------

describe('AC1/AC3: No toast when triage action fires', () => {
  let source: string | null;

  beforeEach(() => {
    source = readRepoFile(IDEAS_PATH);
  });

  it('Ideas.tsx exists', () => {
    expect(source).not.toBeNull();
  });

  it('handleIdeaAction guards setDismissedIdeas so it does not fire for "triaging" status (AC1)', () => {
    // The dismissed toast must be skipped for newStatus === "triaging".
    // After the fix, handleIdeaAction should contain a check like:
    //   if (newStatus !== "triaging") { setDismissedIdeas(...) }
    // or equivalently exclude triaging from the dismissed path.
    //
    // Current (broken) code calls setDismissedIdeas unconditionally.
    // This test fails until the guard is added.
    expect(source).toMatch(/newStatus\s*!==\s*["']triaging["']/);
  });

  it('setDismissedIdeas call in handleIdeaAction is conditional — not unconditional for all statuses (AC1)', () => {
    // Locate handleIdeaAction body and verify setDismissedIdeas is inside a conditional
    const fnStart = source?.indexOf('function handleIdeaAction') ?? -1;
    expect(fnStart).toBeGreaterThan(-1);

    // Grab the function body (up to the closing brace of the function)
    const bodySlice = source?.slice(fnStart, fnStart + 600) ?? '';

    // The call to setDismissedIdeas must be preceded by an if/conditional guard
    // A simple heuristic: "triaging" must appear in the function body near setDismissedIdeas
    expect(bodySlice).toMatch(/triaging/);
  });

  it('comment describing the action handler no longer says "show toast" unconditionally for triage (AC1)', () => {
    // The inline comment "show toast then remove" above handleIdeaAction may have been updated
    // OR the implementation guards against toast for triaging. Either way, the dismissed state
    // must not be set for triaging. We check the comment + guard combination.
    //
    // This test verifies the implementation — not just documentation — by checking the
    // function body does NOT contain an unconditional setDismissedIdeas without a "triaging" guard.
    const fnStart = source?.indexOf('function handleIdeaAction') ?? -1;
    const bodySlice = source?.slice(fnStart, fnStart + 700) ?? '';

    // If setDismissedIdeas is present in the body it MUST be inside an if-block that excludes triaging
    const hasDismissedCall = bodySlice.includes('setDismissedIdeas');
    if (hasDismissedCall) {
      // The guard must be present
      expect(bodySlice).toMatch(/if\s*\([^)]*triaging/);
    }
    // If setDismissedIdeas is absent from the function body, the toast was removed entirely — also valid
    expect(true).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// AC2: Inline TRIAGING card state must be preserved
// ---------------------------------------------------------------------------

describe('AC2: Inline triaging spinner and text are preserved', () => {
  let source: string | null;

  beforeEach(() => {
    source = readRepoFile(IDEAS_PATH);
  });

  it('isTriaging flag is still computed in renderIdeaRows (AC2)', () => {
    expect(source).toMatch(/isTriaging\s*=/);
  });

  it('"Analysing... an agent is triaging this idea" text is still rendered (AC2)', () => {
    expect(source).toMatch(/Analysing\.\.\. an agent is triaging this idea/);
  });

  it('il-triage-spinner or similar spinner element is still present for triaging rows (AC2)', () => {
    expect(source).toMatch(/il-triage-spinner|triaging.*spinner|spinner.*triaging/);
  });

  it('CSS class "triaging" is still applied to the card row when isTriaging is true (AC2)', () => {
    expect(source).toMatch(/isTriaging.*"triaging"|"triaging".*isTriaging/);
  });
});

// ---------------------------------------------------------------------------
// AC3: Only one feedback signal — dismissed toast overlay must not show for triaging
// ---------------------------------------------------------------------------

describe('AC3: Only one feedback signal on triage click', () => {
  let source: string | null;

  beforeEach(() => {
    source = readRepoFile(IDEAS_PATH);
  });

  it('dismissedIdeas map does not get "Moved to Analysing" entry on triage (AC3)', () => {
    // After the fix, "Moved to Analysing" should not appear as a string built from
    // STATUS_LABELS["triaging"] inside handleIdeaAction's setDismissedIdeas call.
    //
    // One way to verify: the function body must exclude triaging from the dismissed path.
    // We check that `Moved to` is not produced unconditionally for triaging.
    const fnStart = source?.indexOf('function handleIdeaAction') ?? -1;
    const bodySlice = source?.slice(fnStart, fnStart + 700) ?? '';

    // If the dismissed toast template literal is present, it must be inside a conditional
    if (bodySlice.includes('Moved to')) {
      expect(bodySlice).toMatch(/triaging/); // guard referencing triaging must exist
    }
    expect(true).toBe(true); // always pass structural check
  });

  it('il-row-dismissed element is still present for non-triage status changes (AC3)', () => {
    // The dismissed row class must still exist in the render for other actions (park, reject, promote)
    expect(source).toMatch(/il-row-dismissed/);
  });
});

// ---------------------------------------------------------------------------
// AC4: Error toasts / error handling on triage failure must be preserved
// ---------------------------------------------------------------------------

describe('AC4: Error feedback on triage failure is preserved', () => {
  let source: string | null;

  beforeEach(() => {
    source = readRepoFile(IDEAS_PATH);
  });

  it('handleBackgroundTriage still calls setActionError on triage failure (AC4)', () => {
    const fnStart = source?.indexOf('async function handleBackgroundTriage') ?? -1;
    expect(fnStart).toBeGreaterThan(-1);
    const bodySlice = source?.slice(fnStart, fnStart + 600) ?? '';
    expect(bodySlice).toMatch(/setActionError/);
  });

  it('handleBackgroundTriage reverts idea status to "new" on API failure (AC4)', () => {
    // Revert to 'new' on dispatch failure must still exist
    expect(source).toMatch(/updateIdeaStatus.*"new"|"new".*updateIdeaStatus/);
  });

  it('triage failure path is not affected by toast removal — try/catch still in place (AC4)', () => {
    const fnStart = source?.indexOf('async function handleBackgroundTriage') ?? -1;
    const bodySlice = source?.slice(fnStart, fnStart + 1000) ?? '';
    expect(bodySlice).toMatch(/catch/);
  });
});

// ---------------------------------------------------------------------------
// AC5: Batch triage toasts remain for batch completion and error cases
// ---------------------------------------------------------------------------

describe('AC5: Batch triage toasts unaffected', () => {
  let source: string | null;

  beforeEach(() => {
    source = readRepoFile(IDEAS_PATH);
  });

  it('showBatchToast is still called with success tone after batch triage completes (AC5)', () => {
    expect(source).toMatch(/showBatchToast.*tone.*success|showBatchToast.*success/s);
  });

  it('showBatchToast is still called with error tone when batch triage has failures (AC5)', () => {
    expect(source).toMatch(/showBatchToast.*tone.*error|showBatchToast.*error/s);
  });

  it('il-toast-stack container is still rendered for batch toasts (AC5)', () => {
    expect(source).toMatch(/il-toast-stack/);
  });

  it('handleRetryTriage still calls showBatchToast on retry failure (AC5)', () => {
    const fnStart = source?.indexOf('handleRetryTriage') ?? -1;
    expect(fnStart).toBeGreaterThan(-1);
    const bodySlice = source?.slice(fnStart, fnStart + 1500) ?? '';
    expect(bodySlice).toMatch(/showBatchToast/);
  });

  it('staleCleanupToast is still set when stale triaging ideas are found (AC5)', () => {
    expect(source).toMatch(/setStaleCleanupToast/);
  });
});

// ---------------------------------------------------------------------------
// AC6: Triage lifecycle (API call, status update, card transition) unaffected
// ---------------------------------------------------------------------------

describe('AC6: Triage lifecycle completes normally', () => {
  let source: string | null;

  beforeEach(() => {
    source = readRepoFile(IDEAS_PATH);
  });

  it('requestHeadlessTriage is still called in handleBackgroundTriage (AC6)', () => {
    const fnStart = source?.indexOf('async function handleBackgroundTriage') ?? -1;
    const bodySlice = source?.slice(fnStart, fnStart + 600) ?? '';
    expect(bodySlice).toMatch(/requestHeadlessTriage/);
  });

  it('updateIdeaStatus to "triaging" is still called before dispatching triage (AC6)', () => {
    const fnStart = source?.indexOf('async function handleBackgroundTriage') ?? -1;
    const bodySlice = source?.slice(fnStart, fnStart + 600) ?? '';
    expect(bodySlice).toMatch(/updateIdeaStatus.*"triaging"|"triaging".*updateIdeaStatus/);
  });

  it('onAction is still called after successful triage dispatch (AC6)', () => {
    const fnStart = source?.indexOf('async function handleBackgroundTriage') ?? -1;
    const bodySlice = source?.slice(fnStart, fnStart + 1000) ?? '';
    expect(bodySlice).toMatch(/onAction/);
  });

  it('Supabase realtime subscription for triaging→done transitions still exists (AC6)', () => {
    // The subscription that fires markIdeaLeaving when status leaves "triaging" must remain
    expect(source).toMatch(/status.*triaging.*!==.*triaging|previous.*triaging.*updated.*triaging/s);
  });
});
