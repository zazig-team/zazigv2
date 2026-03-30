import React from 'react';
import { Box, Text } from 'ink';

type Severity = 'critical' | 'warning' | 'info';

interface Alert {
  id: string;
  severity: Severity;
  message: string;
  timestamp: string;
}

const SAMPLE_ALERTS: Alert[] = [
  { id: '1', severity: 'critical', message: 'Build failed on main', timestamp: '2m ago' },
  { id: '2', severity: 'warning', message: 'CI timeout on feature branch', timestamp: '5m ago' },
  { id: '3', severity: 'info', message: 'Deploy completed successfully', timestamp: '10m ago' },
];

function getSeverityColor(severity: Severity): string {
  if (severity === 'critical') return 'red';
  if (severity === 'warning') return 'yellow';
  return 'white';
}

const AlertsFeed: React.FC = () => {
  return (
    <Box flexDirection="column">
      <Text bold>ALERTS</Text>
      {SAMPLE_ALERTS.map((alert) => (
        <Box key={alert.id} flexDirection="row" gap={1}>
          <Text color={getSeverityColor(alert.severity)} dimColor={alert.severity === 'info'}>
            {alert.message}
          </Text>
          <Text dimColor>{alert.timestamp}</Text>
        </Box>
      ))}
    </Box>
  );
};

export default AlertsFeed;
