import React, { useState, useCallback } from 'react';
import { Box, Drawer, Fab, Typography } from '@mui/material';
import ChatBubbleOutlineIcon from '@mui/icons-material/ChatBubbleOutline';
import CloseIcon from '@mui/icons-material/Close';
import { ChatPanel } from './ChatPanel';
import { Message, Session } from '../../types/chat';
import { useChat } from '../../hooks/useChat';

const DRAWER_WIDTH = 400;

export function WorkBuddyChat() {
  const [open, setOpen] = useState(false);
  const [session, setSession] = useState<Session>({ id: '', title: '', model: 'claude-sonnet-4', messages: [] });

  const { isLoading, inputValue, setInputValue, sendMessage } = useChat(
    session.id ? session : undefined,
    useCallback((s: Session) => setSession(s), [])
  );

  return (
    <>
      {/* FAB */}
      <Box sx={{ position: 'fixed', bottom: 24, right: 24, zIndex: 1300 }}>
        <Fab
          onClick={() => setOpen(true)}
          sx={{ bgcolor: '#111827', color: '#fff', '&:hover': { bgcolor: '#374151' } }}
        >
          <ChatBubbleOutlineIcon />
        </Fab>
      </Box>

      {/* Drawer */}
      <Drawer
        anchor="right"
        open={open}
        onClose={() => setOpen(false)}
        PaperProps={{ sx: { width: DRAWER_WIDTH, boxShadow: '0 0 20px rgba(0,0,0,0.15)' } }}
      >
        <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
          {/* 标题栏 */}
          <Box sx={{ p: 1.5, borderBottom: '1px solid #E5E7EB', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Typography sx={{ fontSize: 14, fontWeight: 600, color: '#111827' }}>AI 助手</Typography>
            <Box onClick={() => setOpen(false)} sx={{ cursor: 'pointer', p: 0.5, borderRadius: 1, '&:hover': { bgcolor: '#F3F4F6' } }}>
              <CloseIcon sx={{ fontSize: 18, color: '#6B7280' }} />
            </Box>
          </Box>
          <ChatPanel
            messages={session.messages}
            isLoading={isLoading}
            inputValue={inputValue}
            onInputChange={setInputValue}
            onSend={() => sendMessage(inputValue)}
          />
        </Box>
      </Drawer>
    </>
  );
}
