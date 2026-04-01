import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';

import {
  COMPANIES_LOADED,
  PIPELINE_UPDATE,
  SAVE_ATTACHMENT,
  SELECT_COMPANY,
  TERMINAL_ATTACH,
  TERMINAL_ATTACH_DEFAULT,
  TERMINAL_DETACH,
  TERMINAL_INPUT,
  TERMINAL_OUTPUT,
  TERMINAL_RESIZE,
} from './ipc-channels';

type PipelineUpdateCallback = (payload: unknown) => void;
type TerminalOutputCallback = (payload: string) => void;
type CompaniesLoadedCallback = (payload: unknown) => void;
type Unsubscribe = () => void;

function subscribe<T>(channel: string, callback: (payload: T) => void): Unsubscribe {
  const listener = (_event: IpcRendererEvent, payload: T) => {
    callback(payload);
  };

  ipcRenderer.on(channel, listener);
  return () => {
    ipcRenderer.removeListener(channel, listener);
  };
}

const zazigBridge = {
  onPipelineUpdate(callback: PipelineUpdateCallback): Unsubscribe {
    return subscribe(PIPELINE_UPDATE, callback);
  },
  terminalAttach(session: string): Promise<unknown> {
    return ipcRenderer.invoke(TERMINAL_ATTACH, session);
  },
  terminalDetach(): Promise<unknown> {
    return ipcRenderer.invoke(TERMINAL_DETACH);
  },
  terminalAttachDefault(): Promise<unknown> {
    return ipcRenderer.invoke(TERMINAL_ATTACH_DEFAULT);
  },
  onTerminalOutput(callback: TerminalOutputCallback): Unsubscribe {
    return subscribe(TERMINAL_OUTPUT, callback);
  },
  terminalInput(data: string): void {
    ipcRenderer.send(TERMINAL_INPUT, data);
  },
  terminalResize(cols: number, rows: number): void {
    ipcRenderer.send(TERMINAL_RESIZE, { cols, rows });
  },
  onCompaniesLoaded(callback: CompaniesLoadedCallback): Unsubscribe {
    return subscribe(COMPANIES_LOADED, callback);
  },
  selectCompany(id: string): void {
    ipcRenderer.send(SELECT_COMPANY, id);
  },
  saveAttachment(fileName: string, data: Uint8Array): Promise<string> {
    return ipcRenderer.invoke(SAVE_ATTACHMENT, fileName, Array.from(data));
  },
};

contextBridge.exposeInMainWorld('zazig', zazigBridge);
