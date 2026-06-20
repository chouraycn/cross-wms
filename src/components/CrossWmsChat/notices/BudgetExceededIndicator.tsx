import React from 'react';
import { Box, Typography } from '@mui/material';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import { GrayScale } from '../../../constants/theme.js';
import { Message } from '../../../types/chat.js';

interface BudgetExceededIndicatorProps {
  data: NonNullable<Message['budgetExceeded']>;
  gs: GrayScale;
  isDark: boolean;
}

export const BudgetExceededIndicator: React.FC<BudgetExceededIndicatorProps> = React.memo(({ data, gs, isDark }) => {
  const isTurns = data.consumedTurns > data.maxTurns && data.maxTurns > 0;
  const isTokens = data.consumedTokens > data.maxTokens && data.maxTokens > 0;

  return (
    <Box
      sx={{
        mt: 1,
        px: 1.25,
        py: 0.5,
        borderRadius: 1.5,
        bgcolor: isDark ? 'rgba(239,68,68,0.08)' : '#FEF2F2',
        border: '1px solid rgba(239,68,68,0.25)',
        display: 'flex',
        alignItems: 'center',
        gap: 0.75,
        maxWidth: 'fit-content',
      }}
    >
      <ErrorOutlineIcon sx={{ fontSize: 14, color: '#EF4444', flexShrink: 0 }} />
      <Typography sx={{ fontSize: 11, fontWeight: 600, color: '#EF4444', whiteSpace: 'nowrap' }}>
        预算超出
      </Typography>
      {isTurns && (
        <Typography sx={{ fontSize: 11, color: gs.textMuted, fontFamily: 'monospace', whiteSpace: 'nowrap' }}>
          轮次 {data.consumedTurns}/{data.maxTurns}
        </Typography>
      )}
      {isTokens && (
        <Typography sx={{ fontSize: 11, color: gs.textMuted, fontFamily: 'monospace', whiteSpace: 'nowrap' }}>
          Token {data.consumedTokens}/{data.maxTokens}
        </Typography>
      )}
      {!isTurns && !isTokens && (
        <Typography sx={{ fontSize: 11, color: gs.textMuted, whiteSpace: 'nowrap' }}>
          {data.reason}
        </Typography>
      )}
    </Box>
  );
});
BudgetExceededIndicator.displayName = 'BudgetExceededIndicator';
