/**
 * Plugin host cleanup — clears plugin-owned session state.
 *
 * 移植自 openclaw/src/plugins/host-hook-cleanup.ts。
 * 降级策略：运行时函数降级为空操作。
 */

export function clearPluginOwnedSessionState(params: {
  sessionId?: string;
  pluginId?: string;
}): void {
  void params;
}

export type PluginHostCleanupFailure = {
  pluginId: string;
  reason: string;
  error?: unknown;
};

export type PluginHostCleanupResult = {
  cleared: string[];
  failures: PluginHostCleanupFailure[];
};

export async function runPluginHostCleanup(params: {
  sessionId?: string;
  pluginIds?: string[];
  reason?: string;
}): Promise<PluginHostCleanupResult> {
  void params;
  return { cleared: [], failures: [] };
}

export async function cleanupReplacedPluginHostRegistry(params: {
  replacedPluginIds?: string[];
  sessionId?: string;
  cfg?: unknown;
  previousRegistry?: unknown;
  nextRegistry?: unknown;
  shouldCleanup?: () => boolean;
}): Promise<void> {
  void params;
}
