import React from "react";
import { Box, Text, useInput } from "ink";
import { AgentSession, isPersistentAgent } from "../lib/tmux.js";

type TopBarProps = {
  sessions?: AgentSession[];
  selectedSession?: AgentSession | null;
  onSelect?: (session: AgentSession | null) => void;
};

export default function TopBar({
  sessions = [],
  selectedSession = null,
  onSelect,
}: TopBarProps): React.JSX.Element {
  useInput((input, key) => {
    if (!onSelect || sessions.length === 0) return;

    if (key.tab) {
      const currentIndex = sessions.findIndex(s => s.sessionName === selectedSession?.sessionName);
      const nextIndex = (currentIndex + 1) % sessions.length;
      onSelect(sessions[nextIndex]);
      return;
    }

    const digit = parseInt(input, 10);
    if (!isNaN(digit) && digit >= 1 && digit <= 9) {
      const index = digit - 1;
      if (index < sessions.length) {
        onSelect(sessions[index]);
      }
    }
  });

  return (
    <Box width="100%" justifyContent="space-between" paddingX={1}>
      <Box flexDirection="row" gap={1}>
        <Text>zazig</Text>
        {sessions.length === 0 ? (
          <Text color="gray">[Tab: Sessions] [Tab: Jobs] [Tab: Activity]</Text>
        ) : (
          sessions.map((session, index) => {
            const isSelected = session.sessionName === selectedSession?.sessionName;
            const isPersistent = isPersistentAgent(session.role);
            const label = `${index + 1}:${session.role.toUpperCase()}`;

            if (!session.isAlive) {
              return (
                <Text key={session.sessionName} dimColor>
                  {label}
                </Text>
              );
            }

            if (!isPersistent) {
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
          })
        )}
      </Box>
      <Text>0 active  0/0 slots</Text>
    </Box>
  );
}
