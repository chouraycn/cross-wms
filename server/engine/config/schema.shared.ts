// 移植自 openclaw/src/config/schema.shared.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export function cloneSchema(...args: unknown[]): unknown {
  throw new Error("not implemented: cloneSchema");
}
export function asSchemaObject(...args: unknown[]): unknown {
  throw new Error("not implemented: asSchemaObject");
}
export function schemaHasChildren(...args: unknown[]): unknown {
  throw new Error("not implemented: schemaHasChildren");
}
export function findWildcardHintMatch(...args: unknown[]): unknown {
  throw new Error("not implemented: findWildcardHintMatch");
}
