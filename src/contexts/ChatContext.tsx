import React, { createContext, useContext, useMemo, useCallback, useRef, useEffect, useState } from 'react';
import { Session, Message, ReferencedSession, Folder } from '../types/chat';
import { API_BASE } from '../constants/api';
import { getDebouncedStorage } from '../utils/storageDebounce';

// ===================== 三个独立 Context 类型定义 =====================

/**
 * ChatSessionContext — 活跃会话 + 消息发送（流式渲染频繁变化）
 */
interface ChatSessionValue {
  /** 当前活跃会话（含 streaming messages） */
  session: Session;
  /** 当前活跃会话 ID */
  activeSessionId: string;
  /** 设置活跃会话 */
  setActiveSessionId: (id: string) => void;
  /** 更新会话数据（供子组件回调，如权限确认后更新消息） */
  handleSessionUpdate: (session: Session) => void;
  /** 轻量更新会话模型字段（不触发标题检查/sidebar 同步） */
  updateSessionModel: (model: string) => void;
  /** 新建对话 */
  handleNewChat: () => void;
  /** 加载更早的消息（上滚分页加载） */
  loadOlderMessages: () => Promise<boolean>;
  /** 是否正在加载更早的消息 */
  isLoadingOlder: boolean;
}

/**
 * ChatSidebarContext — 侧边栏数据（仅 title/folder 变更时更新）
 */
interface ChatSidebarValue {
  /** 所有会话列表（不含消息内容） */
  sessions: Session[];
  /** 文件夹列表 */
  folders: Folder[];
  /** 删除会话 */
  handleDeleteSession: (id: string) => void;
  /** 置顶/取消置顶会话 */
  togglePinSession: (id: string) => void;
  /** 创建文件夹 */
  createFolder: (name: string) => Promise<Folder | null>;
  /** 更新文件夹 */
  updateFolder: (id: string, name: string) => Promise<boolean>;
  /** 删除文件夹 */
  deleteFolder: (id: string) => Promise<boolean>;
  /** 移动会话到文件夹 */
  moveSessionToFolder: (sessionId: string, folderId: string | null) => Promise<boolean>;
  /** v6.0: 归档会话 */
  archiveSession: (sessionId: string) => void;
  /** v6.0: 恢复归档会话 */
  restoreSession: (sessionId: string) => void;
  /** v6.0: 归档会话列表 */
  archivedSessions: Session[];
  /** v10.0: 直接切换活跃会话（不经过路由，更快） */
  setActiveSessionId: (id: string) => void;
  /** 任务 4: 加载历史/归档会话上下文但不切换 activeSessionId（用户停留在历史对话列表） */
  loadSessionContext: (sessionId: string) => Promise<void>;
}

/**
 * ChatMetaContext — 全局元数据（极少变化）
 */
interface ChatMetaValue {
  /** 是否正在从后端初始化 */
  isInitializing: boolean;
  /** 默认模型 */
  defaultModel: string;
}

// ===================== 创建 Context =====================

const ChatSessionContext = createContext<ChatSessionValue | null>(null);
const ChatSidebarContext = createContext<ChatSidebarValue | null>(null);
const ChatMetaContext = createContext<ChatMetaValue | null>(null);

// ===================== 常量 =====================

const SESSIONS_CACHE_KEY = 'cdf-know-clow-chat-sessions';
const MAX_SESSIONS = 20;

// ===================== 工具函数 =====================

