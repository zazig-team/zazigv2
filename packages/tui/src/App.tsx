import React from "react";
import { Box } from "ink";
import { useTmuxSessions } from "./hooks/useTmuxSessions.js";
import TopBar from "./components/TopBar.js";
import SessionPane from "./components/SessionPane.js";
import Sidebar from "./components/Sidebar.js";

type AppProps = {
  companyId?: string;
};

export default function App({ companyId }: AppProps): React.JSX.Element {
  const { sessions, selectedSession, setSelectedSession } = useTmuxSessions();

  return (
    <Box flexDirection="column" width="100%" height="100%">
      <Box width="100%" height={1}>
        <TopBar
          sessions={sessions}
          selectedSession={selectedSession}
          onSelect={setSelectedSession}
        />
      </Box>
      <Box flexDirection="row" flexGrow={1}>
        <Box flexGrow={0.7} width="70%">
          <SessionPane companyId={companyId} />
        </Box>
        <Box flexGrow={0.3} width="30%">
          <Sidebar />
        </Box>
      </Box>
    </Box>
  );
}
