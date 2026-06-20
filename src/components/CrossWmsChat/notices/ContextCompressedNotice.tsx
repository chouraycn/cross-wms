import React from 'react';
import { Box, Typography, Tooltip } from '@mui/material';
import { GrayScale } from '../../../constants/theme.js';
import { Message } from '../../../types/chat.js';

interface ContextCompressedNoticeProps {
  data: NonNullable<Message['contextCompressed']>;
  gs: GrayScale;
  isDark: boolean;
}

const strategyLabel: Record<string, string> = {
  semantic: '语义压缩',
  extractive: '摘要提取',
  truncation: '截断压缩',
};

export const ContextCompressedNotice: React.FC<ContextCompressedNoticeProps> = React.memo(({ data, gs, isDark }) => {
  const ratioPct = data.ratio != null ? Math.round(data.ratio * 100) : 0;
  const preservedCount = data.keyInfoPreserved?.length ?? 0;

  return (
    <Tooltip
      title={
        <Box sx={{ p: 0.5 }}>
          <Typography sx={{ fontSize: 11, color: '#fff', lineHeight: 1.5 }}>
            {strategyLabel[data.strategy] || data.strategy}：{data.originalTokens} → {data.compressedTokens} tokens
          </Typography>
          {preservedCount > 0 && (
            <Typography sx={{ fontSize: 10, color: 'rgba(255,255,255,0.7)', mt: 0.5 }}>
              保留关键信息: {data.keyInfoPreserved!.slice(0, 5).join('、')}{preservedCount > 5 ? ` 等${preservedCount}项` : ''}
            </Typography>
          )}
        </Box>
      }
      arrow
      placement="top"
    >
      <Box
        sx={{
          mt: 1,
          display: 'flex',
          alignItems: 'center',
          gap: 0.5,
          px: 1,
          py: 0.25,
          borderRadius: 1,
          bgcolor: isDark ? 'rgba(99,130,185,0.1)' : 'rgba(99,130,185,0.08)',
          maxWidth: 'fit-content',
          cursor: 'default',
        }}
      >
        <svg width="12" height="12" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0 }}>
          <path d="M2 4h12M2 8h12M2 12h8" stroke="#6382b9" strokeWidth="1.5" strokeLinecap="round" />
          <path d="M12 10l2 2-2 2" stroke="#6382b9" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <Typography sx={{ fontSize: 10, color: '#6382b9', fontWeight: 500, whiteSpace: 'nowrap' }}>
          {strategyLabel[data.strategy] || '上下文压缩'}
        </Typography>
        <Typography sx={{ fontSize: 10, color: gs.textDisabled, fontFamily: 'monospace', whiteSpace: 'nowrap' }}>
          {ratioPct}%
        </Typography>
        {preservedCount > 0 && (
          <Typography sx={{ fontSize: 10, color: gs.textDisabled, whiteSpace: 'nowrap' }}>
            {preservedCount}项关键信息
          </Typography>
        )}
      </Box>
    </Tooltip>
  );
});
ContextCompressedNotice.displayName = 'ContextCompressedNotice';
