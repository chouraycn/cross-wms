import React from 'react';
import { Box, Typography, Tooltip } from '@mui/material';
import { GrayScale } from '../../../constants/theme.js';
import { Message } from '../../../types/chat.js';

interface MemoryRetrievedNoticeProps {
  data: NonNullable<Message['memoryRetrieved']>;
  gs: GrayScale;
  isDark: boolean;
}

export const MemoryRetrievedNotice: React.FC<MemoryRetrievedNoticeProps> = React.memo(({ data, gs, isDark }) => {
  return (
    <Tooltip
      title={
        data.summaries && data.summaries.length > 0 ? (
          <Box sx={{ p: 0.5 }}>
            {data.summaries.map((s, i) => (
              <Typography key={i} sx={{ fontSize: 10, color: 'rgba(255,255,255,0.8)', lineHeight: 1.5 }}>
                {i + 1}. {s.length > 80 ? s.substring(0, 80) + '...' : s}
              </Typography>
            ))}
          </Box>
        ) : undefined
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
          bgcolor: isDark ? 'rgba(156,163,175,0.06)' : 'rgba(156,163,175,0.08)',
          maxWidth: 'fit-content',
        }}
      >
        <svg width="12" height="12" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0 }}>
          <path d="M2 4a6 6 0 0112 0" stroke={gs.textDisabled} strokeWidth="1.5" strokeLinecap="round" />
          <path d="M2 8a6 6 0 0112 0" stroke={gs.textDisabled} strokeWidth="1.5" strokeLinecap="round" />
          <path d="M4 12a4 4 0 018 0" stroke={gs.textDisabled} strokeWidth="1.5" strokeLinecap="round" />
        </svg>
        <Typography sx={{ fontSize: 10, color: gs.textDisabled, whiteSpace: 'nowrap' }}>
          历史记忆注入: {data.count} 条
        </Typography>
      </Box>
    </Tooltip>
  );
});
MemoryRetrievedNotice.displayName = 'MemoryRetrievedNotice';
