import React from 'react';
import { Box, Text } from 'ink';

const columns = [
  { label: 'Ready', count: 0 },
  { label: 'Building', count: 0 },
  { label: 'CI Check', count: 0 },
  { label: 'Failed', count: 0 },
  { label: 'Shipped', count: 0 },
];

const PipelineSummary: React.FC = () => {
  return (
    <Box flexDirection="column" borderStyle="single" paddingX={1}>
      <Text bold>PIPELINE</Text>
      <Box flexDirection="column" marginTop={1}>
        {columns.map(({ label, count }) => (
          <Box key={label} flexDirection="row" gap={1}>
            <Text>{label}:</Text>
            <Text>{count}</Text>
          </Box>
        ))}
      </Box>
    </Box>
  );
};

export default PipelineSummary;
