import { logger } from '../../logger.js';
import type { Hook, HookHandler } from './types.js';

export interface PluginHookInfo {
  pluginId: string;
  hooks: Hook[];
}

const pluginHooks = new Map<string, PluginHookInfo>();

export function registerPluginHooks(pluginId: string, hooks: Hook[]): void {
  pluginHooks.set(pluginId, { pluginId, hooks });
  logger.debug(`[hooks:Plugin] Registered ${hooks.length} hooks for plugin ${pluginId}`);
}

export function getPluginHooks(pluginId: string): PluginHookInfo | undefined {
  return pluginHooks.get(pluginId);
}

export function getAllPluginHooks(): PluginHookInfo[] {
  return Array.from(pluginHooks.values());
}

export function unregisterPluginHooks(pluginId: string): void {
  pluginHooks.delete(pluginId);
  logger.debug(`[hooks:Plugin] Unregistered hooks for plugin ${pluginId}`);
}

export function unregisterAllPluginHooks(): void {
  pluginHooks.clear();
  logger.debug('[hooks:Plugin] All plugin hooks unregistered');
}

export interface PluginHookRegistration {
  pluginId: string;
  hookName: string;
  handler: HookHandler;
}

const pluginHookHandlers = new Map<string, PluginHookRegistration[]>();

export function registerPluginHookHandler(
  pluginId: string,
  hookName: string,
  handler: HookHandler
): void {
  const key = `${pluginId}:${hookName}`;
  const registrations = pluginHookHandlers.get(key) ?? [];
  registrations.push({ pluginId, hookName, handler });
  pluginHookHandlers.set(key, registrations);
  logger.debug(`[hooks:Plugin] Registered handler for ${key}`);
}

export function getPluginHookHandlers(pluginId: string, hookName: string): HookHandler[] {
  const key = `${pluginId}:${hookName}`;
  return (pluginHookHandlers.get(key) ?? []).map(r => r.handler);
}

export function unregisterPluginHookHandler(
  pluginId: string,
  hookName: string,
  handler?: HookHandler
): void {
  const key = `${pluginId}:${hookName}`;
  const registrations = pluginHookHandlers.get(key);
  
  if (!registrations) return;
  
  if (handler) {
    const idx = registrations.findIndex(r => r.handler === handler);
    if (idx !== -1) {
      registrations.splice(idx, 1);
    }
  } else {
    pluginHookHandlers.delete(key);
  }
  
  logger.debug(`[hooks:Plugin] Unregistered handler for ${key}`);
}