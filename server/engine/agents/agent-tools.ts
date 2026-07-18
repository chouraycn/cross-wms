/**
 * 移植自 openclaw/src/agents/agent-tools.ts
 *
 * 降级策略：cross-wms 未完整移植 openclaw agents 子系统，
 * 本文件为降级 stub，仅保留导出签名，函数体抛出 "not implemented" 错误。
 * 类型降级为 unknown 占位，常量降级为 undefined。
 */

export { resolveToolLoopDetectionConfig } from "./tool-loop-detection-config.js";
export type OpenClawCodingToolConstructionPlan = unknown;
export const testing: unknown = undefined;
export function resolveProcessToolScopeKey(..._args: unknown[]): unknown {
  throw new Error("resolveProcessToolScopeKey not implemented (openclaw stub)");
}
export function createOpenClawCodingTools(..._args: unknown[]): unknown {
  throw new Error("createOpenClawCodingTools not implemented (openclaw stub)");
}
