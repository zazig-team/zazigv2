import React from "react";
import { Box, Text } from "ink";

export default function TopBar(): React.JSX.Element {
  return (
    <Box width="100%" justifyContent="space-between">
      <Text>zazig</Text>
      <Text color="gray">[Tab: Sessions] [Tab: Jobs] [Tab: Activity]</Text>
    </Box>
  );
}
