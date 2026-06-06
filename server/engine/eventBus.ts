import { EventEmitter } from 'events';

// ===================== 事件类型常量 =====================

export const AutomationEventType = {
  AUTOMATION_STARTED: 'automation:started',
  AUTOMATION_COMPLETED: 'automation:completed',
  AUTOMATION_FAILED: 'automation:failed',
  AUTOMATION_STEP: 'automation:step',
  WEBHOOK_RECEIVED: 'webhook:received',
} as const;

export type AutomationEventType = (typeof AutomationEventType)[keyof typeof AutomationEventType];

// ===================== 事件载荷 =====================

export interface AutomationEventPayload {
  automationId: string;
  taskType: string;
  status: string;
  timestamp: string;
  data?: unknown;
  error?: string;
}

// ===================== 全局事件总线（单例） =====================

/**
 * 全局事件总线，基于 Node.js 内置 EventEmitter
 *
 * 用法：
 *   import { emitAutomationEvent, onAutomationEvent, AutomationEventType } from './eventBus.js';
 *
 *   emitAutomationEvent(AutomationEventType.AUTOMATION_STARTED, {
 *     automationId: 'auto_xxx',
 *     taskType: 'data-sync',
 *     status: 'running',
 *     timestamp: new Date().toISOString(),
 *   });
 *
 *   const unsubscribe = onAutomationEvent(AutomationEventType.AUTOMATION_COMPLETED, (payload) => {
 *     console.log('自动化完成:', payload);
 *   });
 *   unsubscribe(); // 取消订阅
 */
const eventBus = new EventEmitter();
eventBus.setMaxListeners(50);

export default eventBus;

// ===================== 辅助函数 =====================

/**
 * 发布自动化事件（带 try-catch 保护）
 */
export function emitAutomationEvent(
  event: AutomationEventType,
  payload: AutomationEventPayload,
): void {
  try {
    eventBus.emit(event, payload);
  } catch (err) {
    console.error(`[EventBus] 发布事件 ${event} 失败:`, err);
  }
}

/**
 * 订阅自动化事件，返回取消订阅函数
 */
export function onAutomationEvent(
  event: AutomationEventType,
  handler: (payload: AutomationEventPayload) => void,
): () => void {
  eventBus.on(event, handler);
  return () => {
    eventBus.off(event, handler);
  };
}
