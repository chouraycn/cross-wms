// 通过 fs-safe 默认值暴露常规文件 IO 辅助。
// 降级实现：openclaw 中从 @openclaw/fs-safe/advanced 导入，
// cross-wms 在 _fs-safe-stubs 中提供真实实现。
import "./fs-safe-defaults.js";
import {
  appendRegularFile,
  appendRegularFileSync,
  readRegularFile,
  readRegularFileSync,
  resolveRegularFileAppendFlags,
  statRegularFile,
  statRegularFileSync,
  type RegularFileStatResult,
} from "./_fs-safe-stubs.js";

// 常规文件 IO 辅助在读取或追加触及用户可控路径前拒绝符号链接和非文件目标。
export {
  appendRegularFile,
  appendRegularFileSync,
  readRegularFile,
  readRegularFileSync,
  resolveRegularFileAppendFlags,
  statRegularFile,
  statRegularFileSync,
  type RegularFileStatResult,
};
