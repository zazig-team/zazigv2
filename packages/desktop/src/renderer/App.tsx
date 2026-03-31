import React from 'react';

import { TerminalPane } from './components/TerminalPane';

const rootStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '280px minmax(0, 1fr)',
  height: '100vh',
  width: '100vw',
  background: '#111827',
  color: '#e5e7eb',
  fontFamily: 'Inter, system-ui, -apple-system, Segoe UI, sans-serif',
};

const sidebarStyle: React.CSSProperties = {
  borderRight: '1px solid rgba(148, 163, 184, 0.25)',
  padding: '16px',
  boxSizing: 'border-box',
};

const terminalPaneStyle: React.CSSProperties = {
  minWidth: 0,
  minHeight: 0,
};

export function App(): JSX.Element {
  return (
    <div style={rootStyle}>
      <aside style={sidebarStyle}>
        <div style={{ fontWeight: 700, marginBottom: 12 }}>Pipeline</div>
        <div style={{ opacity: 0.8, fontSize: 13 }}>Select an active session to watch in terminal.</div>
      </aside>
      <main style={terminalPaneStyle}>
        <TerminalPane />
      </main>
    </div>
  );
}
