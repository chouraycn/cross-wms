import React from 'react';
import { Box, Typography, Tooltip } from '@mui/material';
import { GrayScale } from '../../../constants/theme.js';
import { Message } from '../../../types/chat.js';

interface CircuitBreakerAlertProps {
  data: NonNullable<Message['circuitBreakerTriggered']>;
  gs: GrayScale;
  isDark: boolean;
}

export const CircuitBreakerAlert: React.FC<CircuitBreakerAlertProps> = React.memo(({ data, gs, isDark }) => {
  const isOpen = data.state === 'open';
  const bgColor = isOpen
    ? (isDark ? 'rgba(239,68,68,0.1)' : 'rgba(239,68,68,0.06)')
    : (isDark ? 'rgba(249,115,22,0.1)' : 'rgba(249,115,22,0.06)');
  const textColor = isOpen ? '#ef4444' : '#f97316';

  return (
    <Tooltip
      title={
        <Box sx={{ p: 0.5 }}>
          <Typography sx={{ fontSize: 11, color: '#fff', lineHeight: 1.5 }}>
            工具 {data.toolName} 连续失败 {data.failureCount} 次
          </Typography>
          {data.alternativeTool && (
            <Typography sx={{ fontSize: 10, color: 'rgba(255,255,255,0.7)', mt: 0.5 }}>
              建议替代: {data.alternativeTool}
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
          bgcolor: bgColor,
          maxWidth: 'fit-content',
          cursor: 'default',
        }}
      >
        <svg width="12" height="12" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0 }}>
          <path d="M8 2L2 14h12L8 2z" stroke={textColor} strokeWidth="1.5" strokeLinejoin="round" fill="none" />
          <path d="M8 6v3M8 11.5v0.5" stroke={textColor} strokeWidth="1.5" strokeLinecap="round" />
        </svg>
        <Typography sx={{ fontSize: 10, color: textColor, fontWeight: 600, whiteSpace: 'nowrap' }}>
          {isOpen ? '熔断' : '降级'}: {data.toolName}
        </Typography>
        {data.alternativeTool && (
          <Typography sx={{ fontSize: 10, color: gs.textDisabled, whiteSpace: 'nowrap' }}>
            → {data.alternativeTool}
          </Typography>
        )}
      </Box>
    </Tooltip>
  );
});
CircuitBreakerAlert.displayName = 'CircuitBreakerAlert';
