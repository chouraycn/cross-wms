// 移植自 openclaw/src/infra/package-json.ts

export function readPackageJson(...args: unknown[]): unknown {
  return undefined;
}
export function readPackageVersion(...args: unknown[]): Promise<string | null> {
  return Promise.resolve("");
}
export function readPackageName(...args: unknown[]): unknown {
  return undefined;
}
export function readPackageManagerSpec(...args: unknown[]): unknown {
  return undefined;
}
