// 移植自 openclaw/src/gateway/server-methods/tools-catalog.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export function buildToolsCatalogResult(...args: unknown[]): unknown {
  throw new Error("not implemented: buildToolsCatalogResult");
}

export const toolsCatalogHandlers: unknown = undefined;
