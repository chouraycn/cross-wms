// 移植自 openclaw/src/config/markdown-tables.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export type ResolveMarkdownTableMode = unknown;
export type ResolveMarkdownTableModeParams = unknown;
export function resolveMarkdownTableMode(...args: unknown[]): unknown {
  throw new Error("not implemented: resolveMarkdownTableMode");
}
