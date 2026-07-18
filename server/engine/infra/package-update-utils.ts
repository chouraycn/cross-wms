// 移植自 openclaw/src/infra/package-update-utils.ts（降级实现）
// 包更新工具函数。
import { readPackageJson, type PackageJson } from "./package-json.js";

/** 比较两个版本字符串（降级：简单字符串比较） */
export function compareVersions(a: string, b: string): number {
  const aParts = a.split(".").map((p) => Number.parseInt(p, 10) || 0);
  const bParts = b.split(".").map((p) => Number.parseInt(p, 10) || 0);
  const maxLen = Math.max(aParts.length, bParts.length);
  for (let i = 0; i < maxLen; i++) {
    const aVal = aParts[i] ?? 0;
    const bVal = bParts[i] ?? 0;
    if (aVal < bVal) return -1;
    if (aVal > bVal) return 1;
  }
  return 0;
}

/** 检查是否需要更新 */
export function needsUpdate(currentVersion: string, targetVersion: string): boolean {
  return compareVersions(currentVersion, targetVersion) < 0;
}

/** 解析当前安装的版本 */
export function resolveInstalledVersion(packagePath: string): string | null {
  const pkg = readPackageJson(packagePath);
  return pkg?.version ?? null;
}

/** 检查包是否已安装 */
export function isPackageInstalled(packagePath: string): boolean {
  return readPackageJson(packagePath) !== null;
}

/** 解析包名 */
export function resolvePackageName(packagePath: string): string | null {
  const pkg = readPackageJson(packagePath);
  return pkg?.name ?? null;
}

/** 构建更新摘要 */
export function buildUpdateSummary(params: {
  packageName: string;
  fromVersion: string;
  toVersion: string;
  steps: Array<{ name: string; status: string }>;
}): string {
  const completed = params.steps.filter((s) => s.status === "completed").length;
  const failed = params.steps.filter((s) => s.status === "failed").length;
  return `Updated ${params.packageName} from ${params.fromVersion} to ${params.toVersion} (${completed} completed, ${failed} failed)`;
}

export type { PackageJson };
