import React from 'react';
import { Box, Text, useInput } from 'ink';
import { AgentSession } from '../lib/tmux.js';
import { isPersistentAgent } from '../lib/tmux.js';

interface TopBarProps {
  sessions: AgentSession[];
  selectedSession: AgentSession | null;
  setSelectedSession: (session: AgentSession | null) => void;
}

export function TopBar({ sessions, selectedSession, setSelectedSession }: TopBarProps) {
  useInput((input, key) => {
    if (key.tab) {
      // Cycle to next session
      if (sessions.length === 0) return;
      const currentIndex = sessions.findIndex(s => s.sessionName === selectedSession?.sessionName);
      const nextIndex = (currentIndex + 1) % sessions.length;
      setSelectedSession(sessions[nextIndex]);
      return;
    }

    // Number keys 1-9 for direct selection
    const digit = parseInt(input, 10);
    if (!isNaN(digit) && digit >= 1 && digit <= 9) {
      const index = digit - 1;
      if (index < sessions.length) {
        setSelectedSession(sessions[index]);
      }
    }
  });

  return (
    <Box flexDirection="row" justifyContent="space-between" paddingX={1}>
      <Box flexDirection="row" gap={1}>
        {sessions.map((session, index) => {
          const isSelected = session.sessionName === selectedSession?.sessionName;
          const isPersistent = isPersistentAgent(session.role);
          const label = `${index + 1}:${session.role.toUpperCase()}`;

          if (!session.isAlive) {
            // Persistent agents shown dimmed when not alive
            return (
              <Text key={session.sessionName} dimColor>
                {label}
              </Text>
            );
          }

          if (!isPersistent) {
            // Expert sessions get a bullet indicator
            return (
              <Text key={session.sessionName} inverse={isSelected}>
                {isSelected ? `[• ${label}]` : `• ${label}`}
              </Text>
            );
          }

          return (
            <Text key={session.sessionName} inverse={isSelected} underline={isSelected}>
              {isSelected ? `[${label}]` : label}
            </Text>
          );
        })}
      </Box>
      <Box>
        <Text>0 active  0/0 slots</Text>
      </Box>
    </Box>
  );
}
