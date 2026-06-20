import React from 'react';
import { Box, Typography, Tooltip } from '@mui/material';
import { GrayScale } from '../../constants/theme.js';
import { Message } from '../../types/chat.js';

interface ComplexityAssessmentBadgeProps {
  data: NonNullable<Message['complexityAssessment']>;
  gs: GrayScale;
  isDark: boolean;
}

const COMPLEXITY_STYLES: Record<string, { color: string; bg: string; border: string; label: string }> = {
  simple: { color: '#3B82F6', bg: 'rgba(59,130,246,0.1)', border: 'rgba(59,130,246,0.25)', label: '简单' },
  moderate: { color: '#F59E0B', bg: 'rgba(245,158,11,0.1)', border: 'rgba(245,158,11,0.25)', label: '中等' },
  complex: { color: '#EF4444', bg: 'rgba(239,68,68,0.1)', border: 'rgba(239,68,68,0.25)', label: '复杂' },
};

export const ComplexityAssessmentBadge: React.FC<ComplexityAssessmentBadgeProps> = React.memo(({ data, gs, isDark }) => {
  const level = data.level || 'simple';
  const style = COMPLEXITY_STYLES[level] || COMPLEXITY_STYLES.simple;

  return (
    <Tooltip
      title={
        <Box sx={{ p: 0.5 }}>
          <Typography sx={{ fontSize: 11, color: '#fff', lineHeight: 1.5 }}>
            {data.reason || '无推理信息'}
          </Typography>
          {data.recommendedMode && (
            <Typography sx={{ fontSize: 10, color: 'rgba(255,255,255,0.7)', mt: 0.5 }}>
              推荐模式: {data.recommendedMode}
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
          display: 'inline-flex',
          alignItems: 'center',
          gap: 0.5,
          px: 1,
          py: 0.25,
          borderRadius: 1,
          bgcolor: style.bg,
          border: `1px solid ${style.border}`,
          cursor: 'default',
        }}
      >
        <Typography sx={{ fontSize: 11, fontWeight: 600, color: style.color, whiteSpace: 'nowrap' }}>
          {style.label}
        </Typography>
        {data.estimatedSteps > 0 && (
          <Typography sx={{ fontSize: 10, color: gs.textDisabled, fontFamily: 'monospace' }}>
            ≈{data.estimatedSteps}步
          </Typography>
        )}
      </Box>
    </Tooltip>
  );
});
ComplexityAssessmentBadge.displayName = 'ComplexityAssessmentBadge';
