// 通过 fs-safe 默认值暴露跨平台权限检查辅助。
// 降级实现：openclaw 中从 @openclaw/fs-safe/permissions 与
// @openclaw/fs-safe/advanced 导入，cross-wms 在 _fs-safe-stubs 中提供占位实现。
// Windows ACL 相关函数为抛出错误的 stub，POSIX 权限检查为真实实现。
import "./fs-safe-defaults.js";
import {
  formatPermissionDetail,
  formatPermissionRemediation,
  inspectPathPermissions,
  safeStat,
  type PermissionCheck,
  type PermissionCheckOptions,
  createIcaclsResetCommand,
  formatIcaclsResetCommand,
  formatWindowsAclSummary,
  inspectWindowsAcl,
  parseIcaclsOutput,
  resolveWindowsUserPrincipal,
  summarizeWindowsAcl,
  type PermissionExec as ExecFn,
  type WindowsAclEntry,
  type WindowsAclSummary,
} from "./_fs-safe-stubs.js";

// 权限检查 facade 在应用 OpenClaw 的 fs-safe 默认值后暴露 fs-safe POSIX 和 Windows ACL 辅助。
export {
  formatPermissionDetail,
  formatPermissionRemediation,
  inspectPathPermissions,
  safeStat,
  type PermissionCheck,
  type PermissionCheckOptions,
  createIcaclsResetCommand,
  formatIcaclsResetCommand,
  formatWindowsAclSummary,
  inspectWindowsAcl,
  parseIcaclsOutput,
  resolveWindowsUserPrincipal,
  summarizeWindowsAcl,
  type ExecFn,
  type WindowsAclEntry,
  type WindowsAclSummary,
};
