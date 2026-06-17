/**
 * MCPServerList — MCP Server 列表容器
 */

import React from 'react';
import { Box, Typography, CircularProgress } from '@mui/material';
import type { McpServerState } from './types';
import MCPServerCard from './MCPServerCard';
import { getGrayScale } from '../../../constants/theme';
import { useTheme } from '@mui/material';

interface MCPServerListProps {
  servers: McpServerState[];
  loading: boolean;
  error: string | null;
  onToggleEnabled: (id: string, enabled: boolean) => void;
  onConnect: (id: string) => Promise<void>;
  onDisconnect: (id: string) => Promise<void>;
  onDelete: (id: string) => void;
}

const MCPServerList: React.FC<MCPServerListProps> = ({
  servers, loading, error,
  onToggleEnabled, onConnect, onDisconnect, onDelete,
}) => {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const gs = getGrayScale(isDark);

  if (loading) {
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', py: 4, gap: 1 }}>
        <CircularProgress size={20} />
        <Typography sx={{ fontSize: '0.85rem', color: gs.textMuted }}>正在加载 MCP Server...</Typography>
      </Box>
    );
  }

  if (error) {
    return (
      <Box sx={{ py: 4, textAlign: 'center' }}>
        <Typography sx={{ fontSize: '0.85rem', color: '#EF4444' }}>加载失败: {error}</Typography>
      </Box>
    );
  }

  if (servers.length === 0) {
    return (
      <Box sx={{ py: 6, textAlign: 'center' }}>
        <Typography sx={{ fontSize: '0.85rem', color: gs.textDisabled }}>
          还没有添加 MCP Server，点击上方「添加」按钮开始配置
        </Typography>
      </Box>
    );
  }

  return (
    <Box>
      {servers.map(server => (
        <MCPServerCard
          key={server.config.id}
          server={server}
          onToggleEnabled={onToggleEnabled}
          onConnect={onConnect}
          onDisconnect={onDisconnect}
          onDelete={onDelete}
        />
      ))}
    </Box>
  );
};

export default MCPServerList;
