import type { ReactNode } from 'react';

import { Box, Typography } from '@mui/material';

export type DetailFieldProps = {
  label: string;
  children: ReactNode;
  className?: string;
};

/**
 * Labelled read-only field used inside detail dialogs: a bordered light card
 * with an 11px caption and its value.
 */
export function DetailField({ label, children, className }: DetailFieldProps) {
  return (
    <Box
      className={className}
      sx={{
        display: 'flex',
        flexDirection: 'column',
        gap: '6px',
        minWidth: 0,
        borderRadius: '10px',
        border: '1px solid #eef0f4',
        bgcolor: '#fafbfc',
        px: '12px',
        py: '10px',
      }}
    >
      <Typography component="span" sx={{ fontSize: 11, fontWeight: 600, color: '#858b9c' }}>
        {label}
      </Typography>
      <Box sx={{ minWidth: 0, overflowWrap: 'break-word', fontSize: 12, color: '#18181a' }}>{children}</Box>
    </Box>
  );
}

export default DetailField;
