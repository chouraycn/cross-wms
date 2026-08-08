/**
 * Plugin host-hook session extension state.
 *
 * 移植自 openclaw/src/plugins/host-hook-state.ts。
 * 降级策略：运行时函数降级为返回默认值。
 */

import type { PluginJsonValue } from "./host-hook-json.js";

export { clearPluginOwnedSessionState } from "./host-hook-cleanup.js";

export async function enqueuePluginNextTurnInjection(params: {
  sessionId: string;
  pluginId: string;
  injection: any;
  placement?: string;
}): Promise<{ enqueued: boolean }> {
  void params;
  return { enqueued: false };
}

export async function drainPluginNextTurnInjections(params: {
  sessionId: string;
}): Promise<{ injections: any[] }> {
  void params;
  return { injections: [] };
}

export async function drainPluginNextTurnInjectionContext(params: {
  sessionId: string;
}): Promise<{ context: any[] }> {
  void params;
  return { context: [] };
}

export function getPluginSessionExtensionStateSync(params: {
  sessionId?: string;
  pluginId?: string;
  cfg?: any;
  sessionKey?: string;
}): Record<string, PluginJsonValue> | undefined {
  void params;
  return undefined;
}

export async function patchPluginSessionExtension(params: {
  sessionId: string;
  pluginId: string;
  patch: any;
}): Promise<void> {
  void params;
}

export async function projectPluginSessionExtensions(params: {
  sessionId: string;
  pluginIds?: string[];
}): Promise<{ projections: Record<string, any> }> {
  void params;
  return { projections: {} };
}

export function projectPluginSessionExtensionsSync(params: {
  sessionId: string;
  pluginIds?: string[];
}): Record<string, any> {
  void params;
  return {};
}