function createNewSession(defaultModel: string, parentSessionId?: string | null, tags?: string[]): Session {
  const now = new Date();
  return {
    id: `session-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    title: parentSessionId ? '子任务' : '',
    model: defaultModel,
    messages: [],
    isPinned: false,
    status: 'active',
    lastActiveAt: now.toISOString(),
    sessionDate: now.toISOString().split('T')[0],
    parentSessionId: parentSessionId || null,
    tags: tags ? JSON.stringify(tags) : null,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  };
}

/** 比较两个会话列表的 id 和 title 是否一致（用于避免无意义的 setState） */
function sessionsEqual(a: Session[], b: Session[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i].id !== b[i].id || a[i].title !== b[i].title || a[i].messageCount !== b[i].messageCount) return false;
  }
  return true;
}

/** 从 localStorage 加载会话（仅作离线缓存） */
function loadSessionsFromCache(): Session[] {
  try {
    const raw = localStorage.getItem(SESSIONS_CACHE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return (parsed.map((s: Record<string, unknown>) => ({
          ...s,
          // 缓存不保存消息内容，确保 messages 为空数组
          messages: [],
        })) as unknown) as Session[];
      }
    }
  } catch { /* 数据损坏时静默返回空数组 */ }
  return [];
}

/** 安全地将 timestamp 转为 ISO 字符串（兼容 Date 对象和 string） */
function timestampToISO(ts: Date | string): string {
  if (ts instanceof Date) return ts.toISOString();
  if (typeof ts === 'string') return ts;
  return String(ts);
}

/** 保存会话到 localStorage（离线缓存，不包含消息内容以节省空间） */
function saveSessionsToCache(sessions: Session[]): void {
  try {
    const serializable = sessions.slice(0, MAX_SESSIONS).map((s) => ({
      ...s,
      // 缓存不保存消息内容，消息通过 API 按需加载
      messages: [],
      lastMessage: s.messages.length > 0 ? {
        role: s.messages[s.messages.length - 1].role,
        content: s.messages[s.messages.length - 1].content.length > 100
          ? s.messages[s.messages.length - 1].content.slice(0, 100) + '...'
          : s.messages[s.messages.length - 1].content,
        timestamp: timestampToISO(s.messages[s.messages.length - 1].timestamp),
      } : null,
    }));
    getDebouncedStorage(500).setItem(SESSIONS_CACHE_KEY, JSON.stringify(serializable));
  } catch (e) {
    // console.warn('[ChatProvider] 缓存保存失败:', e);
  }
}

// ===================== 后端 API 函数 =====================

/** 从后端 API 加载会话列表（权威数据源，带重试） */
async function fetchSessionsFromAPI(retries = 5): Promise<Session[]> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const response = await fetch(`${API_BASE}/sessions`);
      const data = await response.json();
      if (data.sessions && Array.isArray(data.sessions)) {
        return data.sessions.map((s: Record<string, unknown>) => ({
          ...s,
          messages: [], // 列表不加载消息，按需懒加载
          messageCount: (s as any).messageCount, // 后端返回值（undefined 表示未提供）
          createdAt: s.createdAt as string,       // 保持 string 类型，不做 Date 转换
          updatedAt: s.updatedAt as string,       // 保持 string 类型，不做 Date 转换
        })) as Session[];
      }
      // 响应格式异常（如后端返回的 sessions 不是数组），直接放弃
      return [];
    } catch (e) {
      if (attempt < retries) {
        // console.warn(`[ChatProvider] 后端 API 不可用 (第${attempt}/${retries}次)，2秒后重试...`);
        await new Promise((r) => setTimeout(r, 2000));
      } else {
        // console.warn('[ChatProvider] 后端 API 不可用，已用尽重试次数，使用本地缓存:', e);
      }
    }
  }
  return [];
}

/** 从后端 API 加载指定会话的消息（分页，首次只拉最近 50 条） */
async function fetchSessionMessagesFromAPI(sessionId: string): Promise<{ messages: Message[]; hasMore: boolean; totalCount: number }> {
  try {
    const response = await fetch(`${API_BASE}/sessions/${sessionId}/messages?limit=50`);
    const data = await response.json();
    if (data.messages && Array.isArray(data.messages)) {
      return {
        messages: data.messages.map((m: Record<string, unknown>) => ({
          ...m,
          timestamp: new Date(m.timestamp as string),
        })) as Message[],
        hasMore: data.hasMore ?? false,
        totalCount: data.totalCount ?? data.messages.length,
      };
    }
  } catch (e) {
    // console.warn('[ChatProvider] 加载消息失败:', e);
  }
  return { messages: [], hasMore: false, totalCount: 0 };
}

/** 从后端 API 加载更早的消息（上滚加载） */
async function fetchOlderMessagesFromAPI(sessionId: string, beforeIndex: number, limit: number = 50): Promise<{ messages: Message[]; hasMore: boolean; totalCount: number }> {
  try {
    const response = await fetch(`${API_BASE}/sessions/${sessionId}/messages?limit=${limit}&before=${beforeIndex}`);
    const data = await response.json();
    if (data.messages && Array.isArray(data.messages)) {
      return {
        messages: data.messages.map((m: Record<string, unknown>) => ({
          ...m,
          timestamp: new Date(m.timestamp as string),
        })) as Message[],
        hasMore: data.hasMore ?? false,
        totalCount: data.totalCount ?? 0,
      };
    }
  } catch (e) {
    // console.warn('[ChatProvider] 加载更早消息失败:', e);
  }
  return { messages: [], hasMore: false, totalCount: 0 };
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
        createdAt: data.session.createdAt as string,   // 保持 string 类型，不做 Date 转换
        updatedAt: data.session.updatedAt as string,   // 保持 string 类型，不做 Date 转换
      } as Session;
    }
  } catch (e) {
    // console.warn('[ChatProvider] 创建会话 API 失败:', e);
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
    // console.warn('[ChatProvider] 删除会话 API 失败:', e);
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
    // console.warn('[ChatProvider] 更新会话标题 API 失败:', e);
  }
  return false;
}

// ===================== Folder API 函数 =====================

async function fetchFoldersFromAPI(): Promise<Folder[]> {
  try {
    const response = await fetch(`${API_BASE}/folders`);
    const data = await response.json();
    if (data.folders && Array.isArray(data.folders)) {
      return data.folders as Folder[];
    }
  } catch (e) {
    // console.warn('[ChatProvider] 加载文件夹失败:', e);
  }
  return [];
}

async function createFolderViaAPI(name: string): Promise<Folder | null> {
  try {
    const response = await fetch(`${API_BASE}/folders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    const data = await response.json();
    if (data.folder) return data.folder as Folder;
  } catch (e) {
    // console.warn('[ChatProvider] 创建文件夹失败:', e);
  }
  return null;
}

