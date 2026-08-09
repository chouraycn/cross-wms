import type { ReactNode } from 'react';

import { Box } from '@mui/material';

export type StatCardTone = 'default' | 'green' | 'red';

const SURFACE: Record<StatCardTone, string> = {
  default: 'var(--surface-muted)',
  green: '#e9f7ef',
  red: '#fce7e7',
};
const VALUE_COLOR: Record<StatCardTone, string> = {
  default: 'var(--foreground)',
  green: '#2cb360',
  red: '#d20b0b',
};
const LABEL_COLOR: Record<StatCardTone, string> = {
  default: 'var(--ink-soft)',
  green: '#2cb360',
  red: '#d20b0b',
};

export type StatCardProps = {
  value: ReactNode;
  label: ReactNode;
  /** Colour accent. `default` = neutral grey card, `green`/`red` = tinted. */
  tone?: StatCardTone;
  /** Extra classes for the big value (e.g. a custom colour). */
  valueClassName?: string;
  /** Extra classes for the outer card (e.g. override the flex basis). */
  className?: string;
};

/**
 * Metric card used across the enterprise pages: a rounded tinted surface with
 * a large value and a trailing label.
 */
export function StatCard({ value, label, tone = 'default', valueClassName, className }: StatCardProps) {
  return (
    <Box
      className={className}
      sx={{
        display: 'flex',
        height: 70,
        flex: '1 1 180px',
        alignItems: 'center',
        borderRadius: '14px',
        px: '24px',
        py: '8px',
        bgcolor: SURFACE[tone],
      }}
    >
      <Box sx={{ display: 'flex', minWidth: 0, alignItems: 'flex-end', gap: '6px' }}>
        <Box
          component="span"
          className={valueClassName}
          sx={{ shrink: 0, fontSize: 26, fontWeight: 600, lineHeight: 0, color: VALUE_COLOR[tone] }}
        >
          {value}
        </Box>
        <Box
          component="span"
          sx={{
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            fontSize: 14,
            lineHeight: 0,
            color: LABEL_COLOR[tone],
          }}
        >
          {label}
        </Box>
      </Box>
    </Box>
  );
}

export default StatCard;
