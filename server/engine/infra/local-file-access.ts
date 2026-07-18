// 通过 fs-safe 默认值暴露本地文件 URL 辅助。
// 降级实现：openclaw 中从 @openclaw/fs-safe/advanced 导入，
// cross-wms 在 _fs-safe-stubs 中提供真实实现。
import "./fs-safe-defaults.js";
import {
  assertNoWindowsNetworkPath,
  basenameFromMediaSource,
  hasEncodedFileUrlSeparator,
  isWindowsNetworkPath,
  safeFileURLToPath,
  trySafeFileURLToPath,
} from "./_fs-safe-stubs.js";

// 本地用户文件 URL 辅助集中处理编码分隔符和 UNC 路径检查。
export {
  assertNoWindowsNetworkPath,
  basenameFromMediaSource,
  hasEncodedFileUrlSeparator,
  isWindowsNetworkPath,
  safeFileURLToPath,
  trySafeFileURLToPath,
};
