/**
 * Compiles plugin manifest schemas for validation without runtime loading.
 * 移植自 openclaw/src/plugins/schema-validator.ts。
 * 降级策略：依赖项未移植时，函数体降级为返回默认值或抛出 not implemented；
 * 类型定义保留形状供下游引用。
 */

export type JsonSchemaValue = unknown;

export type JsonSchemaValidationError = unknown;

export function validateJsonSchemaValue(...args: unknown[]): unknown {
  throw new Error("not implemented: validateJsonSchemaValue");
}

