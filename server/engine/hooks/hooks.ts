/**
 * 钩子系统公共 API 门面
 *
 * 参考 openclaw/src/hooks/hooks.ts 与 internal-hooks.ts，对外暴露：
 * - createHookEvent：事件工厂函数
 * - isAgentBootstrapEvent：判断是否为 agent bootstrap 事件
 * - runHooks：执行钩子链（支持 before/after 模式）
 * - HookHandler：处理器类型别名
 *
 * 处理器注册表为全局单例（Symbol.for），与 loader.ts 共享同一 Map，
 * 保证注册与触发始终指向同一存储，避免 bundle 分片导致钩子静默丢失。
 */

import { logger } from '../../logger.js';
import type { HookEvent, HookEventType, HookHandler, HookModifier } from './types.js';

export type { HookHandler, HookModifier };

/** 全局处理器注册表的 Symbol 键（与 loader.ts 一致） */
const INTERNAL_HOOK_HANDLERS_KEY = Symbol.for('cdf-know.internalHookHandlers');

type HandlersMap = Map<string, HookHandler[]>;
type ModifiersMap = Map<string, HookModifier[]>;

/** 获取全局共享的处理器注册表 */
function getHandlersMap(): HandlersMap {
  const store = globalThis as Record<symbol, HandlersMap>;
  if (store[INTERNAL_HOOK_HANDLERS_KEY] === undefined) {
    store[INTERNAL_HOOK_HANDLERS_KEY] = new Map<string, HookHandler[]>();
  }
  return store[INTERNAL_HOOK_HANDLERS_KEY];
}

/** 获取全局共享的修改器注册表 */
function getModifiersMap(): ModifiersMap {
  const key = Symbol.for('cdf-know.internalHookModifiers');
  const store = globalThis as Record<symbol, ModifiersMap>;
  if (store[key] === undefined) {
    store[key] = new Map<string, HookModifier[]>();
  }
  return store[key];
}

/**
 * 创建钩子事件（填充公共字段）
 *
 * @param type - 事件族
 * @param action - 事件族内的具体动作
 * @param sessionKey - 关联的会话键
 * @param context - 事件附带上下文
 */
export function createHookEvent(
  type: HookEventType,
  action: string,
  sessionKey: string,
  context: Record<string, unknown> = {},
): HookEvent {
  return {
    type,
    action,
    sessionKey,
    context,
    timestamp: new Date(),
    messages: [],
  };
}

/** 判断事件是否为 agent bootstrap 事件（type=agent, action=bootstrap, 且 context 含 workspaceDir 与 bootstrapFiles） */
export function isAgentBootstrapEvent(event: HookEvent): boolean {
  if (event.type !== 'agent' || event.action !== 'bootstrap') {
    return false;
  }
  const ctx = event.context as { workspaceDir?: unknown; bootstrapFiles?: unknown } | null;
  if (!ctx || typeof ctx !== 'object') {
    return false;
  }
  return typeof ctx.workspaceDir === 'string' && Array.isArray(ctx.bootstrapFiles);
}

/** 是否存在指定事件族+动作的监听器 */
export function hasHookListeners(type: HookEventType, action: string): boolean {
  const handlers = getHandlersMap();
  const modifiers = getModifiersMap();
  return (handlers.get(type)?.length ?? 0) > 0 || 
         (handlers.get(`${type}:${action}`)?.length ?? 0) > 0 ||
         (modifiers.get(type)?.length ?? 0) > 0 ||
         (modifiers.get(`${type}:${action}`)?.length ?? 0) > 0;
}

/**
 * 执行钩子链：触发一个事件，依次调用所有匹配的处理器
 *
 * 匹配规则：先调用事件族（如 'command'）的所有处理器，再调用事件族:动作（如 'command:new'）的处理器。
 * 处理器按注册顺序执行；单个处理器抛出的错误会被捕获并记录，不阻断后续处理器。
 *
 * @param event - 要触发的事件
 */
export async function runHooks(event: HookEvent): Promise<void> {
  const handlers = getHandlersMap();
  const typeHandlers = handlers.get(event.type) ?? [];
  const specificHandlers = handlers.get(`${event.type}:${event.action}`) ?? [];
  const allHandlers = [...typeHandlers, ...specificHandlers];

  for (const handler of allHandlers) {
    try {
      await handler(event);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error(`[hooks] 钩子错误 [${event.type}:${event.action}]: ${message}`);
    }
  }
}

/**
 * 执行钩子修改器链：允许钩子修改事件上下文
 *
 * @param event - 要修改的事件
 * @returns 修改后的事件
 */
