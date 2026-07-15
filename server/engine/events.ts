/**
 * 事件系统 — 参考 OpenClaw gateway/events.ts
 *
 * 实现事件发布/订阅机制：
 * - 支持多种事件类型（agent、chat、task、system）
 * - 支持命名空间隔离
 * - 支持事件过滤和匹配
 * - 支持异步事件处理
 * - 集成诊断追踪上下文
 */

import { logger } from '../logger.js';
import type { DiagnosticTraceContext } from '../infra/diagnostic-trace-context.js';

export type EventNamespace = 'agent' | 'chat' | 'task' | 'system' | 'plugin' | 'channel';

export type EventType =
  | 'agent:run_started'
  | 'agent:run_completed'
  | 'agent:run_aborted'
  | 'agent:run_failed'
  | 'agent:think'
  | 'agent:tool_call'
  | 'agent:tool_result'
  | 'chat:message_created'
  | 'chat:message_updated'
  | 'chat:message_deleted'
  | 'chat:session_created'
  | 'chat:session_updated'
  | 'chat:session_deleted'
  | 'task:created'
  | 'task:updated'
  | 'task:completed'
  | 'task:failed'
  | 'system:startup'
  | 'system:shutdown'
  | 'system:config_changed'
  | 'system:error'
  | 'plugin:installed'
  | 'plugin:enabled'
  | 'plugin:disabled'
  | 'plugin:error'
  | 'channel:connected'
  | 'channel:disconnected'
  | 'channel:message_received';

export type EventLevel = 'debug' | 'info' | 'warning' | 'error' | 'critical';

export interface EventTags {
  readonly [key: string]: string | number | boolean;
}

export interface EventContext {
  sessionId?: string;
  sessionKey?: string;
  agentId?: string;
  provider?: string;
  modelId?: string;
  runId?: string;
  userId?: string;
  clientIp?: string;
  trace?: DiagnosticTraceContext;
  tags?: EventTags;
}

export interface Event<T = unknown> {
  id: string;
  type: EventType;
  namespace: EventNamespace;
  level: EventLevel;
  timestamp: number;
  data: T;
  context?: EventContext;
  message?: string;
}

export type EventHandler<T = unknown> = (event: Event<T>) => void | Promise<void>;

export interface SubscribeOptions {
  once?: boolean;
  timeoutMs?: number;
  filter?: (event: Event) => boolean;
}

interface Subscriber<T = unknown> {
  handler: EventHandler<T>;
  options?: SubscribeOptions;
}

interface SubscriberRegistry {
  [eventType: string]: Subscriber[];
}

const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_EVENT_QUEUE_SIZE = 10_000;
const EVENT_ID_PREFIX = 'evt';

interface EventSystemState {
  subscribers: SubscriberRegistry;
  eventQueue: Event[];
  started: boolean;
}

const STATE_KEY = Symbol.for('cross-wms.eventSystem');

function getState(): EventSystemState {
  const globalScope = globalThis as Record<symbol, EventSystemState>;
  if (!globalScope[STATE_KEY]) {
    globalScope[STATE_KEY] = {
      subscribers: {},
      eventQueue: [],
      started: false,
    };
  }
  return globalScope[STATE_KEY];
}

