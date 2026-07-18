// 应用 OpenClaw 的默认 fs-safe 运行时配置。
// 降级实现：openclaw 中从 @openclaw/fs-safe/config 导入 configureFsSafePython，
// cross-wms 在 _fs-safe-stubs 中提供无操作占位。
import { configureFsSafePython } from "./_fs-safe-stubs.js";

// OpenClaw 正常文件系统安全不依赖 Python 助手。
// 测试和操作员仍可通过 fs-safe 文档化的 env 覆盖来启用。
const hasPythonModeOverride =
  process.env.FS_SAFE_PYTHON_MODE != null || process.env.OPENCLAW_FS_SAFE_PYTHON_MODE != null;

if (!hasPythonModeOverride) {
  configureFsSafePython({ mode: "off" });
}
