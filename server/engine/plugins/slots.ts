/**
 * * Applies mutually exclusive plugin slot selection for memory and context-engine plugins.
 * 移植自 openclaw/src/plugins/slots.ts。
 * 降级策略：依赖项未移植时，函数体降级为返回默认值或抛出 not implemented；
 * 类型定义保留形状供下游引用。
 */

export type PluginSlotKey = unknown;

export function normalizeKinds(...args: unknown[]): unknown {
  throw new Error("not implemented: normalizeKinds");
}

export function hasKind(...args: unknown[]): unknown {
  throw new Error("not implemented: hasKind");
}

export function kindsEqual(...args: unknown[]): unknown {
  throw new Error("not implemented: kindsEqual");
}

export function slotKeysForPluginKind(...args: unknown[]): unknown {
  throw new Error("not implemented: slotKeysForPluginKind");
}

export function defaultSlotIdForKey(...args: unknown[]): unknown {
  throw new Error("not implemented: defaultSlotIdForKey");
}

export type SlotSelectionResult = unknown;

export function applyExclusiveSlotSelection(...args: unknown[]): unknown {
  throw new Error("not implemented: applyExclusiveSlotSelection");
}

