import React from 'react';
import { Box, Typography } from '@mui/material';
import { GrayScale } from '../../constants/theme.js';
import { ExecutionPlanInfo, PlanStepInfo } from '../../types/chat.js';

interface ExecutionPlanCardProps {
  plan: ExecutionPlanInfo;
  gs: GrayScale;
  isDark: boolean;
}

const STEP_STATUS_ICONS: Record<string, string> = {
  completed: '✅',
  in_progress: '🔄',
  failed: '❌',
  skipped: '⏭️',
  pending: '⏳',
};

export const ExecutionPlanCard: React.FC<ExecutionPlanCardProps> = React.memo(({ plan, gs, isDark }) => {
  if (!plan) return null;

  return (
    <Box
      data-testid="execution-plan"
      sx={{
        mt: 1,
        p: 1.5,
        borderRadius: 2,
        bgcolor: isDark ? '#1A1A2E' : '#F8FAFC',
        border: `1px solid ${gs.border}`,
        maxWidth: '100%',
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 1 }}>
        <Typography sx={{ fontSize: 12, fontWeight: 600, color: gs.textPrimary }}>
          📋 执行计划
        </Typography>
        <Typography sx={{ fontSize: 11, color: gs.textMuted, flex: 1 }}>
          {plan.intent}
        </Typography>
      </Box>
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.25 }}>
        {plan.steps.map((step: PlanStepInfo) => {
          const icon = STEP_STATUS_ICONS[step.status] || '⏳';
          const indent = step.dependsOn.length > 0 ? 2 : 0;

          return (
            <Box
              key={step.step}
              data-testid="plan-step"
              data-status={step.status}
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 0.5,
                pl: indent,
                py: 0.15,
              }}
            >
              <Typography sx={{ fontSize: 12, lineHeight: 1.4, flexShrink: 0 }}>
                {icon}
              </Typography>
              <Typography
                sx={{
                  fontSize: 12,
                  color: step.status === 'failed' ? '#EF4444'
                    : step.status === 'in_progress' ? '#3B82F6'
                    : step.status === 'completed' ? '#22C55E'
                    : gs.textMuted,
                  lineHeight: 1.4,
                }}
              >
                {step.step}. {step.description}
              </Typography>
              {step.toolName && (
                <Typography
                  sx={{
                    fontSize: 10,
                    fontFamily: 'monospace',
                    color: gs.textDisabled,
                    ml: 'auto',
                    flexShrink: 0,
                  }}
                >
                  {step.toolName}
                </Typography>
              )}
            </Box>
          );
        })}
      </Box>
    </Box>
  );
});
ExecutionPlanCard.displayName = 'ExecutionPlanCard';
