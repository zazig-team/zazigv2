import React from 'react';
import { Box, Text } from 'ink';

const PipelineSummary: React.FC = () => {
  const columns = [
    { label: 'Ready', count: 0 },
    { label: 'Building', count: 0 },
    { label: 'CI Check', count: 0 },
    { label: 'Failed', count: 0 },
    { label: 'Shipped', count: 0 },
  ];

  return (
    <Box flexDirection="column">
      <Text bold>PIPELINE</Text>
      {columns.map(({ label, count }) => (
        <Box key={label} flexDirection="row" gap={1}>
          <Text>{label}:</Text>
          <Text>{count}</Text>
        </Box>
      ))}
    </Box>
  );
};

export default PipelineSummary;
