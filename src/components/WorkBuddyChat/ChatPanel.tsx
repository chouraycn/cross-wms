import React, { useState, useRef, useEffect } from 'react';
import { Box, Paper, Typography, TextField, IconButton, CircularProgress } from '@mui/material';
import SendIcon from '@mui/icons-material/Send';
import { Message } from '../../types/chat';

interface ChatPanelProps {
  messages: Message[];
  isLoading: boolean;
  inputValue: string;
  onInputChange: (v: string) => void;
  onSend: () => void;
  compact?: boolean;
}

export function ChatPanel({ messages, isLoading, inputValue, onInputChange, onSend, compact = false }: ChatPanelProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', bgcolor: '#fff' }}>
      {/* 消息区 */}
      <Box sx={{ flex: compact ? 'none' : 1, overflowY: 'auto', p: 2, display: 'flex', flexDirection: 'column', gap: 1.5, ...(compact && { maxHeight: '35vh' }) }}>
        {messages.length === 0 && (
          <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Typography color="text.secondary" sx={{ fontSize: 14 }}>输入消息开始对话</Typography>
          </Box>
        )}
        {messages.map(msg => (
          <Box key={msg.id} sx={{ display: 'flex', justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start' }}>
            <Paper sx={{
              p: 1.5,
              maxWidth: '80%',
              bgcolor: msg.role === 'user' ? '#F3F4F6' : '#fff',
              border: '1px solid #E5E7EB',
              borderRadius: 2,
              boxShadow: 'none'
            }}>
              <Typography sx={{ fontSize: 13, color: '#111827', whiteSpace: 'pre-wrap' }}>{msg.content}</Typography>
            </Paper>
          </Box>
        ))}
        {isLoading && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <CircularProgress size={16} sx={{ color: '#6B7280' }} />
            <Typography sx={{ fontSize: 12, color: '#6B7280' }}>思考中...</Typography>
          </Box>
        )}
        <div ref={messagesEndRef} />
      </Box>

      {/* 输入区仅在非 compact 模式下显示 */}
      {!compact && (
        <Box sx={{ p: 1.5, borderTop: '1px solid #E5E7EB', bgcolor: '#FAFAFA' }}>
          <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-end' }}>
            <TextField
              fullWidth
              multiline
              maxRows={4}
              size="small"
              placeholder="输入消息..."
              value={inputValue}
              onChange={e => onInputChange(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onSend(); } }}
              sx={{ '& .MuiInputBase-root': { fontSize: 13, bgcolor: '#fff', borderRadius: 2 } }}
            />
            <IconButton
              onClick={onSend}
              disabled={!inputValue.trim() || isLoading}
              sx={{
                bgcolor: '#111827',
                color: '#fff',
                borderRadius: 2,
                '&:hover': { bgcolor: '#374151' },
                '&.Mui-disabled': { bgcolor: '#E5E7EB' }
              }}
            >
              <SendIcon sx={{ fontSize: 18 }} />
            </IconButton>
          </Box>
        </Box>
      )}
    </Box>
  );
}
