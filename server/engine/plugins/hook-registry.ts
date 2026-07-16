import { logger } from '../../logger.js';

export interface PluginHookRegistration {
  id: string;
  pluginId: string;
  hookName: string;
  priority: number;
  enabled: boolean;
  metadata?: Record<string, unknown>;
}

const hookRegistrations: PluginHookRegistration[] = [];

export function registerPluginHook(reg: Omit<PluginHookRegistration, 'id'>): string {
  const id = `${reg.pluginId}:${reg.hookName}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;
  hookRegistrations.push({ id, ...reg });
  hookRegistrations.sort((a, b) => b.priority - a.priority);
  logger.debug(`[Plugins:HookRegistry] Registered ${id} (${reg.pluginId}.${reg.hookName})`);
  return id;
}

export function unregisterPluginHook(id: string): boolean {
  const idx = hookRegistrations.findIndex((h) => h.id === id);
  if (idx === -1) return false;
  hookRegistrations.splice(idx, 1);
  return true;
}

export function unregisterPluginHooksByPlugin(pluginId: string): number {
  let count = 0;
  for (let i = hookRegistrations.length - 1; i >= 0; i--) {
    if (hookRegistrations[i].pluginId === pluginId) {
      hookRegistrations.splice(i, 1);
      count++;
    }
  }
  return count;
}

export function getHooksForName(hookName: string): PluginHookRegistration[] {
  return hookRegistrations.filter((h) => h.hookName === hookName && h.enabled);
}

export function getHooksByPlugin(pluginId: string): PluginHookRegistration[] {
  return hookRegistrations.filter((h) => h.pluginId === pluginId);
}

export function enablePluginHook(id: string): boolean {
  const hook = hookRegistrations.find((h) => h.id === id);
  if (!hook) return false;
  hook.enabled = true;
  return true;
}

export function disablePluginHook(id: string): boolean {
  const hook = hookRegistrations.find((h) => h.id === id);
  if (!hook) return false;
  hook.enabled = false;
  return true;
}

export function listAllPluginHooks(): PluginHookRegistration[] {
  return [...hookRegistrations];
}
