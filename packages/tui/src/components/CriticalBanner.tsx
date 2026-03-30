<<<<<<< HEAD
import React, { useEffect, useState } from 'react';
=======
import React, { useState, useEffect } from 'react';
>>>>>>> job/773c1e5c-947e-47d3-839d-5bf7466a723a
import { Box, Text } from 'ink';

interface CriticalBannerProps {
  show?: boolean;
  message?: string;
}

<<<<<<< HEAD
const CriticalBanner: React.FC<CriticalBannerProps> = ({ show = false, message = 'Critical alert!' }) => {
  const [visible, setVisible] = useState(show);

  useEffect(() => {
    if (show) {
      setVisible(true);
=======
const CriticalBanner: React.FC<CriticalBannerProps> = ({ show = false, message = 'Critical alert' }) => {
  const [visible, setVisible] = useState(show);

  useEffect(() => {
    setVisible(show);
    if (show) {
>>>>>>> job/773c1e5c-947e-47d3-839d-5bf7466a723a
      const timer = setTimeout(() => {
        setVisible(false);
      }, 15000);
      return () => clearTimeout(timer);
    }
<<<<<<< HEAD
  }, [show]);

  if (!visible) {
    return null;
  }

  return (
    <Box width="100%" borderStyle="single" paddingX={1}>
      <Text color="red" bold>CRITICAL: {message}</Text>
=======
    return undefined;
  }, [show]);

  if (!visible) return null;

  return (
    <Box width="100%" flexDirection="row">
      <Text color="red" bold>
        [CRITICAL] {message}
      </Text>
>>>>>>> job/773c1e5c-947e-47d3-839d-5bf7466a723a
    </Box>
  );
};

export default CriticalBanner;
