import React, { useEffect, useRef, useState } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';

const dropOverlayStyle: React.CSSProperties = {
  position: 'absolute',
  inset: 0,
  background: 'rgba(56, 139, 253, 0.15)',
  border: '2px dashed #388bfd',
  borderRadius: 4,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  color: '#388bfd',
  fontSize: 14,
  fontWeight: 600,
  pointerEvents: 'none',
  zIndex: 10,
};

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

interface TerminalPaneProps {
  message?: string;
}

export function TerminalPane({ message }: TerminalPaneProps): JSX.Element {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const [disconnected, setDisconnected] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);

  const onDragOver = (e: React.DragEvent<HTMLDivElement>): void => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const onDragLeave = (): void => {
    setIsDragOver(false);
  };

  const onDrop = async (e: React.DragEvent<HTMLDivElement>): Promise<void> => {
    e.preventDefault();
    setIsDragOver(false);

    const files = Array.from(e.dataTransfer.files);
    if (files.length === 0) return;

    const paths: string[] = [];
    for (const file of files) {
      try {
        const buffer = await file.arrayBuffer();
        const data = new Uint8Array(buffer);
        const savedPath = await window.zazig?.saveAttachment(file.name, data);
        if (savedPath) {
          paths.push(savedPath);
        }
      } catch (err) {
        console.error('[TerminalPane] Failed to save attachment:', err);
      }
    }

    if (paths.length > 0) {
      window.zazig?.terminalInput(paths.join(' '));
    }
  };

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
    terminalRef.current = terminal;

    const wheelHandler = terminal.attachCustomWheelEventHandler((event: WheelEvent) => {
      if (event.deltaY === 0) return true;
      const escapeSequence = event.deltaY < 0 ? '\x1b[A' : '\x1b[B';
      const repetitions = Math.max(1, Math.abs(Math.round(event.deltaY / 40)));
      for (let i = 0; i < repetitions; i++) {
        window.zazig.terminalInput(escapeSequence);
      }
      return true;
    });

    const onOutputUnsubscribe = window.zazig.onTerminalOutput((data) => {
      if (data === '') {
        setDisconnected(true);
        terminal.clear();
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
      wheelHandler.dispose();
      onOutputUnsubscribe();
      onTerminalDataDispose.dispose();
      resizeObserver.disconnect();
      window.removeEventListener('resize', sendResize);
      terminalRef.current = null;
      terminal.dispose();
    };
  }, []);

  useEffect(() => {
    const terminal = terminalRef.current;
    if (!terminal || !message) return;

    terminal.reset();
    terminal.writeln(message);
    setDisconnected(false);
  }, [message]);

  return (
    <div
      style={{ position: 'relative', width: '100%', height: '100%' }}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      <div ref={containerRef} style={terminalHostStyle} />
      {disconnected ? <div style={disconnectedStyle}>Disconnected</div> : null}
      {isDragOver ? <div style={dropOverlayStyle}>Drop files to attach</div> : null}
    </div>
  );
}
