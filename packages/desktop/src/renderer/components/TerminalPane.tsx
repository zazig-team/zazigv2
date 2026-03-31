import React, { useEffect, useRef, useState } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';

const terminalHostStyle: React.CSSProperties = {
  width: '100%',
  height: '100%',
  padding: '12px',
  boxSizing: 'border-box',
  background: '#0d1117',
};

const disconnectedStyle: React.CSSProperties = {
  position: 'absolute',
  top: 12,
  right: 12,
  background: 'rgba(31, 41, 55, 0.86)',
  border: '1px solid rgba(148, 163, 184, 0.35)',
  color: '#d1d5db',
  fontSize: 12,
  lineHeight: '18px',
  borderRadius: 999,
  padding: '3px 10px',
  pointerEvents: 'none',
};

export function TerminalPane(): JSX.Element {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [disconnected, setDisconnected] = useState(false);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const terminal = new Terminal({
      cursorBlink: true,
      scrollback: 2_000,
      convertEol: true,
      fontFamily: 'Menlo, Monaco, Consolas, monospace',
      fontSize: 13,
      theme: {
        background: '#0d1117',
      },
    });
    const fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);
    terminal.open(container);
    fitAddon.fit();

    const mouseModeEnabled = true;
    (terminal.options as unknown as { mouseEvents?: boolean }).mouseEvents = mouseModeEnabled;

    const onOutputUnsubscribe = window.zazig.onTerminalOutput((data) => {
      if (data === '') {
        setDisconnected(true);
        return;
      }

      setDisconnected(false);
      terminal.write(data);
    });

    const onTerminalDataDispose = terminal.onData((data) => {
      window.zazig.terminalInput(data);
    });

    const sendResize = (): void => {
      fitAddon.fit();
      window.zazig.terminalResize(terminal.cols, terminal.rows);
    };

    const resizeObserver = new ResizeObserver(() => {
      sendResize();
    });
    resizeObserver.observe(container);
    window.addEventListener('resize', sendResize);
    sendResize();

    return () => {
      onOutputUnsubscribe();
      onTerminalDataDispose.dispose();
      resizeObserver.disconnect();
      window.removeEventListener('resize', sendResize);
      terminal.dispose();
    };
  }, []);

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <div ref={containerRef} style={terminalHostStyle} />
      {disconnected ? <div style={disconnectedStyle}>Disconnected</div> : null}
    </div>
  );
}
