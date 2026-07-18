// 移植自 openclaw/src/config/defaults.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export function resolveNormalizedProviderModelMaxTokens(...args: unknown[]): unknown {
  throw new Error("not implemented: resolveNormalizedProviderModelMaxTokens");
}
export function applyMessageDefaults(...args: unknown[]): unknown {
  throw new Error("not implemented: applyMessageDefaults");
}
export function applySessionDefaults(...args: unknown[]): unknown {
  throw new Error("not implemented: applySessionDefaults");
}
export function applyTalkConfigNormalization(...args: unknown[]): unknown {
  throw new Error("not implemented: applyTalkConfigNormalization");
}
export function applyModelDefaults(...args: unknown[]): unknown {
  throw new Error("not implemented: applyModelDefaults");
}
export function applyAgentDefaults(...args: unknown[]): unknown {
  throw new Error("not implemented: applyAgentDefaults");
}
export function applyCronDefaults(...args: unknown[]): unknown {
  throw new Error("not implemented: applyCronDefaults");
}
export function applyLoggingDefaults(...args: unknown[]): unknown {
  throw new Error("not implemented: applyLoggingDefaults");
}
export function applyContextPruningDefaults(...args: unknown[]): unknown {
  throw new Error("not implemented: applyContextPruningDefaults");
}
export function applyCompactionDefaults(...args: unknown[]): unknown {
  throw new Error("not implemented: applyCompactionDefaults");
}
