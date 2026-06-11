import React, { useCallback } from 'react';
import { Box, IconButton, Tooltip } from '@mui/material';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import { useTypewriter } from '../../hooks/useTypewriter';
import { MarkdownRenderer } from './MarkdownRenderer';

interface TypewriterMessageProps {
  content: string;
}

export function TypewriterMessage({ content }: TypewriterMessageProps) {
  const { displayText, isTyping, skip } = useTypewriter({
    text: content,
    speed: 30,
    enabled: true,
  });

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(content);
  }, [content]);

  return (
    <Box sx={{ position: 'relative' }}>
      <MarkdownRenderer content={displayText} />
      {isTyping && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.5 }}>
          <span
            style={{
              display: 'inline-block',
              width: 7,
              height: 16,
              backgroundColor: 'currentColor',
              marginLeft: 2,
              verticalAlign: 'middle',
              animation: 'cursor-blink 1s step-end infinite',
              borderRadius: 1,
            }}
          />
          <Tooltip title="跳过打字机效果">
            <IconButton
              size="small"
              onClick={skip}
              sx={{
                color: 'text.disabled',
                fontSize: 12,
                p: 0.25,
                '&:hover': { color: 'text.primary' },
              }}
            >
              <ContentCopyIcon sx={{ fontSize: 12 }} />
            </IconButton>
          </Tooltip>
        </Box>
      )}
    </Box>
  );
}