function generateEventId(): string {
  return `${EVENT_ID_PREFIX}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function parseNamespace(type: string): EventNamespace {
  const parts = type.split(':');
  switch (parts[0]) {
    case 'agent':
      return 'agent';
    case 'chat':
      return 'chat';
    case 'task':
      return 'task';
    case 'system':
      return 'system';
    case 'plugin':
      return 'plugin';
    case 'channel':
      return 'channel';
    default:
      return 'system';
  }
}

export async function publishEvent<T = unknown>(
  type: EventType,
  data: T,
  options?: {
    level?: EventLevel;
    context?: EventContext;
    message?: string;
  },
): Promise<void> {
  const state = getState();
  const event: Event<T> = {
    id: generateEventId(),
    type,
    namespace: parseNamespace(type),
    level: options?.level ?? 'info',
    timestamp: Date.now(),
    data,
    context: options?.context,
    message: options?.message,
  };

  if (state.eventQueue.length >= MAX_EVENT_QUEUE_SIZE) {
    state.eventQueue.shift();
  }
  state.eventQueue.push(event);

  logEvent(event);

  await notifySubscribers(event);
}

function logEvent(event: Event): void {
  const contextParts: string[] = [];
  if (event.context?.sessionId) contextParts.push(`session=${event.context.sessionId}`);
  if (event.context?.agentId) contextParts.push(`agent=${event.context.agentId}`);
  if (event.context?.provider) contextParts.push(`provider=${event.context.provider}`);
  if (event.context?.runId) contextParts.push(`run=${event.context.runId}`);

  const contextStr = contextParts.length > 0 ? ` [${contextParts.join(', ')}]` : '';
  const dataStr = typeof event.data === 'object' ? ` ${JSON.stringify(event.data)}` : '';
  const messageStr = event.message ? ` - ${event.message}` : '';

  switch (event.level) {
    case 'debug':
      logger.debug(`[Event] ${event.type}${contextStr}${messageStr}${dataStr}`);
      break;
    case 'info':
      logger.info(`[Event] ${event.type}${contextStr}${messageStr}`);
      break;
    case 'warning':
      logger.warn(`[Event] ${event.type}${contextStr}${messageStr}${dataStr}`);
      break;
    case 'error':
      logger.error(`[Event] ${event.type}${contextStr}${messageStr}${dataStr}`);
      break;
    case 'critical':
      logger.error(`[Event] ${event.type}${contextStr}${messageStr}${dataStr}`);
      break;
  }
}

async function notifySubscribers(event: Event): Promise<void> {
  const state = getState();
  const subscribers = state.subscribers[event.type] ?? [];

  const promises: Promise<void>[] = [];

  for (const subscriber of subscribers) {
    if (subscriber.options?.filter && !subscriber.options.filter(event)) {
      continue;
    }

    try {
      const handlerResult = subscriber.handler(event);
      const handlerPromise = Promise.resolve(handlerResult);

      if (subscriber.options?.once) {
        handlerPromise.then(() => {
          const index = state.subscribers[event.type]?.findIndex(
            (s) => s.handler === subscriber.handler,
          );
          if (index !== undefined && index >= 0) {
            state.subscribers[event.type].splice(index, 1);
          }
        }).catch(() => {});
      }

      promises.push(handlerPromise);
    } catch (err) {
      logger.error(`[Event] 事件处理器执行失败: ${event.type}`, err);
    }
  }

  await Promise.allSettled(promises);
}

export function subscribe<T = unknown>(
  type: EventType | EventType[],
  handler: EventHandler<T>,
  options?: SubscribeOptions,
): () => void {
  const state = getState();
  const types = Array.isArray(type) ? type : [type];

  types.forEach((t) => {
    if (!state.subscribers[t]) {
      state.subscribers[t] = [];
    }
    state.subscribers[t].push({ handler: handler as EventHandler<unknown>, options });
  });

  logger.debug(`[Event] 订阅事件: ${types.join(', ')}`);

  return () => {
    types.forEach((t) => {
      const subscribers = state.subscribers[t];
      if (subscribers) {
        const index = subscribers.findIndex((s) => s.handler === handler);
        if (index >= 0) {
          subscribers.splice(index, 1);
        }
      }
    });
    logger.debug(`[Event] 取消订阅事件: ${types.join(', ')}`);
  };
}

export function subscribeNamespace(
  namespace: EventNamespace,
  handler: EventHandler,
  options?: SubscribeOptions,
): () => void {
  const types = getAllEventTypesForNamespace(namespace);
  return subscribe(types, handler, options);
}

function getAllEventTypesForNamespace(namespace: EventNamespace): EventType[] {
  const allTypes: EventType[] = [
    'agent:run_started',
    'agent:run_completed',
    'agent:run_aborted',
    'agent:run_failed',
    'agent:think',
    'agent:tool_call',
    'agent:tool_result',
    'chat:message_created',
    'chat:message_updated',
    'chat:message_deleted',
    'chat:session_created',
    'chat:session_updated',
    'chat:session_deleted',
    'task:created',
    'task:updated',
    'task:completed',
    'task:failed',
    'system:startup',
    'system:shutdown',
    'system:config_changed',
    'system:error',
    'plugin:installed',
    'plugin:enabled',
    'plugin:disabled',
    'plugin:error',
    'channel:connected',
    'channel:disconnected',
    'channel:message_received',
  ];

  return allTypes.filter((type) => type.startsWith(`${namespace}:`));
}

export async function waitForEvent(
  type: EventType,
  options?: {
    timeoutMs?: number;
    filter?: (event: Event) => boolean;
  },
): Promise<Event> {
  return new Promise((resolve, reject) => {
    const timeout = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const timer = setTimeout(() => {
      unsubscribe();
      reject(new Error(`等待事件超时: ${type}`));
    }, timeout);

    const unsubscribe = subscribe(type, (event) => {
      if (options?.filter && !options.filter(event)) {
        return;
      }
      clearTimeout(timer);
      unsubscribe();
      resolve(event);
    }, { once: true });
  });
}

export function getRecentEvents(count: number = 100): Event[] {
  const state = getState();
  return state.eventQueue.slice(-count);
}

export function clearEventQueue(): void {
  const state = getState();
  state.eventQueue = [];
}

export function getSubscriberCount(): Record<string, number> {
  const state = getState();
  const counts: Record<string, number> = {};
  for (const [type, subscribers] of Object.entries(state.subscribers)) {
    counts[type] = subscribers.length;
  }
  return counts;
}

export async function shutdownEventSystem(): Promise<void> {
  const state = getState();
  state.started = false;
  state.subscribers = {};
  state.eventQueue = [];
  logger.info('[Event] 事件系统已关闭');
}

export function startEventSystem(): void {
  const state = getState();
  if (state.started) return;
  state.started = true;
  logger.info('[Event] 事件系统已启动');
}