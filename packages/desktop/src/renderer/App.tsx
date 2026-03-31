import React, { useCallback, useRef, useState } from 'react';

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
  const [activeSession, setActiveSession] = useState<string | null>(null);
  const [terminalMessage, setTerminalMessage] = useState<string | undefined>(undefined);
  const activeSessionRef = useRef<string | null>(null);
  const transitionQueueRef = useRef(Promise.resolve());

  const queueTerminalTransition = useCallback((transition: () => Promise<void>) => {
    transitionQueueRef.current = transitionQueueRef.current
      .then(transition)
      .catch((error) => {
        console.error('[desktop] Failed to switch terminal session', error);
      });
  }, []);

  const onJobClick = useCallback(
    (job: PipelineJob) => {
      queueTerminalTransition(async () => {
        if (!job.hasLocalSession || !job.sessionName) {
          await window.zazig.terminalDetach();
          setTerminalMessage(`Job "${job.title}" is not running locally`);

          activeSessionRef.current = null;
          setActiveSession(null);
          return;
        }

        setTerminalMessage(undefined);

        const previousSession = activeSessionRef.current;
        if (previousSession !== job.sessionName) {
          await window.zazig.terminalDetach();
          await window.zazig.terminalAttach(job.sessionName);
        }

        activeSessionRef.current = job.sessionName;
        setActiveSession(job.sessionName);
      });
    },
    [queueTerminalTransition],
  );

  const onWatchClick = useCallback(
    (job: PipelineJob) => {
      if (job.hasLocalSession && job.sessionName) {
        onJobClick(job);
        return;
      }

      queueTerminalTransition(async () => {
        await window.zazig.terminalDetach();
        setTerminalMessage(`Job "${job.title}" is not running locally`);

        activeSessionRef.current = null;
        setActiveSession(null);
      });
    },
    [onJobClick, queueTerminalTransition],
  );

  return (
    <div style={rootStyle}>
      <PipelineColumn
        activeSession={activeSession}
        onJobClick={onJobClick}
        onWatchClick={onWatchClick}
      />
      <main style={terminalPaneStyle}>
        <TerminalPane message={terminalMessage} />
      </main>
    </div>
  );
}
