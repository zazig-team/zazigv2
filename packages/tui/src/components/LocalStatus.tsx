import React from 'react';
import { Box, Text } from 'ink';

<<<<<<< HEAD
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
=======
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
>>>>>>> job/773c1e5c-947e-47d3-839d-5bf7466a723a
    </Box>
  );
};

export default LocalStatus;
