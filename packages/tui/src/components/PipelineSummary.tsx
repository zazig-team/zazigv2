import React from "react";
import { Box, Text } from "ink";

const columns = [
  { label: "Ready", count: 0 },
  { label: "Building", count: 0 },
  { label: "CI Check", count: 0 },
  { label: "Failed", count: 0 },
  { label: "Shipped", count: 0 },
];

export default function PipelineSummary(): React.JSX.Element {
  return (
    <Box flexDirection="column" gap={1}>
      <Text bold>PIPELINE</Text>
      <Box flexDirection="column">
        {columns.map((column) => (
          <Text key={column.label}>
            {column.label}: {column.count}
          </Text>
        ))}
      </Box>
    </Box>
  );
}
