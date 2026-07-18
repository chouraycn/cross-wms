// Exposes path-safety helpers backed by fs-safe defaults.
// 降级实现：从本地 _fs-safe-stubs.ts 重新导出，替代 @openclaw/fs-safe/path。
import "./_fs-safe-stubs.js";

export {
  isNotFoundPathError,
  hasNodeErrorCode,
  isNodeError,
  isPathInside,
  isPathInsideWithRealpath,
  isSymlinkOpenError,
  isWithinDir,
  normalizeWindowsPathForComparison,
  resolveSafeBaseDir,
  resolveSafeRelativePath,
  safeRealpathSync,
  safeStatSync,
  splitSafeRelativePath,
} from "./_fs-safe-stubs.js";

export { formatPosixMode } from "./fs-safe-advanced.js";
