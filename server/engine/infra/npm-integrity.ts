// 移植自 openclaw/src/infra/npm-integrity.ts（降级实现）
// npm 包完整性检查。
import fs from "node:fs";
import path from "node:path";

export type NpmIntegrityResult = {
  ok: boolean;
  reason?: string;
  packagePath: string;
};

/** 检查 npm 包完整性（降级：仅检查 package.json 是否存在） */
export function checkNpmPackageIntegrity(packagePath: string): NpmIntegrityResult {
  const packageJsonPath = path.join(packagePath, "package.json");
  try {
    if (!fs.statSync(packageJsonPath).isFile()) {
      return { ok: false, reason: "package.json is not a file", packagePath };
    }
    return { ok: true, packagePath };
  } catch {
    return { ok: false, reason: "package.json not found", packagePath };
  }
}

/** 验证 npm 包 manifest（降级：解析 JSON） */
export function validateNpmPackageManifest(packagePath: string): {
  ok: boolean;
  manifest?: Record<string, unknown>;
  reason?: string;
} {
  const packageJsonPath = path.join(packagePath, "package.json");
  try {
    const content = fs.readFileSync(packageJsonPath, "utf-8");
    const manifest = JSON.parse(content) as Record<string, unknown>;
    if (typeof manifest.name !== "string") {
      return { ok: false, reason: "missing name field" };
    }
    if (typeof manifest.version !== "string") {
      return { ok: false, reason: "missing version field" };
    }
    return { ok: true, manifest };
  } catch (error) {
    return { ok: false, reason: (error as Error).message };
  }
}

/** 检查 node_modules 是否存在 */
export function hasNodeModules(packagePath: string): boolean {
  try {
    return fs.statSync(path.join(packagePath, "node_modules")).isDirectory();
  } catch {
    return false;
  }
}
