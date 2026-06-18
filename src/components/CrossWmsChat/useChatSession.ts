import { useState, useEffect, useCallback, useRef } from 'react';
import { Session, SessionStatus } from '../../types/chat';
import { getDebouncedStorage } from '../../utils/storageDebounce';

const SESSIONS_STORAGE_KEY = 'cdf-know-clow-chat-sessions';
const MAX_SESSIONS = 20;

/** 空闲归档阈值（毫秒）：60 分钟 */
const IDLE_ARCHIVE_THRESHOLD_MS = 60 * 60 * 1000;

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

/** 获取今日日期键 */
function getTodayKey(): string {
  return new Date().toISOString().split('T')[0];
}

/** 检查会话是否空闲超时 */
function isSessionIdle(session: Session): boolean {
  if (session.status === 'archived') return false;
  const lastActive = session.lastActiveAt || session.updatedAt || session.createdAt;
  if (!lastActive) return false;
  return Date.now() - new Date(lastActive).getTime() > IDLE_ARCHIVE_THRESHOLD_MS;
}

function createNewSession(defaultModel?: string, parentSessionId?: string | null, tags?: string[]): Session {
  const now = new Date();
  return {
    id: `session-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    title: parentSessionId ? '子任务' : '',
    model: defaultModel || 'auto',
    messages: [],
    status: 'active',
    lastActiveAt: now.toISOString(),
    sessionDate: getTodayKey(),
    parentSessionId: parentSessionId || null,
    tags: tags ? JSON.stringify(tags) : null,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
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
  /** v6.0: 归档会话 */
  archiveSession: (sessionId: string) => void;
  /** v6.0: 恢复归档会话 */
  restoreSession: (sessionId: string) => void;
  /** v6.0: 创建子会话 */
  createSubSession: (parentSessionId: string, title: string, tags?: string[]) => Session;
  /** v6.0: 获取归档会话列表 */
  archivedSessions: Session[];
  /** v6.0: touch 会话（更新 lastActiveAt） */
  touchSession: (sessionId: string) => void;
}

/**
 * 共享的会话管理 Hook
 * 封装 sessions、activeSessionId、持久化、侧边栏同步、生命周期管理等逻辑
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

  // v6.0: 每日重置检测 — 检查是否有新的日期，如果有则将旧会话标记归档
  useEffect(() => {
    const checkDailyReset = () => {
      const today = getTodayKey();
      setSessions(prev => {
        let changed = false;
        const next = prev.map(s => {
          // 今日已有的活跃会话不处理
          if (s.status === 'archived' || s.sessionDate === today) return s;
          // 非今日的活跃会话标记为 daily_reset
          if (s.status === 'active' || !s.status) {
            changed = true;
            return { ...s, status: 'daily_reset' as SessionStatus };
          }
          return s;
        });
        return changed ? next : prev;
      });
    };

    // 启动时检测一次
    checkDailyReset();

    // 每 30 秒检测日期变更
    const timer = setInterval(checkDailyReset, 30000);
    return () => clearInterval(timer);
  }, []);

  // v6.0: 空闲归档检测
  useEffect(() => {
    const checkIdle = () => {
      setSessions(prev => {
        let changed = false;
        const next = prev.map(s => {
          if (isSessionIdle(s)) {
            changed = true;
            return { ...s, status: 'archived' as SessionStatus, archivedAt: new Date().toISOString() };
          }
          return s;
        });
        return changed ? next : prev;
      });
    };

    // 每 5 分钟检测空闲
    const timer = setInterval(checkIdle, 5 * 60 * 1000);
    return () => clearInterval(timer);
  }, []);

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

  /** v6.0: 归档会话 */
  const archiveSession = useCallback((sessionId: string) => {
    setSessions(prev => {
      const next = prev.map(s =>
        s.id === sessionId
          ? { ...s, status: 'archived' as SessionStatus, archivedAt: new Date().toISOString() }
          : s
      );
      saveSessions(next);
      // 如果归档的是当前会话，切到下一个活跃会话
      if (sessionId === activeSessionId) {
        const activeSession = next.find(s => s.status !== 'archived');
        if (activeSession) {
          setActiveSessionIdState(activeSession.id);
        }
      }
      return next;
    });
    // 同步到后端
    fetch(`/api/sessions/${sessionId}/archive`, { method: 'POST' }).catch(() => {});
  }, [activeSessionId]);

  /** v6.0: 恢复归档会话 */
  const restoreSession = useCallback((sessionId: string) => {
    setSessions(prev => {
      const next = prev.map(s =>
        s.id === sessionId
          ? { ...s, status: 'active' as SessionStatus, archivedAt: null, lastActiveAt: new Date().toISOString(), sessionDate: getTodayKey() }
          : s
      );
      saveSessions(next);
      return next;
    });
    // 同步到后端
    fetch(`/api/sessions/${sessionId}/restore`, { method: 'POST' }).catch(() => {});
  }, []);

  /** v6.0: 创建子会话 */
  const createSubSession = useCallback((parentSessionId: string, title: string, tags?: string[]): Session => {
    const subSession = createNewSession(defaultModel, parentSessionId, tags);
    subSession.title = title;
    setSessions(prev => [subSession, ...prev].slice(0, MAX_SESSIONS));
    setActiveSessionIdState(subSession.id);
    // 同步到后端
    fetch('/api/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, model: defaultModel, parentSessionId, tags }),
    }).catch(() => {});
    return subSession;
  }, [defaultModel]);

  /** v6.0: touch 会话 */
  const touchSession = useCallback((sessionId: string) => {
    setSessions(prev => {
      const next = prev.map(s =>
        s.id === sessionId
          ? { ...s, lastActiveAt: new Date().toISOString(), sessionDate: getTodayKey() }
          : s
      );
      return next;
    });
    // 后端异步 touch
    fetch(`/api/sessions/${sessionId}/touch`, { method: 'POST' }).catch(() => {});
  }, []);

  // v6.0: 归档会话列表
  const archivedSessions = sessions.filter(s => s.status === 'archived');

  return {
    sessions,
    activeSessionId,
    session,
    setActiveSessionId,
    handleSessionUpdate,
    handleNewChat,
    saveSessionsToStorage: saveSessions,
    loadSessionsFromStorage: loadSessions,
    archiveSession,
    restoreSession,
    createSubSession,
    archivedSessions,
    touchSession,
  };
}

export { SESSIONS_STORAGE_KEY, MAX_SESSIONS, loadSessions, saveSessions, createNewSession };
