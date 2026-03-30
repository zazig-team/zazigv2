import React, { useEffect, useState } from 'react';
import { Box, Text } from 'ink';

interface CriticalBannerProps {
  show?: boolean;
  message?: string;
}

export default function CriticalBanner({ show = false, message = 'CRITICAL ALERT' }: CriticalBannerProps) {
  const [visible, setVisible] = useState(show);

  useEffect(() => {
    if (!show) {
      setVisible(false);
      return;
    }
    setVisible(true);
    const timer = setTimeout(() => {
      setVisible(false);
    }, 15000);
    return () => clearTimeout(timer);
  }, [show]);

  if (!visible) {
    return null;
  }

  return (
    <Box width="100%" flexDirection="row" borderStyle="single" borderColor="red">
      <Text color="red" bold>
        ● CRITICAL: {message}
      </Text>
    </Box>
  );
}
