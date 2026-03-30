import { Box, Text, useInput } from 'ink';
import { useMemo, useState } from 'react';

type AlertSeverity = 'critical' | 'warning' | 'info';

type AlertItem = {
  severity: AlertSeverity;
  message: string;
  timestamp: string;
};

const sampleAlerts: AlertItem[] = [
  {
    severity: 'critical',
    message: 'Orchestrator heartbeat missed for cpo-host',
    timestamp: '12s ago',
  },
  {
    severity: 'warning',
    message: 'Codex slot usage at 3/4 capacity',
    timestamp: '2m ago',
  },
  {
    severity: 'info',
    message: 'Local agent reconnected to realtime channel',
    timestamp: '6m ago',
  },
  {
    severity: 'warning',
    message: 'Pipeline queue depth increased to 9 cards',
    timestamp: '11m ago',
  },
];

const VISIBLE_ALERTS = 3;

function SeverityDot({ severity }: { severity: AlertSeverity }) {
  if (severity === 'critical') {
    return <Text color="red">●</Text>;
  }

  if (severity === 'warning') {
    return <Text color="yellow">●</Text>;
  }

  return <Text dimColor>●</Text>;
}

export default function AlertsFeed() {
  const [offset, setOffset] = useState(0);
  const maxOffset = Math.max(0, sampleAlerts.length - VISIBLE_ALERTS);

  useInput((_input, key) => {
    if (key.upArrow) {
      setOffset((current) => Math.max(0, current - 1));
    }

    if (key.downArrow) {
      setOffset((current) => Math.min(maxOffset, current + 1));
    }
  });

  const visibleAlerts = useMemo(
    () => sampleAlerts.slice(offset, offset + VISIBLE_ALERTS),
    [offset],
  );

  return (
    <Box flexDirection="column" paddingX={1} paddingY={1}>
      <Text bold>ALERTS</Text>
      <Box flexDirection="column" marginTop={1}>
        {visibleAlerts.map((alert, index) => (
          <Box key={`${alert.message}-${index}`} justifyContent="space-between">
            <Box marginRight={1} flexGrow={1}>
              <SeverityDot severity={alert.severity} />
              <Text> {alert.message}</Text>
            </Box>
            <Text dimColor>{alert.timestamp}</Text>
          </Box>
        ))}
      </Box>
      <Text dimColor>{`Use ↑/↓ to scroll (${offset + 1}-${Math.min(offset + VISIBLE_ALERTS, sampleAlerts.length)} of ${sampleAlerts.length})`}</Text>
    </Box>
  );
}
