/** Tracks active and retired plugin registries so stale runtime calls can be rejected. */
//
// 移植自 openclaw/src/plugins/registry-lifecycle.ts。
//
// 降级策略：仅依赖 ./registry-types.js 的 PluginRegistry 类型。cross-wms 已
// 在本批移植中创建降级版 registry-types.ts，直接引用。行为与 openclaw 原版
// 一致：使用 WeakSet 跟踪已激活/已退役的注册表，用于拒绝过期运行时调用。

import type { PluginRegistry } from "./registry-types.js";

const retiredRegistries = new WeakSet<PluginRegistry>();
const activatedRegistries = new WeakSet<PluginRegistry>();

/** Marks a registry retired so late runtime calls can reject stale plugin state. */
export function markPluginRegistryRetired(registry: PluginRegistry | null | undefined): void {
  if (registry) {
    retiredRegistries.add(registry);
  }
}

/** Marks a registry active and clears any previous retired state. */
export function markPluginRegistryActive(registry: PluginRegistry | null | undefined): void {
  if (registry) {
    activatedRegistries.add(registry);
    retiredRegistries.delete(registry);
  }
}

/** True when a registry has been activated for runtime use. */
export function isPluginRegistryActivated(registry: PluginRegistry): boolean {
  return activatedRegistries.has(registry);
}

/** True when a registry has been retired by a newer active registry. */
export function isPluginRegistryRetired(registry: PluginRegistry): boolean {
  return retiredRegistries.has(registry);
}
