// 移植自 openclaw/src/config/sensitive-paths.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export function isSensitiveConfigPath(...args: unknown[]): unknown {
  throw new Error("not implemented: isSensitiveConfigPath");
}
