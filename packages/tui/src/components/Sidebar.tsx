import React from 'react';
import { Box } from 'ink';
import AlertsFeed from './AlertsFeed';
import LocalStatus from './LocalStatus';
import PipelineSummary from './PipelineSummary';

const Sidebar: React.FC = () => {
  return (
    <Box flexDirection="column" width="30%" flexShrink={0} borderStyle="single" paddingX={1}>
      <Box marginBottom={1}>
        <AlertsFeed />
      </Box>
      <Box flexGrow={1} justifyContent="center">
        <LocalStatus />
      </Box>
      <Box marginTop={1}>
        <PipelineSummary />
      </Box>
    </Box>
  );
};

export default Sidebar;
