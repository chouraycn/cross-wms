// 移植自 openclaw/src/infra/sanitize-text.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export function stripInternalRuntimeScaffolding(...args: unknown[]): unknown {
  throw new Error("not implemented: stripInternalRuntimeScaffolding");
}
export function sanitizeForPlainText(...args: unknown[]): unknown {
  throw new Error("not implemented: sanitizeForPlainText");
}
