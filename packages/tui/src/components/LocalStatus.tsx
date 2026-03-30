import React from 'react';
import { Box, Text } from 'ink';

interface Agent {
  name: string;
  status: 'active' | 'idle' | 'expert';
}

const SAMPLE_AGENTS: Agent[] = [
  { name: 'agent-1', status: 'idle' },
  { name: 'agent-2', status: 'idle' },
];

function getStatusDot(status: Agent['status']): string {
  if (status === 'active') return '●';
  if (status === 'expert') return '●';
  return '●';
}

function getStatusColor(status: Agent['status']): string {
  if (status === 'active') return 'green';
  if (status === 'expert') return 'yellow';
  return 'gray';
}

const LocalStatus: React.FC = () => {
  return (
    <Box flexDirection="column">
      <Text bold>THIS MACHINE</Text>
      <Box flexDirection="row" gap={1}>
        <Text>Codex: 0/4</Text>
        <Text>CC: 0/4</Text>
      </Box>
      {SAMPLE_AGENTS.map((agent) => (
        <Box key={agent.name} flexDirection="row" gap={1}>
          <Text color={getStatusColor(agent.status)}>{getStatusDot(agent.status)}</Text>
          <Text>{agent.name}</Text>
          {agent.status === 'expert' && <Text color="yellow"> [expert session]</Text>}
        </Box>
      ))}
    </Box>
  );
};

export default LocalStatus;
