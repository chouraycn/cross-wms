/**
 * Shares plugin runtime workspace state across module reloads.
 * 移植自 openclaw/src/plugins/runtime-workspace-state.ts。
 * 降级策略：保留 AsyncLocalStorage 与全局 Symbol 状态结构；resolveGlobalSingleton
 * 降级为内联实现的进程级单例映射。
 */
import { AsyncLocalStorage } from "node:async_hooks";

const PLUGIN_REGISTRY_STATE = Symbol.for("openclaw.pluginRegistryState");
const PINNED_PLUGIN_REGISTRY_WORKSPACE_KEY = Symbol.for(
  "openclaw.pinnedPluginRegistryWorkspaceDir",
);

type GlobalRegistryWorkspaceState = typeof globalThis & {
  [PLUGIN_REGISTRY_STATE]?: {
    workspaceDir?: string | null;
  };
  [PINNED_PLUGIN_REGISTRY_WORKSPACE_KEY]?: AsyncLocalStorage<{
    workspaceDir: string | undefined;
  }>;
};

/** 内联实现的进程级单例解析器（替代 ../shared/global-singleton.js）。 */
function resolveGlobalSingleton<T>(
  key: symbol,
  factory: () => T,
): T {
  const store = globalThis as GlobalRegistryWorkspaceState & {
    [k: symbol]: unknown;
  };
  const existing = (store as Record<symbol, unknown>)[key];
  if (existing) {
    return existing as T;
  }
  const value = factory();
  (store as Record<symbol, unknown>)[key] = value;
  return value;
}

const pinnedWorkspaceDirStorage = resolveGlobalSingleton<
  AsyncLocalStorage<{ workspaceDir: string | undefined }>
>(PINNED_PLUGIN_REGISTRY_WORKSPACE_KEY, () => new AsyncLocalStorage());

/** 读取当前活动的插件注册表工作目录，优先返回异步上下文中 pin 的快照。 */
export function getActivePluginRegistryWorkspaceDirFromState(): string | undefined {
  const pinned = pinnedWorkspaceDirStorage.getStore();
  if (pinned) {
    return pinned.workspaceDir;
  }
  return (
    (globalThis as GlobalRegistryWorkspaceState)[PLUGIN_REGISTRY_STATE]?.workspaceDir ?? undefined
  );
}

/** 在 fn 执行期间 pin 当前插件注册表的工作目录，避免迭代场景下被并发改动重置。 */
export function withPinnedActivePluginRegistryWorkspaceDir<T>(fn: () => T): T {
  if (pinnedWorkspaceDirStorage.getStore()) {
    return fn();
  }
  const workspaceDir =
    (globalThis as GlobalRegistryWorkspaceState)[PLUGIN_REGISTRY_STATE]?.workspaceDir ?? undefined;
  return pinnedWorkspaceDirStorage.run({ workspaceDir }, fn);
}
