export {};

declare global {
  interface Window {
    zazig: {
      onPipelineUpdate(callback: (payload: unknown) => void): () => void;
      onCompaniesLoaded(
        callback: (payload: { companies: Array<{ id: string; name: string }>; selectedId: string | null }) => void,
      ): () => void;
      onExpertSessionAutoSwitch(callback: (payload: unknown) => void): () => void;
      terminalAttach(session: string): Promise<unknown>;
      terminalDetach(): Promise<unknown>;
      terminalAttachDefault(): Promise<unknown>;
      onTerminalOutput(callback: (payload: string) => void): () => void;
      terminalInput(data: string): void;
      terminalResize(cols: number, rows: number): void;
      selectCompany(id: string): void;
      saveAttachment(fileName: string, data: Uint8Array): Promise<string>;
    };
  }
}
