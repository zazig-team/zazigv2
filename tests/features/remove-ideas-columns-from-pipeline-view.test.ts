/**
 * Feature: Remove Ideas columns from Pipeline view
 * Feature ID: 4d824e74-a5b1-4391-af16-a4e072506653
 *
 * Acceptance criteria:
 * AC1  - No Inbox column (no ideas with status=new displayed)
 * AC2  - No Triage column (no ideas with status=triaged displayed)
 * AC3  - No Proposal column (no developing/specced ideas displayed as pseudo-features)
 * AC4  - First column is "Ready"
 * AC5  - No network requests to fetch ideas from Pipeline.tsx
 * AC6  - Page header stats do not include "Inbox" count
 * AC7  - No IdeaDetailPanel renders from Pipeline board
 * AC8  - Remaining pipeline columns are still defined (Ready through Shipped to Staging)
 * AC9  - "Shipped to Production" accordion is still present in the complete column
 * AC10 - usePipelineSnapshot no longer injects developing/specced ideas into proposal slot
 * AC11 - TypeScript source compiles without referencing removed symbols
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

const PIPELINE_PATH = 'packages/webui/src/pages/Pipeline.tsx';
const SNAPSHOT_HOOK_PATH = 'packages/webui/src/hooks/usePipelineSnapshot.ts';

// ---------------------------------------------------------------------------
// AC1: No Inbox column
// ---------------------------------------------------------------------------

describe('AC1: No Inbox column in Pipeline board', () => {
  let source: string | null;

  beforeEach(() => {
    source = readRepoFile(PIPELINE_PATH);
  });

  it('Pipeline.tsx exists', () => {
    expect(source).not.toBeNull();
  });

  it('does not render a col-name "Inbox" element (AC1)', () => {
    // The Inbox section header contains: <span className="col-name">Inbox</span>
    // After the change this must not appear.
    expect(source).not.toMatch(/<span[^>]*className="col-name"[^>]*>\s*Inbox\s*<\/span>/);
  });

  it('does not render a pipeline section with col-dot for --col-ideas (AC1)', () => {
    // The Inbox column header uses: style={{ background: "var(--col-ideas)" }}
    expect(source).not.toMatch(/--col-ideas/);
  });

  it('does not reference inboxTypeFilter state (AC1)', () => {
    // inboxTypeFilter is inbox-only state
    expect(source).not.toMatch(/inboxTypeFilter/);
  });

  it('does not render inbox-type-tabs (AC1)', () => {
    expect(source).not.toMatch(/inbox-type-tabs/);
  });
});

// ---------------------------------------------------------------------------
// AC2: No Triage column
// ---------------------------------------------------------------------------

describe('AC2: No Triage column in Pipeline board', () => {
  let source: string | null;

  beforeEach(() => {
    source = readRepoFile(PIPELINE_PATH);
  });

  it('does not render a col-name "Triage" element (AC2)', () => {
    expect(source).not.toMatch(/<span[^>]*className="col-name"[^>]*>\s*Triage\s*<\/span>/);
  });

  it('does not reference triagedIdeas state variable (AC2)', () => {
    expect(source).not.toMatch(/triagedIdeas/);
  });

  it('does not reference filteredTriagedIdeas (AC2)', () => {
    expect(source).not.toMatch(/filteredTriagedIdeas/);
  });
});

// ---------------------------------------------------------------------------
// AC3: No Proposal column
// ---------------------------------------------------------------------------

describe('AC3: No Proposal column in Pipeline board', () => {
  let source: string | null;

  beforeEach(() => {
    source = readRepoFile(PIPELINE_PATH);
  });

  it('COLUMN_DEFINITIONS does not include a "proposal" entry (AC3)', () => {
    // The array literal must not contain: key: "proposal"
    expect(source).not.toMatch(/key:\s*["']proposal["']/);
  });

  it('does not render a col-name "Proposal" element (AC3)', () => {
    expect(source).not.toMatch(/<span[^>]*className="col-name"[^>]*>\s*Proposal\s*<\/span>/);
  });
});

// ---------------------------------------------------------------------------
// AC4: First column is "Ready"
// ---------------------------------------------------------------------------

describe('AC4: Pipeline board starts at "Ready"', () => {
  let source: string | null;

  beforeEach(() => {
    source = readRepoFile(PIPELINE_PATH);
  });

  it('COLUMN_DEFINITIONS first entry has key "ready" (AC4)', () => {
    // After removing "proposal", the first element must be ready.
    // We check that the array starts with ready, not proposal.
    const defsStart = source?.indexOf('COLUMN_DEFINITIONS') ?? -1;
    expect(defsStart).toBeGreaterThan(-1);

    // Find the first key: "..." inside the array
    const defsSlice = source?.slice(defsStart, defsStart + 300) ?? '';
    const firstKeyMatch = defsSlice.match(/key:\s*["'](\w+)["']/);
    expect(firstKeyMatch).not.toBeNull();
    expect(firstKeyMatch![1]).toBe('ready');
  });

  it('still defines the "ready" column (AC4)', () => {
    expect(source).toMatch(/key:\s*["']ready["']/);
  });
});

// ---------------------------------------------------------------------------
// AC5: No network requests to fetch ideas from Pipeline.tsx
// ---------------------------------------------------------------------------

describe('AC5: Pipeline.tsx does not fetch ideas data', () => {
  let source: string | null;

  beforeEach(() => {
    source = readRepoFile(PIPELINE_PATH);
  });

  it('does not import fetchIdeas (AC5)', () => {
    expect(source).not.toMatch(/fetchIdeas/);
  });

  it('does not define loadIdeasData callback (AC5)', () => {
    expect(source).not.toMatch(/loadIdeasData/);
  });

  it('does not declare ideas state (useState<Idea[]>) (AC5)', () => {
    // This catches: const [ideas, setIdeas] = useState<Idea[]>
    expect(source).not.toMatch(/useState<Idea\[\]>/);
  });

  it('does not declare parkedIdeas state (AC5)', () => {
    expect(source).not.toMatch(/parkedIdeas/);
  });

  it('does not import the Idea type for idea-fetching purposes (AC5)', () => {
    // The import line for fetchIdeas and Idea must be gone entirely
    expect(source).not.toMatch(/import.*fetchIdeas.*from/);
  });
});

// ---------------------------------------------------------------------------
// AC6: Page header stats do not include "Inbox" count
// ---------------------------------------------------------------------------

describe('AC6: Page header stats have no Inbox count', () => {
  let source: string | null;

  beforeEach(() => {
    source = readRepoFile(PIPELINE_PATH);
  });

  it('page-stats section does not render an "Inbox" stat (AC6)', () => {
    // Locate the page-stats div and verify "Inbox" doesn't appear as a stat label
    const statsStart = source?.indexOf('page-stats') ?? -1;
    expect(statsStart).toBeGreaterThan(-1);

    const statsSlice = source?.slice(statsStart, statsStart + 600) ?? '';
    expect(statsSlice).not.toMatch(/Inbox/);
  });

  it('metrics object does not include an ideas field (AC6)', () => {
    // metrics.ideas must not appear in the file
    expect(source).not.toMatch(/metrics\.ideas/);
  });
});

// ---------------------------------------------------------------------------
// AC7: No IdeaDetailPanel renders
// ---------------------------------------------------------------------------

describe('AC7: IdeaDetailPanel is not rendered in Pipeline board', () => {
  let source: string | null;

  beforeEach(() => {
    source = readRepoFile(PIPELINE_PATH);
  });

  it('does not import IdeaDetailPanel (AC7)', () => {
    expect(source).not.toMatch(/import.*IdeaDetailPanel/);
  });

  it('does not render <IdeaDetailPanel (AC7)', () => {
    expect(source).not.toMatch(/<IdeaDetailPanel/);
  });

  it('does not declare selectedIdea state (AC7)', () => {
    expect(source).not.toMatch(/selectedIdea/);
  });
});

// ---------------------------------------------------------------------------
// AC8: Remaining pipeline columns are still defined
// ---------------------------------------------------------------------------

describe('AC8: All feature-development columns are still defined', () => {
  let source: string | null;

  beforeEach(() => {
    source = readRepoFile(PIPELINE_PATH);
  });

  const expectedColumns: [string, string][] = [
    ['breaking_down', 'Breakdown'],
    ['writing_tests', 'Writing Tests'],
    ['building', 'Building'],
    ['combining_and_pr', 'Combining'],
    ['ci_checking', 'CI Check'],
    ['pr_ready', 'PR Ready'],
    ['failed', 'Failed'],
    ['complete', 'Shipped to Staging'],
  ];

  for (const [key, label] of expectedColumns) {
    it(`still defines column key="${key}" label="${label}" (AC8)`, () => {
      expect(source).toMatch(new RegExp(`key:\\s*["']${key}["']`));
      expect(source).toMatch(new RegExp(`label:\\s*["']${label}["']`));
    });
  }
});

// ---------------------------------------------------------------------------
// AC9: "Shipped to Production" accordion is still present
// ---------------------------------------------------------------------------

describe('AC9: Shipped to Production accordion still present', () => {
  let source: string | null;

  beforeEach(() => {
    source = readRepoFile(PIPELINE_PATH);
  });

  it('Shipped to Production text is still in the source (AC9)', () => {
    expect(source).toMatch(/Shipped to Production/);
  });

  it('showProductionArchive state is still present (AC9)', () => {
    expect(source).toMatch(/showProductionArchive/);
  });
});

// ---------------------------------------------------------------------------
// AC10: usePipelineSnapshot does not inject developing/specced ideas
// ---------------------------------------------------------------------------

describe('AC10: usePipelineSnapshot no longer injects ideas into proposal slot', () => {
  let source: string | null;

  beforeEach(() => {
    source = readRepoFile(SNAPSHOT_HOOK_PATH);
  });

  it('usePipelineSnapshot.ts exists', () => {
    expect(source).not.toBeNull();
  });

  it('does not query supabase.from("ideas") with status in [developing, specced] (AC10)', () => {
    // The removed query: supabase.from("ideas").select(...).in("status", ["developing", "specced"])
    expect(source).not.toMatch(/\.from\(["']ideas["']\).*\.in\(["']status["']/s);
  });

  it('does not reference developingIdeasResult (AC10)', () => {
    expect(source).not.toMatch(/developingIdeasResult/);
  });

  it('does not reference devIdeas loop (AC10)', () => {
    expect(source).not.toMatch(/devIdeas/);
  });

  it('does not push proposalFeature objects tagged with _ideaStatus (AC10)', () => {
    expect(source).not.toMatch(/_ideaStatus/);
  });

  it('Promise.all in refresh only destructures two elements — [response, capabilityLookup] (AC10)', () => {
    // Current code: const [response, capabilityLookup, developingIdeasResult] = await Promise.all([...])
    // After change: const [response, capabilityLookup] = await Promise.all([...])
    // We verify the three-element destructure is gone
    expect(source).not.toMatch(/\[\s*response\s*,\s*capabilityLookup\s*,\s*developingIdeasResult\s*\]/);
  });

  it('ideasInboxNewCount is still present in NormalizedPipelineSnapshot (AC10)', () => {
    // ideasInboxNewCount should remain — it comes from the backend snapshot JSON
    expect(source).toMatch(/ideasInboxNewCount/);
  });

  it('byStatus.proposal is still in the empty snapshot shape (AC10)', () => {
    // proposal array stays in the type, just now empty by default
    expect(source).toMatch(/proposal:\s*\[\]/);
  });
});

// ---------------------------------------------------------------------------
// AC11: No dangling references to removed symbols
// ---------------------------------------------------------------------------

describe('AC11: No dangling references to removed symbols in Pipeline.tsx', () => {
  let source: string | null;

  beforeEach(() => {
    source = readRepoFile(PIPELINE_PATH);
  });

  it('applyIdeaFilter function is removed (AC11)', () => {
    expect(source).not.toMatch(/applyIdeaFilter/);
  });

  it('ideasCountsRef is removed (AC11)', () => {
    expect(source).not.toMatch(/ideasCountsRef/);
  });

  it('ideasLoading state is removed (AC11)', () => {
    expect(source).not.toMatch(/ideasLoading/);
  });

  it('ideasError state is removed (AC11)', () => {
    expect(source).not.toMatch(/ideasError/);
  });

  it('showReviewSoon state is removed (AC11)', () => {
    expect(source).not.toMatch(/showReviewSoon/);
  });

  it('showLongTerm state is removed (AC11)', () => {
    expect(source).not.toMatch(/showLongTerm/);
  });

  it('reviewSoonIdeas computed value is removed (AC11)', () => {
    expect(source).not.toMatch(/reviewSoonIdeas/);
  });

  it('longTermIdeas computed value is removed (AC11)', () => {
    expect(source).not.toMatch(/longTermIdeas/);
  });

  it('displayedIdeas computed value is removed (AC11)', () => {
    expect(source).not.toMatch(/displayedIdeas/);
  });
});
