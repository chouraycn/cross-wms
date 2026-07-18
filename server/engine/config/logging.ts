// 移植自 openclaw/src/config/logging.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export function formatConfigPath(...args: unknown[]): unknown {
  throw new Error("not implemented: formatConfigPath");
}
export function formatConfigUpdatedMessage(...args: unknown[]): unknown {
  throw new Error("not implemented: formatConfigUpdatedMessage");
}
export function logConfigUpdated(...args: unknown[]): unknown {
  throw new Error("not implemented: logConfigUpdated");
}
