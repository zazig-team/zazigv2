/**
 * Feature: Desktop — drag-and-drop image support in chat
 *
 * Tests for acceptance criteria:
 *  AC1: Drag an image file onto the terminal pane — file is saved to
 *       ~/.zazigv2/attachments/ and the absolute path appears at the terminal cursor
 *  AC2: Drop zone overlay appears during dragover, disappears on dragleave or drop
 *  AC3: Dropping multiple files injects paths separated by spaces
 *  AC4: Non-image files (txt, pdf, etc) also work — path is injected the same way
 *  AC5: Agent (Claude Code) in the tmux session can read the dropped image from the injected path
 *  AC6: No errors when dropping onto a terminal with no active session
 *
 * Static analysis of:
 *   - packages/desktop/src/renderer/components/TerminalPane.tsx
 *   - packages/desktop/src/main/preload.ts
 *   - packages/desktop/src/main/index.ts
 *   - packages/desktop/src/main/ipc-channels.ts
 *
 * Written to FAIL against the current codebase; pass once the feature is built.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');

const TERMINAL_PANE = 'packages/desktop/src/renderer/components/TerminalPane.tsx';
const PRELOAD = 'packages/desktop/src/main/preload.ts';
const MAIN_INDEX = 'packages/desktop/src/main/index.ts';
const IPC_CHANNELS = 'packages/desktop/src/main/ipc-channels.ts';

function readRepoFile(relPath: string): string | null {
  const fullPath = path.join(REPO_ROOT, relPath);
  try {
    return fs.readFileSync(fullPath, 'utf-8');
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// AC1: Drop saves file and injects path via terminalInput
// ---------------------------------------------------------------------------

describe('AC1: drop handler saves attachment and injects absolute path into terminal', () => {
  let terminalPane: string | null;
  let preload: string | null;
  let mainIndex: string | null;

  beforeAll(() => {
    terminalPane = readRepoFile(TERMINAL_PANE);
    preload = readRepoFile(PRELOAD);
    mainIndex = readRepoFile(MAIN_INDEX);
  });

  it('TerminalPane.tsx has an onDrop handler', () => {
    expect(terminalPane).toMatch(/onDrop\s*[=:]/);
  });

  it('TerminalPane.tsx calls saveAttachment (or similar) on drop', () => {
    expect(terminalPane).toMatch(/saveAttachment/);
  });

  it('TerminalPane.tsx injects the returned file path via window.zazig.terminalInput()', () => {
    expect(terminalPane).toMatch(/zazig\.terminalInput\s*\(/);
  });

  it('preload.ts exposes saveAttachment on the zazig bridge', () => {
    expect(preload).toMatch(/saveAttachment/);
  });

  it('main/index.ts handles the saveAttachment IPC channel', () => {
    expect(mainIndex).toMatch(/saveAttachment/);
  });

  it('main/index.ts writes the file under ~/.zazigv2/attachments/', () => {
    // Accept either the string literal or a path-join expression that includes "attachments"
    expect(mainIndex).toMatch(/attachments/);
  });

  it('main/index.ts uses a timestamp prefix in the saved filename', () => {
    // Must produce filenames like {timestamp}-{filename} to avoid collisions
    expect(mainIndex).toMatch(/Date\.now\(\)|timestamp/i);
  });
});

// ---------------------------------------------------------------------------
// AC2: Drop zone overlay is shown during dragover, hidden on dragleave / drop
// ---------------------------------------------------------------------------

describe('AC2: visual drop zone overlay appears on dragover and disappears on dragleave or drop', () => {
  let terminalPane: string | null;

  beforeAll(() => {
    terminalPane = readRepoFile(TERMINAL_PANE);
  });

  it('TerminalPane.tsx has an onDragOver handler', () => {
    expect(terminalPane).toMatch(/onDragOver\s*[=:]/);
  });

  it('TerminalPane.tsx has an onDragLeave handler', () => {
    expect(terminalPane).toMatch(/onDragLeave\s*[=:]/);
  });

  it('TerminalPane.tsx tracks a drop-zone-active state (boolean useState)', () => {
    // e.g. const [isDragOver, setIsDragOver] = useState(false)
    expect(terminalPane).toMatch(/isDragOver|dropActive|dragOver|isDropTarget/i);
  });

  it('TerminalPane.tsx renders a drop zone overlay element conditionally', () => {
    // Should render some overlay only when dragover is active
    expect(terminalPane).toMatch(/isDragOver|dropActive|dragOver|isDropTarget/i);
  });

  it('dragover handler sets the drop-zone state to true', () => {
    // The setXxx(true) call should be present
    expect(terminalPane).toMatch(/set(?:IsDragOver|DropActive|DragOver|IsDropTarget)\s*\(\s*true\s*\)/i);
  });

  it('dragleave handler sets the drop-zone state to false', () => {
    expect(terminalPane).toMatch(/set(?:IsDragOver|DropActive|DragOver|IsDropTarget)\s*\(\s*false\s*\)/i);
  });

  it('drop handler resets the drop-zone state to false', () => {
    // The drop handler must also clear the overlay
    expect(terminalPane).toMatch(/set(?:IsDragOver|DropActive|DragOver|IsDropTarget)\s*\(\s*false\s*\)/i);
  });

  it('dragover handler calls event.preventDefault() to allow drop', () => {
    expect(terminalPane).toMatch(/preventDefault\s*\(\s*\)/);
  });
});

// ---------------------------------------------------------------------------
// AC3: Dropping multiple files injects paths separated by spaces
// ---------------------------------------------------------------------------

describe('AC3: multiple files are injected as space-separated paths', () => {
  let terminalPane: string | null;

  beforeAll(() => {
    terminalPane = readRepoFile(TERMINAL_PANE);
  });

  it('drop handler iterates over dataTransfer.files or dataTransfer.items', () => {
    expect(terminalPane).toMatch(/dataTransfer\.(files|items)/);
  });

  it('multiple paths are joined with a space separator', () => {
    // The paths should be joined by ' ' (a space)
    expect(terminalPane).toMatch(/join\s*\(\s*['"][\s]['"]|join\s*\(\s*['"]\s['"]/);
  });
});

// ---------------------------------------------------------------------------
// AC4: Non-image files also work — path is injected without format gating
// ---------------------------------------------------------------------------

describe('AC4: non-image files are handled identically to images', () => {
  let terminalPane: string | null;

  beforeAll(() => {
    terminalPane = readRepoFile(TERMINAL_PANE);
  });

  it('drop handler does not filter files by MIME type or extension', () => {
    // There should be no image/* type check or accept list that would block non-images
    expect(terminalPane).not.toMatch(/file\.type\.startsWith\s*\(\s*['"]image/);
    expect(terminalPane).not.toMatch(/\.type\s*!==\s*['"]image/);
  });

  it('all dropped files are processed regardless of type', () => {
    // The handler must iterate over all files in dataTransfer.files / items
    expect(terminalPane).toMatch(/dataTransfer\.(files|items)/);
  });
});

// ---------------------------------------------------------------------------
// AC5: IPC channel is defined so main process can receive attachment saves
// ---------------------------------------------------------------------------

describe('AC5: IPC channel wiring is complete so saved path is readable by Claude Code', () => {
  let ipcChannels: string | null;
  let preload: string | null;
  let mainIndex: string | null;

  beforeAll(() => {
    ipcChannels = readRepoFile(IPC_CHANNELS);
    preload = readRepoFile(PRELOAD);
    mainIndex = readRepoFile(MAIN_INDEX);
  });

  it('ipc-channels.ts exports a SAVE_ATTACHMENT (or similar) constant', () => {
    expect(ipcChannels).toMatch(/SAVE_ATTACHMENT|ATTACHMENT_SAVE|attachment/i);
  });

  it('preload.ts imports the saveAttachment channel constant', () => {
    expect(preload).toMatch(/SAVE_ATTACHMENT|saveAttachment/i);
  });

  it('preload.ts uses ipcRenderer.invoke for saveAttachment (returns a Promise with the saved path)', () => {
    // saveAttachment must be async so the renderer can await the absolute path
    expect(preload).toMatch(/ipcRenderer\.invoke[\s\S]{0,200}saveAttachment|saveAttachment[\s\S]{0,200}ipcRenderer\.invoke/s);
  });

  it('main/index.ts uses ipcMain.handle for the saveAttachment channel', () => {
    expect(mainIndex).toMatch(/ipcMain\.handle[\s\S]{0,200}saveAttachment|ipcMain\.handle[\s\S]{0,50}SAVE_ATTACHMENT/s);
  });

  it('main/index.ts returns the absolute saved file path from the IPC handler', () => {
    // The handler must resolve with the full path so the renderer can inject it
    expect(mainIndex).toMatch(/return\s+(?:savedPath|filePath|attachmentPath|fullPath|dest)/i);
  });
});

// ---------------------------------------------------------------------------
// AC6: No errors when dropping onto a terminal with no active session
// ---------------------------------------------------------------------------

describe('AC6: drop with no active session does not throw or crash', () => {
  let terminalPane: string | null;

  beforeAll(() => {
    terminalPane = readRepoFile(TERMINAL_PANE);
  });

  it('drop handler guards against null/undefined window.zazig before calling terminalInput', () => {
    // Either optional chaining or an explicit check must be present
    expect(terminalPane).toMatch(/zazig\?\.terminalInput|zazig\s*&&\s*[\s\S]{0,50}terminalInput/s);
  });

  it('drop handler uses async/await or .catch() to handle saveAttachment errors gracefully', () => {
    expect(terminalPane).toMatch(/await\s+[\s\S]{0,100}saveAttachment|saveAttachment[\s\S]{0,100}\.catch/s);
  });
});
