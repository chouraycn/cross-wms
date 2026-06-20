import React from 'react';
import { Box, Typography, Tooltip } from '@mui/material';
import { GrayScale } from '../../../constants/theme.js';
import { Message } from '../../../types/chat.js';

interface OutputRepairedNoticeProps {
  data: NonNullable<Message['outputRepaired']>;
  gs: GrayScale;
  isDark: boolean;
}

export const OutputRepairedNotice: React.FC<OutputRepairedNoticeProps> = React.memo(({ data, gs, isDark }) => {
  return (
    <Tooltip
      title={
        data.repairDetails ? (
          <Box sx={{ p: 0.5 }}>
            <Typography sx={{ fontSize: 10, color: 'rgba(255,255,255,0.8)', lineHeight: 1.5 }}>
              {data.repairDetails}
            </Typography>
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
          bgcolor: isDark ? 'rgba(234,179,8,0.08)' : 'rgba(234,179,8,0.06)',
          maxWidth: 'fit-content',
          cursor: 'default',
        }}
      >
        <svg width="12" height="12" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0 }}>
          <path d="M2 8l4 4 8-8" stroke="#eab308" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M10 4l4-0L14 8" stroke="#eab308" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <Typography sx={{ fontSize: 10, color: '#eab308', whiteSpace: 'nowrap' }}>
          输出已修复: {data.toolName}
        </Typography>
      </Box>
    </Tooltip>
  );
});
OutputRepairedNotice.displayName = 'OutputRepairedNotice';
