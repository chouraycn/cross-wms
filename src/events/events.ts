/**
 * 集中管理前端 CustomEvent 事件名
 *
 * 项目中存在大量 `window.dispatchEvent(new CustomEvent(...))` 调用，
 * 事件名以字符串字面量散落在各组件/hooks/stores 中，容易拼写错误且难以重构。
 *
 * 本文件提供：
 * 1. 统一的事件名常量（CdfEvents）
 * 2. 事件 detail 类型映射表（CdfEventDetailMap）—— 实现类型安全的 detail
 * 3. 辅助函数 dispatchCdfEvent / onCdfEvent / offCdfEvent
 *
 * 迁移指南：将散落的字符串字面量逐步替换为 CdfEvents.xxx 常量。
 */

// ===================== 事件名常量 =====================

/**
 * 所有前端 CustomEvent 事件名集中定义
 *
 * 命名约定：
 * - 前端内部事件使用 `cdf-` 前缀
 * - 历史遗留事件（approval_*、new-chat 等）保留原名以保持兼容
 */
export const CdfEvents = {
  // ===== 会话 / 聊天 =====
  CHAT_UPDATED: 'cdf-know-clow-chat-updated',
  FOCUS_CHAT: 'cdf-know-clow-focus-chat',
  SELECT_SESSION: 'cdf-know-clow-select-session',
  NAVIGATE_CHAT: 'cdf-know-clow-navigate-chat',
  NEW_CHAT: 'cdf-know-clow-new-chat',
  CLEAR_SESSION: 'cdf-know-clow-clear-session',
  /** CommandPalette 触发的新建聊天（简短名，历史遗留） */
  NEW_CHAT_SHORT: 'new-chat',
  /** CommandPalette 触发的清空聊天（简短名，历史遗留） */
  CLEAR_CHAT_SHORT: 'clear-chat',

  // ===== 侧边栏 =====
  SIDEBAR_STATE: 'cdf-sidebar-state',
  TOGGLE_SIDEBAR: 'cdf-toggle-sidebar',
  OPEN_SEARCH: 'cdf-open-search',

  // ===== 窗口控制 =====
  WINDOW_MAXIMIZED: 'cdf-window-maximized',
  WINDOW_RESTORED: 'cdf-window-restored',
  WINDOW_FULLSCREEN_CHANGED: 'cdf-window-fullscreen-changed',

  // ===== 审批 =====
  APPROVAL_REQUEST: 'approval_request',
  APPROVAL_TIMEOUT: 'approval_timeout',
  APPROVAL_EVENT: 'approval_event',
  WHITELIST_ADD: 'whitelist_add',
  WHITELIST_REMOVE: 'whitelist_remove',

  // ===== 错误 / 系统 =====
  API_ERROR: 'cdf-know-clow-api-error',
  STORAGE_WARNING: 'cdf-know-clow-storage-warning',
  MEMORY_PRESSURE: 'cdf-memory-pressure',

  // ===== UI 交互 =====
  CHAT_INPUT_BLUR: 'cdf-chat-input-blur',
  TODOS_UPDATED: 'cdf-todos-updated',
  TRIGGER_SKILL: 'trigger-skill',
} as const;

export type CdfEventName = (typeof CdfEvents)[keyof typeof CdfEvents];

// ===================== 事件 detail 类型映射 =====================

/**
 * 事件 detail 类型映射表
 *
 * 为每个事件名声明其 detail 的类型（void 表示无 detail）。
 * 新增事件时在此补充类型映射即可获得类型安全。
 */
export interface CdfEventDetailMap {
  // 会话 / 聊天
  [CdfEvents.CHAT_UPDATED]: { sessionId?: string };
  [CdfEvents.FOCUS_CHAT]: { sessionId?: string };
  [CdfEvents.SELECT_SESSION]: { sessionId?: string };
  [CdfEvents.NAVIGATE_CHAT]: { sessionId?: string; messageId?: string };
  [CdfEvents.NEW_CHAT]: void;
  [CdfEvents.CLEAR_SESSION]: void;
  [CdfEvents.NEW_CHAT_SHORT]: void;
  [CdfEvents.CLEAR_CHAT_SHORT]: void;

  // 侧边栏
  [CdfEvents.SIDEBAR_STATE]: { collapsed: boolean };
  [CdfEvents.TOGGLE_SIDEBAR]: void;
  [CdfEvents.OPEN_SEARCH]: void;

  // 窗口控制
  [CdfEvents.WINDOW_MAXIMIZED]: void;
  [CdfEvents.WINDOW_RESTORED]: void;
  [CdfEvents.WINDOW_FULLSCREEN_CHANGED]: { fullscreen: boolean };

  // 审批
  [CdfEvents.APPROVAL_REQUEST]: unknown;
  [CdfEvents.APPROVAL_TIMEOUT]: { requestId: string; request: unknown };
  [CdfEvents.APPROVAL_EVENT]: unknown;
  [CdfEvents.WHITELIST_ADD]: { pattern: string };
  [CdfEvents.WHITELIST_REMOVE]: { pattern: string };

  // 错误 / 系统
  [CdfEvents.API_ERROR]: { action: string; error: unknown };
  [CdfEvents.STORAGE_WARNING]: unknown;
  [CdfEvents.MEMORY_PRESSURE]: void;

  // UI 交互
  [CdfEvents.CHAT_INPUT_BLUR]: unknown;
  [CdfEvents.TODOS_UPDATED]: unknown;
  [CdfEvents.TRIGGER_SKILL]: { skillId: string };
}

// ===================== 辅助函数 =====================

/**
 * 派发一个类型安全的 CustomEvent
 *
 * @param eventName - 事件名（使用 CdfEvents 常量）
 * @param detail - 事件数据（类型由 CdfEventDetailMap 推导）
 */
export function dispatchCdfEvent<K extends CdfEventName>(
  eventName: K,
  ...args: CdfEventDetailMap[K] extends void ? [] : [detail: CdfEventDetailMap[K]]
): void {
  if (args.length > 0) {
    window.dispatchEvent(new CustomEvent(eventName, { detail: args[0] }));
  } else {
    window.dispatchEvent(new CustomEvent(eventName));
  }
}

/**
 * 事件监听器类型（自动推导 detail 类型）
 */
export type CdfEventListener<K extends CdfEventName> = (
  detail: CdfEventDetailMap[K],
) => void;

/**
 * 添加事件监听器（自动处理 detail 提取）
 *
 * @param eventName - 事件名（使用 CdfEvents 常量）
 * @param handler - 事件处理器（接收 detail 参数）
 * @returns 清理函数，调用后移除监听器
 */
export function onCdfEvent<K extends CdfEventName>(
  eventName: K,
  handler: CdfEventListener<K>,
): () => void {
  const listener = (e: Event) => {
    handler((e as CustomEvent<CdfEventDetailMap[K]>).detail);
  };
  window.addEventListener(eventName, listener);
  return () => window.removeEventListener(eventName, listener);
}

/**
 * 移除事件监听器
 *
 * @param eventName - 事件名
 * @param handler - 原先注册的处理器
 */
export function offCdfEvent<K extends CdfEventName>(
  eventName: K,
  handler: CdfEventListener<K>,
): void {
  // 注意：由于 onCdfEvent 内部包装了 listener，直接 off 无法移除。
  // 推荐使用 onCdfEvent 返回的清理函数。
  // 此函数保留用于需要手动管理的场景（需配合原始 addEventListener）。
  window.removeEventListener(eventName, handler as EventListener);
}
