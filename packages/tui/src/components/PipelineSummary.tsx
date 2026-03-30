import React from 'react';
import { Box, Text } from 'ink';

const COLUMNS = [
  { label: 'Ready', count: 0 },
  { label: 'Building', count: 0 },
  { label: 'CI Check', count: 0 },
  { label: 'Failed', count: 0 },
  { label: 'Shipped', count: 0 },
];

export default function PipelineSummary() {
  return (
    <Box flexDirection="column">
      <Text bold>PIPELINE</Text>
      <Box flexDirection="column" marginTop={1}>
        {COLUMNS.map((col) => (
          <Box key={col.label} flexDirection="row">
            <Box width={12}>
              <Text>{col.label}</Text>
            </Box>
            <Text dimColor>{col.count}</Text>
          </Box>
        ))}
      </Box>
    </Box>
  );
}
