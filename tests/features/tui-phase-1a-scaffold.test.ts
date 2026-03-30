/**
 * Feature: TUI Phase 1a: Scaffold packages/tui with Ink and zazig ui command
 *
 * Tests encode the acceptance criteria for the TUI scaffold:
 * - packages/tui exists with correct package.json, tsconfig.json, and source files
 * - Layout components: TopBar, SessionPane, Sidebar
 * - App.tsx root layout with three regions
 * - CLI ui command that starts daemon and launches the Ink app
 * - zazig start still works independently
 *
 * Written to FAIL against the current codebase until the feature is implemented.
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

function fileExists(relPath: string): boolean {
  return fs.existsSync(path.join(REPO_ROOT, relPath));
}

// ---------------------------------------------------------------------------
// AC1: packages/tui package structure exists
// ---------------------------------------------------------------------------

describe('AC1: packages/tui package structure', () => {
  it('packages/tui/package.json exists', () => {
    expect(fileExists('packages/tui/package.json'), 'packages/tui/package.json not found').toBe(true);
  });

  it('packages/tui/package.json has ink dependency', () => {
    const content = readRepoFile('packages/tui/package.json');
    expect(content).not.toBeNull();
    expect(content).toMatch(/"ink"/);
  });

  it('packages/tui/package.json has react dependency', () => {
    const content = readRepoFile('packages/tui/package.json');
    expect(content).toMatch(/"react"/);
  });

  it('packages/tui/package.json has @types/react dependency', () => {
    const content = readRepoFile('packages/tui/package.json');
    expect(content).toMatch(/@types\/react/);
  });

  it('packages/tui/package.json has build script', () => {
    const content = readRepoFile('packages/tui/package.json');
    expect(content).toMatch(/"build"/);
  });

  it('packages/tui/package.json has dev script', () => {
    const content = readRepoFile('packages/tui/package.json');
    expect(content).toMatch(/"dev"/);
  });

  it('packages/tui/tsconfig.json exists', () => {
    expect(fileExists('packages/tui/tsconfig.json'), 'packages/tui/tsconfig.json not found').toBe(true);
  });

  it('packages/tui/tsconfig.json extends monorepo base config', () => {
    const content = readRepoFile('packages/tui/tsconfig.json');
    expect(content).not.toBeNull();
    expect(content).toMatch(/"extends"/);
  });
});

// ---------------------------------------------------------------------------
// AC2: src/index.tsx entry point renders Ink app
// ---------------------------------------------------------------------------

describe('AC2: src/index.tsx entry point', () => {
  let content: string | null;

  beforeAll(() => {
    content = readRepoFile('packages/tui/src/index.tsx');
  });

  it('packages/tui/src/index.tsx exists', () => {
    expect(content, 'packages/tui/src/index.tsx not found').not.toBeNull();
  });

  it('imports render from ink', () => {
    expect(content).toMatch(/import.*render.*from ['"]ink['"]/);
  });

  it('imports App component', () => {
    expect(content).toMatch(/import.*App.*from/);
  });

  it('calls render(<App />) to launch the Ink app', () => {
    expect(content).toMatch(/render\s*\(\s*<App\s*\/?\s*>\s*\)/);
  });

  it('accepts --company flag or reads from config', () => {
    // Must reference company flag or config reading
    expect(content).toMatch(/company|--company|getConfig|readConfig/);
  });
});

// ---------------------------------------------------------------------------
// AC3: App.tsx root layout with three regions
// ---------------------------------------------------------------------------

describe('AC3: App.tsx root layout component', () => {
  let content: string | null;

  beforeAll(() => {
    content = readRepoFile('packages/tui/src/App.tsx');
  });

  it('packages/tui/src/App.tsx exists', () => {
    expect(content, 'packages/tui/src/App.tsx not found').not.toBeNull();
  });

  it('imports Box from ink for flexbox layout', () => {
    expect(content).toMatch(/import.*Box.*from ['"]ink['"]/);
  });

  it('renders TopBar component', () => {
    expect(content).toMatch(/TopBar/);
  });

  it('renders SessionPane component', () => {
    expect(content).toMatch(/SessionPane/);
  });

  it('renders Sidebar component', () => {
    expect(content).toMatch(/Sidebar/);
  });

  it('uses flexDirection row for main area split', () => {
    expect(content).toMatch(/flexDirection.*row|row.*flexDirection/);
  });

  it('layout splits main area 70/30 between SessionPane and Sidebar', () => {
    // Should reference 70 and 30 percent values for the split
    expect(content).toMatch(/70|30/);
  });
});

// ---------------------------------------------------------------------------
// AC4: TopBar component displays 'zazig' and placeholder tabs
// ---------------------------------------------------------------------------

describe('AC4: TopBar component', () => {
  let content: string | null;

  beforeAll(() => {
    content = readRepoFile('packages/tui/src/components/TopBar.tsx');
  });

  it('packages/tui/src/components/TopBar.tsx exists', () => {
    expect(content, 'packages/tui/src/components/TopBar.tsx not found').not.toBeNull();
  });

  it('imports from ink', () => {
    expect(content).toMatch(/from ['"]ink['"]/);
  });

  it('displays static text "zazig"', () => {
    expect(content).toMatch(/zazig/);
  });

  it('renders placeholder tabs', () => {
    expect(content).toMatch(/tab|Tab|placeholder|Placeholder/i);
  });
});

// ---------------------------------------------------------------------------
// AC5: SessionPane component shows placeholder text
// ---------------------------------------------------------------------------

describe('AC5: SessionPane component shows placeholder', () => {
  let content: string | null;

  beforeAll(() => {
    content = readRepoFile('packages/tui/src/components/SessionPane.tsx');
  });

  it('packages/tui/src/components/SessionPane.tsx exists', () => {
    expect(content, 'packages/tui/src/components/SessionPane.tsx not found').not.toBeNull();
  });

  it('imports from ink', () => {
    expect(content).toMatch(/from ['"]ink['"]/);
  });

  it('renders placeholder text for session viewer', () => {
    expect(content).toMatch(/Session viewer|session viewer|placeholder/i);
  });
});

// ---------------------------------------------------------------------------
// AC6: Sidebar component shows placeholder text
// ---------------------------------------------------------------------------

describe('AC6: Sidebar component shows placeholder', () => {
  let content: string | null;

  beforeAll(() => {
    content = readRepoFile('packages/tui/src/components/Sidebar.tsx');
  });

  it('packages/tui/src/components/Sidebar.tsx exists', () => {
    expect(content, 'packages/tui/src/components/Sidebar.tsx not found').not.toBeNull();
  });

  it('imports from ink', () => {
    expect(content).toMatch(/from ['"]ink['"]/);
  });

  it('renders placeholder text "Sidebar"', () => {
    expect(content).toMatch(/Sidebar|sidebar|placeholder/i);
  });
});

// ---------------------------------------------------------------------------
// AC7: CLI ui command exists and starts daemon then launches Ink app
// ---------------------------------------------------------------------------

describe('AC7: CLI ui command wires daemon + TUI launch', () => {
  let content: string | null;

  beforeAll(() => {
    content = readRepoFile('packages/cli/src/commands/ui.ts');
  });

  it('packages/cli/src/commands/ui.ts exists', () => {
    expect(content, 'packages/cli/src/commands/ui.ts not found').not.toBeNull();
  });

  it('imports startDaemonForCompany to start daemon if not running', () => {
    expect(content).toMatch(/startDaemonForCompany/);
  });

  it('imports or references the TUI package or index', () => {
    // Must import from packages/tui or the TUI entry
    expect(content).toMatch(/@zazigv2\/tui|packages\/tui|\.\..*tui/);
  });

  it('exports a ui command handler or registers "ui" command', () => {
    expect(content).toMatch(/\bui\b/);
  });

  it('launches the Ink app (calls render or spawns TUI process)', () => {
    expect(content).toMatch(/render|spawn|exec|tui|TUI/i);
  });
});

// ---------------------------------------------------------------------------
// AC8: zazig start still works independently (not broken by ui command)
// ---------------------------------------------------------------------------

describe('AC8: zazig start still works independently', () => {
  let startContent: string | null;
  let uiContent: string | null;

  beforeAll(() => {
    startContent = readRepoFile('packages/cli/src/commands/start.ts');
    uiContent = readRepoFile('packages/cli/src/commands/ui.ts');
  });

  it('packages/cli/src/commands/start.ts still exists', () => {
    expect(startContent, 'start.ts not found — should not have been removed').not.toBeNull();
  });

  it('start.ts still exports a start command', () => {
    expect(startContent).toMatch(/export.*start|start.*command|startDaemon/i);
  });

  it('ui.ts does not import or modify start.ts internals in a breaking way', () => {
    // ui.ts should use the shared daemon lib, not re-export or rewrite start
    if (uiContent !== null) {
      // ui.ts should NOT import directly from start.ts (it should use daemon.ts)
      expect(uiContent).not.toMatch(/from ['"].*commands\/start['"]/);
    }
  });

  it('start.ts still references startDaemonForCompany from daemon lib', () => {
    expect(startContent).toMatch(/startDaemonForCompany/);
  });
});

// ---------------------------------------------------------------------------
// Structural: packages/tui is a valid monorepo workspace package
// ---------------------------------------------------------------------------

describe('Structural: packages/tui registered as workspace', () => {
  it('root package.json includes packages/tui in workspaces', () => {
    const content = readRepoFile('package.json');
    expect(content).not.toBeNull();
    expect(content).toMatch(/packages\/tui/);
  });

  it('packages/tui has a package name', () => {
    const content = readRepoFile('packages/tui/package.json');
    expect(content).not.toBeNull();
    expect(content).toMatch(/"name"\s*:/);
  });
});
