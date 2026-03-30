import React from 'react';
import { Box } from 'ink';
import { useTmuxSessions } from './hooks/useTmuxSessions.js';
import { TopBar } from './components/TopBar.js';

export function App() {
  const { sessions, selectedSession, setSelectedSession } = useTmuxSessions();

  return (
    <Box flexDirection="column" height="100%">
      <TopBar
        sessions={sessions}
        selectedSession={selectedSession}
        setSelectedSession={setSelectedSession}
      />
      <Box flexGrow={1}>
        {/* SessionPane will use selectedSession to display the active session */}
      </Box>
    </Box>
  );
}
