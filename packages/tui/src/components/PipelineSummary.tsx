import React from 'react';
import { Box, Text } from 'ink';

const PipelineSummary: React.FC = () => {
<<<<<<< HEAD
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
=======
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
>>>>>>> job/773c1e5c-947e-47d3-839d-5bf7466a723a
    </Box>
  );
};

export default PipelineSummary;
