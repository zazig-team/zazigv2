import React from 'react';
import { Box, Text } from 'ink';

const agents = [
  { name: 'codex-1', status: 'idle' },
  { name: 'codex-2', status: 'idle' },
  { name: 'cc-1', status: 'idle' },
  { name: 'cc-2', status: 'idle' },
];

const LocalStatus: React.FC = () => {
  return (
    <Box flexDirection="column" borderStyle="single" paddingX={1}>
      <Text bold>THIS MACHINE</Text>
      <Box flexDirection="column" marginTop={1}>
        <Text>Codex: 0/4</Text>
        <Text>CC: 0/4</Text>
      </Box>
      <Box flexDirection="column" marginTop={1}>
        {agents.map((agent) => (
          <Box key={agent.name}>
            <Text dimColor>● </Text>
            <Text dimColor>{agent.name}</Text>
          </Box>
        ))}
      </Box>
      <Box marginTop={1}>
        <Text dimColor>Expert session: none</Text>
      </Box>
    </Box>
  );
};

export default LocalStatus;
