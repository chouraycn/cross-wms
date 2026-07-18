import { logger } from "../../../logger.js";
import type { PluginHookType, PluginHookHandler, PluginHookContext } from "./types.js";

const hookHandlers = new Map<PluginHookType, Array<{ handler: PluginHookHandler; priority: number }>>();

export function registerHook(hookType: PluginHookType, handler: PluginHookHandler, priority: number = 100): void {
  const handlers = hookHandlers.get(hookType) ?? [];
  handlers.push({ handler, priority });
  handlers.sort((a, b) => a.priority - b.priority);
  hookHandlers.set(hookType, handlers);
  logger.debug(`[ChannelPlugins:Hooks] Registered hook ${hookType} with priority ${priority}`);
}

export function unregisterHook(hookType: PluginHookType, handler: PluginHookHandler): boolean {
  const handlers = hookHandlers.get(hookType);
  if (!handlers) return false;

  const idx = handlers.findIndex((h) => h.handler === handler);
  if (idx === -1) return false;

  handlers.splice(idx, 1);
  logger.debug(`[ChannelPlugins:Hooks] Unregistered hook ${hookType}`);
  return true;
}

export function getHookHandlers(hookType: PluginHookType): PluginHookHandler[] {
  return (hookHandlers.get(hookType) ?? []).map((h) => h.handler);
}

export async function emitHook(context: PluginHookContext): Promise<void> {
  const handlers = getHookHandlers(context.hookType);
  if (handlers.length === 0) return;

  logger.debug(`[ChannelPlugins:Hooks] Emitting ${context.hookType} for ${context.pluginId}`);

  for (const handler of handlers) {
    try {
      await handler(context);
    } catch (error) {
      logger.error(`[ChannelPlugins:Hooks] Handler failed for ${context.hookType}`, { error });
    }
  }
}

export async function emitHooks(hookTypes: PluginHookType[], context: Omit<PluginHookContext, "hookType">): Promise<void> {
  for (const hookType of hookTypes) {
    await emitHook({ ...context, hookType });
  }
}

export function clearHooks(hookType?: PluginHookType): void {
  if (hookType) {
    hookHandlers.delete(hookType);
    logger.debug(`[ChannelPlugins:Hooks] Cleared hooks for ${hookType}`);
  } else {
    hookHandlers.clear();
    logger.debug(`[ChannelPlugins:Hooks] All hooks cleared`);
  }
}

export function getHookCount(hookType?: PluginHookType): number {
  if (hookType) {
    return hookHandlers.get(hookType)?.length ?? 0;
  }
  return Array.from(hookHandlers.values()).reduce((sum, handlers) => sum + handlers.length, 0);
}