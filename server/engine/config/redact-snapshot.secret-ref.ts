// 移植自 openclaw/src/config/redact-snapshot.secret-ref.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export function isSecretRefShape(...args: unknown[]): unknown {
  throw new Error("not implemented: isSecretRefShape");
}
export function redactSecretRefId(...args: unknown[]): unknown {
  throw new Error("not implemented: redactSecretRefId");
}
