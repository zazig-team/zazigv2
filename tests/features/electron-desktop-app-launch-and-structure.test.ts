/**
 * Feature: Electron Desktop App v1.0 — Launch, structure, and pipeline column
 *
 * Tests for acceptance criteria:
 *  AC1: zazig desktop launches an Electron window with split-view layout
 *  AC2: Pipeline column shows active jobs, failed features, backlog, and recently completed
 *  AC9: Clicking Watch on a non-running job shows appropriate message
 * AC10: App works without code signing on macOS
 *
 * Static analysis of packages/desktop and the zazig desktop CLI command.
 * Written to FAIL against the current codebase; pass once the feature is built.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');

const DESKTOP_PKG_JSON = 'packages/desktop/package.json';
const DESKTOP_MAIN = 'packages/desktop/src/main.ts';
const DESKTOP_RENDERER_DIR = 'packages/desktop/src/renderer';
const CLI_DESKTOP_CMD = 'packages/cli/src/commands/desktop.ts';

function readRepoFile(relPath: string): string | null {
  const fullPath = path.join(REPO_ROOT, relPath);
  try {
    return fs.readFileSync(fullPath, 'utf-8');
  } catch {
    return null;
  }
}

function dirExists(relPath: string): boolean {
  const fullPath = path.join(REPO_ROOT, relPath);
  try {
    return fs.statSync(fullPath).isDirectory();
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// AC1: zazig desktop launches an Electron window with split-view layout
// ---------------------------------------------------------------------------

describe('AC1: zazig desktop CLI command exists and spawns Electron', () => {
  let cliContent: string | null;

  beforeAll(() => {
    cliContent = readRepoFile(CLI_DESKTOP_CMD);
  });

  it('packages/cli/src/commands/desktop.ts exists', () => {
    expect(cliContent, `File not found: ${CLI_DESKTOP_CMD}`).not.toBeNull();
  });

  it('desktop command spawns Electron (references electron or spawn)', () => {
    expect(cliContent).toMatch(/electron|spawn/i);
  });

  it('desktop command launches packages/desktop', () => {
    expect(cliContent).toMatch(/desktop/i);
  });
});

describe('AC1: packages/desktop package exists with Electron dependency', () => {
  let pkgContent: string | null;
  let pkg: Record<string, unknown> | null;

  beforeAll(() => {
    pkgContent = readRepoFile(DESKTOP_PKG_JSON);
    try {
      pkg = pkgContent ? JSON.parse(pkgContent) : null;
    } catch {
      pkg = null;
    }
  });

  it('packages/desktop/package.json exists', () => {
    expect(pkgContent, `File not found: ${DESKTOP_PKG_JSON}`).not.toBeNull();
  });

  it('Electron is listed as a dependency (dev or direct)', () => {
    const allDeps = {
      ...(pkg as any)?.dependencies,
      ...(pkg as any)?.devDependencies,
    };
    const hasElectron = 'electron' in allDeps;
    expect(hasElectron, 'electron must be listed in dependencies or devDependencies').toBe(true);
  });

  it('package uses esbuild for bundling', () => {
    const allDeps = {
      ...(pkg as any)?.dependencies,
      ...(pkg as any)?.devDependencies,
    };
    const hasEsbuild = 'esbuild' in allDeps;
    expect(hasEsbuild, 'esbuild must be listed as a build dependency').toBe(true);
  });
});

describe('AC1: Electron main process creates a BrowserWindow', () => {
  let mainContent: string | null;

  beforeAll(() => {
    mainContent = readRepoFile(DESKTOP_MAIN);
  });

  it('packages/desktop/src/main.ts exists', () => {
    expect(mainContent, `File not found: ${DESKTOP_MAIN}`).not.toBeNull();
  });

  it('imports or requires BrowserWindow from electron', () => {
    expect(mainContent).toMatch(/BrowserWindow/);
  });

  it('creates a BrowserWindow instance', () => {
    expect(mainContent).toMatch(/new BrowserWindow/);
  });

  it('loads a renderer HTML file or URL', () => {
    expect(mainContent).toMatch(/loadFile|loadURL/);
  });
});

describe('AC1: Renderer implements two-panel split-view layout', () => {
  it('packages/desktop/src/renderer directory exists', () => {
    expect(dirExists(DESKTOP_RENDERER_DIR), `Directory not found: ${DESKTOP_RENDERER_DIR}`).toBe(true);
  });

  it('renderer contains React component files', () => {
    const rendererPath = path.join(REPO_ROOT, DESKTOP_RENDERER_DIR);
    let files: string[] = [];
    try {
      files = fs.readdirSync(rendererPath, { recursive: true } as any) as string[];
    } catch {
      files = [];
    }
    const hasReactFiles = files.some(f => String(f).match(/\.(tsx|jsx)$/));
    expect(hasReactFiles, 'renderer directory must contain .tsx or .jsx React files').toBe(true);
  });

  it('renderer has a split/panel layout component (App or Layout)', () => {
    const appTsx = readRepoFile('packages/desktop/src/renderer/App.tsx')
      ?? readRepoFile('packages/desktop/src/renderer/app.tsx')
      ?? readRepoFile('packages/desktop/src/renderer/Layout.tsx');
    expect(appTsx, 'App.tsx or Layout.tsx must exist in renderer').not.toBeNull();
    // Must reference split-view or two-panel structure
    expect(appTsx).toMatch(/split|panel|flex|grid/i);
  });
});

// ---------------------------------------------------------------------------
// AC2: Pipeline column shows active jobs, failed features, backlog, recently completed
// ---------------------------------------------------------------------------

describe('AC2: Pipeline column component shows all required sections', () => {
  let pipelineContent: string | null;

  beforeAll(() => {
    pipelineContent =
      readRepoFile('packages/desktop/src/renderer/Pipeline.tsx')
      ?? readRepoFile('packages/desktop/src/renderer/PipelineColumn.tsx')
      ?? readRepoFile('packages/desktop/src/renderer/components/Pipeline.tsx')
      ?? readRepoFile('packages/desktop/src/renderer/components/PipelineColumn.tsx');
  });

  it('Pipeline column component file exists', () => {
    expect(pipelineContent, 'Pipeline.tsx or PipelineColumn.tsx must exist').not.toBeNull();
  });

  it('shows active jobs section', () => {
    expect(pipelineContent).toMatch(/active.*job|activeJob|Active Job/i);
  });

  it('shows failed features section', () => {
    expect(pipelineContent).toMatch(/failed|Failed/);
  });

  it('shows backlog section', () => {
    expect(pipelineContent).toMatch(/backlog|Backlog/i);
  });

  it('shows recently completed section', () => {
    expect(pipelineContent).toMatch(/completed|Completed|recent/i);
  });

  it('has a status bar showing daemon running/stopped state', () => {
    expect(pipelineContent).toMatch(/daemon|running|stopped|status/i);
  });

  it('displays company name in status bar', () => {
    expect(pipelineContent).toMatch(/company|companyName/i);
  });
});

describe('AC2: Recently completed section shows last 5 and is collapsible', () => {
  let pipelineContent: string | null;

  beforeAll(() => {
    pipelineContent =
      readRepoFile('packages/desktop/src/renderer/Pipeline.tsx')
      ?? readRepoFile('packages/desktop/src/renderer/PipelineColumn.tsx')
      ?? readRepoFile('packages/desktop/src/renderer/components/Pipeline.tsx')
      ?? readRepoFile('packages/desktop/src/renderer/components/PipelineColumn.tsx');
  });

  it('limits recently completed to 5 items', () => {
    expect(pipelineContent).toMatch(/\.slice\(0,\s*5\)|\.slice\(0,5\)|last.*5|5.*recent/i);
  });

  it('recently completed section is collapsible', () => {
    expect(pipelineContent).toMatch(/collapse|expanded|toggle|isOpen/i);
  });
});

// ---------------------------------------------------------------------------
// AC9: Clicking Watch on non-running job shows appropriate message
// ---------------------------------------------------------------------------

describe('AC9: Watch button on non-running job shows "not running locally" message', () => {
  let pipelineContent: string | null;

  beforeAll(() => {
    pipelineContent =
      readRepoFile('packages/desktop/src/renderer/Pipeline.tsx')
      ?? readRepoFile('packages/desktop/src/renderer/PipelineColumn.tsx')
      ?? readRepoFile('packages/desktop/src/renderer/components/Pipeline.tsx')
      ?? readRepoFile('packages/desktop/src/renderer/components/PipelineColumn.tsx');
  });

  it('renders a Watch button', () => {
    expect(pipelineContent).toMatch(/Watch|watch/);
  });

  it('shows a "not running locally" or equivalent message when Watch clicked on non-running job', () => {
    expect(pipelineContent).toMatch(/not running locally|not running|no.*session/i);
  });
});

// ---------------------------------------------------------------------------
// AC10: App works without code signing on macOS
// ---------------------------------------------------------------------------

describe('AC10: No code signing, DMG, or auto-update configuration', () => {
  let pkgContent: string | null;
  let pkg: Record<string, unknown> | null;

  beforeAll(() => {
    pkgContent = readRepoFile(DESKTOP_PKG_JSON);
    try {
      pkg = pkgContent ? JSON.parse(pkgContent) : null;
    } catch {
      pkg = null;
    }
  });

  it('no electron-builder or electron-forge signing config in package.json', () => {
    const str = pkgContent ?? '';
    const hasSigningConfig = /identity|codesign|signing|certificat/i.test(str);
    expect(hasSigningConfig, 'package.json must not contain code signing configuration').toBe(false);
  });

  it('no DMG build target specified', () => {
    const str = pkgContent ?? '';
    expect(str).not.toMatch(/"dmg"|'dmg'/);
  });

  it('no auto-update package listed as dependency', () => {
    const allDeps = {
      ...(pkg as any)?.dependencies,
      ...(pkg as any)?.devDependencies,
    };
    const hasAutoUpdate = Object.keys(allDeps).some(k => /auto.?update|updater/i.test(k));
    expect(hasAutoUpdate, 'auto-update packages must not be present').toBe(false);
  });
});
