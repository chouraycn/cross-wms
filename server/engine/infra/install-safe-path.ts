// 为插件安装目标提供安全路径辅助。
// 降级实现：openclaw 中从 @openclaw/fs-safe/advanced 导入，
// cross-wms 在 _fs-safe-stubs 中提供真实实现。
import "./fs-safe-defaults.js";
import {
  assertCanonicalPathWithinBase,
  resolveSafeInstallDir,
  safeDirName,
  safePathSegmentHashed,
} from "./_fs-safe-stubs.js";

export {
  assertCanonicalPathWithinBase,
  resolveSafeInstallDir,
  safeDirName,
  safePathSegmentHashed,
};

/** 返回 scoped npm 名称的包 basename，同时保留普通 id */
export function unscopedPackageName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) {
    return trimmed;
  }
  return trimmed.includes("/") ? (trimmed.split("/").pop() ?? trimmed) : trimmed;
}

/** 将请求的 install id 与完整包名或 unscoped basename 匹配 */
export function packageNameMatchesId(packageName: string, id: string): boolean {
  const trimmedId = id.trim();
  if (!trimmedId) {
    return false;
  }

  const trimmedPackageName = packageName.trim();
  if (!trimmedPackageName) {
    return false;
  }

  return trimmedId === trimmedPackageName || trimmedId === unscopedPackageName(trimmedPackageName);
}
