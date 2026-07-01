/**
 * EventLedgerPage - 事件溯源查询页面
 */

import React from 'react';
import { Box, useTheme } from '@mui/material';
import EventLedgerPanel from '../components/EventLedger/EventLedgerPanel';
import { getGrayScale } from '../constants/theme';

const EventLedgerPage: React.FC = () => {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const gs = getGrayScale(isDark);

  return (
    <Box
      sx={{
        height: 'calc(100vh - var(--pw-top, 0px))',
        backgroundColor: gs.bgPage,
        display: 'flex',
        flexDirection: 'column',
        p: 3,
      }}
    >
      <EventLedgerPanel />
    </Box>
  );
};

export default EventLedgerPage;