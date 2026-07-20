/**
 * 移植自 openclaw/src/agents/sandbox/workspace-mounts.ts
 *
 * 降级策略：cross-wms 未完整移植 openclaw agents 子系统，
 * 本文件为降级 stub，仅保留导出签名，函数体抛出 "not implemented" 错误。
 * 类型降级为 unknown 占位，常量降级为 undefined。
 */

export type ReadOnlyWorkspaceSkillMount = unknown;
export function resolveMaterializedSandboxSkillsWorkspaceDir(..._args: unknown[]): unknown {
  return undefined;
}
export function isExistingWorkspaceSkillMountSource(..._args: unknown[]): unknown {
  return false;
}
export function resolveReadOnlyWorkspaceSkillMounts(..._args: unknown[]): unknown {
  return undefined;
}
export function formatReadOnlyWorkspaceSkillMountHashState(..._args: unknown[]): unknown {
  return "";
}
export function appendReadOnlyWorkspaceSkillMountArgs(..._args: unknown[]): unknown {
  return undefined;
}
export function appendWorkspaceMountArgs(..._args: unknown[]): unknown {
  return undefined;
}
export const SANDBOX_MOUNT_FORMAT_VERSION: unknown = undefined;
