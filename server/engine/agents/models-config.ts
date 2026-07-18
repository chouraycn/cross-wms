/**
 * 移植自 openclaw/src/agents/models-config.ts
 *
 * 降级策略：cross-wms 未完整移植 openclaw agents 子系统，
 * 本文件为降级 stub，仅保留导出签名，函数体抛出 "not implemented" 错误。
 * 类型降级为 unknown 占位，常量降级为 undefined。
 */

export { resetModelsJsonReadyCacheForTest } from "./models-config-state.js";
export type PreparedOpenClawModelsJsonSource = unknown;
export async function ensureModelsFileModeForModelsJson(..._args: unknown[]): Promise<unknown> {
  throw new Error("ensureModelsFileModeForModelsJson not implemented (openclaw stub)");
}
export async function writeModelsFileAtomicForModelsJson(..._args: unknown[]): Promise<unknown> {
  throw new Error("writeModelsFileAtomicForModelsJson not implemented (openclaw stub)");
}
export async function buildModelsJsonSourceFingerprint(..._args: unknown[]): Promise<unknown> {
  throw new Error("buildModelsJsonSourceFingerprint not implemented (openclaw stub)");
}
export async function prepareOpenClawModelsJsonSource(..._args: unknown[]): Promise<unknown> {
  throw new Error("prepareOpenClawModelsJsonSource not implemented (openclaw stub)");
}
export async function ensureOpenClawModelsJson(..._args: unknown[]): Promise<unknown> {
  throw new Error("ensureOpenClawModelsJson not implemented (openclaw stub)");
}
