import React, { useState, useEffect, useCallback } from 'react';
import { Box, Typography, IconButton, Tooltip, Chip, useTheme, Avatar } from '@mui/material';
import AddCommentOutlinedIcon from '@mui/icons-material/AddCommentOutlined';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import AutorenewIcon from '@mui/icons-material/Autorenew';
import PersonOutlineIcon from '@mui/icons-material/PersonOutline';
import SmartToyOutlinedIcon from '@mui/icons-material/SmartToyOutlined';
import { TopBarChatInput } from './TopBarChatInput';
import { MarkdownRenderer } from './MarkdownRenderer';
import { QueryResultRenderer } from './QueryResultRenderer';
import { Message, ReferencedSession, Session } from '../../types/chat';
import { useAppSettings } from '../../contexts/AppSettingsContext';
import { useToast } from '../../contexts/ToastContext';
import type { DataSourceType } from '../../types/inventory-query';
import { getGrayScale } from '../../constants/theme';
import { useChat } from '../../hooks/useChat';

// P0-4: 会话持久化配置
const SESSIONS_STORAGE_KEY = 'cdf-know-clow-chat-sessions';
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
      window.dispatchEvent(new CustomEvent('cdf-know-clow-storage-warning', {
        detail: { key: SESSIONS_STORAGE_KEY },
      }));
    }
  }
}

