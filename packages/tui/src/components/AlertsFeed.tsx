import React from 'react';
import { Box, Text } from 'ink';

type Severity = 'critical' | 'warning' | 'info';

interface Alert {
  id: number;
  severity: Severity;
  message: string;
  timestamp: string;
}

const SAMPLE_ALERTS: Alert[] = [
  {
    id: 1,
    severity: 'critical',
    message: 'Build pipeline failure on main branch',
    timestamp: '2 min ago',
  },
  {
    id: 2,
    severity: 'warning',
    message: 'CI check timeout on feature/auth-refactor',
    timestamp: '5 min ago',
  },
  {
    id: 3,
    severity: 'info',
    message: 'Agent job completed successfully',
    timestamp: '10 min ago',
  },
  {
    id: 4,
    severity: 'warning',
    message: 'Merge conflict detected in PR #42',
    timestamp: '15 min ago',
  },
];

function SeverityDot({ severity }: { severity: Severity }) {
  if (severity === 'critical') {
    return <Text color="red">●</Text>;
  }
  if (severity === 'warning') {
    return <Text color="yellow">●</Text>;
  }
  return <Text dimColor>●</Text>;
}

export default function AlertsFeed() {
  return (
    <Box flexDirection="column">
      {SAMPLE_ALERTS.map((alert) => (
        <Box key={alert.id} flexDirection="row" marginBottom={0}>
          <Box marginRight={1}>
            <SeverityDot severity={alert.severity} />
          </Box>
          <Box flexGrow={1}>
            <Text>{alert.message}</Text>
          </Box>
          <Box marginLeft={1}>
            <Text dimColor>{alert.timestamp}</Text>
          </Box>
        </Box>
      ))}
    </Box>
  );
}
