status: pass
summary: Added IPC plumbing for drag-and-drop file saving — SAVE_ATTACHMENT channel in ipc-channels.ts, saveAttachment on the preload bridge, ipcMain handler in index.ts that writes to ~/.zazigv2/attachments/, and drag-and-drop handlers in TerminalPane.tsx that inject saved paths into the terminal.
files_changed:
  - packages/desktop/src/main/ipc-channels.ts
  - packages/desktop/src/main/preload.ts
  - packages/desktop/src/main/index.ts
  - packages/desktop/src/renderer/components/TerminalPane.tsx
  - packages/desktop/src/renderer/global.d.ts
