// 通过 fs-safe 默认值暴露私有临时工作区辅助。
// 降级实现：openclaw 中从 @openclaw/fs-safe/temp 导入，
// cross-wms 在 _fs-safe-stubs 中提供真实实现。
import "./fs-safe-defaults.js";
import {
  tempWorkspace,
  tempWorkspaceSync,
  type TempWorkspace,
  type TempWorkspaceOptions,
  type TempWorkspaceSync,
  withTempWorkspace,
  withTempWorkspaceSync,
} from "./_fs-safe-stubs.js";

// 私有临时工作区在调用方选择的 temp 根下隔离下载和生成产物，并带清理所有权。
export {
  tempWorkspace,
  tempWorkspaceSync,
  type TempWorkspace,
  type TempWorkspaceOptions,
  type TempWorkspaceSync,
  withTempWorkspace,
  withTempWorkspaceSync,
};
