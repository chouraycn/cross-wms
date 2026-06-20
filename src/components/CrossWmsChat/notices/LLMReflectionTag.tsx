import React from 'react';
import { Box, Typography } from '@mui/material';
import { GrayScale } from '../../../constants/theme.js';
import { Message } from '../../../types/chat.js';

interface LLMReflectionTagProps {
  data: NonNullable<Message['llmReflection']>;
  gs: GrayScale;
  isDark: boolean;
}

export const LLMReflectionTag: React.FC<LLMReflectionTagProps> = React.memo(({ data, gs, isDark }) => {
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
        bgcolor: isDark ? 'rgba(59,130,246,0.08)' : 'rgba(59,130,246,0.06)',
        maxWidth: 'fit-content',
      }}
    >
      <svg width="12" height="12" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0 }}>
        <circle cx="8" cy="8" r="6" stroke="#3b82f6" strokeWidth="1.5" fill="none" />
        <path d="M8 5v3l2 2" stroke="#3b82f6" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
      <Typography sx={{ fontSize: 10, color: '#3b82f6', fontWeight: 500, whiteSpace: 'nowrap' }}>
        LLM 反思
      </Typography>
      {data.insight && (
        <Typography sx={{ fontSize: 10, color: gs.textDisabled, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 200 }}>
          {data.insight.length > 50 ? data.insight.substring(0, 50) + '...' : data.insight}
        </Typography>
      )}
      <Typography sx={{ fontSize: 9, color: gs.textDisabled, fontFamily: 'monospace' }}>
        ({data.confidenceScore})
      </Typography>
    </Box>
  );
});
LLMReflectionTag.displayName = 'LLMReflectionTag';
