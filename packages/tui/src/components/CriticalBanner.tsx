import { useEffect } from 'react';
import { Box, Text } from 'ink';

export type CriticalBannerProps = {
  message: string;
  visible: boolean;
  onDismiss?: () => void;
};

const AUTO_DISMISS_MS = 15000;

export default function CriticalBanner({
  message,
  visible,
  onDismiss
}: CriticalBannerProps) {
  useEffect(() => {
    if (!visible || !onDismiss) {
      return;
    }

    const dismissTimer = setTimeout(() => {
      onDismiss();
    }, AUTO_DISMISS_MS);

    return () => {
      clearTimeout(dismissTimer);
    };
  }, [visible, onDismiss]);

  if (!visible) {
    return null;
  }

  return (
    <Box
      width="100%"
      borderStyle="round"
      borderColor="red"
      paddingX={1}
    >
      <Text color="red">{message}</Text>
    </Box>
  );
}
