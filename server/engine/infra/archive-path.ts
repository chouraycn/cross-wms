// 通过安全的文件系统默认值解析归档路径。
// 降级实现：openclaw 中从 @openclaw/fs-safe/archive 导入，
// cross-wms 在 _fs-safe-stubs 中提供 isWindowsDrivePath。
import "./fs-safe-defaults.js";
import { isWindowsDrivePath } from "./_fs-safe-stubs.js";

export { isWindowsDrivePath };
