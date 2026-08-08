// 移植自 openclaw/src/infra/package-json.ts

export function readPackageJson(...args: any[]): any {
  return undefined;
}
export function readPackageVersion(...args: any[]): Promise<string | null> {
  return Promise.resolve("");
}
export function readPackageName(...args: any[]): any {
  return undefined;
}
export function readPackageManagerSpec(...args: any[]): any {
  return undefined;
}
