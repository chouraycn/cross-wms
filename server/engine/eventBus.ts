import { EventEmitter } from 'events';
import {
  AgentEventType as AgentEventTypeConst,
  type AgentEventPayload,
} from '../../shared/types/agent.js';
import { logger } from '../logger.js';

// ===================== 自动化事件类型常量 =====================

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
 *     logger.debug('自动化完成:', payload);
 *   });
 *   unsubscribe(); // 取消订阅
 */
const eventBus = new EventEmitter();
eventBus.setMaxListeners(100); // v8.0: 增大上限以支持多 Agent 订阅

export default eventBus;

// ===================== 自动化事件辅助函数 =====================

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
    logger.error(`[EventBus] 发布事件 ${event} 失败:`, err);
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

// ===================== Agent 事件辅助函数（v8.0） =====================

/**
 * 发布 Agent 事件（带 try-catch 保护）
 *
 * 用法：
 *   emitAgentEvent({
 *     type: AgentEventType.AGENT_TASK_COMPLETE,
 *     sourceAgentId: 'researcher-1',
 *     sessionId: 'sess_xxx',
 *     subTaskId: 'task_1',
 *     timestamp: new Date().toISOString(),
 *     data: { result: '...' },
 *   });
 */
export function emitAgentEvent(payload: AgentEventPayload): void {
  try {
    eventBus.emit(payload.type, payload);
    // 同时发布到通配符通道，方便全局监听
    eventBus.emit('agent:*', payload);
  } catch (err) {
    logger.error(`[EventBus] 发布 Agent 事件 ${payload.type} 失败:`, err);
  }
}

/**
 * 订阅特定类型的 Agent 事件，返回取消订阅函数
 */
export function onAgentEvent(
  event: AgentEventTypeConst | '*',
  handler: (payload: AgentEventPayload) => void,
): () => void {
  const eventName = event === '*' ? 'agent:*' : event;
  eventBus.on(eventName, handler);
  return () => {
    eventBus.off(eventName, handler);
  };
}

/**
 * 订阅特定 Agent 的事件（按 sourceAgentId 过滤）
 */
export function onAgentEventFrom(
  agentId: string,
  handler: (payload: AgentEventPayload) => void,
): () => void {
  const filteredHandler = (payload: AgentEventPayload) => {
    if (payload.sourceAgentId === agentId) {
      handler(payload);
    }
  };
  eventBus.on('agent:*', filteredHandler);
  return () => {
    eventBus.off('agent:*', filteredHandler);
  };
}

/**
 * 订阅特定会话的 Agent 事件（按 sessionId 过滤）
 */
export function onAgentEventForSession(
  sessionId: string,
  handler: (payload: AgentEventPayload) => void,
): () => void {
  const filteredHandler = (payload: AgentEventPayload) => {
    if (payload.sessionId === sessionId) {
      handler(payload);
    }
  };
  eventBus.on('agent:*', filteredHandler);
  return () => {
    eventBus.off('agent:*', filteredHandler);
  };
}
