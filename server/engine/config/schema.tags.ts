// 移植自 openclaw/src/config/schema.tags.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export type ConfigTag = unknown;
export function deriveTagsForPath(...args: unknown[]): unknown {
  throw new Error("not implemented: deriveTagsForPath");
}
export function applyDerivedTags(...args: unknown[]): unknown {
  throw new Error("not implemented: applyDerivedTags");
}
export const CONFIG_TAGS: unknown = undefined;
