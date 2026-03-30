import React from 'react';
import { Box, Text } from 'ink';

const PipelineSummary: React.FC = () => {
  return (
    <Box flexDirection="column" borderStyle="single" paddingX={1}>
      <Text bold>PIPELINE</Text>
      <Box flexDirection="column" marginTop={1}>
        <Text>Ready:     0</Text>
        <Text>Building:  0</Text>
        <Text>CI Check:  0</Text>
        <Text>Failed:    0</Text>
        <Text>Shipped:   0</Text>
      </Box>
    </Box>
  );
};

export default PipelineSummary;
