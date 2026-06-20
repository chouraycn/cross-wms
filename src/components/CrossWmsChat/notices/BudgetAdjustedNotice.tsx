import React from 'react';
import { Box, Typography, Tooltip } from '@mui/material';
import { GrayScale } from '../../../constants/theme.js';
import { Message } from '../../../types/chat.js';

interface BudgetAdjustedNoticeProps {
  data: NonNullable<Message['budgetAdjusted']>;
  gs: GrayScale;
  isDark: boolean;
}

export const BudgetAdjustedNotice: React.FC<BudgetAdjustedNoticeProps> = React.memo(({ data, gs, isDark }) => {
  return (
    <Tooltip
      title={
        <Box sx={{ p: 0.5 }}>
          <Typography sx={{ fontSize: 11, color: '#fff', lineHeight: 1.5 }}>
            {data.reason || '复杂度变更'}
          </Typography>
          {data.oldMaxTokens !== undefined && data.newMaxTokens !== undefined && (
            <Typography sx={{ fontSize: 10, color: 'rgba(255,255,255,0.7)', mt: 0.5 }}>
              Token 预算: {data.oldMaxTokens} → {data.newMaxTokens}
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
          bgcolor: isDark ? 'rgba(156,163,175,0.06)' : 'rgba(156,163,175,0.08)',
          maxWidth: 'fit-content',
        }}
      >
        <svg width="12" height="12" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0 }}>
          <rect x="2" y="6" width="12" height="8" rx="1" stroke={gs.textDisabled} strokeWidth="1.5" fill="none" />
          <path d="M5 6V4a3 3 0 016 0v2" stroke={gs.textDisabled} strokeWidth="1.5" strokeLinecap="round" />
        </svg>
        <Typography sx={{ fontSize: 10, color: gs.textDisabled, whiteSpace: 'nowrap' }}>
          预算调整: {data.oldMaxTurns} → {data.newMaxTurns} 轮
        </Typography>
      </Box>
    </Tooltip>
  );
});
BudgetAdjustedNotice.displayName = 'BudgetAdjustedNotice';
