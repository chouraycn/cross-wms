import React, { useState, useEffect, useCallback } from 'react';
import { Box, Typography, IconButton, Tooltip } from '@mui/material';
import AddCommentOutlinedIcon from '@mui/icons-material/AddCommentOutlined';
import SmartToyOutlinedIcon from '@mui/icons-material/SmartToyOutlined';
import { TopBarChatInput } from '../components/CrossWmsChat/TopBarChatInput';
import { Message, Session } from '../types/chat';

// 会话持久化配置（与 CrossWmsChat 共享 localStorage）
const SESSIONS_STORAGE_KEY = 'crosswms-chat-sessions';
const MAX_SESSIONS = 20;

function loadSessions(): Session[] {
  try {
    const raw = localStorage.getItem(SESSIONS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed.map((s: Record<string, unknown>) => ({
          ...s,
          messages: Array.isArray(s.messages)
            ? s.messages.map((m: Record<string, unknown>) => ({
                ...m,
                timestamp: new Date(m.timestamp as string),
              }))
            : [],
        })) as Session[];
      }
    }
  } catch { /* 数据损坏时静默返回空数组 */ }
  return [];
}

function saveSessions(sessions: Session[]): void {
  try {
    const serializable = sessions.slice(0, MAX_SESSIONS).map((s) => ({
      ...s,
      messages: s.messages.map((m) => ({
        ...m,
        timestamp: m.timestamp.toISOString(),
      })),
    }));
    localStorage.setItem(SESSIONS_STORAGE_KEY, JSON.stringify(serializable));
  } catch (e) {
    console.error(`[${SESSIONS_STORAGE_KEY}] 保存失败:`, e);
  }
}

function createNewSession(): Session {
  return {
    id: `session-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    title: '',
    model: 'claude-sonnet-4',
    messages: [],
  };
}

/** AI 对话全屏页面 — "新建任务" 的目标页 */
const ChatPage: React.FC = () => {
  const [sessions, setSessions] = useState<Session[]>(() => loadSessions());
  const [activeSessionId, setActiveSessionId] = useState<string>(() => {
    const saved = loadSessions();
    return saved.length > 0 ? saved[0].id : '';
  });

  const session = sessions.find((s) => s.id === activeSessionId) || createNewSession();

  useEffect(() => {
    if (sessions.length > 0) saveSessions(sessions);
  }, [sessions]);

  const handleSessionUpdate = useCallback((updatedSession: Session) => {
    setSessions((prev) => {
      const idx = prev.findIndex((s) => s.id === updatedSession.id);
      if (idx !== -1) {
        const next = [...prev];
        next[idx] = updatedSession;
        return next;
      }
      return [updatedSession, ...prev].slice(0, MAX_SESSIONS);
    });
  }, []);

  const handleNewChat = useCallback(() => {
    const newSession = createNewSession();
    setSessions((prev) => [newSession, ...prev].slice(0, MAX_SESSIONS));
    setActiveSessionId(newSession.id);
  }, []);

  // 监听侧边栏"新建任务"按钮事件
  useEffect(() => {
    const handleFocusChat = () => {
      handleNewChat();
      setTimeout(() => {
        const editable = document.querySelector('[contenteditable="true"]') as HTMLElement;
        if (editable) {
          editable.focus();
          const range = document.createRange();
          const sel = window.getSelection();
          range.selectNodeContents(editable);
          range.collapse(false);
          sel?.removeAllRanges();
          sel?.addRange(range);
        }
      }, 200);
    };
    window.addEventListener('crosswms-focus-chat', handleFocusChat);
    return () => window.removeEventListener('crosswms-focus-chat', handleFocusChat);
  }, [handleNewChat]);

  // 自动聚焦输入框
  useEffect(() => {
    const timer = setTimeout(() => {
      const editable = document.querySelector('[contenteditable="true"]') as HTMLElement;
      if (editable) editable.focus();
    }, 300);
    return () => clearTimeout(timer);
  }, []);

  const isEmpty = session.messages.length === 0;

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', minHeight: 0, bgcolor: '#fff' }}>
      {/* 顶部栏 */}
      <Box
        sx={{
          px: 2,
          py: 1,
          borderBottom: '1px solid #E5E7EB',
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          flexShrink: 0,
          bgcolor: '#F9FAFB',
        }}
      >
        <SmartToyOutlinedIcon sx={{ fontSize: 18, color: '#6B7280' }} />
        <Typography sx={{ fontSize: '0.8125rem', color: '#374151', fontWeight: 500, flex: 1 }}>
          新建任务
        </Typography>
        <Tooltip title="新对话">
          <IconButton
            size="small"
            onClick={handleNewChat}
            sx={{ color: '#9CA3AF', '&:hover': { color: '#374151', bgcolor: '#F3F4F6' } }}
          >
            <AddCommentOutlinedIcon sx={{ fontSize: 18 }} />
          </IconButton>
        </Tooltip>
      </Box>

      {/* 内容区 */}
      <Box sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

        {isEmpty ? (
          /* 首页状态 — 居中欢迎 + 输入框 */
          <Box sx={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            px: 3,
            pb: 8,
          }}>
            {/* Logo / 欢迎区 */}
            <Box sx={{
              width: 56,
              height: 56,
              borderRadius: '16px',
              bgcolor: '#F3F4F6',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              mb: 3,
            }}>
              <SmartToyOutlinedIcon sx={{ fontSize: 28, color: '#6B7280' }} />
            </Box>

            <Typography sx={{
              fontSize: '1.25rem',
              fontWeight: 600,
              color: '#111827',
              mb: 1,
            }}>
              有什么可以帮你的？
            </Typography>

            <Typography sx={{
              fontSize: '0.875rem',
              color: '#9CA3AF',
              mb: 5,
              textAlign: 'center',
              maxWidth: 400,
            }}>
              输入任务描述，AI 助手将为你完成工作
            </Typography>

            {/* 输入框区域 — 限制最大宽度 */}
            <Box sx={{ width: '100%', maxWidth: 720 }}>
              <TopBarChatInput
                session={session}
                onSessionUpdate={handleSessionUpdate}
              />
            </Box>
          </Box>
        ) : (
          /* 对话状态 — 消息 + 输入框 */
          <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            {/* 消息历史 */}
            <Box
              sx={{
                flex: 1,
                overflow: 'auto',
                px: 3,
                py: 2,
                display: 'flex',
                flexDirection: 'column',
                gap: 2,
                minHeight: 0,
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
                  <Box
                    sx={{
                      px: 2,
                      py: 1.5,
                      borderRadius: '12px',
                      maxWidth: '75%',
                      bgcolor: msg.role === 'user' ? '#f97316' : '#F3F4F6',
                      color: msg.role === 'user' ? '#fff' : '#111827',
                      border: msg.role === 'assistant' ? '1px solid #E5E7EB' : 'none',
                      wordBreak: 'break-word',
                    }}
                  >
                    <Typography sx={{ fontSize: 14, lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>
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
                  </Box>
                </Box>
              ))}
            </Box>

            {/* 底部输入框 */}
            <Box sx={{ px: 3, py: 2, borderTop: '1px solid #F3F4F6', flexShrink: 0 }}>
              <Box sx={{ maxWidth: 720, mx: 'auto' }}>
                <TopBarChatInput
                  session={session}
                  onSessionUpdate={handleSessionUpdate}
                />
              </Box>
            </Box>
          </Box>
        )}
      </Box>
    </Box>
  );
};

export default ChatPage;
