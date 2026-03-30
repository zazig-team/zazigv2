import React from 'react';
import { Box, Text } from 'ink';

interface Agent {
  name: string;
  status: 'active' | 'idle' | 'expert';
}

const SAMPLE_AGENTS: Agent[] = [
  { name: 'claude-1', status: 'active' },
  { name: 'codex-1', status: 'idle' },
  { name: 'expert-session', status: 'expert' },
];

function AgentDot({ status }: { status: Agent['status'] }) {
  if (status === 'active') {
    return <Text color="green">●</Text>;
  }
  if (status === 'expert') {
    return <Text color="cyan">●</Text>;
  }
  return <Text dimColor>●</Text>;
}

export default function LocalStatus() {
  return (
    <Box flexDirection="column">
      <Text bold>THIS MACHINE</Text>
      <Box flexDirection="row" marginTop={1}>
        <Text>Codex: 0/4  </Text>
        <Text>CC: 0/4</Text>
      </Box>
      <Box flexDirection="column" marginTop={1}>
        {SAMPLE_AGENTS.map((agent) => (
          <Box key={agent.name} flexDirection="row">
            <Box marginRight={1}>
              <AgentDot status={agent.status} />
            </Box>
            <Text>{agent.name}</Text>
            {agent.status === 'expert' && (
              <Text dimColor> (expert session)</Text>
            )}
          </Box>
        ))}
      </Box>
    </Box>
  );
}
