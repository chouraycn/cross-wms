import React, { useState } from 'react';
import { Box, Typography, CircularProgress, Paper } from '@mui/material';
import { TopBarChatInput } from './TopBarChatInput';
import { Message, Session } from '../../types/chat';

export function WorkBuddyChat() {
  const [session, setSession] = useState<Session>({
    id: '',
    title: '',
    model: 'claude-sonnet-4',
    messages: []
  });

  return (
    <Box sx={{ width: '100%', display: 'flex', flexDirection: 'column', maxHeight: '70vh' }}>
      {/* 消息历史区域 — 在 TopBarChatInput 上方显示 */}
      {session.messages.length > 0 && (
        <Box
          sx={{
            flex: 1,
            overflow: 'auto',
            px: 1.5,
            py: 1,
            display: 'flex',
            flexDirection: 'column',
            gap: 1.5,
            minHeight: 0,
            maxHeight: 'calc(70vh - 130px)',
          }}
        >
          {session.messages.map((msg: Message) => (
            <Box
              key={msg.id}
              sx={{
                display: 'flex',
                justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start',
              }}
            >
              <Paper
                elevation={0}
                sx={{
                  px: 1.5,
                  py: 1,
                  borderRadius: '12px',
                  maxWidth: '80%',
                  bgcolor: msg.role === 'user' ? '#f97316' : '#F3F4F6',
                  color: msg.role === 'user' ? '#fff' : '#111827',
                  border: msg.role === 'assistant' ? '1px solid #E5E7EB' : 'none',
                  wordBreak: 'break-word',
                }}
              >
                <Typography sx={{ fontSize: 14, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
                  {msg.content || (msg.role === 'assistant' && msg.content === '' ? '思考中...' : '')}
                </Typography>
                <Typography
                  sx={{
                    fontSize: 11,
                    color: msg.role === 'user' ? 'rgba(255,255,255,0.7)' : '#9CA3AF',
                    mt: 0.5,
                    textAlign: 'right',
                  }}
                >
                  {msg.timestamp.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
                </Typography>
              </Paper>
            </Box>
          ))}
        </Box>
      )}

      {/* TopBarChatInput — 完全保持原有样式，不做任何修改 */}
      <TopBarChatInput
        session={session}
        onSessionUpdate={(s: Session) => setSession(s)}
      />
    </Box>
  );
}
