import React from 'react';
import { Box, Typography, Tooltip } from '@mui/material';
import { GrayScale } from '../../../constants/theme.js';
import { Message } from '../../../types/chat.js';

interface ComplexityUpgradedNoticeProps {
  data: NonNullable<Message['complexityUpgraded']>;
  gs: GrayScale;
  isDark: boolean;
}

const levelMap: Record<string, string> = { simple: '简单', moderate: '中等', complex: '复杂' };

export const ComplexityUpgradedNotice: React.FC<ComplexityUpgradedNoticeProps> = React.memo(({ data, gs, isDark }) => {
  return (
    <Tooltip
      title={
        <Box sx={{ p: 0.5 }}>
          <Typography sx={{ fontSize: 11, color: '#fff', lineHeight: 1.5 }}>
            {data.reason || '无升级原因'}
          </Typography>
        </Box>
      }
      arrow
      placement="top"
    >
      <Box
        sx={{
          mt: 1,
          display: 'inline-flex',
          alignItems: 'center',
          gap: 0.5,
          px: 1,
          py: 0.25,
          borderRadius: 1,
          bgcolor: isDark ? 'rgba(168,85,247,0.12)' : 'rgba(168,85,247,0.08)',
          border: '1px solid rgba(168,85,247,0.3)',
          cursor: 'default',
        }}
      >
        <svg width="12" height="12" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0 }}>
          <path d="M8 2l2 5h5l-4 3 1.5 5L8 12 3.5 15 5 10 1 7h5z" stroke="#a855f7" strokeWidth="1.2" fill="none" />
        </svg>
        <Typography sx={{ fontSize: 10, color: '#a855f7', fontWeight: 600, whiteSpace: 'nowrap' }}>
          复杂度升级
        </Typography>
        <Typography sx={{ fontSize: 10, color: gs.textDisabled, whiteSpace: 'nowrap' }}>
          {levelMap[data.oldLevel] || data.oldLevel} → {levelMap[data.newLevel] || data.newLevel}
        </Typography>
      </Box>
    </Tooltip>
  );
});
ComplexityUpgradedNotice.displayName = 'ComplexityUpgradedNotice';
