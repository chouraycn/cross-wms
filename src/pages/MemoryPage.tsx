/**
 * MemoryPage - 记忆管理页面
 */

import React from 'react';
import { Box, useTheme } from '@mui/material';
import MemoryPanel from '../components/Memory/MemoryPanel';
import { getGrayScale } from '../constants/theme';

const MemoryPage: React.FC = () => {
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
      <MemoryPanel />
    </Box>
  );
};

export default MemoryPage;