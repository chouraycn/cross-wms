// 移植自 openclaw/src/config/io.observe-suspicious.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export type ConfigObserveSuspiciousBaseline = unknown;
export function resolveConfigObserveSuspiciousReasons(...args: unknown[]): unknown {
  throw new Error("not implemented: resolveConfigObserveSuspiciousReasons");
}
