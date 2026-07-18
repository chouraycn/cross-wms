// 应用 OpenClaw 文件系统默认值后暴露 fs-safe 文件存储。
// 降级实现：openclaw 中从 @openclaw/fs-safe/store 导入，
// cross-wms 在 _fs-safe-stubs 中提供抛出错误的占位实现。
import "./fs-safe-defaults.js";
import { fileStore, type FileStore } from "./_fs-safe-stubs.js";

// 安全文件存储 facade。调用方在构造 root 范围存储前获得仓库默认 fs-safe 配置。
// 注意：降级 stub 的所有方法均抛出错误，cross-wms 未移植完整 fs-safe/store。
export { fileStore, type FileStore };
