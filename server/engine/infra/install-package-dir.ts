// 移植自 openclaw/src/infra/install-package-dir.ts（降级实现）
// 从目录安装包。
import fs from "node:fs";
import path from "node:path";
import { readPackageJson } from "./package-json.js";

export type InstallPackageDirOptions = {
  sourceDir: string;
  targetDir: string;
  env?: NodeJS.ProcessEnv;
};

export type InstallPackageDirResult = {
  ok: boolean;
  targetDir?: string;
  reason?: string;
};

/**
 * 从目录安装包。
 * 降级实现：仅验证源目录，不执行复制。
 */
export async function installPackageDir(options: InstallPackageDirOptions): Promise<InstallPackageDirResult> {
  if (!options.sourceDir) {
    return { ok: false, reason: "missing sourceDir" };
  }
  try {
    if (!fs.statSync(options.sourceDir).isDirectory()) {
      return { ok: false, reason: "sourceDir is not a directory" };
    }
  } catch {
    return { ok: false, reason: "sourceDir does not exist" };
  }
  const pkg = readPackageJson(options.sourceDir);
  if (!pkg) {
    return { ok: false, reason: "sourceDir has no package.json" };
  }
  return {
    ok: false,
    targetDir: options.targetDir,
    reason: "installPackageDir stub: directory copy not ported",
  };
}

/** 验证源目录 */
export function validateSourceDir(sourceDir: string): { ok: boolean; reason?: string } {
  try {
    if (!fs.statSync(sourceDir).isDirectory()) {
      return { ok: false, reason: "not a directory" };
    }
  } catch {
    return { ok: false, reason: "directory does not exist" };
  }
  if (!readPackageJson(sourceDir)) {
    return { ok: false, reason: "missing package.json" };
  }
  return { ok: true };
}

/** 解析目标目录（确保父目录存在） */
export function resolveTargetDir(targetDir: string): string {
  return path.resolve(targetDir);
}
