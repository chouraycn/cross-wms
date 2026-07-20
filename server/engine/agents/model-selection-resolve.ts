/**
 * 移植自 openclaw/src/agents/model-selection-resolve.ts
 *
 * 降级策略：cross-wms 未完整移植 openclaw agents 子系统，
 * 本文件为降级 stub，仅保留导出签名，函数体抛出 "not implemented" 错误。
 * 类型降级为 unknown 占位，常量降级为 undefined。
 */

export { buildConfiguredAllowlistKeys, buildModelAliasIndex, normalizeModelSelection, resolveConfiguredModelRef, resolveHooksGmailModel, resolveModelRefFromString } from "./model-selection-shared.js";
export type { ModelRefStatus } from "./model-selection-shared.js";
export function getModelRefStatus(..._args: unknown[]): unknown {
  return undefined;
}
export function resolveAllowedModelRef(..._args: unknown[]): unknown {
  return undefined;
}
