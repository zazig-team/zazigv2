import React, { useEffect, useState } from 'react';
import { Box, Text } from 'ink';

interface CriticalBannerProps {
  show?: boolean;
  message?: string;
}

const CriticalBanner: React.FC<CriticalBannerProps> = ({ show = false, message = 'Critical alert!' }) => {
  const [visible, setVisible] = useState(show);

  useEffect(() => {
    setVisible(show);
    if (show) {
      const timer = setTimeout(() => {
        setVisible(false);
      }, 15000);
      return () => clearTimeout(timer);
    }
  }, [show]);

  if (!visible) {
    return null;
  }

  return (
    <Box width="100%" borderStyle="single" paddingX={1}>
      <Text color="red" bold>CRITICAL: {message}</Text>
    </Box>
  );
};

export default CriticalBanner;
