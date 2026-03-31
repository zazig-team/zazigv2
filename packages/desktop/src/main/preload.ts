import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';

import {
  PIPELINE_UPDATE,
  TERMINAL_ATTACH,
  TERMINAL_DETACH,
  TERMINAL_INPUT,
  TERMINAL_OUTPUT,
  TERMINAL_RESIZE,
} from './ipc-channels';

type PipelineUpdateCallback = (payload: unknown) => void;
type TerminalOutputCallback = (payload: string) => void;
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
  onTerminalOutput(callback: TerminalOutputCallback): Unsubscribe {
    return subscribe(TERMINAL_OUTPUT, callback);
  },
  terminalInput(data: string): void {
    ipcRenderer.send(TERMINAL_INPUT, data);
  },
  terminalResize(cols: number, rows: number): void {
    ipcRenderer.send(TERMINAL_RESIZE, { cols, rows });
  },
};

contextBridge.exposeInMainWorld('zazig', zazigBridge);
