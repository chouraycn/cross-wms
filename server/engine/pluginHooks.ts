/**
 * Plugin Hooks — 插件生命周期钩子系统
 *
 * v1.0: 提供标准化的插件生命周期钩子机制，允许插件在引擎各阶段插入自定义逻辑。
 *
 * 特性:
 * - 10 种生命周期钩子类型，覆盖消息、工具、AI 调用、会话等全流程
 * - 串行执行（按优先级排序）+ 并行执行两种模式
 * - 支持短路机制（stopPropagation）
 * - 错误隔离（单个钩子失败不影响其他钩子执行）
 * - 支持钩子修改上下文数据（modified）
 *
 * 用法：
 *   import pluginHooks from './pluginHooks.js';
 *
 *   // 注册钩子
 *   pluginHooks.registerHook('my-plugin', 'before_message_received', async (ctx) => {
 *     console.log('收到消息:', ctx.message);
 *     return { modified: { ...ctx.message, text: '修改后的消息' } };
 *   });
 *
 *   // 执行钩子
 *   const result = await pluginHooks.executeHooks('before_message_received', context);
 */

import { logger } from '../logger.js';

// ===================== 钩子类型常量 =====================

/**
 * 钩子类型常量
 *
 * - before_message_received: 收到用户消息前
 * - after_message_received: 收到用户消息后
 * - before_tool_call: 工具调用前
 * - after_tool_call: 工具调用后
 * - before_ai_call: AI 调用前
 * - after_ai_call: AI 调用后
 * - before_session_create: 会话创建前
 * - after_session_create: 会话创建后
 * - on_error: 错误发生时
 * - on_completion: 任务完成时
 */
export const HookType = {
  BEFORE_MESSAGE_RECEIVED: 'before_message_received',
  AFTER_MESSAGE_RECEIVED: 'after_message_received',
  BEFORE_TOOL_CALL: 'before_tool_call',
  AFTER_TOOL_CALL: 'after_tool_call',
  BEFORE_AI_CALL: 'before_ai_call',
  AFTER_AI_CALL: 'after_ai_call',
  BEFORE_SESSION_CREATE: 'before_session_create',
  AFTER_SESSION_CREATE: 'after_session_create',
  ON_ERROR: 'on_error',
  ON_COMPLETION: 'on_completion',
} as const;

/** 钩子类型 */
export type HookType = (typeof HookType)[keyof typeof HookType];

// ===================== 钩子上下文类型 =====================

/**
 * 钩子上下文 — 执行钩子时传递的上下文信息
 *
 * 不同钩子类型会填充不同的字段：
 * - message 系列钩子: session + message
 * - tool_call 系列钩子: session + message + toolCall + toolResult(after)
 * - ai_call 系列钩子: session + messages + aiResult(after)
 * - session 系列钩子: session
 * - error 钩子: session + error
 * - completion 钩子: session + result
 */
export interface HookContext {
  /** 会话 ID */
  sessionId?: string;
  /** 会话数据（如果有） */
  session?: Record<string, unknown>;
  /** 用户消息（消息相关钩子） */
  message?: Record<string, unknown>;
  /** 消息列表（AI 调用相关钩子） */
  messages?: Array<Record<string, unknown>>;
  /** 工具调用信息（工具调用相关钩子） */
  toolCall?: {
    toolName: string;
    args: Record<string, unknown>;
  };
  /** 工具调用结果（after_tool_call） */
  toolResult?: unknown;
  /** AI 调用结果（after_ai_call） */
  aiResult?: unknown;
  /** 错误信息（on_error） */
  error?: Error;
  /** 任务完成结果（on_completion） */
  result?: unknown;
  /** 额外的自定义上下文数据 */
  extra?: Record<string, unknown>;
}

// ===================== 钩子返回值类型 =====================

/**
 * 钩子执行结果
 *
 * 插件钩子处理函数可以返回 HookResult 来影响后续执行：
 * - stopPropagation: 停止后续钩子执行（短路）
 * - modified: 修改后的数据，会被合并到上下文中传递给下一个钩子
 * - error: 钩子执行中产生的错误
 */
export interface HookResult {
  /** 是否停止后续钩子执行（短路） */
  stopPropagation?: boolean;
  /** 修改后的数据，会合并到上下文中 */
  modified?: unknown;
  /** 钩子执行错误（内部使用，通常不需要手动返回） */
  error?: Error;
}

/** 钩子处理函数类型 */
export type HookHandler = (context: HookContext) => HookResult | Promise<HookResult> | void | Promise<void>;

// ===================== 钩子注册信息 =====================

/** 已注册的钩子信息 */
interface RegisteredHook {
  /** 插件 ID */
  pluginId: string;
  /** 钩子类型 */
  hookType: HookType;
  /** 处理函数 */
  handler: HookHandler;
  /** 优先级（数值越小优先级越高，默认 100） */
  priority: number;
  /** 注册时间 */
  timestamp: number;
}

// ===================== PluginHookManager =====================

