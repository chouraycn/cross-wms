/**
 * Registers plugin-provided models into the model catalog.
 * 移植自 openclaw/src/plugins/model-catalog-registration.ts。
 * 降级策略：依赖项未移植时，函数体降级为返回默认值或抛出 not implemented；
 * 类型定义保留形状供下游引用。
 */

export function createModelCatalogRegistrationHandlers(...args: unknown[]): unknown {
  throw new Error("not implemented: createModelCatalogRegistrationHandlers");
}

