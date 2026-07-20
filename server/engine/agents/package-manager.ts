/**
 * 移植自 openclaw/src/agents/sessions/package-manager.ts
 *
 * 降级策略：cross-wms 未完整移植 openclaw agents 子系统，
 * 本文件为降级 stub，仅保留导出签名，函数体抛出 "not implemented" 错误。
 * 类型降级为 unknown 占位，常量降级为 undefined。
 */

export type MissingSourceAction = unknown;
export type PathMetadata = unknown;
export type ResolvedResource = unknown;
export type ResolvedPaths = unknown;
export type PackageManager = unknown;
export class DefaultPackageManager {
  // Stub: not fully ported
}
