import React, { useState, useEffect, useCallback } from 'react';
import { Box, Typography, CircularProgress, Paper, IconButton, Tooltip } from '@mui/material';
import AddCommentOutlinedIcon from '@mui/icons-material/AddCommentOutlined';
import { TopBarChatInput } from './TopBarChatInput';
import { Message, Session } from '../../types/chat';

// P0-4: 会话持久化配置
const SESSIONS_STORAGE_KEY = 'crosswms-chat-sessions';
const MAX_SESSIONS = 20;

/** 从 localStorage 加载最近会话列表 */
function loadSessions(): Session[] {
  try {
    const raw = localStorage.getItem(SESSIONS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed.map((s: Record<string, unknown>) => ({
          ...s,
          // 反序列化：timestamp 从 ISO 字符串恢复为 Date
          messages: Array.isArray(s.messages)
            ? s.messages.map((m: Record<string, unknown>) => ({
                ...m,
                timestamp: new Date(m.timestamp as string),
              }))
            : [],
        })) as Session[];
      }
    }
  } catch {
    // 数据损坏时静默返回空数组
  }
  return [];
}

/** 保存会话列表到 localStorage（仅保留最近 MAX_SESSIONS 条） */
function saveSessions(sessions: Session[]): void {
  try {
    // 序列化：Date → ISO 字符串
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
    if (e instanceof DOMException && e.name === 'QuotaExceededError') {
      window.dispatchEvent(new CustomEvent('crosswms-storage-warning', {
        detail: { key: SESSIONS_STORAGE_KEY },
      }));
    }
  }
}

/** 创建新空会话 */
function createNewSession(): Session {
  return {
    id: `session-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    title: '',
    model: 'claude-sonnet-4',
    messages: [],
  };
}

export function CrossWmsChat() {
  // P0-4: 初始化时从 localStorage 恢复最近会话
  const [sessions, setSessions] = useState<Session[]>(() => {
    const saved = loadSessions();
    return saved;
  });
  const [activeSessionId, setActiveSessionId] = useState<string>(() => {
    const saved = loadSessions();
    return saved.length > 0 ? saved[0].id : '';
  });

  // 获取当前活跃会话
  const session = sessions.find((s) => s.id === activeSessionId) || createNewSession();

  // 会话更新时自动持久化
  useEffect(() => {
    if (sessions.length > 0) {
      saveSessions(sessions);
    }
  }, [sessions]);

  /** 更新当前会话 */
  const handleSessionUpdate = useCallback((updatedSession: Session) => {
    setSessions((prev) => {
      const idx = prev.findIndex((s) => s.id === updatedSession.id);
      if (idx !== -1) {
        const next = [...prev];
        next[idx] = updatedSession;
        return next;
      }
      // 新会话，插入到头部
      return [updatedSession, ...prev].slice(0, MAX_SESSIONS);
    });
  }, []);

  /** 新建对话 */
  const handleNewChat = useCallback(() => {
    const newSession = createNewSession();
    setSessions((prev) => [newSession, ...prev].slice(0, MAX_SESSIONS));
    setActiveSessionId(newSession.id);
  }, []);

  return (
    <Box sx={{ width: '100%', display: 'flex', flexDirection: 'column', maxHeight: '70vh' }}>
      {/* 顶部工具栏：新对话按钮 */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', px: 1, py: 0.5 }}>
        <Tooltip title="新对话">
          <IconButton
            size="small"
            onClick={handleNewChat}
            sx={{ color: '#9CA3AF', '&:hover': { color: '#374151', backgroundColor: '#F3F4F6' } }}
          >
            <AddCommentOutlinedIcon sx={{ fontSize: 18 }} />
          </IconButton>
        </Tooltip>
      </Box>

      {/* 空状态引导（P2-3） */}
      {session.messages.length === 0 && (
        <Box
          sx={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            py: 4,
            px: 2,
            gap: 1,
            animation: 'fadeIn 0.5s ease-in-out',
            '@keyframes fadeIn': {
              from: { opacity: 0, transform: 'translateY(8px)' },
              to: { opacity: 1, transform: 'translateY(0)' },
            },
          }}
        >
          <Typography sx={{ fontSize: '1.5rem', textAlign: 'center' }}>
            👋
          </Typography>
          <Typography sx={{ fontSize: '0.9375rem', fontWeight: 600, color: '#374151', textAlign: 'center' }}>
            你好！我是 CrossWMS 智能助手
          </Typography>
          <Typography sx={{ fontSize: '0.8125rem', color: '#9CA3AF', textAlign: 'center', maxWidth: 280 }}>
            可以帮你查询仓库数据、生成报表、管理自动化任务
          </Typography>
        </Box>
      )}

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
        onSessionUpdate={handleSessionUpdate}
      />
    </Box>
  );
}
