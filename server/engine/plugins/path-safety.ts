// Plugin-local re-export of shared path safety helpers for plugin install/runtime code.
//
// 移植自 openclaw/src/plugins/path-safety.ts。
//
// 降级策略：openclaw 原文件仅从 ../infra/path-safety.js 重新导出辅助函数。
// cross-wms 的 infra/path-safety.js 已提供同名导出（含 formatPosixMode），
// 直接复用即可，无需进一步降级。

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
  formatPosixMode,
} from "../infra/path-safety.js";
