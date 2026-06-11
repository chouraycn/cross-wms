/**
 * 统一的会话存储模块
 *
 * 以 localStorage 为唯一真相源（Single Source of Truth），
 * 提供 load / save / subscribe 能力，消除 ChatPage / CrossWmsChat / SessionReferenceSelector
 * 三个组件各自维护 localStorage 读取逻辑的不一致问题。
 *
 * @version 1.9.0
 */

import type { Session } from '../types/chat';

/** localStorage key — 与历史版本保持兼容 */
export const SESSIONS_STORAGE_KEY = 'cdf-know-clow-chat-sessions';

/** 最大会话保存数量 */
export const MAX_SESSIONS = 20;

// ===================== 序列化 / 反序列化 =====================

/**
 * 从 localStorage 加载会话列表
 *
 * 反序列化时将 ISO 字符串恢复为 Date 对象。
 * 数据损坏时静默返回空数组。
 */
export function loadSessions(): Session[] {
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
          // 确保 title/updatedAt 存在
          title: typeof s.title === 'string' ? s.title : '',
          updatedAt: typeof s.updatedAt === 'string' ? s.updatedAt : typeof s.createdAt === 'string' ? s.createdAt : undefined,
        })) as Session[];
      }
    }
  } catch {
    // 数据损坏时静默返回空数组
  }
  return [];
}

/**
 * 保存会话列表到 localStorage
 *
 * 序列化时将 Date 转为 ISO 字符串。
 * 仅保留最近 MAX_SESSIONS 条会话。
 * 超出配额时发出 storage-warning 事件。
 */
export function saveSessions(sessions: Session[]): void {
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
    if (e instanceof DOMException && e.name === 'QuotaExceededError') {
      window.dispatchEvent(new CustomEvent('cdf-know-clow-storage-warning', {
        detail: { key: SESSIONS_STORAGE_KEY },
      }));
    }
  }
}

/**
 * 创建新空会话
 *
 * @param defaultModel - 默认模型 ID，默认 'auto'
 */
export function createNewSession(defaultModel?: string): Session {
  return {
    id: `session-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    title: '',
    model: defaultModel || 'auto',
    messages: [],
  };
}

// ===================== useSyncExternalStore 支持 =====================

/** 会话变更事件名（用于组件间同步） */
export const SESSIONS_UPDATED_EVENT = 'cdf-know-clow-chat-updated';

/**
 * 通知其他组件会话数据已更新
 *
 * 在 saveSessions 之后调用，触发 useSyncExternalStore 订阅者重新读取。
 */
export function notifySessionsUpdated(): void {
  window.dispatchEvent(new CustomEvent(SESSIONS_UPDATED_EVENT));
}

/**
 * 保存并通知：一步完成"写入 localStorage + 广播更新事件"
 *
 * 推荐使用此函数替代手动调用 saveSessions + notifySessionsUpdated。
 */
export function saveAndNotify(sessions: Session[]): void {
  saveSessions(sessions);
  notifySessionsUpdated();
}

// ===================== 内部订阅管理 =====================

type Listener = () => void;

/** 当前活跃的订阅者列表 */
const listeners: Listener[] = [];

/** 触发所有订阅者重新读取 */
function emitChange(): void {
  for (const listener of listeners) {
    listener();
  }
}

// 监听 localStorage storage 事件（跨标签页同步）
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key === SESSIONS_STORAGE_KEY) {
      emitChange();
    }
  });

  // 监听自定义事件（同标签页内组件间同步）
  window.addEventListener(SESSIONS_UPDATED_EVENT, () => {
    emitChange();
  });
}

/**
 * 订阅会话变更 — 兼容 useSyncExternalStore API
 *
 * @param listener - 变更回调
 * @returns 取消订阅函数
 */
export function subscribeSessions(listener: Listener): () => void {
  listeners.push(listener);
  return () => {
    const idx = listeners.indexOf(listener);
    if (idx !== -1) {
      listeners.splice(idx, 1);
    }
  };
}

/**
 * 获取当前会话快照 — 兼容 useSyncExternalStore API
 */
export function getSessionsSnapshot(): Session[] {
  return loadSessions();
}

/**
 * 获取服务端渲染快照（SSR fallback）
 */
export function getSessionsServerSnapshot(): Session[] {
  return [];
}
