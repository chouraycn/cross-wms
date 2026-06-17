/**
 * MCPToolbar — MCP Settings 顶部工具栏
 */

import React from 'react';
import { Box, Button, Typography } from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import RefreshIcon from '@mui/icons-material/Refresh';
import { getGrayScale } from '../../../constants/theme';
import { useTheme } from '@mui/material';

interface MCPToolbarProps {
  serverCount: number;
  connectedCount: number;
  onAdd: () => void;
  onRefresh: () => void;
}

const MCPToolbar: React.FC<MCPToolbarProps> = ({ serverCount, connectedCount, onAdd, onRefresh }) => {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const gs = getGrayScale(isDark);

  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2 }}>
      <Typography sx={{ fontSize: '1.25rem', fontWeight: 700, color: gs.textPrimary, flex: 1 }}>
        MCP Server
      </Typography>

      {/* 状态摘要 */}
      <Typography sx={{ fontSize: '0.78rem', color: gs.textMuted }}>
        {connectedCount}/{serverCount} 已连接
      </Typography>

      {/* 刷新 */}
      <Button
        size="small"
        startIcon={<RefreshIcon sx={{ fontSize: 16 }} />}
        onClick={onRefresh}
        sx={{
          fontSize: '0.8rem',
          color: gs.textMuted,
          '&:hover': { color: gs.textPrimary },
        }}
      >
        刷新
      </Button>

      {/* 添加 */}
      <Button
        size="small"
        variant="contained"
        startIcon={<AddIcon sx={{ fontSize: 16 }} />}
        onClick={onAdd}
        sx={{
          fontSize: '0.8rem',
          backgroundColor: isDark ? 'rgba(99,102,241,0.8)' : 'rgba(99,102,241,0.9)',
          '&:hover': { backgroundColor: isDark ? 'rgba(99,102,241,1)' : 'rgba(99,102,241,0.85)' },
        }}
      >
        添加
      </Button>
    </Box>
  );
};

export default MCPToolbar;
