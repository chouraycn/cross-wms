import React, { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Box, Typography } from '@mui/material';
import SmartToyOutlinedIcon from '@mui/icons-material/SmartToyOutlined';
import { TopBarChatInput } from '../components/CrossWmsChat/TopBarChatInput';
import { Message, Session } from '../types/chat';
import { getAllSkills } from '../stores/skillStore';
import type { Skill } from '../types/skill';
import { ICON_MAP } from '../types/skill';
import { getCategoryLabel, getCategoryGradient } from '../constants/skillCategories';
import { MarkdownRenderer } from '../components/CrossWmsChat/MarkdownRenderer';

// 会话持久化配置（与 CDFKnowClowChat 共享 localStorage）
const SESSIONS_STORAGE_KEY = 'cdf-know-clow-chat-sessions';
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

/** 从 URL 参数解析技能上下文 */
function resolveSkillFromParams(skillId: string | null): Skill | null {
  if (!skillId) return null;
  return getAllSkills().find(s => s.id === skillId && s.status === 'active') ?? null;
}

/** AI 对话全屏页面 — "新建任务" 的目标页 */
const ChatPage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [sessions, setSessions] = useState<Session[]>(() => loadSessions());

  // 从 URL 参数解析：session=xxx 载入历史会话，无参数则新建
  const [activeSessionId, setActiveSessionId] = useState<string>(() => {
    const sessionId = searchParams.get('session');
    if (sessionId) {
      const saved = loadSessions();
      const found = saved.find(s => s.id === sessionId);
      if (found) return found.id;
    }
    // 无 session 参数 → 始终创建新 session
    return '';
  });

  // 从 URL 参数解析技能上下文（响应 URL 变化，支持同页面内跳转）
  const [initialSkill, setInitialSkill] = useState<Skill | null>(() => {
    const skillId = searchParams.get('skill');
    return resolveSkillFromParams(skillId);
  });

  // 提前声明 handleNewChat（多个 useEffect 依赖它）
  const handleNewChat = useCallback(() => {
    const newSession = createNewSession();
    setSessions((prev) => [newSession, ...prev].slice(0, MAX_SESSIONS));
    setActiveSessionId(newSession.id);
  }, []);

  // 当 URL 参数中存在 skill 时，解析并创建新 session
  useEffect(() => {
    const skillId = searchParams.get('skill');
    if (skillId) {
      const skill = resolveSkillFromParams(skillId);
      if (skill) {
        setInitialSkill(skill);
        handleNewChat();
      }
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, setSearchParams, handleNewChat]);

  // 响应 URL 中的 session 参数变化（侧边栏点击历史对话时 navigate 携带 ?session=xxx）
  // 必须放在 URL 清理 effect 之前，确保先读取 session ID 再清理 URL
  useEffect(() => {
    const sessionId = searchParams.get('session');
    if (sessionId) {
      const saved = loadSessions();
      const found = saved.find(s => s.id === sessionId);
      if (found) {
        setActiveSessionId(found.id);
      }
    }
  }, [searchParams]);

  // 清理 URL 中的 session 参数（避免刷新后重复加载）
  useEffect(() => {
    if (searchParams.has('session')) {
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  // 如果 activeSessionId 为空，自动创建新 session
  const effectiveSessionId = activeSessionId || (() => {
    const newSession = createNewSession();
    setSessions(prev => [newSession, ...prev].slice(0, MAX_SESSIONS));
    setActiveSessionId(newSession.id);
    return newSession.id;
  })();

  const session = sessions.find((s) => s.id === effectiveSessionId) || createNewSession();

  useEffect(() => {
    if (sessions.length > 0) saveSessions(sessions);
    window.dispatchEvent(new CustomEvent('cdf-know-clow-chat-updated'));
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

  // 监听侧边栏事件
  useEffect(() => {
    // 侧边栏"新建任务"按钮 → 创建新会话
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
    // 侧边栏选择历史会话 → 切换到指定会话
    const handleSelectSession = (e: Event) => {
      const sessionId = (e as CustomEvent).detail;
      if (sessionId) setActiveSessionId(sessionId);
    };
    // 导航到 /chat 时（如果已在 /chat 页面，React Router 不会 remount）→ 新建 session
    const handleNavigateToChat = () => {
      handleNewChat();
      setTimeout(() => {
        const editable = document.querySelector('[contenteditable="true"]') as HTMLElement;
        if (editable) editable.focus();
      }, 200);
    };
    window.addEventListener('cdf-know-clow-focus-chat', handleFocusChat);
    window.addEventListener('cdf-know-clow-select-session', handleSelectSession);
    window.addEventListener('cdf-know-clow-navigate-chat', handleNavigateToChat);
    return () => {
      window.removeEventListener('cdf-know-clow-focus-chat', handleFocusChat);
      window.removeEventListener('cdf-know-clow-select-session', handleSelectSession);
      window.removeEventListener('cdf-know-clow-navigate-chat', handleNavigateToChat);
    };
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
    <Box sx={{
      // 直接撑满视口可见区域（减去顶部工具栏高度）
      height: 'calc(100vh - 40px - var(--pw-top, 0px))',
      // 脱离父级 padding Box 的内边距
      mx: -3,
      mt: -2,
      mb: -3,
      display: 'flex',
      flexDirection: 'column',
      bgcolor: '#fff',
      overflow: 'hidden',
    }}>
      {/* 内容区 */}
      <Box sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>

        {isEmpty ? (
          /* 首页状态 — 欢迎区居中 + 输入框吸底 */
          <Box sx={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            minHeight: 0,
          }}>
            {/* 欢迎区 — 垂直居中 */}
            <Box sx={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              px: 3,
            }}>
              {/* 技能上下文提示 or 默认 Logo */}
              {initialSkill ? (
                <>
                  <Box sx={{
                    width: 56,
                    height: 56,
                    borderRadius: '16px',
                    background: getCategoryGradient(initialSkill.category),
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    mb: 3,
                  }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', '& .MuiSvgIcon-root': { fontSize: 28, color: '#fff' } }}>
                      {ICON_MAP[initialSkill.icon]}
                    </Box>
                  </Box>
                  <Typography sx={{
                    fontSize: '1.25rem',
                    fontWeight: 600,
                    color: '#111827',
                    mb: 0.5,
                  }}>
                    {initialSkill.name}
                  </Typography>
                  <Typography sx={{
                    fontSize: '0.75rem',
                    color: '#9CA3AF',
                    mb: 1,
                  }}>
                    {getCategoryLabel(initialSkill.category)}
                  </Typography>
                  <Typography sx={{
                    fontSize: '0.875rem',
                    color: '#6B7280',
                    textAlign: 'center',
                    maxWidth: 400,
                  }}>
                    {initialSkill.desc}
                  </Typography>
                </>
              ) : (
                <>
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
                    textAlign: 'center',
                    maxWidth: 400,
                  }}>
                    输入任务描述，AI 助手将为你完成工作
                  </Typography>
                </>
              )}
            </Box>

            {/* 输入框吸底 */}
            <Box sx={{ px: 3, py: 2, flexShrink: 0, maxWidth: 960, width: '100%', mx: 'auto' }}>
              <TopBarChatInput
                session={session}
                onSessionUpdate={handleSessionUpdate}
                initialSkill={initialSkill}
              />
              <Typography
                sx={{
                  fontSize: '0.6875rem',
                  color: '#9CA3AF',
                  textAlign: 'center',
                  pt: 0.5,
                }}
              >
                内容由AI生成，请核实重要信息
              </Typography>
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
                    {msg.role === 'user' ? (
                      <Typography sx={{ fontSize: 14, lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>
                        {msg.content}
                      </Typography>
                    ) : (
                      <MarkdownRenderer content={msg.content} />
                    )}
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
              <Box sx={{ maxWidth: 960, mx: 'auto' }}>
                <TopBarChatInput
                  session={session}
                  onSessionUpdate={handleSessionUpdate}
                  initialSkill={initialSkill}
                />
                <Typography
                  sx={{
                    fontSize: '0.6875rem',
                    color: '#9CA3AF',
                    textAlign: 'center',
                    pt: 0.5,
                  }}
                >
                  内容由AI生成，请核实重要信息
                </Typography>
              </Box>
            </Box>
          </Box>
        )}
      </Box>
    </Box>
  );
};

export default ChatPage;
