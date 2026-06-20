import React from 'react';
import { Box, Typography } from '@mui/material';
import { GrayScale } from '../../../constants/theme.js';
import { Message } from '../../../types/chat.js';

interface PlanStepCompletedIndicatorProps {
  data: NonNullable<Message['planStepCompleted']>;
  gs: GrayScale;
  isDark: boolean;
}

export const PlanStepCompletedIndicator: React.FC<PlanStepCompletedIndicatorProps> = React.memo(({ data, gs, isDark }) => {
  return (
    <Box
      sx={{
        mt: 1,
        display: 'flex',
        alignItems: 'center',
        gap: 0.5,
        px: 1,
        py: 0.25,
        borderRadius: 1,
        bgcolor: isDark ? 'rgba(34,197,94,0.08)' : 'rgba(34,197,94,0.06)',
        maxWidth: 'fit-content',
      }}
    >
      <svg width="12" height="12" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0 }}>
        <path d="M3 8.5l3.5 3.5 6.5-7" stroke="#22c55e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <Typography sx={{ fontSize: 10, color: '#22c55e', whiteSpace: 'nowrap' }}>
        步骤 {data.step} 完成{data.toolName ? ` · ${data.toolName}` : ''}
      </Typography>
      {data.description && (
        <Typography sx={{ fontSize: 10, color: gs.textDisabled, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 200 }}>
          {data.description}
        </Typography>
      )}
    </Box>
  );
});
PlanStepCompletedIndicator.displayName = 'PlanStepCompletedIndicator';
