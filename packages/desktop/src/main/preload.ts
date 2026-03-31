import { contextBridge } from 'electron';

// Expose APIs to the renderer process here as needed.
// This file is intentionally minimal and will be filled in later jobs.
contextBridge.exposeInMainWorld('electronAPI', {});
