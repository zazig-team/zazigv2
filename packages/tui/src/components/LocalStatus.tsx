import React from 'react';
import { Box, Text } from 'ink';

export default function LocalStatus(): React.ReactElement {
  return (
    <Box borderStyle="round" borderColor="gray" paddingX={1} paddingY={0} flexDirection="column">
      <Text bold color="cyan">
        THIS MACHINE
      </Text>

      <Box marginTop={1} flexDirection="column">
        <Text>
          Codex: <Text color="green">0/4</Text>
        </Text>
        <Text>
          CC: <Text color="green">0/4</Text>
        </Text>
      </Box>

      <Box marginTop={1} flexDirection="column">
        <Text color="gray">Agents</Text>
        <Text>
          <Text dimColor>o</Text> codex-worker-1 (idle dot)
        </Text>
        <Text>
          <Text dimColor>o</Text> codex-worker-2 (idle dot)
        </Text>
        <Text>
          <Text dimColor>o</Text> cc-worker-1 (idle dot)
        </Text>
      </Box>

      <Box marginTop={1}>
        <Text color="yellow">Expert session: none</Text>
      </Box>
    </Box>
  );
}
