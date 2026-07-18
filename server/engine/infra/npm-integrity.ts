// 移植自 openclaw/src/infra/npm-integrity.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export type NpmIntegrityDriftPayload = unknown;
export function resolveNpmIntegrityDrift(...args: unknown[]): unknown {
  throw new Error("not implemented: resolveNpmIntegrityDrift");
}
export function resolveNpmIntegrityDriftWithDefaultMessage(...args: unknown[]): unknown {
  throw new Error("not implemented: resolveNpmIntegrityDriftWithDefaultMessage");
}
