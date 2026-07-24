import { logger } from '../../logger.js';

export type PluginSourceRoots = {
  stock?: string;
  global: string;
  workspace?: string;
};

export interface PluginRoot {
  path: string;
  name?: string;
  priority: number;
}

const pluginRoots: PluginRoot[] = [];

export function addPluginRoot(path: string, options?: { name?: string; priority?: number }): void {
  const root: PluginRoot = {
    path,
    name: options?.name,
    priority: options?.priority ?? pluginRoots.length,
  };
  pluginRoots.push(root);
  pluginRoots.sort((a, b) => a.priority - b.priority);
  logger.debug(`[Plugins:Roots] Added plugin root: ${path}`);
}

export function resolvePluginRoots(): PluginRoot[] {
  return [...pluginRoots];
}

export function getPluginRoot(name?: string): PluginRoot | undefined {
  if (!name) {
    return pluginRoots[0];
  }
  return pluginRoots.find(r => r.name === name);
}

export function removePluginRoot(path: string): void {
  const idx = pluginRoots.findIndex(r => r.path === path);
  if (idx !== -1) {
    pluginRoots.splice(idx, 1);
    logger.debug(`[Plugins:Roots] Removed plugin root: ${path}`);
  }
}

export function clearPluginRoots(): void {
  pluginRoots.length = 0;
}

// Auto-generated stub exports (added by auto-fix-exports.mjs)
export const resolvePluginSourceRoots: (...args: unknown[]) => any = undefined as unknown as (...args: unknown[]) => any;
