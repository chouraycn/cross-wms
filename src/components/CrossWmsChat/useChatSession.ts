import { useState, useEffect, useCallback, useRef } from 'react';
import { Session } from '../../types/chat';
import { getDebouncedStorage } from '../../utils/storageDebounce';

const SESSIONS_STORAGE_KEY = 'cdf-know-clow-chat-sessions';
const MAX_SESSIONS = 20;

const debouncedStorage = getDebouncedStorage(500);

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
        timestamp: m.timestamp instanceof Date ? m.timestamp.toISOString() : String(m.timestamp),
      })),
    }));
    debouncedStorage.setItem(SESSIONS_STORAGE_KEY, JSON.stringify(serializable));
  } catch (e) {
    console.error(`[${SESSIONS_STORAGE_KEY}] 保存失败:`, e);
    if (e instanceof DOMException && e.name === 'QuotaExceededError') {
      window.dispatchEvent(new CustomEvent('cdf-know-clow-storage-warning', {
        detail: { key: SESSIONS_STORAGE_KEY },
      }));
    }
  }
}

function createNewSession(defaultModel?: string): Session {
  return {
    id: `session-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    title: '',
    model: defaultModel || 'auto',
    messages: [],
  };
}

interface UseChatSessionOptions {
  /** 初始 activeSessionId，空字符串表示不选中任何会话 */
  initialActiveSessionId?: string;
  /** 默认模型 */
  defaultModel?: string;
  /** 是否同步侧边栏 activeSessionId */
  syncSidebar?: boolean;
}

interface UseChatSessionReturn {
  sessions: Session[];
  activeSessionId: string;
  session: Session;
  setActiveSessionId: (id: string) => void;
  handleSessionUpdate: (updatedSession: Session) => void;
  handleNewChat: () => void;
  saveSessionsToStorage: (sessions: Session[]) => void;
  loadSessionsFromStorage: () => Session[];
}

/**
 * 共享的会话管理 Hook
 * 封装 sessions、activeSessionId、持久化、侧边栏同步等逻辑
 */
export function useChatSession(options: UseChatSessionOptions = {}): UseChatSessionReturn {
  const {
    initialActiveSessionId = '',
    defaultModel = 'auto',
    syncSidebar = true,
  } = options;

  const [sessions, setSessions] = useState<Session[]>(() => loadSessions());
  const [activeSessionId, setActiveSessionIdState] = useState<string>(initialActiveSessionId);

  // 同步侧边栏
  const syncSidebarRef = useRef(syncSidebar);
  syncSidebarRef.current = syncSidebar;

  const setActiveSessionId = useCallback((id: string) => {
    setActiveSessionIdState(id);
    if (syncSidebarRef.current && id) {
      window.dispatchEvent(new CustomEvent('cdf-know-clow-chat-updated', {
        detail: { activeSessionId: id },
      }));
    }
  }, []);

  // 获取当前活跃会话
  const session = sessions.find((s) => s.id === activeSessionId) || sessions[0] || createNewSession(defaultModel);

  // 会话更新时自动持久化
  useEffect(() => {
    if (sessions.length > 0) {
      saveSessions(sessions);
    }
  }, [sessions]);

  // 单独监听 activeSessionId 变化，同步侧边栏
  useEffect(() => {
    if (syncSidebarRef.current && activeSessionId) {
      window.dispatchEvent(new CustomEvent('cdf-know-clow-chat-updated', {
        detail: { activeSessionId },
      }));
    }
  }, [activeSessionId]);

  /** 更新当前会话 */
  const handleSessionUpdate = useCallback((updatedSession: Session) => {
    setSessions((prev) => {
      const idx = prev.findIndex((s) => s.id === updatedSession.id);
      if (idx !== -1) {
        const next = [...prev];
        next[idx] = updatedSession;
        saveSessions(next);
        if (syncSidebarRef.current) {
          window.dispatchEvent(new CustomEvent('cdf-know-clow-chat-updated', {
            detail: { activeSessionId: updatedSession.id },
          }));
        }
        return next;
      }
      // 新会话，插入到头部
      const next = [updatedSession, ...prev].slice(0, MAX_SESSIONS);
      saveSessions(next);
      if (syncSidebarRef.current) {
        window.dispatchEvent(new CustomEvent('cdf-know-clow-chat-updated', {
          detail: { activeSessionId: updatedSession.id },
        }));
      }
      // 同步更新 activeSessionId
      setActiveSessionIdState(updatedSession.id);
      return next;
    });
  }, []);

  /** 新建对话 */
  const handleNewChat = useCallback(() => {
    const newSession = createNewSession(defaultModel);
    setSessions((prev) => [newSession, ...prev].slice(0, MAX_SESSIONS));
    setActiveSessionIdState(newSession.id);
    if (syncSidebarRef.current) {
      window.dispatchEvent(new CustomEvent('cdf-know-clow-chat-updated', {
        detail: { activeSessionId: newSession.id },
      }));
    }
  }, [defaultModel]);

  return {
    sessions,
    activeSessionId,
    session,
    setActiveSessionId,
    handleSessionUpdate,
    handleNewChat,
    saveSessionsToStorage: saveSessions,
    loadSessionsFromStorage: loadSessions,
  };
}

export { SESSIONS_STORAGE_KEY, MAX_SESSIONS, loadSessions, saveSessions, createNewSession };
