// 移植自 openclaw/src/infra/package-update-steps.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export type PackageUpdateStepResult = unknown;
export type PackageUpdateStepAdvisory = unknown;
export function markPackagePostInstallDoctorAdvisory(...args: unknown[]): unknown {
  throw new Error("not implemented: markPackagePostInstallDoctorAdvisory");
}
export function runGlobalPackageUpdateSteps(...args: unknown[]): unknown {
  throw new Error("not implemented: runGlobalPackageUpdateSteps");
}