/**
 * 插件钩子管理器
 *
 * 负责管理插件生命周期钩子的注册、卸载和执行。
 * 使用单例模式，通过 default 导出全局实例。
 */
class PluginHookManager {
  private static instance: PluginHookManager;

  /** 已注册的钩子（按类型分组） */
  private hooks: Map<HookType, RegisteredHook[]> = new Map();

  /** 插件 ID 到其注册的所有钩子类型的映射（用于快速卸载） */
  private pluginHookMap: Map<string, Set<HookType>> = new Map();

  private constructor() {}

  /**
   * 获取单例实例
   */
  static getInstance(): PluginHookManager {
    if (!PluginHookManager.instance) {
      PluginHookManager.instance = new PluginHookManager();
    }
    return PluginHookManager.instance;
  }

  /**
   * 注册钩子
   *
   * @param pluginId - 插件 ID
   * @param hookType - 钩子类型
   * @param handler - 钩子处理函数
   * @param priority - 优先级（数值越小优先级越高，默认 100）
   */
  registerHook(
    pluginId: string,
    hookType: HookType,
    handler: HookHandler,
    priority: number = 100,
  ): void {
    if (!pluginId) {
      throw new Error('[PluginHooks] 注册钩子失败: pluginId 不能为空');
    }
    if (!hookType) {
      throw new Error('[PluginHooks] 注册钩子失败: hookType 不能为空');
    }
    if (typeof handler !== 'function') {
      throw new Error('[PluginHooks] 注册钩子失败: handler 必须是函数');
    }

    const registeredHook: RegisteredHook = {
      pluginId,
      hookType,
      handler,
      priority,
      timestamp: Date.now(),
    };

    // 添加到对应类型的钩子列表
    if (!this.hooks.has(hookType)) {
      this.hooks.set(hookType, []);
    }
    const hookList = this.hooks.get(hookType)!;
    hookList.push(registeredHook);

    // 按优先级排序（数值小的在前，同优先级按注册时间先后）
    hookList.sort((a, b) => {
      if (a.priority !== b.priority) {
        return a.priority - b.priority;
      }
      return a.timestamp - b.timestamp;
    });

    // 更新插件钩子映射
    if (!this.pluginHookMap.has(pluginId)) {
      this.pluginHookMap.set(pluginId, new Set());
    }
    this.pluginHookMap.get(pluginId)!.add(hookType);

    logger.debug(`[PluginHooks] 插件 '${pluginId}' 注册钩子 '${hookType}'（优先级: ${priority}）`);
  }

  /**
   * 卸载指定插件的所有钩子
   *
   * @param pluginId - 插件 ID
   */
  unregisterHooks(pluginId: string): void {
    const hookTypes = this.pluginHookMap.get(pluginId);
    if (!hookTypes) {
      return;
    }

    for (const hookType of hookTypes) {
      const hookList = this.hooks.get(hookType);
      if (hookList) {
        const filtered = hookList.filter((h) => h.pluginId !== pluginId);
        if (filtered.length > 0) {
          this.hooks.set(hookType, filtered);
        } else {
          this.hooks.delete(hookType);
        }
      }
    }

    this.pluginHookMap.delete(pluginId);
    logger.debug(`[PluginHooks] 已卸载插件 '${pluginId}' 的所有钩子`);
  }

  /**
   * 串行执行某类型的所有钩子
   *
   * 按优先级顺序依次执行，支持短路和上下文修改。
   * 如果某个钩子返回 stopPropagation，则停止执行后续钩子。
   * 如果某个钩子返回 modified，则修改后的数据会传递给下一个钩子。
   * 单个钩子抛出的错误会被捕获并记录，不影响其他钩子执行。
   *
   * @param hookType - 钩子类型
   * @param context - 钩子上下文
   * @returns 最终的钩子结果（包含最后一个钩子的 modified 和是否被短路）
   */
  async executeHooks(hookType: HookType, context: HookContext): Promise<HookResult> {
    const hookList = this.hooks.get(hookType);
    if (!hookList || hookList.length === 0) {
      return {};
    }

    let currentContext = { ...context };
    let lastModified: unknown = undefined as unknown;
    let stopped = false;

    for (const hook of hookList) {
      try {
        const result = await Promise.resolve(hook.handler(currentContext));

        if (result && typeof result === 'object') {
          // 如果返回了 modified，更新当前上下文（用于传递给下一个钩子）
          if (result.modified !== undefined) {
            lastModified = result.modified;
            currentContext = this.mergeContext(currentContext, result.modified);
          }

          // 如果返回了 stopPropagation，停止执行后续钩子
          if (result.stopPropagation) {
            logger.debug(
              `[PluginHooks] 钩子 '${hookType}' 被插件 '${hook.pluginId}' 短路`
            );
            stopped = true;
            break;
          }
        }
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        logger.error(
          `[PluginHooks] 插件 '${hook.pluginId}' 的钩子 '${hookType}' 执行失败: ${errorMsg}`,
          err
        );
      }
    }

    return {
      stopPropagation: stopped,
      modified: lastModified,
    };
  }

