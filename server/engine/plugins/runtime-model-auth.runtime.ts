// 移植自 openclaw/src/plugins/runtime-model-auth.runtime.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export function getApiKeyForModel(...args: unknown[]): unknown {
  throw new Error("not implemented: getApiKeyForModel");
}
export function resolveApiKeyForProvider(...args: unknown[]): unknown {
  throw new Error("not implemented: resolveApiKeyForProvider");
}
export function getRuntimeAuthForModel(...args: unknown[]): unknown {
  throw new Error("not implemented: getRuntimeAuthForModel");
}
