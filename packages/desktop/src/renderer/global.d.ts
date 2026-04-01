export {};

declare global {
  interface Window {
    zazig: {
      onPipelineUpdate(callback: (payload: unknown) => void): () => void;
      terminalAttach(session: string): Promise<unknown>;
      terminalDetach(): Promise<unknown>;
      terminalAttachDefault(): Promise<unknown>;
      onTerminalOutput(callback: (payload: string) => void): () => void;
      terminalInput(data: string): void;
      terminalResize(cols: number, rows: number): void;
      saveAttachment(fileName: string, data: Uint8Array): Promise<string>;
    };
  }
}
