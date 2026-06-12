import React, { createContext, useContext, useMemo, useCallback, useRef, useEffect, useState } from 'react';
import { Session, Message, ReferencedSession } from '../../types/chat';
import { useChat, SendMessageOptions } from '../../hooks/useChat';
import { API_BASE } from '../../constants/api';

// ===================== Context 类型 =====================

interface ChatContextValue {
  /** 所有会话列表 */
  sessions: Session[];
  /** 当前活跃会话 ID */
  activeSessionId: string;
  /** 当前活跃会话（computed） */
  session: Session;
  /** 设置活跃会话 */
  setActiveSessionId: (id: string) => void;
  /** 更新会话数据 */
  handleSessionUpdate: (session: Session) => void;
  /** 新建对话 */
  handleNewChat: () => void;
  /** 删除会话 */
  handleDeleteSession: (id: string) => void;
  /** 是否正在加载 */
  isLoading: boolean;
  /** 是否正在从后端初始化 */
  isInitializing: boolean;
  /** 发送消息 */
  sendMessage: (content: string, options?: SendMessageOptions) => void;
  /** 停止生成 */
  stopGeneration: () => void;
  /** 默认模型 */
  defaultModel: string;
}

const ChatContext = createContext<ChatContextValue | null>(null);

// ===================== 常量 =====================

const SESSIONS_CACHE_KEY = 'cdf-know-clow-chat-sessions';
const MAX_SESSIONS = 20;

// ===================== 工具函数 =====================

function createNewSession(defaultModel: string): Session {
  return {
    id: `session-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    title: '',
    model: defaultModel,
    messages: [],
  };
}

/** 从 localStorage 加载会话（仅作离线缓存） */
function loadSessionsFromCache(): Session[] {
  try {
    const raw = localStorage.getItem(SESSIONS_CACHE_KEY);
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

/** 保存会话到 localStorage（离线缓存，不包含消息内容以节省空间） */
function saveSessionsToCache(sessions: Session[]): void {
  try {
    const serializable = sessions.slice(0, MAX_SESSIONS).map((s) => ({
      ...s,
      // 缓存只保留最近 2 条消息的摘要，不存完整消息
      messages: s.messages.slice(-2).map((m) => ({
        ...m,
        // 截断长内容
        content: m.content.length > 200 ? m.content.slice(0, 200) + '...' : m.content,
        timestamp: m.timestamp.toISOString(),
      })),
    }));
    localStorage.setItem(SESSIONS_CACHE_KEY, JSON.stringify(serializable));
  } catch (e) {
    console.warn('[ChatProvider] 缓存保存失败:', e);
  }
}

// ===================== 后端 API 函数 =====================

/** 从后端 API 加载会话列表（权威数据源） */
async function fetchSessionsFromAPI(): Promise<Session[]> {
  try {
    const response = await fetch(`${API_BASE}/sessions`);
    const data = await response.json();
    if (data.sessions && Array.isArray(data.sessions)) {
      return data.sessions.map((s: Record<string, unknown>) => ({
        ...s,
        messages: [], // 列表不加载消息，按需懒加载
        createdAt: new Date(s.createdAt as string),
        updatedAt: new Date(s.updatedAt as string),
      })) as Session[];
    }
  } catch (e) {
    console.warn('[ChatProvider] 后端 API 不可用，使用本地缓存:', e);
  }
  return [];
}

/** 从后端 API 加载指定会话的消息 */
async function fetchSessionMessagesFromAPI(sessionId: string): Promise<Message[]> {
  try {
    const response = await fetch(`${API_BASE}/sessions/${sessionId}`);
    const data = await response.json();
    if (data.messages && Array.isArray(data.messages)) {
      return data.messages.map((m: Record<string, unknown>) => ({
        ...m,
        timestamp: new Date(m.timestamp as string),
      })) as Message[];
    }
  } catch (e) {
    console.warn('[ChatProvider] 加载消息失败:', e);
  }
  return [];
}

/** 通过后端 API 创建会话 */
async function createSessionViaAPI(title: string, model: string): Promise<Session | null> {
  try {
    const response = await fetch(`${API_BASE}/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, model }),
    });
    const data = await response.json();
    if (data.session) {
      return {
        ...data.session,
        messages: [],
        createdAt: new Date(data.session.createdAt),
        updatedAt: new Date(data.session.updatedAt),
      } as Session;
    }
  } catch (e) {
    console.warn('[ChatProvider] 创建会话 API 失败:', e);
  }
  return null;
}

