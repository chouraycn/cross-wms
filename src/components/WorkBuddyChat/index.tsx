import React, { useState, useCallback } from 'react';
import { Box } from '@mui/material';
import { TopBarChatInput } from './TopBarChatInput';
import { Message, Session } from '../../types/chat';

export function WorkBuddyChat() {
  const [session, setSession] = useState<Session>({ id: '', title: '', model: 'claude-sonnet-4', messages: [] });

  return (
    <Box sx={{ display: 'inline-flex', alignItems: 'center' }}>
      <TopBarChatInput
        session={session}
        onSessionUpdate={(s: Session) => setSession(s)}
      />
    </Box>
  );
}
