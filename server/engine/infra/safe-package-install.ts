// 移植自 openclaw/src/infra/safe-package-install.ts（降级实现）
// 安全包安装。
import path from "node:path";
import { resolveNpmManagedRoot } from "./npm-managed-root.js";
import { validateInstallSource, resolveInstallSource } from "./install-source-utils.js";

export type SafePackageInstallOptions = {
  source: string;
  packageName?: string;
  env?: NodeJS.ProcessEnv;
  allowNetwork?: boolean;
};

export type SafePackageInstallResult = {
  ok: boolean;
  installPath?: string;
  reason?: string;
};

/**
 * 安全安装包。
 * 降级实现：不执行实际安装，返回失败。
 */
export async function safeInstallPackage(_options: SafePackageInstallOptions): Promise<SafePackageInstallResult> {
  const validation = validateInstallSource(_options.source);
  if (!validation.ok) {
    return { ok: false, reason: validation.reason };
  }
  const source = resolveInstallSource(_options.source);
  const installRoot = resolveNpmManagedRoot(_options.env);
  const packageName = _options.packageName ?? source.raw;
  const installPath = path.join(installRoot, "packages", packageName);
  return {
    ok: false,
    installPath,
    reason: "safeInstallPackage stub: safe install not ported",
  };
}

/** 预检查安全安装条件 */
export function precheckSafeInstall(options: SafePackageInstallOptions): { ok: boolean; reason?: string } {
  if (!options.source) {
    return { ok: false, reason: "missing source" };
  }
  const validation = validateInstallSource(options.source);
  if (!validation.ok) {
    return { ok: false, reason: validation.reason };
  }
  if (!options.allowNetwork) {
    const source = resolveInstallSource(options.source);
    if (source.kind === "npm-spec") {
      return { ok: false, reason: "network install not allowed" };
    }
  }
  return { ok: true };
}

/** 解析安全安装路径 */
export function resolveSafeInstallPath(params: {
  source: string;
  packageName?: string;
  env?: NodeJS.ProcessEnv;
}): string {
  const source = resolveInstallSource(params.source);
  const installRoot = resolveNpmManagedRoot(params.env);
  const packageName = params.packageName ?? source.raw;
  return path.join(installRoot, "packages", packageName);
}
