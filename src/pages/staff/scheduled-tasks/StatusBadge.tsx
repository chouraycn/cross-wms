import type { ReactNode } from 'react';

import { Box } from '@mui/material';
import type { SxProps } from '@mui/material/styles';

import { BADGE_TONE_SX, RUN_STATUS_BADGE, TASK_STATUS_BADGE, type BadgeTone } from './shared.js';

export function StatusBadge({
  tone,
  children,
  className,
  sx,
}: {
  tone: BadgeTone;
  children: ReactNode;
  className?: string;
  sx?: SxProps;
}) {
  return (
    <Box
      className={className}
      sx={[
        {
          display: 'inline-flex',
          alignItems: 'center',
          borderRadius: '9999px',
          px: '12px',
          py: '4px',
          fontSize: 10,
          lineHeight: 0,
          textTransform: 'capitalize',
          whiteSpace: 'nowrap',
        },
        BADGE_TONE_SX[tone],
        ...(sx ? [sx] : []),
      ] as SxProps}
    >
      {children}
    </Box>
  );
}

export function TaskStatusBadge({ status }: { status: string }) {
  const { tone, text } = TASK_STATUS_BADGE[status] || TASK_STATUS_BADGE.archived;
  return <StatusBadge tone={tone}>{text}</StatusBadge>;
}

export function TaskRunResultBadge({ status }: { status: string }) {
  const preset = RUN_STATUS_BADGE[status] || { tone: 'gray' as BadgeTone, text: status || '暂无' };
  return <StatusBadge tone={preset.tone}>{preset.text}</StatusBadge>;
}
