import React from "react";
import { Box, Text } from "ink";

type SessionPaneProps = {
  companyId?: string;
};

export default function SessionPane({ companyId }: SessionPaneProps): React.JSX.Element {
  return (
    <Box>
      <Text>Session viewer{companyId ? ` (${companyId})` : ""}</Text>
    </Box>
  );
}
