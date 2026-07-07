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
import type { HookEvent, HookEventType, HookHandler } from './types.js';

export type { HookHandler };

/** 全局处理器注册表的 Symbol 键（与 loader.ts 一致） */
const INTERNAL_HOOK_HANDLERS_KEY = Symbol.for('cdf-know.internalHookHandlers');

type HandlersMap = Map<string, HookHandler[]>;

/** 获取全局共享的处理器注册表 */
function getHandlersMap(): HandlersMap {
  const store = globalThis as Record<symbol, HandlersMap>;
  if (store[INTERNAL_HOOK_HANDLERS_KEY] === undefined) {
    store[INTERNAL_HOOK_HANDLERS_KEY] = new Map<string, HookHandler[]>();
  }
  return store[INTERNAL_HOOK_HANDLERS_KEY];
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
  return (handlers.get(type)?.length ?? 0) > 0 || (handlers.get(`${type}:${action}`)?.length ?? 0) > 0;
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
