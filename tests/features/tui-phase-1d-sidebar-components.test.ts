/**
 * Feature: TUI Phase 1d — Sidebar with placeholder alerts, status, and pipeline
 *
 * Tests for acceptance criteria:
 * - Sidebar renders at ~30% width containing AlertsFeed, LocalStatus, PipelineSummary
 * - AlertsFeed shows sample alerts with severity colors
 * - LocalStatus shows placeholder slot counts and agent list under "THIS MACHINE"
 * - PipelineSummary shows placeholder column counts under "PIPELINE"
 * - CriticalBanner can be triggered manually and auto-dismisses after 15 seconds
 *
 * These tests do static analysis of TUI component source files to verify the
 * required implementation patterns. Written to FAIL against the current codebase
 * and pass once the feature is implemented.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');
const TUI_COMPONENTS = 'packages/tui/src/components';

function readRepoFile(relPath: string): string | null {
  const fullPath = path.join(REPO_ROOT, relPath);
  try {
    return fs.readFileSync(fullPath, 'utf-8');
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// AC1: Sidebar renders at ~30% width containing AlertsFeed, LocalStatus, PipelineSummary
// ---------------------------------------------------------------------------

describe('AC1: Sidebar component — vertical layout at ~30% width', () => {
  let content: string | null;
  const FILE = `${TUI_COMPONENTS}/Sidebar.tsx`;

  beforeAll(() => {
    content = readRepoFile(FILE);
  });

  it('Sidebar.tsx exists', () => {
    expect(content, `File not found: ${FILE}`).not.toBeNull();
  });

  it('imports AlertsFeed', () => {
    expect(content).toMatch(/import.*AlertsFeed/);
  });

  it('imports LocalStatus', () => {
    expect(content).toMatch(/import.*LocalStatus/);
  });

  it('imports PipelineSummary', () => {
    expect(content).toMatch(/import.*PipelineSummary/);
  });

  it('renders AlertsFeed component', () => {
    expect(content).toMatch(/<AlertsFeed/);
  });

  it('renders LocalStatus component', () => {
    expect(content).toMatch(/<LocalStatus/);
  });

  it('renders PipelineSummary component', () => {
    expect(content).toMatch(/<PipelineSummary/);
  });

  it('uses a Box as the root container', () => {
    expect(content).toMatch(/<Box/);
  });

  it('specifies ~30% width (percentage or fraction)', () => {
    // width="30%" or width={30} or width={terminalWidth * 0.3} or similar
    expect(content).toMatch(/30%|0\.3|width.*30/);
  });

  it('uses flexDirection column (vertical stacking)', () => {
    expect(content).toMatch(/flexDirection.*column|column.*flexDirection/);
  });
});

// ---------------------------------------------------------------------------
// AC2: AlertsFeed — scrollable list with severity indicators
// ---------------------------------------------------------------------------

describe('AC2: AlertsFeed component — severity colors and sample alerts', () => {
  let content: string | null;
  const FILE = `${TUI_COMPONENTS}/AlertsFeed.tsx`;

  beforeAll(() => {
    content = readRepoFile(FILE);
  });

  it('AlertsFeed.tsx exists', () => {
    expect(content, `File not found: ${FILE}`).not.toBeNull();
  });

  it('imports Text from ink for colored output', () => {
    expect(content).toMatch(/import.*Text.*from.*ink|from.*ink.*Text/);
  });

  it('renders critical severity as red', () => {
    expect(content).toMatch(/red/);
  });

  it('renders warning severity as yellow', () => {
    expect(content).toMatch(/yellow/);
  });

  it('renders info severity as dim', () => {
    expect(content).toMatch(/dimColor|dim/);
  });

  it('contains at least 3 hardcoded sample alerts', () => {
    // Must have at least 3 alert entries in the sample data
    const alertEntries = content?.match(/severity|critical|warning|info/gi) ?? [];
    expect(alertEntries.length).toBeGreaterThanOrEqual(3);
  });

  it('renders message text for each alert', () => {
    expect(content).toMatch(/message|text/i);
  });

  it('renders a relative timestamp for each alert', () => {
    // Pattern: "ago", "min", "sec", or a timestamp field
    expect(content).toMatch(/ago|timestamp|time/i);
  });

  it('uses a Box or ScrollableBox for list layout', () => {
    expect(content).toMatch(/<Box/);
  });
});

// ---------------------------------------------------------------------------
// AC3: LocalStatus — slot counts, agent list, "THIS MACHINE" header
// ---------------------------------------------------------------------------

describe('AC3: LocalStatus component — placeholder slot counts and THIS MACHINE header', () => {
  let content: string | null;
  const FILE = `${TUI_COMPONENTS}/LocalStatus.tsx`;

  beforeAll(() => {
    content = readRepoFile(FILE);
  });

  it('LocalStatus.tsx exists', () => {
    expect(content, `File not found: ${FILE}`).not.toBeNull();
  });

  it('renders THIS MACHINE section header', () => {
    expect(content).toMatch(/THIS MACHINE/);
  });

  it('shows Codex slot count (e.g. Codex: 0/4)', () => {
    expect(content).toMatch(/Codex.*\d+\/\d+|\d+\/\d+.*Codex/);
  });

  it('shows CC slot count (e.g. CC: 0/4)', () => {
    expect(content).toMatch(/CC.*\d+\/\d+|\d+\/\d+.*CC/);
  });

  it('renders agent list with status dots or indicators', () => {
    // Status dot pattern: colored dot or bullet character
    expect(content).toMatch(/●|•|dot|status/i);
  });

  it('includes expert session indicator', () => {
    expect(content).toMatch(/expert|session/i);
  });

  it('uses Text from ink for rendering', () => {
    expect(content).toMatch(/import.*Text.*from.*ink|from.*ink.*Text/);
  });
});

// ---------------------------------------------------------------------------
// AC4: PipelineSummary — placeholder column counts, "PIPELINE" header
// ---------------------------------------------------------------------------

describe('AC4: PipelineSummary component — placeholder column counts and PIPELINE header', () => {
  let content: string | null;
  const FILE = `${TUI_COMPONENTS}/PipelineSummary.tsx`;

  beforeAll(() => {
    content = readRepoFile(FILE);
  });

  it('PipelineSummary.tsx exists', () => {
    expect(content, `File not found: ${FILE}`).not.toBeNull();
  });

  it('renders PIPELINE section header', () => {
    expect(content).toMatch(/PIPELINE/);
  });

  it('shows Ready count', () => {
    expect(content).toMatch(/Ready/);
  });

  it('shows Building count', () => {
    expect(content).toMatch(/Building/);
  });

  it('shows CI Check count', () => {
    expect(content).toMatch(/CI Check|CICheck|ci.check/i);
  });

  it('shows Failed count', () => {
    expect(content).toMatch(/Failed/);
  });

  it('shows Shipped count', () => {
    expect(content).toMatch(/Shipped/);
  });

  it('uses hardcoded 0 values for Phase 1 placeholder counts', () => {
    // Should have multiple "0" values for the placeholder counts
    const zeros = content?.match(/\b0\b/g) ?? [];
    expect(zeros.length).toBeGreaterThanOrEqual(5);
  });

  it('uses Text from ink for rendering', () => {
    expect(content).toMatch(/import.*Text.*from.*ink|from.*ink.*Text/);
  });
});

// ---------------------------------------------------------------------------
// AC5: CriticalBanner — show/hide logic, 15s auto-dismiss, manual trigger prop
// ---------------------------------------------------------------------------

describe('AC5: CriticalBanner component — show/hide and 15s auto-dismiss', () => {
  let content: string | null;
  const FILE = `${TUI_COMPONENTS}/CriticalBanner.tsx`;

  beforeAll(() => {
    content = readRepoFile(FILE);
  });

  it('CriticalBanner.tsx exists', () => {
    expect(content, `File not found: ${FILE}`).not.toBeNull();
  });

  it('exposes a prop to manually trigger the banner', () => {
    // Must accept a prop like: show, visible, trigger, isVisible, or similar
    expect(content).toMatch(/show|visible|trigger|isVisible|active/i);
  });

  it('implements show/hide logic', () => {
    // Must have conditional rendering based on visibility state
    expect(content).toMatch(/useState|show|visible|hidden/);
  });

  it('auto-dismisses after 15 seconds', () => {
    // Must reference 15000ms or 15s in a timer
    expect(content).toMatch(/15000|15\s*\*\s*1000|15s/);
  });

  it('uses setTimeout or useEffect for the auto-dismiss timer', () => {
    expect(content).toMatch(/setTimeout|useEffect/);
  });

  it('clears the timer to prevent memory leaks (clearTimeout)', () => {
    expect(content).toMatch(/clearTimeout/);
  });

  it('renders as a full-width banner (Box with full width)', () => {
    expect(content).toMatch(/width.*100%|fullWidth|width.*full/i);
  });

  it('uses red color for critical banner styling', () => {
    expect(content).toMatch(/red|critical/i);
  });

  it('renders nothing (null) when not visible', () => {
    // Must return null or empty when not shown
    expect(content).toMatch(/return null|!.*show|!.*visible|!.*active/);
  });
});

// ---------------------------------------------------------------------------
// Structural: All components use Ink primitives
// ---------------------------------------------------------------------------

describe('Structural: All sidebar components import from ink', () => {
  it('Sidebar imports Box from ink', () => {
    const content = readRepoFile(`${TUI_COMPONENTS}/Sidebar.tsx`);
    expect(content).toMatch(/from ['"]ink['"]/);
  });

  it('AlertsFeed imports from ink', () => {
    const content = readRepoFile(`${TUI_COMPONENTS}/AlertsFeed.tsx`);
    expect(content).toMatch(/from ['"]ink['"]/);
  });

  it('LocalStatus imports from ink', () => {
    const content = readRepoFile(`${TUI_COMPONENTS}/LocalStatus.tsx`);
    expect(content).toMatch(/from ['"]ink['"]/);
  });

  it('PipelineSummary imports from ink', () => {
    const content = readRepoFile(`${TUI_COMPONENTS}/PipelineSummary.tsx`);
    expect(content).toMatch(/from ['"]ink['"]/);
  });

  it('CriticalBanner imports from ink', () => {
    const content = readRepoFile(`${TUI_COMPONENTS}/CriticalBanner.tsx`);
    expect(content).toMatch(/from ['"]ink['"]/);
  });
});
