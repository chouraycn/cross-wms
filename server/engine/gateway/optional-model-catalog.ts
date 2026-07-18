// 移植自 openclaw/src/gateway/server-methods/optional-model-catalog.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export type OptionalServerMethodModelCatalogLoad = unknown;

export function startOptionalServerMethodModelCatalogLoad(...args: unknown[]): unknown {
  throw new Error("not implemented: startOptionalServerMethodModelCatalogLoad");
}

export async function loadOptionalServerMethodModelCatalog(...args: unknown[]): Promise<unknown> {
  throw new Error("not implemented: loadOptionalServerMethodModelCatalog");
}
