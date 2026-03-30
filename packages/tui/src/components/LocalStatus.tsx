import React from 'react';
import { Box, Text } from 'ink';

interface Agent {
  name: string;
  status: 'active' | 'idle' | 'expert';
}

const SAMPLE_AGENTS: Agent[] = [
  { name: 'codex-1', status: 'idle' },
  { name: 'codex-2', status: 'idle' },
  { name: 'cc-1', status: 'idle' },
  { name: 'cc-2', status: 'idle' },
];

function getStatusColor(status: Agent['status']): string {
  if (status === 'active') return 'green';
  if (status === 'expert') return 'yellow';
  return 'gray';
}

const LocalStatus: React.FC = () => {
  return (
    <Box flexDirection="column" borderStyle="single" paddingX={1}>
      <Text bold>THIS MACHINE</Text>
      <Box flexDirection="column" marginTop={1}>
        <Text>Codex: 0/4</Text>
        <Text>CC: 0/4</Text>
      </Box>
      <Box flexDirection="column" marginTop={1}>
        {SAMPLE_AGENTS.map((agent) => (
          <Box key={agent.name} flexDirection="row" gap={1}>
            <Text color={getStatusColor(agent.status)}>●</Text>
            <Text>{agent.name}</Text>
            {agent.status === 'expert' && <Text color="yellow"> [expert session]</Text>}
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
