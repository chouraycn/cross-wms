// 移植自 openclaw/src/infra/executable-path.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export function resolveExecutablePathCandidate(...args: unknown[]): unknown {
  throw new Error("not implemented: resolveExecutablePathCandidate");
}
export function isExecutableFile(...args: unknown[]): unknown {
  throw new Error("not implemented: isExecutableFile");
}
export function resolveExecutableFromPathEnv(...args: unknown[]): unknown {
  throw new Error("not implemented: resolveExecutableFromPathEnv");
}
export function resolveExecutablePath(...args: unknown[]): unknown {
  throw new Error("not implemented: resolveExecutablePath");
}
export function resolveExecutable(...args: unknown[]): unknown {
  throw new Error("not implemented: resolveExecutable");
}
