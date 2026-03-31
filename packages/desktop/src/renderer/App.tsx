import React, { useState } from 'react';

import PipelineColumn, { type PipelineJob } from './components/PipelineColumn';
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

const terminalPaneStyle: React.CSSProperties = {
  minWidth: 0,
  minHeight: 0,
};

export function App(): JSX.Element {
  const [selectedJob, setSelectedJob] = useState<PipelineJob | null>(null);
  const [watchedJob, setWatchedJob] = useState<PipelineJob | null>(null);

  return (
    <div style={rootStyle}>
      <PipelineColumn
        onJobClick={(job) => setSelectedJob(job)}
        onWatchClick={(job) => {
          setSelectedJob(job);
          setWatchedJob(job);
        }}
      />
      <main style={terminalPaneStyle}>
        <TerminalPane />
      </main>
    </div>
  );
}
