import React, { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Typography,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  Tooltip,
  IconButton,
  useTheme,
} from '@mui/material';
import ChatBubbleOutlineIcon from '@mui/icons-material/ChatBubbleOutline';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import { Session } from '../../types/chat';

// ===================== Session Helpers =====================

const SESSIONS_STORAGE_KEY = 'crosswms-chat-sessions';

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
  } catch { /* ignore */ }
  return [];
}

function saveSessions(sessions: Session[]): void {
  try {
    const serializable = sessions.map((s) => ({
      ...s,
      messages: s.messages.map((m) => ({
        ...m,
        timestamp: m.timestamp.toISOString(),
      })),
    }));
    localStorage.setItem(SESSIONS_STORAGE_KEY, JSON.stringify(serializable));
  } catch { /* ignore */ }
}

// ===================== Props =====================

interface ChatHistoryProps {
  collapsed: boolean;
  activeSessionId: string;
  onSelectSession: (sessionId: string) => void;
  onDeleteSession: (sessionId: string) => void;
}

// ===================== Component =====================

const ChatHistory: React.FC<ChatHistoryProps> = ({
  collapsed,
  activeSessionId,
  onSelectSession,
  onDeleteSession,
}) => {
  const [sessions, setSessions] = useState<Session[]>(() => loadSessions());
  const [expanded, setExpanded] = useState(true);
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';

  // Dark mode responsive colors
  const borderColor = isDark ? '#2D2D2D' : '#E5E7EB';
  const textPrimary = isDark ? '#F3F4F6' : '#111827';
  const textSecondary = isDark ? '#9CA3AF' : '#6B7280';
  const textMuted = isDark ? '#6B7280' : '#9CA3AF';
  const bgHover = isDark ? '#2D2D2D' : '#f5f5f5';
  const bgActive = isDark ? '#2D2D2D' : '#FFFFFF';
  const bgActiveHover = isDark ? '#333333' : '#F9FAFB';

  // 监听 localStorage 变化（跨组件同步）
  useEffect(() => {
    const onStorage = () => setSessions(loadSessions());
    window.addEventListener('storage', onStorage);
    // 自定义事件：ChatPage 更新 session 后通知
    const onChatUpdate = () => setSessions(loadSessions());
    window.addEventListener('crosswms-chat-updated', onChatUpdate);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('crosswms-chat-updated', onChatUpdate);
    };
  }, []);

  const handleDelete = useCallback((e: React.MouseEvent, sessionId: string) => {
    e.stopPropagation();
    const next = sessions.filter((s) => s.id !== sessionId);
    setSessions(next);
    saveSessions(next);
    onDeleteSession(sessionId);
  }, [sessions, onDeleteSession]);

  // 只显示有消息的会话
  const chatSessions = sessions.filter((s) => s.messages.length > 0);

  if (collapsed) {
    // 收起模式：只显示图标+数量badge
    return (
      <Box sx={{ px: 0.5, flexShrink: 0 }}>
        <Tooltip title={`历史对话 (${chatSessions.length})`} placement="right" arrow>
          <ListItemButton
            onClick={() => setExpanded(!expanded)}
            sx={{
              minHeight: 40,
              justifyContent: 'center',
              px: 0,
              borderRadius: '6px',
              '&:hover': { backgroundColor: bgHover },
            }}
          >
            <Box sx={{ position: 'relative' }}>
              <ChatBubbleOutlineIcon
                sx={{ fontSize: '20px', color: textSecondary }}
              />
              {chatSessions.length > 0 && (
                <Box
                  sx={{
                    position: 'absolute',
                    top: -4,
                    right: -6,
                    minWidth: 14,
                    height: 14,
                    borderRadius: 7,
                    bgcolor: '#9CA3AF',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    px: 0.3,
                  }}
                >
                  <Typography sx={{ fontSize: 9, color: '#fff', fontWeight: 600, lineHeight: 1 }}>
                    {chatSessions.length > 9 ? '9+' : chatSessions.length}
                  </Typography>
                </Box>
              )}
            </Box>
          </ListItemButton>
        </Tooltip>
      </Box>
    );
  }

  return (
    <Box
      sx={{
        flexShrink: 0,
        maxHeight: expanded ? 200 : 'auto',
        display: 'flex',
        flexDirection: 'column',
        px: 1,
        borderTop: `1px solid ${borderColor}`,
        mt: 0.5,
        pt: 0.5,
      }}
    >
      {/* 标题栏 */}
      <ListItemButton
        onClick={() => setExpanded(!expanded)}
        sx={{
          py: 0.25,
          px: 1.5,
          borderRadius: '6px',
          '&:hover': { backgroundColor: bgHover },
        }}
      >
        <ListItemIcon sx={{ minWidth: 0, mr: 1, justifyContent: 'center', color: textSecondary }}>
          <ChatBubbleOutlineIcon sx={{ fontSize: '16px' }} />
        </ListItemIcon>
        <Typography sx={{ fontSize: '0.75rem', fontWeight: 500, color: textSecondary, flex: 1 }}>
          历史对话
        </Typography>
        {expanded ? (
          <ExpandLessIcon sx={{ fontSize: 16, color: textMuted }} />
        ) : (
          <ExpandMoreIcon sx={{ fontSize: 16, color: textMuted }} />
        )}
      </ListItemButton>

      {/* 会话列表 */}
      {expanded && (
        <List sx={{ py: 0, overflow: 'auto', flex: 1, minHeight: 0 }}>
          {chatSessions.length === 0 && (
            <Typography sx={{ fontSize: '0.75rem', color: textMuted, px: 1.5, py: 0.5, textAlign: 'center' }}>
              暂无对话
            </Typography>
          )}
          {chatSessions.map((session) => {
            const title = session.title || session.messages[0]?.content?.slice(0, 20) || '新对话';
            const isActive = session.id === activeSessionId;
            return (
              <ListItem
                key={session.id}
                disablePadding
                sx={{ display: 'block', mb: 0.25 }}
              >
                <ListItemButton
                  onClick={() => onSelectSession(session.id)}
                  sx={{
                    py: 0.25,
                    px: 1.5,
                    borderRadius: '6px',
                    backgroundColor: isActive ? bgActive : 'transparent',
                    '&:hover': {
                      backgroundColor: isActive ? bgActiveHover : bgHover,
                    },
                  }}
                >
                  <Typography
                    sx={{
                      fontSize: '0.75rem',
                      fontWeight: isActive ? 500 : 400,
                      color: isActive ? textPrimary : (isDark ? '#D1D5DB' : '#374151'),
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      flex: 1,
                      lineHeight: '24px',
                    }}
                  >
                    {title}
                  </Typography>
                  <IconButton
                    size="small"
                    onClick={(e) => handleDelete(e, session.id)}
                    sx={{
                      p: 0.25,
                      opacity: 0,
                      color: textMuted,
                      transition: 'opacity 0.15s',
                      '.MuiListItemButton-root:hover &': { opacity: 1 },
                      '&:hover': { color: '#EF4444' },
                    }}
                  >
                    <DeleteOutlineIcon sx={{ fontSize: 14 }} />
                  </IconButton>
                </ListItemButton>
              </ListItem>
            );
          })}
        </List>
      )}
    </Box>
  );
};

export default ChatHistory;
