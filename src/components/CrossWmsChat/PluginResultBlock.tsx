/**
 * PluginResultBlock — 渲染插件自动调用结果块
 *
 * v3.0: 在聊天消息中展示 reasoning 流触发的插件调用结果。
 * 参照 ToolCallBlock.tsx 的设计风格：MUI 组件 + 折叠交互。
 *
 * v1.5.68: 样式与 ToolCallItem 对齐 — 透明背景 + 浅灰左侧描边 + 灰色文本/图标。
 */

import React, { useState, memo } from 'react';
import { Box, Typography, Chip, Collapse, IconButton, useTheme } from '@mui/material';
import ExtensionIcon from '@mui/icons-material/Extension';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import { getGrayScale } from '../../constants/theme';
import type { PluginResultInfo } from '../../types/chat';

interface PluginResultBlockProps {
  /** 插件调用结果列表 */
  results: PluginResultInfo[];
}

/**
 * 渲染插件自动调用结果块
 * - 默认折叠，点击标题行展开/折叠
 * - 展示工具名 Chip 列表、执行耗时、输出内容
 */
export default memo(function PluginResultBlock({ results }: PluginResultBlockProps) {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const gs = getGrayScale(isDark);
  const [expanded, setExpanded] = useState(false);

  if (!results || results.length === 0) return null;

  return (
    <Box sx={{
      my: 0.5,
      borderLeft: `2px solid ${isDark ? '#555555' : '#e0e0e0'}`,
      bgcolor: 'transparent',
      overflow: 'hidden',
    }}>
      {/* 标题行 */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          px: 1.25,
          py: 0.625,
          cursor: 'pointer',
          '&:hover': {
            bgcolor: isDark ? 'rgba(255,255,255,0.05)' : '#f5f5f5',
          },
          transition: 'background-color 0.15s ease',
        }}
        onClick={() => setExpanded(!expanded)}
      >
        <ExtensionIcon sx={{ fontSize: 'small', color: gs.textMuted, mr: 0.75 }} />
        <Typography variant="caption" sx={{ color: gs.textSecondary, flex: 1, fontWeight: 500 }}>
          Plugin 调用 ({results.length})
        </Typography>
        {results.map((r, i) => (
          <Chip
            key={i}
            label={r.tool}
            size="small"
            variant="outlined"
            sx={{ mr: 0.5, fontSize: '0.7rem', color: gs.textMuted, borderColor: gs.border }}
          />
        ))}
        <IconButton size="small" sx={{ p: 0.25, color: gs.textMuted }}>
          {expanded ? <ExpandLessIcon sx={{ fontSize: 16 }} /> : <ExpandMoreIcon sx={{ fontSize: 16 }} />}
        </IconButton>
      </Box>

      {/* 详情（默认折叠） */}
      <Collapse in={expanded}>
        <Box sx={{ px: 1.25, py: 1, borderTop: `1px solid ${gs.border}` }}>
          {results.map((result, idx) => (
            <Box key={idx} sx={{ mb: idx < results.length - 1 ? 1 : 0 }}>
              <Typography variant="caption" fontWeight="bold" sx={{ color: gs.textSecondary }}>
                [{result.tool}]
              </Typography>
              {result.durationMs && (
                <Typography variant="caption" sx={{ ml: 1, color: gs.textMuted }}>
                  {result.durationMs}ms
                </Typography>
              )}
              <Box sx={{
                mt: 0.25,
                p: 0.5,
                bgcolor: isDark ? '#1A1A1A' : '#F9FAFB',
                borderRadius: 0.5,
                fontFamily: 'monospace',
                fontSize: '0.8rem',
                color: gs.textSecondary,
                whiteSpace: 'pre-wrap',
                maxHeight: 200,
                overflow: 'auto',
              }}>
                {result.output}
              </Box>
            </Box>
          ))}
        </Box>
      </Collapse>
    </Box>
  );
});
