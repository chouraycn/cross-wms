import React from 'react';
import { Box, Typography } from '@mui/material';
import { GrayScale } from '../../constants/theme.js';
import { ReactPhaseInfo } from '../../types/chat.js';

interface ReactPhaseIndicatorProps {
  phaseInfo: ReactPhaseInfo;
  gs: GrayScale;
  isDark: boolean;
}

const REACT_PHASES: Array<{ key: ReactPhaseInfo['phase']; label: string }> = [
  { key: 'reasoning', label: '推理' },
  { key: 'acting', label: '执行' },
  { key: 'observing', label: '观察' },
  { key: 'reflecting', label: '反思' },
  { key: 'done', label: '完成' },
];

export const ReactPhaseIndicator: React.FC<ReactPhaseIndicatorProps> = React.memo(({ phaseInfo, gs, isDark }) => {
  if (!phaseInfo) return null;

  const currentIdx = REACT_PHASES.findIndex(p => p.key === phaseInfo.phase);

  return (
    <Box
      sx={{
        mt: 1,
        display: 'flex',
        alignItems: 'center',
        gap: 0.5,
        px: 1,
        py: 0.5,
        borderRadius: 1.5,
        bgcolor: isDark ? '#1A1A2E' : '#F1F5F9',
        border: `1px solid ${gs.border}`,
        maxWidth: 'fit-content',
      }}
    >
      {REACT_PHASES.map((phase, idx) => {
        const isCurrent = idx === currentIdx;
        const isCompleted = idx < currentIdx;

        let bgColor: string;
        let textColor: string;
        if (isCurrent) {
          bgColor = '#3B82F6';
          textColor = '#FFFFFF';
        } else if (isCompleted) {
          bgColor = isDark ? '#374151' : '#D1D5DB';
          textColor = isDark ? '#9CA3AF' : '#6B7280';
        } else {
          bgColor = isDark ? '#1F2937' : '#E5E7EB';
          textColor = isDark ? '#4B5563' : '#9CA3AF';
        }

        return (
          <React.Fragment key={phase.key}>
            {idx > 0 && (
              <Typography sx={{ fontSize: 10, color: gs.textDisabled, mx: 0.25 }}>
                →
              </Typography>
            )}
            <Box
              sx={{
                px: 1,
                py: 0.15,
                borderRadius: 0.75,
                bgcolor: bgColor,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                minWidth: 36,
                transition: 'background-color 0.2s',
              }}
            >
              <Typography
                sx={{
                  fontSize: 10,
                  fontWeight: isCurrent ? 600 : 400,
                  color: textColor,
                  whiteSpace: 'nowrap',
                }}
              >
                {phase.label}
              </Typography>
            </Box>
          </React.Fragment>
        );
      })}
      {phaseInfo.step != null && phaseInfo.totalSteps != null && (
        <Typography sx={{ fontSize: 10, color: gs.textMuted, ml: 0.5 }}>
          {phaseInfo.step}/{phaseInfo.totalSteps}
        </Typography>
      )}
    </Box>
  );
});
ReactPhaseIndicator.displayName = 'ReactPhaseIndicator';
