import React from 'react';
import { Box } from 'ink';
import AlertsFeed from './AlertsFeed.js';
import LocalStatus from './LocalStatus.js';
import PipelineSummary from './PipelineSummary.js';

export default function Sidebar() {
  return (
    <Box flexDirection="column" width="30%">
      <AlertsFeed />
      <LocalStatus />
      <PipelineSummary />
    </Box>
  );
}
