// 移植自 openclaw/src/infra/install-flow.ts（降级实现）
// 包安装流程。
import type { PackageUpdatePlan } from "./package-update-steps.js";

export type InstallFlowOptions = {
  packagePath: string;
  packageName: string;
  version?: string;
  env?: NodeJS.ProcessEnv;
};

export type InstallFlowResult = {
  ok: boolean;
  plan: PackageUpdatePlan;
  reason?: string;
};

/** 默认安装步骤 */
export const DEFAULT_INSTALL_STEPS = [
  "validate-source",
  "prepare-target",
  "copy-files",
  "install-dependencies",
  "verify-install",
];

/**
 * 执行包安装流程。
 * 降级实现：不执行实际安装，返回失败。
 */
export async function runInstallFlow(_options: InstallFlowOptions): Promise<InstallFlowResult> {
  const { createPackageUpdatePlan } = await import("./package-update-steps.js");
  const plan = createPackageUpdatePlan(DEFAULT_INSTALL_STEPS);
  return {
    ok: false,
    plan,
    reason: "runInstallFlow stub: install flow not ported",
  };
}

/** 预检查安装条件 */
export function precheckInstall(options: InstallFlowOptions): { ok: boolean; reason?: string } {
  if (!options.packagePath) {
    return { ok: false, reason: "missing packagePath" };
  }
  if (!options.packageName) {
    return { ok: false, reason: "missing packageName" };
  }
  return { ok: true };
}

/** 解析安装计划步骤 */
export function resolveInstallSteps(options: InstallFlowOptions): string[] {
  return [...DEFAULT_INSTALL_STEPS];
}

export type { PackageUpdatePlan };
