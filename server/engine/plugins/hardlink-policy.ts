/**
 * * Enforces plugin root hardlink policy with bundled and immutable Nix-store exceptions.
 * 移植自 openclaw/src/plugins/hardlink-policy.ts。
 * 降级策略：依赖项未移植时，函数体降级为返回默认值或抛出 not implemented；
 * 类型定义保留形状供下游引用。
 */

export function isNixStorePluginRoot(...args: unknown[]): unknown {
  throw new Error("not implemented: isNixStorePluginRoot");
}

export function shouldRejectHardlinkedPluginFiles(...args: unknown[]): unknown {
  throw new Error("not implemented: shouldRejectHardlinkedPluginFiles");
}

