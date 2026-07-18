// 移植自 openclaw/src/infra/npm-pack-install.ts（降级实现）
// 从 npm pack tarball 安装包。
import path from "node:path";
import { resolveNpmPackageInstallDir } from "./npm-managed-root.js";

export type NpmPackInstallResult = {
  ok: boolean;
  installPath?: string;
  reason?: string;
};

/**
 * 从 npm pack tarball 安装包。
 * 降级实现：不执行实际安装，返回失败。
 */
export async function installFromNpmPack(_params: {
  tarballPath: string;
  packageName: string;
  env?: NodeJS.ProcessEnv;
}): Promise<NpmPackInstallResult> {
  return {
    ok: false,
    reason: "installFromNpmPack stub: npm pack install not ported",
  };
}

/** 解析 npm pack 安装目标目录 */
export function resolveNpmPackInstallDir(params: {
  packageName: string;
  env?: NodeJS.ProcessEnv;
}): string {
  return resolveNpmPackageInstallDir({ packageName: params.packageName, env: params.env });
}

/** 验证 tarball 路径安全性 */
export function validateTarballPath(tarballPath: string): boolean {
  if (!tarballPath || typeof tarballPath !== "string") return false;
  const resolved = path.resolve(tarballPath);
  return resolved.endsWith(".tgz") && !resolved.includes("..");
}
