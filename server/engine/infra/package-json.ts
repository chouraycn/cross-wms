// 移植自 openclaw/src/infra/package-json.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export function readPackageJson(...args: unknown[]): unknown {
  throw new Error("not implemented: readPackageJson");
}
export function readPackageVersion(...args: unknown[]): Promise<string | null> {
  throw new Error("not implemented: readPackageVersion");
}
export function readPackageName(...args: unknown[]): unknown {
  throw new Error("not implemented: readPackageName");
}
export function readPackageManagerSpec(...args: unknown[]): unknown {
  throw new Error("not implemented: readPackageManagerSpec");
}
