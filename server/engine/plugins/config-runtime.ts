// 移植自 openclaw/src/plugins/config-runtime.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export function getRuntimeConfigSnapshot(...args: unknown[]): unknown {
  throw new Error("not implemented: getRuntimeConfigSnapshot");
}
export type resolveActiveTalkProviderConfig = unknown;
