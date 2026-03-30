import { useState, useEffect } from 'react';
import { listAgentSessions, AgentSession } from '../lib/tmux.js';

interface UseTmuxSessionsResult {
  sessions: AgentSession[];
  selectedSession: AgentSession | null;
  setSelectedSession: (session: AgentSession | null) => void;
}

export function useTmuxSessions(): UseTmuxSessionsResult {
  const [sessions, setSessions] = useState<AgentSession[]>([]);
  const [selectedSession, setSelectedSession] = useState<AgentSession | null>(null);

  useEffect(() => {
    const poll = () => {
      const current = listAgentSessions();
      setSessions(current);
      // Auto-select first session if none selected
      setSelectedSession(prev => {
        if (prev === null && current.length > 0) {
          return current[0];
        }
        // Keep selected if still alive
        if (prev !== null) {
          const still = current.find(s => s.sessionName === prev.sessionName);
          return still ?? (current.length > 0 ? current[0] : null);
        }
        return prev;
      });
    };

    poll();
    const interval = setInterval(poll, 5000);
    return () => clearInterval(interval);
  }, []);

  return { sessions, selectedSession, setSelectedSession };
}
