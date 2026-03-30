import { useState, useEffect, useRef } from 'react';
import { listAgentSessions, isPersistentAgent } from '../lib/tmux.js';

export interface AgentSession {
  role: string;
  sessionName: string;
  isAlive: boolean;
}

interface UseTmuxSessionsResult {
  sessions: AgentSession[];
  selectedSession: AgentSession | null;
  setSelectedSession: (session: AgentSession | null) => void;
}

export function useTmuxSessions(): UseTmuxSessionsResult {
  const [sessions, setSessions] = useState<AgentSession[]>([]);
  const [selectedSession, setSelectedSession] = useState<AgentSession | null>(null);
  const didAutoSelectRef = useRef(false);

  useEffect(() => {
    const pickInitialSession = (current: AgentSession[]): AgentSession | null => {
      if (current.length === 0) {
        return null;
      }

      const firstPersistent = current.find(session => isPersistentAgent(session.role));
      return firstPersistent ?? current[0];
    };

    const poll = async () => {
      const current = await Promise.resolve(listAgentSessions());
      setSessions(current);

      if (!didAutoSelectRef.current) {
        setSelectedSession(pickInitialSession(current));
        didAutoSelectRef.current = true;
        return;
      }

      setSelectedSession(prev => {
        if (prev === null) {
          return null;
        }

        const stillExists = current.find(s => s.sessionName === prev.sessionName);
        return stillExists ?? null;
      });
    };

    void poll();
    const interval = setInterval(poll, 5000);
    return () => clearInterval(interval);
  }, []);

  return { sessions, selectedSession, setSelectedSession };
}
