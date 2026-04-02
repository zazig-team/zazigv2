import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import PipelineColumn, {
  type PersistentAgent,
  type PipelineJob,
} from './components/PipelineColumn';
import { TerminalPane } from './components/TerminalPane';
import { derivePersistentAgents, queuePersistentAgentSwitch } from './persistent-agents';

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

type AnyRecord = Record<string, unknown>;

function isRecord(value: unknown): value is AnyRecord {
  return typeof value === 'object' && value !== null;
}

function asRecord(value: unknown): AnyRecord {
  return isRecord(value) ? value : {};
}

function parseExpertSessionId(payload: unknown): string | null {
  if (typeof payload === 'string' && payload.length > 0) {
    return payload;
  }

  if (payload && typeof payload === 'object') {
    const sessionId =
      'sessionId' in payload && typeof payload.sessionId === 'string'
        ? payload.sessionId
        : 'session_id' in payload && typeof payload.session_id === 'string'
          ? payload.session_id
          : null;

    if (sessionId && sessionId.length > 0) {
      return sessionId;
    }
  }

  return null;
}

export function App(): JSX.Element {
  const [activeSession, setActiveSession] = useState<string | null>(null);
  const [latestStatus, setLatestStatus] = useState<AnyRecord>({});
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

  useEffect(() => {
    const unsubscribe = window.zazig.onPipelineUpdate((payload: unknown) => {
      const root = asRecord(payload);
      setLatestStatus(asRecord(root.status));
    });

    return () => {
      unsubscribe();
    };
  }, []);

  const persistentAgents = useMemo(
    () => derivePersistentAgents(latestStatus, activeSession),
    [latestStatus, activeSession],
  );

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

  const onAgentClick = useCallback(
    (agent: PersistentAgent) => {
      queuePersistentAgentSwitch(agent, {
        queueTerminalTransition,
        terminalDetach: window.zazig.terminalDetach,
        terminalAttach: window.zazig.terminalAttach,
        setTerminalMessage,
        setActiveSession,
        activeSessionRef,
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

  const onExpertClick = useCallback((sessionId: string) => {
    if (!sessionId) return;

    transitionQueueRef.current = transitionQueueRef.current
      .then(async () => {
        setTerminalMessage(undefined);

        const previousSession = activeSessionRef.current;
        if (previousSession !== sessionId) {
          await window.zazig.terminalDetach();
          await window.zazig.terminalAttach(sessionId);
        }

        activeSessionRef.current = sessionId;
        setActiveSession(sessionId);
      })
      .catch((error) => {
        console.error('[desktop] Failed to switch terminal session', error);
      });
  }, []);

  useEffect(() => {
    const unsubscribe = window.zazig.onExpertSessionAutoSwitch((payload: unknown) => {
      const sessionId = parseExpertSessionId(payload);
      if (!sessionId) {
        return;
      }

      // expert-session:auto-switch — route through transitionQueueRef to prevent races
      transitionQueueRef.current = transitionQueueRef.current
        .then(async () => {
          setTerminalMessage(undefined);

          const previousSession = activeSessionRef.current;
          if (previousSession !== sessionId) {
            await window.zazig.terminalDetach();
            await window.zazig.terminalAttach(sessionId);
          }

          activeSessionRef.current = sessionId;
          setActiveSession(sessionId);
        })
        .catch((error) => {
          console.error('[desktop] Failed to handle expert-session:auto-switch', error);
        });
    });

    return () => {
      unsubscribe();
    };
  }, []);

  return (
    <div style={rootStyle}>
      <PipelineColumn
        activeSession={activeSession}
        persistentAgents={persistentAgents}
        onAgentClick={onAgentClick}
        onExpertClick={onExpertClick}
        onJobClick={onJobClick}
        onWatchClick={onWatchClick}
      />
      <main style={terminalPaneStyle}>
        <TerminalPane message={terminalMessage} />
      </main>
    </div>
  );
}