export async function runHookModifiers<T extends HookEvent>(event: T): Promise<T> {
  const modifiers = getModifiersMap();
  const typeModifiers = modifiers.get(event.type) ?? [];
  const specificModifiers = modifiers.get(`${event.type}:${event.action}`) ?? [];
  const allModifiers = [...typeModifiers, ...specificModifiers];

  let currentEvent = event;
  for (const modifier of allModifiers) {
    try {
      const result = await modifier(currentEvent);
      if (result !== undefined && result !== null) {
        currentEvent = result as T;
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error(`[hooks] 修改器错误 [${event.type}:${event.action}]: ${message}`);
    }
  }

  return currentEvent;
}

/**
 * 以 before/after 模式执行钩子链，包裹一个核心操作
 *
 * 流程：
 *   1. 触发 `<type>:before:<action>` 事件（前置钩子）
 *   2. 执行 operation（核心操作）
 *   3. 触发 `<type>:after:<action>` 事件（后置钩子）
 *
 * 前置钩子的错误不阻断 operation；后置钩子的错误被捕获记录。
 *
 * @param type - 事件族
 * @param action - 动作名
 * @param sessionKey - 会话键
 * @param context - 上下文
 * @param operation - 被 before/after 包裹的核心操作
 */
export async function runHooksAround<T>(
  type: HookEventType,
  action: string,
  sessionKey: string,
  context: Record<string, unknown>,
  operation: () => Promise<T>,
): Promise<T> {
  // 1. 前置钩子
  await runHooks(createHookEvent(type, `before:${action}`, sessionKey, context));
  // 2. 核心操作
  const result = await operation();
  // 3. 后置钩子
  await runHooks(createHookEvent(type, `after:${action}`, sessionKey, { ...context, result }));
  return result;
}

/**
 * 注册钩子修改器
 */
export function registerHookModifier<T extends HookEvent>(
  type: HookEventType,
  action: string,
  modifier: HookModifier<T>,
): void {
  const modifiers = getModifiersMap();
  const key = `${type}:${action}`;
  let list = modifiers.get(key);
  if (!list) {
    list = [];
    modifiers.set(key, list);
  }
  list.push(modifier as unknown as HookModifier);
}

// ===================== 便捷钩子触发函数 =====================

/**
 * 触发 agent-start 前置钩子
 */
export async function triggerBeforeAgentStart(
  sessionKey: string,
  agentId: string,
  agentRole: string,
): Promise<void> {
  await runHooks(createHookEvent('agent', 'before-start', sessionKey, { agentId, agentRole }));
}

/**
 * 触发 agent-start 后置钩子
 */
export async function triggerAfterAgentStart(
  sessionKey: string,
  agentId: string,
  agentRole: string,
  success: boolean,
  error?: string,
): Promise<void> {
  await runHooks(createHookEvent('agent', 'after-start', sessionKey, { agentId, agentRole, success, error }));
}

/**
 * 触发 tool-call 前置钩子（支持修改）
 */
export async function triggerBeforeToolCall(
  sessionKey: string,
  toolName: string,
  toolType: string,
  args: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const event = await runHookModifiers(
    createHookEvent('tool', 'before-call', sessionKey, { toolName, toolType, arguments: args })
  );
  return event.context.arguments as Record<string, unknown>;
}

/**
 * 触发 tool-call 后置钩子
 */
export async function triggerAfterToolCall(
  sessionKey: string,
  toolName: string,
  toolType: string,
  args: Record<string, unknown>,
  result: unknown,
  error?: string,
  durationMs?: number,
): Promise<void> {
  await runHooks(createHookEvent('tool', 'after-call', sessionKey, {
    toolName,
    toolType,
    arguments: args,
    result,
    error,
    durationMs
  }));
}

/**
 * 触发 tool-result 钩子（在工具结果返回后触发）
 */
export async function triggerAfterToolResult(
  sessionKey: string,
  toolName: string,
  toolType: string,
  result: unknown,
  isError: boolean,
): Promise<void> {
  await runHooks(createHookEvent('tool', 'after-result', sessionKey, { 
    toolName, 
    toolType, 
    result, 
    isError 
  }));
}

/**
 * 触发 message-send 前置钩子（支持修改消息内容）
 */
export async function triggerBeforeMessageSend(
  sessionKey: string,
  content: string,
  messageType: string,
): Promise<string> {
  const event = await runHookModifiers(
    createHookEvent('message', 'before-send', sessionKey, { content, messageType })
  );
  return String(event.context.content ?? content);
}

/**
 * 触发 message-receive 后置钩子
 */
export async function triggerAfterMessageReceive(
  sessionKey: string,
  content: string,
  messageType: string,
): Promise<void> {
  await runHooks(createHookEvent('message', 'after-receive', sessionKey, { content, messageType }));
}

/**
 * 触发 session-start 钩子
 */
export async function triggerSessionStart(
  sessionKey: string,
  userId?: string,
): Promise<void> {
  await runHooks(createHookEvent('session', 'start', sessionKey, { userId }));
}

/**
 * 触发 session-end 钩子
 */
export async function triggerSessionEnd(
  sessionKey: string,
  reason?: string,
): Promise<void> {
  await runHooks(createHookEvent('session', 'end', sessionKey, { reason }));
}
