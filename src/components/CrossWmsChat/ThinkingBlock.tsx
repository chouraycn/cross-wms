import React, { useState } from 'react';
import { Box, Typography, IconButton, Collapse, useTheme, keyframes } from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { MarkdownRenderer } from './MarkdownRenderer';
import { getGrayScale } from '../../constants/theme';

interface ThinkingBlockProps {
  /** AI 思考过程内容 */
  thinking: string;
  /** 思考耗时（毫秒） */
  duration?: number;
  /** 是否正在流式输出 */
  isStreaming?: boolean;
}

/** 脉冲动画 keyframes */
const pulse = keyframes`
  0% { opacity: 0.4; }
  50% { opacity: 1; }
  100% { opacity: 0.4; }
`;

/** 格式化耗时：毫秒 → 可读字符串 */
function formatDuration(ms?: number): string {
  if (ms === undefined || ms === null) return '';
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

export function ThinkingBlock({ thinking, duration, isStreaming }: ThinkingBlockProps) {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const gs = getGrayScale(isDark);
  const [expanded, setExpanded] = useState(false);

  return (
    <Box
      sx={{
        mb: 1,
        borderRadius: '8px',
        borderLeft: '3px solid #3B82F6',
        bgcolor: isDark ? '#1F2937' : '#F9FAFB',
        overflow: 'hidden',
      }}
    >
      {/* 折叠状态的头部栏（始终可见） */}
      <Box
        onClick={() => !isStreaming && setExpanded((prev) => !prev)}
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          px: 1.5,
          py: 0.75,
          cursor: isStreaming ? 'default' : 'pointer',
          bgcolor: isDark ? '#1F2937' : '#F3F4F6',
          '&:hover': isStreaming
            ? {}
            : { bgcolor: isDark ? '#374151' : '#E5E7EB' },
          transition: 'background-color 0.2s ease',
          userSelect: 'none',
        }}
      >
        <IconButton
          size="small"
          sx={{
            p: 0.25,
            color: gs.textDisabled,
            transition: 'transform 0.3s ease',
            transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)',
          }}
        >
          <ExpandMoreIcon sx={{ fontSize: 18 }} />
        </IconButton>

        {isStreaming ? (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Typography
              sx={{
                fontSize: 12,
                color: gs.textSecondary,
                animation: `${pulse} 1.5s ease-in-out infinite`,
              }}
            >
              正在思考...
            </Typography>
          </Box>
        ) : (
          <>
            <Typography sx={{ fontSize: 12, color: gs.textSecondary, fontWeight: 500 }}>
              思考过程
            </Typography>
            {duration !== undefined && (
              <Typography sx={{ fontSize: 11, color: gs.textDisabled }}>
                耗时 {formatDuration(duration)}
              </Typography>
            )}
          </>
        )}
      </Box>

      {/* 展开内容区域 */}
      <Collapse in={expanded}>
        <Box
          sx={{
            px: 1.5,
            py: 1,
            color: gs.textMuted,
            '& .markdown-body': {
              fontSize: 13,
              lineHeight: 1.6,
              p: 0,
              m: 0,
            },
            '& .markdown-body p': {
              m: 0,
              '& + p': { mt: 0.5 },
            },
            '& .markdown-body code': {
              fontSize: 12,
            },
          }}
        >
          <MarkdownRenderer content={thinking} />
        </Box>
      </Collapse>
    </Box>
  );
}
