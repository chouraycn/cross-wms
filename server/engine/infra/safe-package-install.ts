// 移植自 openclaw/src/infra/safe-package-install.ts

export function createSafeNpmInstallEnv(
  env: NodeJS.ProcessEnv,
  options?: Record<string, any>,
): NodeJS.ProcessEnv {
  return { ...env };
}
export function createSafeNpmInstallArgs(...args: any[]): string[] {
  return [];
}
