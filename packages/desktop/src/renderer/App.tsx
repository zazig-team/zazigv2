import React, { useState } from 'react';

import PipelineColumn, { type PipelineJob } from './components/PipelineColumn';

export default function App(): React.JSX.Element {
  const [selectedJob, setSelectedJob] = useState<PipelineJob | null>(null);
  const [watchedJob, setWatchedJob] = useState<PipelineJob | null>(null);

  return (
    <div
      style={{
        display: 'flex',
        width: '100%',
        height: '100vh',
        minHeight: '100vh',
        background: '#050b16',
        color: '#e6edff',
        fontFamily: '"IBM Plex Sans", "Segoe UI", sans-serif',
      }}
    >
      <PipelineColumn
        onJobClick={(job) => setSelectedJob(job)}
        onWatchClick={(job) => {
          setSelectedJob(job);
          setWatchedJob(job);
        }}
      />

      <div
        className="terminal-pane"
        style={{
          flex: 1,
          minWidth: 0,
          display: 'flex',
          flexDirection: 'column',
          padding: 18,
          borderLeft: '1px solid #1b2940',
        }}
      >
        <div style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.9, color: '#9cadc8' }}>
          Terminal Pane
        </div>
        <div
          style={{
            marginTop: 10,
            borderRadius: 10,
            border: '1px solid #223552',
            background: '#040a13',
            flex: 1,
            padding: 14,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ fontSize: 13, color: '#d6e3ff' }}>
            {watchedJob
              ? `Watching ${watchedJob.title} (${watchedJob.featureName}).`
              : 'Select a running job and click Watch to attach its tmux session.'}
          </div>
          <div style={{ fontSize: 11, color: '#8da0c2' }}>
            {selectedJob
              ? `Selected job: ${selectedJob.title}`
              : 'No active job selected.'}
          </div>
        </div>
      </div>
    </div>
  );
}
