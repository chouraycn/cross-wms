/**
 * CDFChat 输入框组件
 *
 * - 多行输入（自动高度）
 * - Enter 发送，Shift+Enter 换行
 * - 禁用状态（isStreaming 时）
 * - 停止生成按钮
 */
import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Box, TextField, IconButton, useTheme } from '@mui/material';
import SendIcon from '@mui/icons-material/Send';
import StopCircleIcon from '@mui/icons-material/StopCircle';
import { getGrayScale } from '../../constants/theme';
import type { ChatInputProps } from './types';

/** 最大输入行数 */
const MAX_ROWS = 8;

/**
 * 输入框组件
 */
export const ChatInput: React.FC<ChatInputProps> = React.memo(function ChatInput({
  onSend,
  onStop,
  isStreaming,
  disabled = false,
  placeholder = '\u8F93\u5165\u60A8\u7684\u95EE\u9898...',
}) {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const gs = getGrayScale(isDark);
  const [value, setValue] = useState('');
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const canSend = value.trim().length > 0 && !isStreaming && !disabled;

  const handleSend = useCallback(() => {
    const trimmed = value.trim();
    if (!trimmed || isStreaming || disabled) return;
    onSend(trimmed);
    setValue('');
  }, [value, isStreaming, disabled, onSend]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend],
  );

  // 聚焦输入框
  useEffect(() => {
    if (!isStreaming && !disabled && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isStreaming, disabled]);

  return (
    <Box
      sx={{
        px: 2,
        py: 1.5,
        borderTop: `1px solid ${gs.border}`,
        bgcolor: gs.bgPanel,
      }}
    >
      <Box
        sx={{
          display: 'flex',
          alignItems: 'flex-end',
          gap: 1,
          maxWidth: 920,
          mx: 'auto',
        }}
      >
        <TextField
          inputRef={inputRef}
          multiline
          maxRows={MAX_ROWS}
          fullWidth
          placeholder={placeholder}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          size="small"
          sx={{
            '& .MuiOutlinedInput-root': {
              borderRadius: 2,
              bgcolor: isDark ? '#1A1A1A' : '#F9FAFB',
              fontSize: 14,
              lineHeight: 1.6,
              color: gs.textPrimary,
              '& fieldset': {
                borderColor: gs.border,
              },
              '&:hover fieldset': {
                borderColor: gs.borderDarker,
              },
              '&.Mui-focused fieldset': {
                borderColor: isDark ? '#60A5FA' : '#3B82F6',
              },
              '&.Mui-disabled': {
                bgcolor: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.03)',
              },
            },
            '& .MuiInputBase-input::placeholder': {
              color: gs.textDisabled,
            },
          }}
        />

        {/* 发送 / 停止按钮 */}
        {isStreaming ? (
          <IconButton
            onClick={onStop}
            sx={{
              color: '#EF4444',
              bgcolor: isDark ? 'rgba(239,68,68,0.08)' : 'rgba(239,68,68,0.06)',
              borderRadius: 2,
              p: 1,
              '&:hover': {
                bgcolor: isDark ? 'rgba(239,68,68,0.15)' : 'rgba(239,68,68,0.1)',
              },
              transition: 'background-color 0.15s ease',
            }}
            aria-label="停止生成"
          >
            <StopCircleIcon sx={{ fontSize: 22 }} />
          </IconButton>
        ) : (
          <IconButton
            onClick={handleSend}
            disabled={!canSend}
            sx={{
              color: canSend ? (isDark ? '#60A5FA' : '#3B82F6') : gs.textDisabled,
              bgcolor: canSend
                ? isDark
                  ? 'rgba(96,165,250,0.08)'
                  : 'rgba(59,130,246,0.06)'
                : 'transparent',
              borderRadius: 2,
              p: 1,
              '&:hover': canSend
                ? {
                    bgcolor: isDark ? 'rgba(96,165,250,0.15)' : 'rgba(59,130,246,0.1)',
                  }
                : {},
              '&.Mui-disabled': {
                color: gs.textDisabled,
              },
              transition: 'all 0.15s ease',
            }}
            aria-label="发送"
          >
            <SendIcon sx={{ fontSize: 20 }} />
          </IconButton>
        )}
      </Box>
    </Box>
  );
});
