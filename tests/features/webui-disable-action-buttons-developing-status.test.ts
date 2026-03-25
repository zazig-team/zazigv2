/**
 * Feature: WebUI — Disable Action Buttons While Idea is in `developing` Status
 * Feature ID: 06f010dd-f1b2-46df-9e98-667d5c5f6be9
 *
 * Acceptance criteria:
 * AC1 — InlineDetail list view: idea with status=developing shows spinner + "Spec in progress..."
 *        instead of action buttons (Promote to Feature, Done, Park, Reject)
 * AC2 — Detail panel/modal: idea with status=developing similarly shows the spinner indicator
 * AC3 — Real-time update: when idea transitions to status=specced the action buttons reappear
 *        (subscription wiring is preserved)
 * AC4 — Non-developing statuses continue to show normal action buttons unaffected
 * AC5 — "Spec in progress..." indicator uses muted/secondary styling, not error/warning color
 * AC6 — No console errors when idea transitions between developing and other statuses
 *
 * Tests are written to FAIL against the current codebase and pass once the feature is implemented.
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
const DETAIL_PANEL_PATH = 'packages/webui/src/components/IdeaDetailPanel.tsx';

// ---------------------------------------------------------------------------
// AC1: InlineDetail must render "Spec in progress..." instead of action buttons
// ---------------------------------------------------------------------------

describe('AC1: InlineDetail replaces action buttons with spinner for developing status', () => {
  let source: string | null;

  beforeEach(() => {
    source = readRepoFile(IDEAS_PATH);
  });

  it('Ideas.tsx exists', () => {
    expect(source).not.toBeNull();
  });

  it('"Spec in progress..." label is rendered inside InlineDetail for developing status (AC1)', () => {
    // The InlineDetail component must render "Spec in progress..." when status is developing.
    // This string is entirely absent from the current codebase — test FAILS until implemented.
    expect(source).toMatch(/Spec in progress\.\.\./);
  });

  it('InlineDetail function body contains a guard for data.status === "developing" (AC1)', () => {
    // After the fix, the InlineDetail action area must check idea status before rendering buttons.
    // The guard must reference "developing" to conditionally show the spinner.
    const fnStart = source?.indexOf('function InlineDetail') ?? -1;
    expect(fnStart).toBeGreaterThan(-1);

    // Slice from InlineDetail through the end of its JSX (conservative 8000 chars)
    const fnBody = source?.slice(fnStart, fnStart + 8000) ?? '';

    // The function body must contain a conditional guard referencing developing
    expect(fnBody).toMatch(/status.*[=!]=.*["']developing["']|["']developing["'].*[=!]=.*status/);
  });

  it('the action buttons area is conditionally excluded when status is developing (AC1)', () => {
    // The action row (il-detail-actions) must not be rendered unconditionally for developing ideas.
    // After the fix, there must be a structural guard that prevents il-action-park and
    // il-action-reject buttons from appearing when data.status === "developing".
    //
    // One valid pattern: the outer condition includes data.status !== "developing":
    //   {!canPromote && !isShipped && !promoted && !actionDone && data.status !== "developing" && ...}
    //
    // Another valid pattern: early return inside the action area:
    //   if (data.status === "developing") { return <spinner /> }
    //
    // We check that the "developing" guard appears near the il-detail-actions render site.
    const actionAreaIdx = source?.indexOf('il-detail-actions') ?? -1;
    expect(actionAreaIdx).toBeGreaterThan(-1);

    // Look at the 400 chars before and after the action area for the developing guard
    const window = source?.slice(Math.max(0, actionAreaIdx - 400), actionAreaIdx + 400) ?? '';
    expect(window).toMatch(/developing/);
  });

  it('a spinner element is rendered for developing status in InlineDetail (AC1)', () => {
    // The "Spec in progress..." indicator must include an animated spinner element.
    // After the fix, a spinner CSS class or Spinner component should appear inside InlineDetail
    // in the context of the developing status guard.
    const fnStart = source?.indexOf('function InlineDetail') ?? -1;
    const fnBody = source?.slice(fnStart, fnStart + 8000) ?? '';

    // Spinner may use il-chip-spinner, il-spec-spinner, animate-spin, or a <Spinner> component
    expect(fnBody).toMatch(/il-chip-spinner|il-spec-spinner|animate-spin|<Spinner|spinner/i);
  });
});

// ---------------------------------------------------------------------------
// AC2: IdeaDetailPanel (standalone modal) must show "Spec in progress..." for developing status
// ---------------------------------------------------------------------------

describe('AC2: IdeaDetailPanel shows developing indicator when status is developing', () => {
  let source: string | null;

  beforeEach(() => {
    source = readRepoFile(DETAIL_PANEL_PATH);
  });

  it('IdeaDetailPanel.tsx exists', () => {
    expect(source).not.toBeNull();
  });

  it('"Spec in progress..." label is present in IdeaDetailPanel.tsx (AC2)', () => {
    // The detail panel must also render "Spec in progress..." for developing status.
    // Currently absent — test FAILS until the feature is implemented.
    expect(source).toMatch(/Spec in progress\.\.\./);
  });

  it('IdeaDetailPanel.tsx references "developing" status to guard or show the indicator (AC2)', () => {
    // The panel must have a conditional that checks for developing status.
    expect(source).toMatch(/["']developing["']/);
  });
});

// ---------------------------------------------------------------------------
// AC3: Real-time subscription wiring is preserved so buttons reappear on specced transition
// ---------------------------------------------------------------------------

describe('AC3: Real-time subscription for status transitions is preserved', () => {
  let source: string | null;

  beforeEach(() => {
    source = readRepoFile(IDEAS_PATH);
  });

  it('Supabase realtime subscription for ideas table still exists (AC3)', () => {
    // The UI subscribes to real-time idea updates — this wiring must not be removed.
    expect(source).toMatch(/channel|subscribe|from\s*\(\s*["']ideas["']\s*\)/s);
  });

  it('status transition from developing to specced is still handled in realtime callback (AC3)', () => {
    // The realtime handler must still process specced transitions so spec-done ideas
    // regain their action buttons without a page refresh.
    expect(source).toMatch(/status.*specced|specced.*status/s);
  });

  it('batchSpecStates map still tracks specced transition (AC3)', () => {
    // After the feature, spec state tracking must be preserved.
    // The batchSpecStates map must still update when a developing idea becomes specced.
    expect(source).toMatch(/setBatchSpecStates|batchSpecStates/);
  });
});

// ---------------------------------------------------------------------------
// AC4: Non-developing statuses still show normal action buttons unaffected
// ---------------------------------------------------------------------------

describe('AC4: Action buttons are preserved for non-developing statuses', () => {
  let source: string | null;

  beforeEach(() => {
    source = readRepoFile(IDEAS_PATH);
  });

  it('il-action-park button class is still rendered in Ideas.tsx for non-developing ideas (AC4)', () => {
    // Park button must still exist — only hidden for developing status.
    expect(source).toMatch(/il-action-park/);
  });

  it('il-action-reject button class is still rendered in Ideas.tsx for non-developing ideas (AC4)', () => {
    // Reject button must still exist — only hidden for developing status.
    expect(source).toMatch(/il-action-reject/);
  });

  it('Promote to Feature action still exists for triaged ideas (AC4)', () => {
    // canPromote conditional must still gate the Promote to Feature button.
    expect(source).toMatch(/canPromote/);
    expect(source).toMatch(/Promote to Feature/);
  });

  it('Done action still exists in Ideas.tsx (AC4)', () => {
    // Done button must remain for non-developing statuses.
    expect(source).toMatch(/il-action-done|markingDone|handleMarkDone/);
  });
});

// ---------------------------------------------------------------------------
// AC5: "Spec in progress..." indicator uses muted/secondary styling
// ---------------------------------------------------------------------------

describe('AC5: Spec in progress indicator uses non-alarming muted styling', () => {
  let source: string | null;

  beforeEach(() => {
    source = readRepoFile(IDEAS_PATH);
  });

  it('"Spec in progress..." indicator in InlineDetail uses muted or secondary CSS class (AC5)', () => {
    // The indicator must NOT use error/warning colors.
    // Valid patterns: text-muted-foreground, il-spec-in-progress, il-detail-muted, muted, secondary
    // We look for the combination of "Spec in progress" near a muted/secondary class name.
    const idx = source?.indexOf('Spec in progress') ?? -1;
    expect(idx).toBeGreaterThan(-1);

    // Check the 300 chars surrounding the "Spec in progress" occurrence for a muted/secondary style
    const window = source?.slice(Math.max(0, idx - 300), idx + 300) ?? '';
    expect(window).toMatch(/muted|secondary|il-spec-in-progress|il-detail-muted|text-secondary/i);
  });
});

// ---------------------------------------------------------------------------
// AC6: No console errors when transitioning between developing and other statuses
// ---------------------------------------------------------------------------

describe('AC6: Robust conditional rendering prevents errors during status transitions', () => {
  let source: string | null;

  beforeEach(() => {
    source = readRepoFile(IDEAS_PATH);
  });

  it('InlineDetail renders the developing guard only after data is loaded (no null access) (AC6)', () => {
    // The developing status check must be inside the `data ?` guard so it can't throw
    // a null-access error before data is fetched.
    const fnStart = source?.indexOf('function InlineDetail') ?? -1;
    const fnBody = source?.slice(fnStart, fnStart + 8000) ?? '';

    // Confirm the data null check still wraps the render — look for "data ?" or "data &&"
    expect(fnBody).toMatch(/data\s*[?&]/);
  });

  it('realtime handler for batchSpecStates correctly cleans up after non-developing transition (AC6)', () => {
    // The handler must delete the spec state entry when status leaves developing,
    // preventing stale state that could cause the indicator to flash incorrectly.
    expect(source).toMatch(/specStartTimesRef.*delete|delete.*specStartTimesRef/s);
  });
});
