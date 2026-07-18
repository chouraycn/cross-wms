// 通过 fs-safe 默认值暴露兄弟临时文件写入。
// 降级实现：openclaw 中从 @openclaw/fs-safe/advanced 导入，
// cross-wms 在 _fs-safe-stubs 中提供真实实现。
import "./fs-safe-defaults.js";
import {
  writeSiblingTempFile,
  type WriteSiblingTempFileOptions,
  type WriteSiblingTempFileResult,
} from "./_fs-safe-stubs.js";

// 原子兄弟临时写入保留目标目录权限并避免跨设备 rename 行为。
export {
  writeSiblingTempFile,
  type WriteSiblingTempFileOptions,
  type WriteSiblingTempFileResult,
};
