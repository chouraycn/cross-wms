/**
 * 执行历史页面 — 执行记录查询和回放
 */

import React from 'react';
import { Box, Paper, Typography } from '@mui/material';
import ExecutionHistoryPanel from '../components/History/ExecutionHistoryPanel';

const ExecutionHistoryPage: React.FC = React.memo(() => {
  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <Paper sx={{ p: 2, mb: 2 }}>
        <Typography variant="h4">执行历史</Typography>
        <Typography variant="body2" color="text.secondary">
          查看工作流、触发器、手动执行的记录和回放
        </Typography>
      </Paper>
      <Box sx={{ flex: 1, overflow: 'hidden' }}>
        <ExecutionHistoryPanel />
      </Box>
    </Box>
  );
});

ExecutionHistoryPage.displayName = 'ExecutionHistoryPage';

export default ExecutionHistoryPage;