import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import PipelineColumn, {
  type PersistentAgent,
  type PipelineJob,
} from './components/PipelineColumn';
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

type AnyRecord = Record<string, unknown>;

function isRecord(value: unknown): value is AnyRecord {
  return typeof value === 'object' && value !== null;
}

function asRecord(value: unknown): AnyRecord {
  return isRecord(value) ? value : {};
}

function asRecordArray(value: unknown): AnyRecord[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isRecord);
}

function getString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function getTmuxSessionNames(status: AnyRecord): string[] {
  const rawTmuxSessions = status.tmux_sessions ?? status.tmuxSessions ?? [];
  if (!Array.isArray(rawTmuxSessions)) return [];

  const sessionNames: string[] = [];
  for (const session of rawTmuxSessions) {
    if (typeof session === 'string') {
      const name = session.trim();
      if (name.length > 0) {
        sessionNames.push(name);
      }
      continue;
    }

    if (!isRecord(session)) {
      continue;
    }

    const name =
      getString(session.session_name) ||
      getString(session.sessionName) ||
      getString(session.session) ||
      getString(session.name);
    if (name.length > 0) {
      sessionNames.push(name);
    }
  }

  return sessionNames;
}

function derivePersistentAgents(status: AnyRecord, activeSession: string | null): PersistentAgent[] {
  const persistentAgents = asRecordArray(status.persistent_agents ?? status.persistentAgents);
  const tmuxSessionNames = getTmuxSessionNames(status);

  return persistentAgents
    .map((agent, index) => {
      const role =
        getString(agent.role) ||
        getString(agent.role_name) ||
        getString(agent.roleName) ||
        `agent-${index + 1}`;
      const roleSuffix = `-${role.toLowerCase()}`;
      const sessionName = tmuxSessionNames.find((name) => name.endsWith(roleSuffix)) ?? null;
      const isRunning = sessionName !== null;

      return {
        role,
        sessionName,
        isRunning,
        isActive: Boolean(sessionName && activeSession === sessionName),
      };
    })
    .filter((agent) => agent.role.length > 0);
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
      if (!agent.sessionName) {
        return;
      }

      queueTerminalTransition(async () => {
        setTerminalMessage(undefined);
        await window.zazig.terminalDetach();
        await window.zazig.terminalAttach(agent.sessionName);
        activeSessionRef.current = agent.sessionName;
        setActiveSession(agent.sessionName);
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
        persistentAgents={persistentAgents}
        onAgentClick={onAgentClick}
        onJobClick={onJobClick}
        onWatchClick={onWatchClick}
      />
      <main style={terminalPaneStyle}>
        <TerminalPane message={terminalMessage} />
      </main>
    </div>
  );
}