async function updateFolderViaAPI(id: string, name: string): Promise<boolean> {
  try {
    const response = await fetch(`${API_BASE}/folders/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    const data = await response.json();
    return !!data.folder;
  } catch (e) {
    // console.warn('[ChatProvider] 更新文件夹失败:', e);
  }
  return false;
}

async function deleteFolderViaAPI(id: string): Promise<boolean> {
  try {
    const response = await fetch(`${API_BASE}/folders/${id}`, { method: 'DELETE' });
    const data = await response.json();
    return data.ok === true;
  } catch (e) {
    // console.warn('[ChatProvider] 删除文件夹失败:', e);
  }
  return false;
}

async function moveSessionViaAPI(sessionId: string, folderId: string | null): Promise<boolean> {
  try {
    const response = await fetch(`${API_BASE}/sessions/${sessionId}/move`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ folderId }),
    });
    const data = await response.json();
    return data.ok === true;
  } catch (e) {
    // console.warn('[ChatProvider] 移动会话失败:', e);
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
  // ===== 侧边栏状态：sessions + folders（不含流式消息，仅 title/folder 变更时更新） =====
  const [sessions, setSessions] = useState<Session[]>(() => loadSessionsFromCache());
  const [folders, setFolders] = useState<Folder[]>([]);

  // ===== 元数据状态：极少变化 =====
  const [initialized, setInitialized] = useState(false);
  const [isInitializing, setIsInitializing] = useState(true);

  // ===== 会话层状态：活跃会话 ID + 独立会话对象（含流式消息） =====
  const [activeSessionId, setActiveSessionIdState] = useState<string>(initialActiveSessionId);
  const [activeSession, setActiveSession] = useState<Session>(() =>
    initialActiveSessionId
      ? loadSessionsFromCache().find((s) => s.id === initialActiveSessionId) ?? createNewSession(defaultModel)
      : createNewSession(defaultModel)
  );

  // 已加载过消息的会话 ID 集合（避免重复请求）
  // v11.0: 改为 LRU 缓存，最多保留 30 个，防止内存无限增长
  const loadedMessageIdsRef = useRef<Map<string, number>>(new Map());
  const MAX_LOADED_SESSIONS = 30;

  // 用 ref 跟踪 sessions，避免 handleSessionUpdate 依赖 sessions state
  const sessionsRef = useRef(sessions);
  sessionsRef.current = sessions;

  // ===== LRU 辅助函数：标记访问、淘汰最旧 =====
  const markSessionLoaded = useCallback((sessionId: string) => {
    const map = loadedMessageIdsRef.current;
    map.delete(sessionId);
    map.set(sessionId, Date.now());
    // 淘汰超出上限的最旧条目，并卸载对应会话的消息
    if (map.size > MAX_LOADED_SESSIONS) {
      const oldestKey = map.keys().next().value;
      if (oldestKey && oldestKey !== activeSessionId) {
        map.delete(oldestKey);
        // 卸载该会话的消息，释放内存
        setSessions((prev) =>
          prev.map((s) => s.id === oldestKey ? { ...s, messages: [], hasMoreMessages: undefined, totalMessageCount: undefined } : s)
        );
      }
    }
  }, [activeSessionId]);

  const hasSessionLoaded = useCallback((sessionId: string): boolean => {
    return loadedMessageIdsRef.current.has(sessionId);
  }, []);

  const removeSessionLoaded = useCallback((sessionId: string) => {
    loadedMessageIdsRef.current.delete(sessionId);
  }, []);

  // v8.3: 流式 session ref — 流式期间用 ref 存储最新 session，
  // 只有 content 变化时才触发 setActiveSession（减少 Context value 重建频率）
  const streamingSessionRef = useRef<Session | null>(null);

  // Bug Fix: 跟踪本地临时会话到 API 会话的 ID 映射，防止新建对话时出现重复条目
  const pendingApiSessionRef = useRef<{ localId: string; apiId: string } | null>(null);

  // Bug Fix: 跟踪当前渲染周期内已添加到 sidebar 的会话 ID，防止 sendMessage 两次调用 handleSessionUpdate 产生重复
  const recentlyAddedIdsRef = useRef<Set<string>>(new Set());

  // ===================== 初始化：从后端 API 加载会话列表和文件夹 =====================
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [apiSessions, apiFolders] = await Promise.all([
        fetchSessionsFromAPI(),
        fetchFoldersFromAPI(),
      ]);
      if (cancelled) return;
      if (apiSessions.length > 0) {
        setSessions((prev) => {
          if (sessionsEqual(prev, apiSessions)) return prev;
          saveSessionsToCache(apiSessions);
          return apiSessions;
        });
      }
      setFolders(apiFolders);
      setInitialized(true);
      setIsInitializing(false);
    })();
    return () => { cancelled = true; };
  }, []);

  // ===================== 切换会话时：从 sessions 同步到 activeSession =====================
  useEffect(() => {
    if (!initialized) return;
    if (!activeSessionId) {
      setActiveSession(createNewSession(defaultModel));
      return;
    }
    const found = sessions.find((s) => s.id === activeSessionId);
    if (found) {
      setActiveSession((prev) => {
        // Bug Fix: API 会话创建后 ID 从 localId 变为 apiId 时，保留已收到的消息
        const pending = pendingApiSessionRef.current;
        if (pending && prev.id === pending.localId && found.id === pending.apiId && prev.messages.length > 0) {
          return { ...found, messages: prev.messages };
        }
        return found;
      });
    }
  }, [sessions, activeSessionId, defaultModel, initialized]);

  // ===================== 切换会话时懒加载消息 =====================
  useEffect(() => {
    if (!initialized) return;
    if (!activeSessionId) return;
    if (hasSessionLoaded(activeSessionId)) {
      markSessionLoaded(activeSessionId);
      return;
    }

    const target = sessions.find((s) => s.id === activeSessionId);
    if (!target || target.messages.length > 0) {
      markSessionLoaded(activeSessionId);
      return;
    }

    let cancelled = false;
    (async () => {
      const { messages, hasMore, totalCount } = await fetchSessionMessagesFromAPI(activeSessionId);
      if (cancelled) return;
      markSessionLoaded(activeSessionId);
      if (messages.length > 0) {
        setSessions((prev) =>
          prev.map((s) => s.id === activeSessionId ? { ...s, messages, hasMoreMessages: hasMore, totalMessageCount: totalCount } : s)
        );
        setActiveSession((prev) =>
          prev.id === activeSessionId ? { ...prev, messages, hasMoreMessages: hasMore, totalMessageCount: totalCount } : prev
        );
      }
    })();
    return () => { cancelled = true; };
  }, [activeSessionId, initialized, hasSessionLoaded, markSessionLoaded]);

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
    // v10.0: 直接同步 activeSession，减少一次渲染周期
    // 原来的 useEffect 依赖 sessions 变化再同步，会多一帧延迟
    const found = sessionsRef.current.find((s) => s.id === id);
    if (found) {
      setActiveSession((prev) => {
        if (prev.id === found.id && prev.messages.length > 0) return prev;
        return found;
      });
    }
  }, [syncSidebar]);

  // ===================== 更新当前会话 — 只更新 activeSession，不清洗 sessions =====================
  // 流式渲染时每 ~16ms 调用：仅更新 activeSession（不触发 sidebar 重渲染）
  // 标题自动生成时：将 title 同步到 sessions（触发 sidebar 更新）
  const handleSessionUpdate = useCallback((originalSession: Session) => {
    // v2.8.0: Streaming fast-path — skip O(n) title scan + O(m) sidebar lookup
    // During streaming, only the last message's content/metadata changes.
    // Title is already set (or will be set when streaming ends), sidebar doesn't need updating.
    const lastMsg = originalSession.messages[originalSession.messages.length - 1];
    if (lastMsg?.isStreaming) {
      // v8.3: 流式优化 — 始终用 ref 存储最新 session（供外部读取），
      // 但只在有意义的变化时才触发 React setState（减少 Context 级联重渲染）
      const prev = streamingSessionRef.current;
      const prevLastMsg = prev?.messages[prev.messages.length - 1];
      // v8.4-fix: 扩展变化检测 — 不仅 content/thinking，还包括 model、metadata、reactPhase 等
      // 之前只检测 content/thinking 导致 init 事件（设置 model）、react_phase 事件、
      // error 事件等纯元数据变更不触发 UI 更新，用户看到空白
      const contentChanged = !prevLastMsg || prevLastMsg.content !== lastMsg.content;
      const thinkingChanged = !prevLastMsg || prevLastMsg.thinking !== lastMsg.thinking;
      const modelChanged = !prevLastMsg || prevLastMsg.model !== lastMsg.model;
      const metadataChanged = !prevLastMsg || prevLastMsg.metadata !== lastMsg.metadata;
      const reactPhaseChanged = !prevLastMsg || prevLastMsg.reactPhase !== lastMsg.reactPhase;
      const thinkingDoneChanged = !prevLastMsg || prevLastMsg.thinkingDone !== lastMsg.thinkingDone;
      const hasMeaningfulChange = contentChanged || thinkingChanged || modelChanged || metadataChanged || reactPhaseChanged || thinkingDoneChanged;
      streamingSessionRef.current = originalSession;
      if (hasMeaningfulChange) {
        setActiveSession(originalSession);
      }
      return;
    }

    // Non-streaming path: full title check + sidebar sync
    // v8.3: 清理流式 ref
    streamingSessionRef.current = null;
    // 2. 自动标题：在所有路径之前执行，确保新会话也能生成标题
    let updatedSession = originalSession;
    const firstUserMsg = updatedSession.messages.find((m) => m.role === 'user');
    if (firstUserMsg && (!updatedSession.title || updatedSession.title === '新对话')) {
      const autoTitle = firstUserMsg.content.slice(0, 20).replace(/\n/g, ' ').trim();
      if (autoTitle) {
        updatedSession = { ...updatedSession, title: autoTitle };
        updateSessionTitleViaAPI(updatedSession.id, autoTitle);
      }
    }

    // 1. 始终更新 activeSession（ChatSessionContext 消费）
    setActiveSession(updatedSession);

    // 3. 检测是否需要同步 sidebar（仅 title 变更 或 新会话）
    const prevSessions = sessionsRef.current;
    const existingIdx = prevSessions.findIndex((s) => s.id === updatedSession.id);

    if (existingIdx === -1) {
      // 防止同一事件循环中 sendMessage 两次调用 handleSessionUpdate 导致重复插入
      if (recentlyAddedIdsRef.current.has(updatedSession.id)) return;
      recentlyAddedIdsRef.current.add(updatedSession.id);

      // Bug Fix: 新会话加入侧边栏前，检查 API 是否已创建了对应的会话
      const pending = pendingApiSessionRef.current;
      if (pending && pending.localId === updatedSession.id && pending.apiId) {
        // API 已返回，更新已有 API 会话的 title，不添加重复条目
        setActiveSessionIdState(pending.apiId);
        setSessions((prev) =>
          prev.map((s) => (s.id === pending.apiId ? { ...s, title: updatedSession.title, updatedAt: updatedSession.updatedAt } : s))
        );
        return;
      }
      // 新会话：插入到 sidebar 列表头部
      setActiveSessionIdState(updatedSession.id);
      setSessions((prev) => {
        const next = [{ ...updatedSession, messages: [] }, ...prev].slice(0, MAX_SESSIONS);
        return next;
      });
      // 同步到 sidebar（移出 setState updater，避免渲染阶段更新）
      syncSidebar(updatedSession.id);
      return;
    }

    // 4. 流式更新：不触及 sessions → sidebar 不重渲染
    // 5. 流式完成后同步消息到 sessions + 更新 updatedAt + 移到顶部
    if (existingIdx !== -1 && lastMsg && lastMsg.role === 'assistant' && !lastMsg.isStreaming) {
      setSessions((prev) => {
        const existing = prev.find((s) => s.id === updatedSession.id);
        if (existing && existing.messages.length < updatedSession.messages.length) {
          const now = new Date().toISOString();
          const updatedItem: Session = { ...existing, messages: updatedSession.messages, messageCount: updatedSession.messages.length, updatedAt: now };
          // 将活跃会话移到顶部（最新的在最上面）
          const rest = prev.filter((s) => s.id !== updatedSession.id);
          return [updatedItem, ...rest];
        }
        return prev;
      });
    }
  }, [syncSidebar]);

  // ===================== 轻量更新会话模型 — 仅改 model 字段，不经过 handleSessionUpdate 全流程 =====================
  const updateSessionModel = useCallback((model: string) => {
    setActiveSession((prev) => prev.model === model ? prev : { ...prev, model });
  }, []);

  // ===================== 新建对话 =====================
  const handleNewChat = useCallback(() => {
    const newSession = createNewSession(defaultModel);
    // 不立即创建后端会话，避免空白会话出现在侧边栏历史列表中
    // 会话在首次发送消息时由 handleSessionUpdate 自动加入侧边栏
    setActiveSessionIdState(newSession.id);
    setActiveSession(newSession);
  }, [defaultModel]);

  // ===================== 监听侧边栏事件（始终注册，避免从非聊天页切换时事件丢失） =====================
  useEffect(() => {
    const handleFocusChat = () => {
      handleNewChat();
    };
    const handleSelectSession = (e: Event) => {
      const sessionId = (e as CustomEvent).detail;
      if (sessionId) setActiveSessionId(sessionId);
    };
    const handleNavigateToChat = () => {
      handleNewChat();
    };
    const handleNewChatEvent = () => {
      handleNewChat();
    };
    window.addEventListener('cdf-know-clow-focus-chat', handleFocusChat);
    window.addEventListener('cdf-know-clow-select-session', handleSelectSession);
    window.addEventListener('cdf-know-clow-navigate-chat', handleNavigateToChat);
    window.addEventListener('cdf-know-clow-new-chat', handleNewChatEvent);
    return () => {
      window.removeEventListener('cdf-know-clow-focus-chat', handleFocusChat);
      window.removeEventListener('cdf-know-clow-select-session', handleSelectSession);
      window.removeEventListener('cdf-know-clow-navigate-chat', handleNavigateToChat);
      window.removeEventListener('cdf-know-clow-new-chat', handleNewChatEvent);
    };
  }, [handleNewChat, setActiveSessionId]);

  // ===================== 删除会话 =====================
  const handleDeleteSession = useCallback((id: string) => {
    setSessions((prev) => prev.filter((s) => s.id !== id));
    removeSessionLoaded(id);
    deleteSessionViaAPI(id); // 不阻塞 UI
  }, [removeSessionLoaded]);

  // ===================== 置顶/取消置顶 =====================
  const togglePinSession = useCallback((id: string) => {
    setSessions((prev) => prev.map((s) => s.id === id ? { ...s, isPinned: !s.isPinned } : s));
  }, []);

  // ===================== 文件夹操作 =====================
  const createFolder = useCallback(async (name: string): Promise<Folder | null> => {
    const folder = await createFolderViaAPI(name);
    if (folder) {
      setFolders((prev) => [...prev, folder].sort((a, b) => a.sortOrder - b.sortOrder));
    }
    return folder;
  }, []);

  const updateFolder = useCallback(async (id: string, name: string): Promise<boolean> => {
    const ok = await updateFolderViaAPI(id, name);
    if (ok) {
      setFolders((prev) => prev.map((f) => f.id === id ? { ...f, name } : f));
    }
    return ok;
  }, []);

  const deleteFolder = useCallback(async (id: string): Promise<boolean> => {
    const ok = await deleteFolderViaAPI(id);
    if (ok) {
      setFolders((prev) => prev.filter((f) => f.id !== id));
      // 关联的会话 folderId 会被数据库 SET NULL
      setSessions((prev) => prev.map((s) => s.folderId === id ? { ...s, folderId: null } : s));
    }
    return ok;
  }, []);

  const moveSessionToFolder = useCallback(async (sessionId: string, folderId: string | null): Promise<boolean> => {
    const ok = await moveSessionViaAPI(sessionId, folderId);
    if (ok) {
      setSessions((prev) => prev.map((s) => s.id === sessionId ? { ...s, folderId } : s));
    }
    return ok;
  }, []);

  // ===================== v6.0: 会话生命周期 =====================

  /** 归档会话 */
  const archiveSession = useCallback((sessionId: string) => {
    setSessions((prev) => prev.map((s) =>
      s.id === sessionId
        ? { ...s, status: 'archived' as const, archivedAt: new Date().toISOString() }
        : s
    ));
    // 同步后端
    fetch(`${API_BASE}/sessions/${sessionId}/archive`, { method: 'POST' }).catch(() => {});
  }, []);

  /** 恢复归档会话 */
  const restoreSession = useCallback((sessionId: string) => {
    const today = new Date().toISOString().split('T')[0];
    setSessions((prev) => prev.map((s) =>
      s.id === sessionId
        ? { ...s, status: 'active' as const, archivedAt: null, lastActiveAt: new Date().toISOString(), sessionDate: today }
        : s
    ));
    // 同步后端
    fetch(`${API_BASE}/sessions/${sessionId}/restore`, { method: 'POST' }).catch(() => {});
  }, []);

  /** 归档会话列表 */
  const archivedSessions = useMemo(
    () => sessions.filter(s => s.status === 'archived'),
    [sessions]
  );

  // ===================== 任务 4: 加载会话上下文但不切换 activeSessionId =====================
  // 用户点击历史/归档对话时，仅加载该会话的消息作为上下文，不跳转路由
  // 用户在输入框继续对话时，会依托该会话的上次上下文继续完善
  const loadSessionContext = useCallback(async (sessionId: string) => {
    // 找到目标会话
    const target = sessionsRef.current.find((s) => s.id === sessionId);
    if (!target) return;

    // 如果消息已加载，直接更新 activeSession 但不切换 activeSessionId
    if (target.messages.length === 0) {
      // 异步加载该会话的消息
      const { messages } = await fetchSessionMessagesFromAPI(sessionId);
      // 将消息合并到 sessions 中（不切换 activeSessionId）
      setSessions((prev) => prev.map((s) =>
        s.id === sessionId ? { ...s, messages } : s
      ));
      // 更新 activeSession 为目标会话（供输入框使用上下文）
      setActiveSession({ ...target, messages });
    } else {
      // 消息已加载，直接更新 activeSession
      setActiveSession(target);
    }
    // 注意：不调用 setActiveSessionIdState，不调用 syncSidebar
    // 这样 UI 不会切换到 chat 页面，用户停留在历史对话列表
  }, []);

  // ===================== 上滚加载更早消息 =====================
  const [isLoadingOlder, setIsLoadingOlder] = useState(false);

  const loadOlderMessages = useCallback(async (): Promise<boolean> => {
    if (!activeSessionId || isLoadingOlder) return false;
    // hasMoreMessages 标记在加载消息时设置
    const currentSession = activeSession;
    if (!currentSession || !currentSession.hasMoreMessages) return false;
    if (currentSession.messages.length === 0) return false;

    setIsLoadingOlder(true);
    try {
      // before = 当前最早消息在完整列表中的索引
      // 当前 messages 是从末尾取的，所以最早消息的 index = totalCount - currentMessages.length
      const currentCount = currentSession.messages.length;
      const totalCount = currentSession.totalMessageCount ?? currentCount;
      const beforeIndex = totalCount - currentCount;

      const { messages: olderMessages, hasMore } = await fetchOlderMessagesFromAPI(activeSessionId, beforeIndex);

      if (olderMessages.length > 0) {
        const newMessages = [...olderMessages, ...currentSession.messages];
        const newSession = {
          ...currentSession,
          messages: newMessages,
          hasMoreMessages: hasMore,
        };
        setActiveSession(newSession);
        setSessions((prev) =>
          prev.map((s) => s.id === activeSessionId ? { ...s, messages: newMessages, hasMoreMessages: hasMore } : s)
        );
        return true;
      } else {
        // 没有更早的消息了
        setActiveSession((prev) => prev.id === activeSessionId ? { ...prev, hasMoreMessages: false } : prev);
        return false;
      }
    } catch (e) {
      return false;
    } finally {
      setIsLoadingOlder(false);
    }
  }, [activeSessionId, activeSession, isLoadingOlder]);

  // ===================== 构建三个 Context 值 =====================

  // ChatSessionContext：流式消息变更时重新创建（约 10ms 间隔）
  const sessionValue = useMemo<ChatSessionValue>(() => ({
    session: activeSession,
    activeSessionId,
    setActiveSessionId,
    handleSessionUpdate,
    updateSessionModel,
    handleNewChat,
    loadOlderMessages,
    isLoadingOlder,
  }), [activeSession, activeSessionId, setActiveSessionId, handleSessionUpdate, updateSessionModel, handleNewChat, loadOlderMessages, isLoadingOlder]);

  // ChatSidebarContext：仅 title/folder 变更时重新创建（不随流式更新）
  const sidebarValue = useMemo<ChatSidebarValue>(() => ({
    sessions,
    folders,
    handleDeleteSession,
    togglePinSession,
    createFolder,
    updateFolder,
    deleteFolder,
    moveSessionToFolder,
    archiveSession,
    restoreSession,
    archivedSessions,
    setActiveSessionId,
    loadSessionContext,
  }), [sessions, folders, handleDeleteSession, togglePinSession, createFolder, updateFolder, deleteFolder, moveSessionToFolder, archiveSession, restoreSession, archivedSessions, setActiveSessionId, loadSessionContext]);

  // ChatMetaContext：极少变更
  const metaValue = useMemo<ChatMetaValue>(() => ({
    isInitializing,
    defaultModel,
  }), [isInitializing, defaultModel]);

  return (
    <ChatMetaContext.Provider value={metaValue}>
      <ChatSidebarContext.Provider value={sidebarValue}>
        <ChatSessionContext.Provider value={sessionValue}>
          {children}
        </ChatSessionContext.Provider>
      </ChatSidebarContext.Provider>
    </ChatMetaContext.Provider>
  );
}

// ===================== Hooks =====================

/**
 * 消费 ChatSessionContext 的 Hook — 活跃会话 + 消息发送
 * 依赖项：activeSession, activeSessionId, isLoading, sendMessage, stopGeneration
 */
export function useChatSession(): ChatSessionValue {
  const ctx = useContext(ChatSessionContext);
  if (!ctx) {
    throw new Error('useChatSession 必须在 <ChatProvider> 内部使用');
  }
  return ctx;
}

/**
 * 消费 ChatSidebarContext 的 Hook — 会话列表 + 文件夹 + CRUD
 * 依赖项：sessions, folders（不随流式消息更新）
 */
export function useChatSidebar(): ChatSidebarValue {
  const ctx = useContext(ChatSidebarContext);
  if (!ctx) {
    throw new Error('useChatSidebar 必须在 <ChatProvider> 内部使用');
  }
  return ctx;
}

/**
 * 消费 ChatMetaContext 的 Hook — isInitializing, defaultModel
 * 依赖项：极少变化
 */
export function useChatMeta(): ChatMetaValue {
  const ctx = useContext(ChatMetaContext);
  if (!ctx) {
    throw new Error('useChatMeta 必须在 <ChatProvider> 内部使用');
  }
  return ctx;
}
