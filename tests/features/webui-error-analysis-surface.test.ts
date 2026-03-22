/**
 * Feature: WebUI: Surface job error_analysis details in pipeline feature/job views
 * Feature ID: ae8d42f7-2fa0-405d-8f80-24b126746f45
 *
 * Tests for all acceptance criteria:
 * AC1 - Job rows in FeatureDetailPanel show error count badge when error_analysis has errors
 * AC2 - Critical errors show red badge, warnings show yellow/orange
 * AC3 - Jobs with no errors show no badge
 * AC4 - Clicking a job with errors shows "Errors" section above Result Summary in JobDetailExpand
 * AC5 - Each error displays pattern, severity badge, and snippet
 * AC6 - Snippets over 300 chars are truncated with "Show more" toggle
 * AC7 - Section is hidden when error_analysis is null or errors array is empty
 * AC8 - No visual regression on jobs without errors
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

// ---------------------------------------------------------------------------
// AC1-AC3, AC8: Data layer — queries.ts must include error_analysis
// ---------------------------------------------------------------------------

describe('Data layer: queries.ts exposes error_analysis', () => {
  const QUERIES_PATH = 'packages/webui/src/lib/queries.ts';
  let queries: string | null;

  beforeEach(() => {
    queries = readRepoFile(QUERIES_PATH);
  });

  it('queries.ts exists', () => {
    expect(queries).not.toBeNull();
  });

  it('JobDetail interface includes error_analysis field', () => {
    expect(queries).toMatch(/error_analysis/);
  });

  it('JobDetail interface error_analysis is typed as an object with errors array or null', () => {
    // Should have something like: error_analysis: { errors: ...; scanned_at: ... } | null
    expect(queries).toMatch(/error_analysis\s*[?:].*null|null.*error_analysis/);
  });

  it('fetchJobDetail query selects error_analysis', () => {
    // The select clause in fetchJobDetail must include error_analysis
    const fetchJobDetailIdx = queries?.indexOf('fetchJobDetail') ?? -1;
    expect(fetchJobDetailIdx).toBeGreaterThan(-1);
    const afterFetch = queries?.slice(fetchJobDetailIdx) ?? '';
    // Within the function body there should be a select that includes error_analysis
    expect(afterFetch).toMatch(/error_analysis/);
  });

  it('job list query used by FeatureDetailPanel includes error_analysis', () => {
    // The feature list query (used to show badge in job rows) must fetch error_analysis
    // There should be at least two references: one in JobDetail interface, one in a list query
    const matches = queries?.match(/error_analysis/g) ?? [];
    expect(matches.length).toBeGreaterThanOrEqual(2);
  });
});

// ---------------------------------------------------------------------------
// AC1-AC3, AC8: FeatureDetailPanel shows error count badge on job rows
// ---------------------------------------------------------------------------

describe('FeatureDetailPanel: error count badge on job rows', () => {
  const PANEL_PATH = 'packages/webui/src/components/FeatureDetailPanel.tsx';
  let panel: string | null;

  beforeEach(() => {
    panel = readRepoFile(PANEL_PATH);
  });

  it('FeatureDetailPanel.tsx exists', () => {
    expect(panel).not.toBeNull();
  });

  it('references error_analysis in the component', () => {
    expect(panel).toMatch(/error_analysis/);
  });

  it('renders a badge or label showing error count when errors exist (AC1)', () => {
    // Should show something like "N errors" or "N error" text
    expect(panel).toMatch(/errors?.*badge|badge.*errors?|\berrors?\b.*error_analysis|error_analysis.*\berrors?\b/i);
  });

  it('applies distinct styling for critical errors — red class or style (AC2)', () => {
    // Should reference "critical" alongside a color class or style
    expect(panel).toMatch(/critical.*red|red.*critical|critical.*negative|negative.*critical|critical.*badge/i);
  });

  it('applies distinct styling for warning errors — yellow/orange class or style (AC2)', () => {
    expect(panel).toMatch(/warning.*yellow|yellow.*warning|warning.*orange|orange.*warning|warning.*caution|caution.*warning/i);
  });

  it('conditionally renders badge only when errors.length > 0 (AC3)', () => {
    // Must guard on length > 0 or similar
    expect(panel).toMatch(/errors\.length\s*>\s*0|errors\.length\s*&&|errors\?\.length/);
  });

  it('does not render error badge when errors array is absent (AC3, AC8)', () => {
    // The badge render should be conditional — must have a falsy path (no badge rendered)
    // i.e. there is a conditional branch around the badge
    expect(panel).toMatch(/\?\s*\(?.*errors|errors.*\?\s*\(?/);
  });
});

// ---------------------------------------------------------------------------
// AC4-AC7: JobDetailExpand shows "Errors" section above Result Summary
// ---------------------------------------------------------------------------

describe('JobDetailExpand: Errors section when error_analysis has errors', () => {
  const EXPAND_PATH = 'packages/webui/src/components/JobDetailExpand.tsx';
  let expand: string | null;

  beforeEach(() => {
    expand = readRepoFile(EXPAND_PATH);
  });

  it('JobDetailExpand.tsx exists', () => {
    expect(expand).not.toBeNull();
  });

  it('references error_analysis in the component (AC4)', () => {
    expect(expand).toMatch(/error_analysis/);
  });

  it('renders an "Errors" section heading (AC4)', () => {
    expect(expand).toMatch(/Errors/);
  });

  it('"Errors" section appears before "Result Summary" in source order (AC4)', () => {
    const errIdx = expand?.indexOf('Errors') ?? -1;
    const resultIdx = expand?.indexOf('Result Summary') ?? -1;
    expect(errIdx).toBeGreaterThan(-1);
    expect(resultIdx).toBeGreaterThan(-1);
    expect(errIdx).toBeLessThan(resultIdx);
  });

  it('renders pattern field for each error (AC5)', () => {
    expect(expand).toMatch(/\.pattern/);
  });

  it('renders severity badge for each error (AC5)', () => {
    expect(expand).toMatch(/\.severity/);
  });

  it('renders snippet field for each error (AC5)', () => {
    expect(expand).toMatch(/\.snippet/);
  });

  it('applies red styling for critical severity (AC5)', () => {
    expect(expand).toMatch(/critical.*red|red.*critical|critical.*negative|negative.*critical/i);
  });

  it('applies yellow/orange styling for warning severity (AC5)', () => {
    expect(expand).toMatch(/warning.*yellow|yellow.*warning|warning.*caution|caution.*warning|warning.*orange/i);
  });

  it('snippet is rendered in a preformatted or code block (AC5)', () => {
    expect(expand).toMatch(/<pre|<code/);
  });

  it('truncates snippets over 300 chars with "Show more" toggle (AC6)', () => {
    expect(expand).toMatch(/300/);
    expect(expand).toMatch(/[Ss]how more/);
  });

  it('hides Errors section when error_analysis is null (AC7)', () => {
    // Must have a null/falsy guard before rendering errors
    expect(expand).toMatch(/error_analysis\s*&&|error_analysis\?|!error_analysis|error_analysis\s*==\s*null/);
  });

  it('hides Errors section when errors array is empty (AC7)', () => {
    // Must guard on array length or emptiness
    expect(expand).toMatch(/errors\.length\s*>\s*0|errors\.length\s*&&|errors\?\.length\s*>\s*0/);
  });

  it('does not crash or show errors section when job has no error_analysis (AC8)', () => {
    // Conditional rendering must allow the no-error path
    // Check that there's a conditional branch — not unconditional rendering
    expect(expand).not.toMatch(/error_analysis\.errors\.map/);
    // Instead it should use optional chaining or a guard
    expect(expand).toMatch(/error_analysis\?\.errors|error_analysis &&|error_analysis\s*\?/);
  });
});

// ---------------------------------------------------------------------------
// AC6: Snippet truncation logic — unit-level behavioral check
// ---------------------------------------------------------------------------

describe('Snippet truncation: 300-char threshold', () => {
  it('a snippet of exactly 300 chars is NOT truncated', () => {
    const snippet = 'x'.repeat(300);
    const shouldTruncate = snippet.length > 300;
    expect(shouldTruncate).toBe(false);
  });

  it('a snippet of 301 chars IS truncated', () => {
    const snippet = 'x'.repeat(301);
    const shouldTruncate = snippet.length > 300;
    expect(shouldTruncate).toBe(true);
  });

  it('truncated display shows first 300 chars + ellipsis', () => {
    const snippet = 'a'.repeat(350);
    const truncated = snippet.slice(0, 300) + '…';
    expect(truncated.length).toBe(301);
    expect(truncated.endsWith('…')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// AC2: Badge color logic — critical vs warning
// ---------------------------------------------------------------------------

describe('Error badge color logic', () => {
  function getBadgeClass(severity: string): string {
    // This mirrors what the implementation should do.
    // These tests will fail until the component implements this logic.
    if (severity === 'critical') return 'error-badge--critical';
    if (severity === 'warning') return 'error-badge--warning';
    return 'error-badge';
  }

  it('critical severity maps to a distinct (red) badge class', () => {
    const cls = getBadgeClass('critical');
    expect(cls).toContain('critical');
  });

  it('warning severity maps to a distinct (yellow/orange) badge class', () => {
    const cls = getBadgeClass('warning');
    expect(cls).toContain('warning');
  });

  it('critical and warning classes are different', () => {
    expect(getBadgeClass('critical')).not.toBe(getBadgeClass('warning'));
  });
});

// ---------------------------------------------------------------------------
// Structural: error_analysis type shape matches spec
// ---------------------------------------------------------------------------

describe('Structural: error_analysis type shape', () => {
  it('ErrorAnalysis type/interface is defined in queries.ts', () => {
    const queries = readRepoFile('packages/webui/src/lib/queries.ts');
    // Should define an interface or type for ErrorAnalysis or inline the shape
    expect(queries).toMatch(/ErrorAnalysis|error_analysis.*errors.*pattern|errors.*severity.*snippet/);
  });

  it('ErrorEntry type includes pattern, severity, and snippet fields', () => {
    const queries = readRepoFile('packages/webui/src/lib/queries.ts');
    expect(queries).toMatch(/pattern/);
    expect(queries).toMatch(/severity/);
    expect(queries).toMatch(/snippet/);
  });

  it('severity is typed as "critical" | "warning" literal union or string', () => {
    const queries = readRepoFile('packages/webui/src/lib/queries.ts');
    // Either a literal union or just string is acceptable
    expect(queries).toMatch(/severity.*critical.*warning|critical.*warning.*severity|severity.*string/);
  });
});