  /**
   * 异步并行执行某类型的所有钩子
   *
   * 同时执行所有钩子，不保证顺序，不支持短路和上下文传递。
   * 所有钩子的错误都会被隔离捕获。
   *
   * @param hookType - 钩子类型
   * @param context - 钩子上下文
   * @returns 所有钩子的执行结果数组
   */
  async executeHooksAsync(
    hookType: HookType,
    context: HookContext
  ): Promise<Array<{ pluginId: string; result: HookResult | null; error?: string }>> {
    const hookList = this.hooks.get(hookType);
    if (!hookList || hookList.length === 0) {
      return [];
    }

    const promises = hookList.map(async (hook) => {
      try {
        const result = await Promise.resolve(hook.handler(context));
        return {
          pluginId: hook.pluginId,
          result: (result && typeof result === 'object' ? result : null) as HookResult | null,
        };
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        logger.error(
          `[PluginHooks] 插件 '${hook.pluginId}' 的钩子 '${hookType}' 执行失败: ${errorMsg}`,
          err
        );
        return {
          pluginId: hook.pluginId,
          result: null,
          error: errorMsg,
        };
      }
    });

    return Promise.all(promises);
  }

  /**
   * 获取所有注册的钩子
   *
   * @returns 按类型分组的所有已注册钩子信息
   */
  getRegisteredHooks(): Record<HookType, Array<{ pluginId: string; priority: number }>> {
    const result: Record<string, Array<{ pluginId: string; priority: number }>> = {};

    for (const [hookType, hookList] of this.hooks) {
      result[hookType] = hookList.map((h) => ({
        pluginId: h.pluginId,
        priority: h.priority,
      }));
    }

    return result as Record<HookType, Array<{ pluginId: string; priority: number }>>;
  }

  /**
   * 获取指定插件注册的所有钩子类型
   *
   * @param pluginId - 插件 ID
   * @returns 该插件注册的钩子类型数组
   */
  getPluginHooks(pluginId: string): HookType[] {
    const hookTypes = this.pluginHookMap.get(pluginId);
    return hookTypes ? Array.from(hookTypes) : [];
  }

  /**
   * 检查某类型是否有已注册的钩子
   *
   * @param hookType - 钩子类型
   * @returns 是否有已注册的钩子
   */
  hasHooks(hookType: HookType): boolean {
    const hookList = this.hooks.get(hookType);
    return !!hookList && hookList.length > 0;
  }

  /**
   * 清除所有已注册的钩子（主要用于测试）
   */
  clearAllHooks(): void {
    this.hooks.clear();
    this.pluginHookMap.clear();
    logger.debug('[PluginHooks] 已清除所有钩子');
  }

  // ===================== 内部方法 =====================

  /**
   * 合并上下文数据
   *
   * 将 modified 数据智能合并到当前上下文中。
   * 如果 modified 是对象，则浅合并；否则直接替换 message/result 等字段。
   *
   * @param context - 当前上下文
   * @param modified - 修改后的数据
   * @returns 合并后的新上下文
   */
  private mergeContext(context: HookContext, modified: unknown): HookContext {
    const newContext = { ...context };

    if (modified && typeof modified === 'object' && !Array.isArray(modified)) {
      // 如果 modified 是对象，尝试智能合并
      const mod = modified as Record<string, unknown>;

      // 如果有 message 字段，替换 message
      if ('message' in mod && mod.message !== undefined) {
        newContext.message = mod.message as Record<string, unknown>;
      }
      // 如果有 messages 字段，替换 messages
      if ('messages' in mod && mod.messages !== undefined) {
        newContext.messages = mod.messages as Array<Record<string, unknown>>;
      }
      // 如果有 toolResult 字段，替换 toolResult
      if ('toolResult' in mod && mod.toolResult !== undefined) {
        newContext.toolResult = mod.toolResult;
      }
      // 如果有 aiResult 字段，替换 aiResult
      if ('aiResult' in mod && mod.aiResult !== undefined) {
        newContext.aiResult = mod.aiResult;
      }
      // 如果有 result 字段，替换 result
      if ('result' in mod && mod.result !== undefined) {
        newContext.result = mod.result;
      }
      // 合并 extra
      if ('extra' in mod && mod.extra !== undefined) {
        newContext.extra = {
          ...(newContext.extra ?? {}),
          ...(mod.extra as Record<string, unknown>),
        };
      }
    } else {
      // 非对象类型的 modified，根据钩子类型推断要修改的字段
      // 这里不做自动推断，交由调用方处理
      newContext.extra = {
        ...(newContext.extra ?? {}),
        __modified: modified,
      };
    }

    return newContext;
  }
}

// ===================== 单例导出 =====================

/** 全局插件钩子管理器实例 */
const pluginHooks = PluginHookManager.getInstance();

export { pluginHooks };

export default pluginHooks;
