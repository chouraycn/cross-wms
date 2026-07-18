// 移植自 openclaw/src/gateway/server-methods/validation.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export type Validator = unknown;

export function assertValidParams(...args: unknown[]): unknown {
  throw new Error("not implemented: assertValidParams");
}