/** 创建新空会话 */
function createNewSession(defaultModel?: string): Session {
  return {
    id: `session-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    title: '',
    model: defaultModel || 'auto',
    messages: [],
  };
}

export function CrossWmsChat() {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const gs = getGrayScale(isDark);
  const { settings } = useAppSettings();
  const { showToast } = useToast();

  // 获取 sendMessage 用于重新生成功能
  const { sendMessage } = useChat(session, handleSessionUpdate);

  const [copiedId, setCopiedId] = useState<string | null>(null);

  /** 复制消息内容到剪贴板 */
  const handleCopy = useCallback((msg: Message) => {
    navigator.clipboard.writeText(msg.content);
    setCopiedId(msg.id);
    setTimeout(() => setCopiedId(null), 2000);
  }, []);

  /** 重新生成：移除当前 assistant 消息，重新发送上一条用户消息 */
  const handleRegenerate = useCallback((msg: Message) => {
    const msgIndex = session.messages.findIndex((m) => m.id === msg.id);
    if (msgIndex === -1) return;

    // 找到前一条用户消息
    let userContent: string | null = null;
    for (let i = msgIndex - 1; i >= 0; i--) {
      if (session.messages[i].role === 'user') {
        userContent = session.messages[i].content;
        break;
      }
    }
    if (!userContent) return;

    // 移除当前 assistant 消息及之后的所有消息
    const trimmedMessages = session.messages.slice(0, msgIndex);
    const updatedSession = { ...session, messages: trimmedMessages };
    handleSessionUpdate(updatedSession);

    // 重新发送用户消息
    setTimeout(() => {
      sendMessage(userContent);
    }, 100);
  }, [session, handleSessionUpdate, sendMessage]);

  // 获取默认模型 ID（优先使用 settings 中配置的默认模型）
  const defaultModelId = 'auto';

  // P0-4: 初始化时从 localStorage 恢复最近会话
  // 使用单个初始化函数确保 sessions 和 activeSessionId 完全同步
  const initState = (() => {
    const saved = loadSessions();
    if (saved.length === 0) {
      const newSession = createNewSession();
      return { sessions: [newSession], activeSessionId: newSession.id };
    }
    return { sessions: saved, activeSessionId: saved[0].id };
  })();

  const [sessions, setSessions] = useState<Session[]>(initState.sessions);
  const [activeSessionId, setActiveSessionId] = useState<string>(initState.activeSessionId);

  // 获取当前活跃会话（始终从 sessions 数组中查找，确保状态一致性）
  const session = sessions.find((s) => s.id === activeSessionId) || sessions[0] || createNewSession();

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
    const newSession = createNewSession(defaultModelId);
    setSessions((prev) => [newSession, ...prev].slice(0, MAX_SESSIONS));
    setActiveSessionId(newSession.id);
  }, [defaultModelId]);

  /**
   * v1.7.0: 补货确认成功回调
   *
   * ConfirmReplenishmentButton 自行调用 API 并管理 loading/success/error 状态。
   * 本回调仅在确认成功后触发，用于父组件通知。若发生异常则抛出，以便 button 进入 error 态。
   */
  const handleConfirmReplenishment = useCallback(async (suggestionId: number) => {
    try {
      showToast(`补货建议 #${suggestionId} 已确认`, 'success', 2000);
    } catch (e) {
      console.error('[CrossWmsChat] 确认补货回调异常:', e);
      throw new Error(
        e instanceof Error ? e.message : '确认补货建议失败，请重试',
      );
    }
  }, [showToast]);

  // 监听侧边栏"新建任务"按钮事件 — 聚焦 AI 对话框输入
  useEffect(() => {
    const handleFocusChat = () => {
      // 先新建一个空会话
      handleNewChat();
      // 延迟聚焦输入框（等待渲染完成）
      setTimeout(() => {
        const editable = document.querySelector('[contenteditable="true"]') as HTMLElement;
        if (editable) {
          editable.focus();
          // 光标移到末尾
          const range = document.createRange();
          const sel = window.getSelection();
          range.selectNodeContents(editable);
          range.collapse(false);
          sel?.removeAllRanges();
          sel?.addRange(range);
        }
      }, 200);
    };
    window.addEventListener('cdf-know-clow-focus-chat', handleFocusChat);
    return () => window.removeEventListener('cdf-know-clow-focus-chat', handleFocusChat);
  }, [handleNewChat]);

  return (
    <Box sx={{ width: '100%', display: 'flex', flexDirection: 'column', maxHeight: '70vh' }}>
      {/* 顶部工具栏：新对话按钮 */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', px: 2, py: 0.5 }}>
        <Tooltip title="新对话">
          <IconButton
            size="small"
            onClick={handleNewChat}
            sx={{ color: gs.textDisabled, '&:hover': { color: gs.textSecondary, backgroundColor: gs.bgHover } }}
          >
            <AddCommentOutlinedIcon sx={{ fontSize: 18 }} />
          </IconButton>
        </Tooltip>
      </Box>

      {/* 消息历史区域 */}
      {session.messages.length > 0 && (
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
            maxHeight: 'calc(70vh - 130px)',
          }}
        >
          {session.messages.map((msg: Message) => (
            <Box
              key={msg.id}
              sx={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: msg.role === 'user' ? 'flex-end' : 'flex-start',
                gap: 0.5,
              }}
            >
              {/* 角色标签 + 时间 */}
              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1,
                  px: msg.role === 'user' ? 2 : 0,
                }}
              >
                {msg.role === 'assistant' && (
                  <Typography
                    sx={{
                      fontSize: 13,
                      fontWeight: 600,
                      color: isDark ? '#E5E7EB' : '#111827',
                    }}
                  >
                    CDF Bot
                  </Typography>
                )}
                <Typography sx={{ fontSize: 11, color: gs.textDisabled }}>
                  {msg.timestamp.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
                </Typography>
                {msg.role === 'user' && (
                  <Typography
                    sx={{
                      fontSize: 13,
                      fontWeight: 600,
                      color: gs.textPrimary,
                    }}
                  >
                    你
                  </Typography>
                )}
              </Box>

              {/* 引用会话 chip — 仅在用户消息上展示 */}
              {msg.role === 'user' && msg.referencedSessions && msg.referencedSessions.length > 0 && (
                <Box
                  sx={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: 0.5,
                    mb: 0.5,
                    justifyContent: 'flex-end',
                  }}
                >
                  {msg.referencedSessions.map((ref: ReferencedSession) => (
                    <Box
                      key={ref.id}
                      sx={{
                        display: 'flex',
                        alignItems: 'center',
                        px: 0.8,
                        py: 0.2,
                        borderRadius: '6px',
                        bgcolor: isDark ? '#1E3A5F' : '#EFF6FF',
                        color: isDark ? '#60A5FA' : '#2563EB',
                        border: `1px solid ${isDark ? '#1E40AF' : '#BFDBFE'}`,
                        fontSize: 11,
                        lineHeight: 1.4,
                        gap: 0.4,
                      }}
                    >
                      <span style={{ fontSize: 13 }}>@</span>
                      <span style={{
                        maxWidth: 120,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}>
                        {ref.title || '未命名对话'}
                      </span>
                    </Box>
                  ))}
                </Box>
              )}

              {/* 消息内容 */}
              {msg.role === 'user' ? (
                /* 用户消息：右侧灰色对话框 */
                <Box
                  sx={{
                    px: 2,
                    py: 1.5,
                    borderRadius: '16px',
                    maxWidth: '75%',
                    bgcolor: isDark ? '#374151' : '#F3F4F6',
                    color: gs.textPrimary,
                    wordBreak: 'break-word',
                  }}
                >
                  <Typography sx={{ fontSize: 14, lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>
                    {msg.content}
                  </Typography>
                </Box>
              ) : (
                /* Bot 消息：左侧平铺，无头像 */
                <Box
                  sx={{
                    maxWidth: '85%',
                    color: gs.textPrimary,
                    fontSize: 14,
                    lineHeight: 1.7,
                    wordBreak: 'break-word',
                    '& .markdown-body h1, & .markdown-body h2, & .markdown-body h3': {
                      fontSize: 'inherit',
                      fontWeight: 600,
                      mt: 1,
                      mb: 0.5,
                    },
                    '& .markdown-body ul, & .markdown-body ol': {
                      paddingLeft: 2.5,
                      mt: 0.5,
                      mb: 0.5,
                    },
                    '& .markdown-body p': {
                      m: 0,
                      '& + p': { mt: 0.75 },
                    },
                    '& .markdown-body code': {
                      fontSize: 13,
                    },
                    '& .markdown-body pre': {
                      my: 1,
                    },
                  }}
                >
                  {/* 查询结果渲染 */}
                  {msg.metadata?.queryResult && (
                    <QueryResultRenderer
                      queryResult={msg.metadata.queryResult}
                      loading={msg.metadata.loading}
                      dataSource={msg.metadata.queryResult.dataSource}
                      onConfirmReplenishment={handleConfirmReplenishment}
                    />
                  )}
                  {/* 如果仅有 loading 状态 */}
                  {msg.metadata?.loading && !msg.metadata.queryResult && (
                    <QueryResultRenderer
                      queryResult={{
                        columns: [],
                        rows: [],
                        rowCount: 0,
                        truncated: false,
                        chartType: 'table',
                        sql: '',
                      }}
                      loading={true}
                      onConfirmReplenishment={handleConfirmReplenishment}
                    />
                  )}
                  <MarkdownRenderer content={msg.content} />
                  {/* v1.8.0: 流式输出闪烁光标 */}
                  {msg.isStreaming && (
                    <span
                      style={{
                        display: 'inline-block',
                        width: 7,
                        height: 16,
                        backgroundColor: gs.textPrimary,
                        marginLeft: 2,
                        verticalAlign: 'middle',
                        animation: 'cursor-blink 1s step-end infinite',
                        borderRadius: 1,
                      }}
                    />
                  )}

                  {/* 操作按钮：复制 + 重新生成（非流式输出时显示） */}
                  {!msg.isStreaming && (
                    <Box sx={{ display: 'flex', gap: 0.5, mt: 1 }}>
                      <Tooltip title={copiedId === msg.id ? '已复制' : '复制'}>
                        <IconButton
                          size="small"
                          onClick={() => handleCopy(msg)}
                          sx={{ color: gs.textDisabled, '&:hover': { color: gs.textPrimary } }}
                        >
                          <ContentCopyIcon sx={{ fontSize: 14 }} />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="重新生成">
                        <IconButton
                          size="small"
                          onClick={() => handleRegenerate(msg)}
                          sx={{ color: gs.textDisabled, '&:hover': { color: gs.textPrimary } }}
                        >
                          <AutorenewIcon sx={{ fontSize: 14 }} />
                        </IconButton>
                      </Tooltip>
                    </Box>
                  )}

                  {/* Auto 选型原因 */}
                  {msg.autoReason && (
                    <Box sx={{ mt: 1, display: 'flex', alignItems: 'center', gap: 0.75 }}>
                      <AutoAwesomeIcon sx={{ fontSize: 12, color: gs.textDisabled }} />
                      <Typography sx={{ fontSize: 11, color: gs.textDisabled }}>
                        {msg.autoReason}
                      </Typography>
                      {msg.activePreset && (
                        <Chip
                          label={msg.activePreset.label}
                          size="small"
                          sx={{
                            height: 18,
                            fontSize: 10,
                            backgroundColor: isDark ? '#374151' : '#F3F4F6',
                            color: gs.textMuted,
                            '& .MuiChip-label': { px: 1 },
                          }}
                        />
                      )}
                    </Box>
                  )}
                </Box>
              )}
            </Box>
          ))}
        </Box>
      )}

      {/* TopBarChatInput — 完全保持原有样式，不做任何修改 */}
      <TopBarChatInput
        session={session}
        onSessionUpdate={handleSessionUpdate}
      />

      {/* AI 免责声明 */}
      <Typography
        sx={{
          fontSize: '0.6875rem',
          color: gs.textDisabled,
          textAlign: 'center',
          py: 0.5,
          flexShrink: 0,
        }}
      >
        内容由AI生成，请核实重要信息
      </Typography>
    </Box>
  );
}