/** 通过后端 API 删除会话 */
async function deleteSessionViaAPI(id: string): Promise<boolean> {
  try {
    const response = await fetch(`${API_BASE}/sessions/${id}`, { method: 'DELETE' });
    const data = await response.json();
    return data.ok === true;
  } catch (e) {
    console.warn('[ChatProvider] 删除会话 API 失败:', e);
  }
  return false;
}

/** 通过后端 API 更新会话标题 */
async function updateSessionTitleViaAPI(id: string, title: string): Promise<boolean> {
  try {
    const response = await fetch(`${API_BASE}/sessions/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title }),
    });
    const data = await response.json();
    return data.ok === true;
  } catch (e) {
    console.warn('[ChatProvider] 更新会话标题 API 失败:', e);
  }
  return false;
}

// ===================== Provider Props =====================

export interface ChatProviderProps {
  children: React.ReactNode;
  /** 默认模型 ID */
  defaultModel?: string;
  /** 初始活跃会话 ID */
  initialActiveSessionId?: string;
}

// ===================== ChatProvider =====================

export function ChatProvider({
  children,
  defaultModel = 'auto',
  initialActiveSessionId = '',
}: ChatProviderProps) {
  // 启动时先从 localStorage 加载缓存（快速显示），然后从 API 加载权威数据
  const [sessions, setSessions] = useState<Session[]>(() => loadSessionsFromCache());
  const [activeSessionId, setActiveSessionIdState] = useState<string>(initialActiveSessionId);
  const [initialized, setInitialized] = useState(false);
  const [isInitializing, setIsInitializing] = useState(true);

  // 已加载过消息的会话 ID 集合（避免重复请求）
  const loadedMessageIds = useRef(new Set<string>());

  // ===================== 初始化：从后端 API 加载会话列表 =====================
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const apiSessions = await fetchSessionsFromAPI();
      if (cancelled) return;
      if (apiSessions.length > 0) {
        setSessions(apiSessions);
        saveSessionsToCache(apiSessions);
      }
      setInitialized(true);
      setIsInitializing(false);
    })();
    return () => { cancelled = true; };
  }, []);

  // ===================== 获取当前活跃会话 =====================
  const session = useMemo(() => {
    return sessions.find((s) => s.id === activeSessionId) || sessions[0] || createNewSession(defaultModel);
  }, [sessions, activeSessionId, defaultModel]);

  // ===================== 切换会话时懒加载消息 =====================
  useEffect(() => {
    if (!initialized) return;
    if (!activeSessionId) return;
    if (loadedMessageIds.current.has(activeSessionId)) return;

    const target = sessions.find((s) => s.id === activeSessionId);
    if (!target || target.messages.length > 0) {
      loadedMessageIds.current.add(activeSessionId);
      return;
    }

    let cancelled = false;
    (async () => {
      const messages = await fetchSessionMessagesFromAPI(activeSessionId);
      if (cancelled) return;
      loadedMessageIds.current.add(activeSessionId);
      if (messages.length > 0) {
        setSessions((prev) =>
          prev.map((s) => s.id === activeSessionId ? { ...s, messages } : s)
        );
      }
    })();
    return () => { cancelled = true; };
  }, [activeSessionId, initialized]); // eslint-disable-line react-hooks/exhaustive-deps

  // ===================== 会话变化时同步缓存 =====================
  useEffect(() => {
    if (sessions.length > 0 && initialized) {
      saveSessionsToCache(sessions);
    }
  }, [sessions, initialized]);

  // ===================== 侧边栏同步 =====================
  const syncSidebar = useCallback((sessionId: string) => {
    window.dispatchEvent(new CustomEvent('cdf-know-clow-chat-updated', {
      detail: { activeSessionId: sessionId },
    }));
  }, []);

  const setActiveSessionId = useCallback((id: string) => {
    setActiveSessionIdState(id);
    syncSidebar(id);
  }, [syncSidebar]);

  // ===================== 更新当前会话（含标题同步） =====================
  const handleSessionUpdate = useCallback((updatedSession: Session) => {
    setSessions((prev) => {
      const idx = prev.findIndex((s) => s.id === updatedSession.id);
      if (idx !== -1) {
        const next = [...prev];
        next[idx] = updatedSession;
        syncSidebar(updatedSession.id);

        // 自动生成/更新会话标题：取第一条用户消息的前 20 字
        const firstUserMsg = updatedSession.messages.find((m) => m.role === 'user');
        if (firstUserMsg && (!updatedSession.title || updatedSession.title === '新对话')) {
          const autoTitle = firstUserMsg.content.slice(0, 20).replace(/\n/g, ' ').trim();
          if (autoTitle) {
            updateSessionTitleViaAPI(updatedSession.id, autoTitle);
            next[idx] = { ...next[idx], title: autoTitle };
          }
        }
        return next;
      }
      // 新会话，插入到头部
      const next = [updatedSession, ...prev].slice(0, MAX_SESSIONS);
      syncSidebar(updatedSession.id);
      setActiveSessionIdState(updatedSession.id);
      return next;
    });
  }, [syncSidebar]);

  // ===================== 新建对话 =====================
  const handleNewChat = useCallback(() => {
    const newSession = createNewSession(defaultModel);
    // 异步创建后端会话（不阻塞 UI）
    createSessionViaAPI('新对话', newSession.model).then((apiSession) => {
      if (apiSession) {
        setSessions((prev) => {
          // 替换本地临时 ID 为后端 ID
          return [apiSession, ...prev.filter((s) => s.id !== newSession.id)].slice(0, MAX_SESSIONS);
        });
        setActiveSessionIdState(apiSession.id);
        loadedMessageIds.current.add(apiSession.id);
        syncSidebar(apiSession.id);
      }
    });
    // 立即使用本地会话（乐观更新）
    setSessions((prev) => [newSession, ...prev].slice(0, MAX_SESSIONS));
    setActiveSessionIdState(newSession.id);
    syncSidebar(newSession.id);
  }, [defaultModel, syncSidebar]);

  // ===================== 删除会话 =====================
  const handleDeleteSession = useCallback((id: string) => {
    setSessions((prev) => prev.filter((s) => s.id !== id));
    loadedMessageIds.current.delete(id);
    deleteSessionViaAPI(id); // 不阻塞 UI
  }, []);

  // ===================== useChat hook =====================
  const { isLoading, sendMessage, stopGeneration } = useChat(session, handleSessionUpdate);

  const value = useMemo<ChatContextValue>(() => ({
    sessions,
    activeSessionId,
    session,
    setActiveSessionId,
    handleSessionUpdate,
    handleNewChat,
    handleDeleteSession,
    isLoading,
    isInitializing,
    sendMessage,
    stopGeneration,
    defaultModel,
  }), [
    sessions, activeSessionId, session, setActiveSessionId,
    handleSessionUpdate, handleNewChat, handleDeleteSession,
    isLoading, isInitializing, sendMessage, stopGeneration, defaultModel,
  ]);

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
}

// ===================== Hook =====================

/**
 * 消费 ChatContext 的 Hook
 * 必须在 ChatProvider 内部使用
 */
export function useChatContext(): ChatContextValue {
  const ctx = useContext(ChatContext);
  if (!ctx) {
    throw new Error('useChatContext 必须在 <ChatProvider> 内部使用');
  }
  return ctx;
}

export default ChatContext;
