/**
 * MCPServerCard — 单个 MCP Server 卡片
 *
 * 显示 Server 配置、连接状态、工具列表，提供连接/断开/删除操作。
 */

import React from 'react';
import { Box, Typography, IconButton, Switch, Chip, Tooltip, Collapse } from '@mui/material';
import LinkIcon from '@mui/icons-material/Link';
import LinkOffIcon from '@mui/icons-material/LinkOff';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import HourglassEmptyIcon from '@mui/icons-material/HourglassEmpty';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import type { McpServerState } from './types';
import { getGrayScale } from '../../../constants/theme';
import { useTheme } from '@mui/material';

interface MCPServerCardProps {
  server: McpServerState;
  onToggleEnabled: (id: string, enabled: boolean) => void;
  onConnect: (id: string) => Promise<void>;
  onDisconnect: (id: string) => Promise<void>;
  onDelete: (id: string) => void;
}

const STATE_ICON_MAP: Record<string, React.ReactNode> = {
  connected: <CheckCircleOutlineIcon sx={{ fontSize: 16, color: '#22C55E' }} />,
  connecting: <HourglassEmptyIcon sx={{ fontSize: 16, color: '#F59E0B' }} />,
  disconnected: <LinkOffIcon sx={{ fontSize: 16, color: '#9CA3AF' }} />,
  error: <ErrorOutlineIcon sx={{ fontSize: 16, color: '#EF4444' }} />,
};

const STATE_LABEL_MAP: Record<string, string> = {
  connected: '已连接',
  connecting: '连接中',
  disconnected: '未连接',
  error: '错误',
};

const MCPServerCard: React.FC<MCPServerCardProps> = ({ server, onToggleEnabled, onConnect, onDisconnect, onDelete }) => {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const gs = getGrayScale(isDark);
  const [expanded, setExpanded] = React.useState(false);
  const [operating, setOperating] = React.useState(false);

  const { config, connectionState, tools, error } = server;

  const handleConnect = async () => {
    setOperating(true);
    try {
      await onConnect(config.id);
    } finally {
      setOperating(false);
    }
  };

  const handleDisconnect = async () => {
    setOperating(true);
    try {
      await onDisconnect(config.id);
    } finally {
      setOperating(false);
    }
  };

  return (
    <Box
      sx={{
        p: 2,
        borderRadius: 2,
        border: `1px solid ${connectionState === 'connected' ? 'rgba(34,197,94,0.3)' : gs.border}`,
        backgroundColor: connectionState === 'connected'
          ? (isDark ? 'rgba(34,197,94,0.06)' : 'rgba(34,197,94,0.03)')
          : gs.bgPanel,
        mb: 1.5,
        transition: 'all 0.15s ease',
      }}
    >
      {/* Header row */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
        {/* 状态图标 */}
        {STATE_ICON_MAP[connectionState]}

        {/* 名称 */}
        <Typography sx={{ fontSize: '0.9rem', fontWeight: 600, color: gs.textPrimary, flex: 1 }}>
          {config.name}
        </Typography>

        {/* 状态 Chip */}
        <Chip
          label={STATE_LABEL_MAP[connectionState]}
          size="small"
          sx={{
            fontSize: '0.7rem',
            height: 22,
            backgroundColor:
              connectionState === 'connected' ? 'rgba(34,197,94,0.12)'
              : connectionState === 'error' ? 'rgba(239,68,68,0.12)'
              : connectionState === 'connecting' ? 'rgba(245,158,11,0.12)'
              : gs.bgHover,
            color:
              connectionState === 'connected' ? '#22C55E'
              : connectionState === 'error' ? '#EF4444'
              : connectionState === 'connecting' ? '#F59E0B'
              : gs.textMuted,
          }}
        />

        {/* 工具数 Chip */}
        {connectionState === 'connected' && tools.length > 0 && (
          <Chip
            label={`${tools.length} 工具`}
            size="small"
            sx={{
              fontSize: '0.7rem',
              height: 22,
              backgroundColor: isDark ? 'rgba(99,102,241,0.12)' : 'rgba(99,102,241,0.08)',
              color: 'rgba(99,102,241,1)',
            }}
          />
        )}

        {/* 启用开关 */}
        <Switch
          checked={config.enabled}
          onChange={e => onToggleEnabled(config.id, e.target.checked)}
          size="small"
          disabled={operating}
        />

        {/* 操作按钮 */}
        {connectionState === 'disconnected' && config.enabled && (
          <Tooltip title="连接">
            <IconButton size="small" onClick={handleConnect} disabled={operating} sx={{ color: gs.textMuted }}>
              <LinkIcon sx={{ fontSize: 18 }} />
            </IconButton>
          </Tooltip>
        )}
        {connectionState === 'connected' && (
          <Tooltip title="断开">
            <IconButton size="small" onClick={handleDisconnect} disabled={operating} sx={{ color: gs.textMuted }}>
              <LinkOffIcon sx={{ fontSize: 18 }} />
            </IconButton>
          </Tooltip>
        )}

        {/* 删除按钮 */}
        <Tooltip title="删除">
          <IconButton size="small" onClick={() => onDelete(config.id)} sx={{ color: gs.textMuted }}>
            <DeleteOutlineIcon sx={{ fontSize: 18 }} />
          </IconButton>
        </Tooltip>

        {/* 展开/收起工具列表 */}
        {(connectionState === 'connected' && tools.length > 0) && (
          <IconButton size="small" onClick={() => setExpanded(!expanded)} sx={{ color: gs.textMuted }}>
            {expanded ? <ExpandLessIcon sx={{ fontSize: 18 }} /> : <ExpandMoreIcon sx={{ fontSize: 18 }} />}
          </IconButton>
        )}
      </Box>

      {/* 命令行 */}
      <Typography sx={{ fontSize: '0.75rem', color: gs.textMuted, mt: 0.75, fontFamily: 'monospace' }}>
        {config.command} {config.args.join(' ')}
      </Typography>

      {/* 错误信息 */}
      {error && (
        <Typography sx={{ fontSize: '0.78rem', color: '#EF4444', mt: 0.5 }}>
          {error}
        </Typography>
      )}

      {/* 工具列表（展开） */}
      <Collapse in={expanded}>
        <Box sx={{ mt: 1, pl: 0.5 }}>
          {tools.map(tool => (
            <Box key={tool.name} sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
              <Typography sx={{ fontSize: '0.78rem', fontWeight: 500, color: gs.textPrimary }}>
                {tool.name}
              </Typography>
              <Typography sx={{ fontSize: '0.72rem', color: gs.textMuted, flex: 1 }}>
                {tool.description.length > 80 ? tool.description.slice(0, 80) + '...' : tool.description}
              </Typography>
            </Box>
          ))}
        </Box>
      </Collapse>
    </Box>
  );
};

export default MCPServerCard;
