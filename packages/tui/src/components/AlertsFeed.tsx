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
  { id: '1', severity: 'critical', message: 'Build failed on feature/auth', timestamp: '2m ago' },
  { id: '2', severity: 'warning', message: 'CI check slow on feature/payments', timestamp: '5m ago' },
  { id: '3', severity: 'info', message: 'Job dispatched for feature/ui', timestamp: '10m ago' },
];

const severityColor: Record<Severity, string> = {
  critical: 'red',
  warning: 'yellow',
  info: 'white',
};

const AlertsFeed: React.FC = () => {
  return (
    <Box flexDirection="column" borderStyle="single" paddingX={1}>
      <Text bold>ALERTS</Text>
      <Box flexDirection="column" marginTop={1}>
        {SAMPLE_ALERTS.map((alert) => (
          <Box key={alert.id} flexDirection="row" gap={1}>
            {alert.severity === 'info' ? (
              <Text dimColor>● {alert.message} {alert.timestamp}</Text>
            ) : (
              <>
                <Text color={severityColor[alert.severity]}>●</Text>
                <Text> {alert.message} </Text>
                <Text dimColor>{alert.timestamp}</Text>
              </>
            )}
          </Box>
        ))}
      </Box>
    </Box>
  );
};

export default AlertsFeed;
