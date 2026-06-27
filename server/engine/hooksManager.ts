/**
 * Hooks System
 * Hooks 插件系统 - 可扩展的钩子机制
 */

export type HookType =
  | "before_message_send"
  | "after_message_send"
  | "before_tool_call"
  | "after_tool_call"
  | "before_turn_start"
  | "after_turn_complete"
  | "after_turn_failed"
  | "session_created"
  | "session_closed"
  | "config_changed"
  | "cron_triggered"
  | "cron_completed"
  | "memory_added"
  | "memory_searched";

export type HookHandler<T = unknown> = (
  context: T,
) => Promise<T | void> | T | void;

export interface HookRegistration {
  id: string;
  type: HookType;
  handler: HookHandler;
  priority: number;
  enabled: boolean;
  pluginId?: string;
  createdAt: number;
}

export interface HookContext {
  sessionKey?: string;
  userId?: string;
  timestamp: number;
  [key: string]: unknown;
}

class HooksManager {
  private readonly hooks = new Map<string, HookRegistration[]>();
  private readonly pluginHooks = new Map<string, string[]>();

  // ========== Hook Registration ==========

  register<T extends HookContext>(
    type: HookType,
    handler: HookHandler<T>,
    options?: {
      id?: string;
      priority?: number;
      pluginId?: string;
    },
  ): string {
    const id = options?.id ?? `hook_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    const registration: HookRegistration = {
      id,
      type,
      handler: handler as HookHandler,
      priority: options?.priority ?? 50,
      enabled: true,
      pluginId: options?.pluginId,
      createdAt: Date.now(),
    };

    let hookList = this.hooks.get(type);
    if (!hookList) {
      hookList = [];
      this.hooks.set(type, hookList);
    }

    hookList.push(registration);
    hookList.sort((a, b) => b.priority - a.priority);

    // 跟踪插件的 hooks
    if (options?.pluginId) {
      let pluginHookIds = this.pluginHooks.get(options.pluginId);
      if (!pluginHookIds) {
        pluginHookIds = [];
        this.pluginHooks.set(options.pluginId, pluginHookIds);
      }
      pluginHookIds.push(id);
    }

    return id;
  }

  unregister(hookId: string): boolean {
    for (const [type, hookList] of this.hooks) {
      const index = hookList.findIndex((h) => h.id === hookId);
      if (index >= 0) {
        const hook = hookList[index];
        hookList.splice(index, 1);

        // 从插件跟踪中移除
        if (hook.pluginId) {
          const pluginHookIds = this.pluginHooks.get(hook.pluginId);
          if (pluginHookIds) {
            const idx = pluginHookIds.indexOf(hookId);
            if (idx >= 0) pluginHookIds.splice(idx, 1);
          }
        }

        return true;
      }
    }
    return false;
  }

  unregisterPlugin(pluginId: string): number {
    const pluginHookIds = this.pluginHooks.get(pluginId);
    if (!pluginHookIds) return 0;

    let removed = 0;
    for (const hookId of [...pluginHookIds]) {
      if (this.unregister(hookId)) {
        removed++;
      }
    }

    this.pluginHooks.delete(pluginId);
    return removed;
  }

  // ========== Hook Execution ==========

  async trigger<T extends HookContext>(type: HookType, context: T): Promise<T> {
    const hookList = this.hooks.get(type);
    if (!hookList || hookList.length === 0) {
      return context;
    }

    let currentContext = { ...context };

    for (const hook of hookList) {
      if (!hook.enabled) continue;

      try {
        const result = await hook.handler(currentContext);
        if (result !== undefined && result !== null) {
          currentContext = { ...currentContext, ...(result as Record<string, unknown>) } as T;
        }
      } catch (error) {
        console.error(`[hooks] Hook ${hook.id} (${type}) failed:`, error);
        // 继续执行其他 hooks
      }
    }

    return currentContext;
  }

  triggerSync<T extends HookContext>(type: HookType, context: T): T {
    const hookList = this.hooks.get(type);
    if (!hookList || hookList.length === 0) {
      return context;
    }

    let currentContext = { ...context };

    for (const hook of hookList) {
      if (!hook.enabled) continue;

      try {
        const result = hook.handler(currentContext);
        if (result !== undefined && result !== null && typeof result === "object") {
          currentContext = { ...currentContext, ...(result as Record<string, unknown>) } as T;
        }
      } catch (error) {
        console.error(`[hooks] Hook ${hook.id} (${type}) failed:`, error);
      }
    }

    return currentContext;
  }

  // ========== Query ==========

  listHooks(type?: HookType, pluginId?: string): HookRegistration[] {
    let result: HookRegistration[] = [];

    if (type) {
      result = [...(this.hooks.get(type) ?? [])];
    } else {
      for (const hookList of this.hooks.values()) {
        result.push(...hookList);
      }
    }

    if (pluginId) {
      result = result.filter((h) => h.pluginId === pluginId);
    }

    return result.sort((a, b) => b.priority - a.priority || a.createdAt - b.createdAt);
  }

  getHook(hookId: string): HookRegistration | undefined {
    for (const hookList of this.hooks.values()) {
      const hook = hookList.find((h) => h.id === hookId);
      if (hook) return hook;
    }
    return undefined;
  }

  enableHook(hookId: string): boolean {
    const hook = this.getHook(hookId);
    if (!hook) return false;
    hook.enabled = true;
    return true;
  }

  disableHook(hookId: string): boolean {
    const hook = this.getHook(hookId);
    if (!hook) return false;
    hook.enabled = false;
    return true;
  }

  // ========== Plugin Management ==========

  listPluginHooks(pluginId: string): HookRegistration[] {
    return this.listHooks(undefined, pluginId);
  }

  hasPluginHooks(pluginId: string): boolean {
    return (this.pluginHooks.get(pluginId)?.length ?? 0) > 0;
  }

  // ========== Stats ==========

  getStats(): {
    totalHooks: number;
    byType: Record<string, number>;
    enabled: number;
    disabled: number;
    plugins: number;
  } {
    const byType: Record<string, number> = {};
    let enabled = 0;
    let disabled = 0;

    for (const [type, hookList] of this.hooks) {
      byType[type] = hookList.length;
      for (const hook of hookList) {
        if (hook.enabled) enabled++;
        else disabled++;
      }
    }

    return {
      totalHooks: Array.from(this.hooks.values()).reduce((sum, list) => sum + list.length, 0),
      byType,
      enabled,
      disabled,
      plugins: this.pluginHooks.size,
    };
  }

  clear(): void {
    this.hooks.clear();
    this.pluginHooks.clear();
  }
}

const HOOKS_INSTANCE = new HooksManager();

export function getHooksManager(): HooksManager {
  return HOOKS_INSTANCE;
}

export function registerHook<T extends HookContext>(
  type: HookType,
  handler: HookHandler<T>,
  options?: Parameters<HooksManager["register"]>[2],
): string {
  return HOOKS_INSTANCE.register(type, handler, options);
}

export function unregisterHook(hookId: string): boolean {
  return HOOKS_INSTANCE.unregister(hookId);
}

export async function triggerHook<T extends HookContext>(
  type: HookType,
  context: T,
): Promise<T> {
  return HOOKS_INSTANCE.trigger(type, context);
}

export function resetHooksForTests(): void {
  HOOKS_INSTANCE.clear();
}

export type { HooksManager };
