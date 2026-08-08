/**
 * 移植自 openclaw/src/agents/agent-tools.ts
 *
 * 降级策略：cross-wms 未完整移植 openclaw agents 子系统，
 * 本文件为降级 stub，仅保留导出签名，函数体抛出 "not implemented" 错误。
 * 类型降级为 unknown 占位，常量降级为 undefined。
 */

export { resolveToolLoopDetectionConfig } from "./tool-loop-detection-config.js";
export type OpenClawCodingToolConstructionPlan = {
  includeBaseCodingTools: boolean;
  includeShellTools: boolean;
  includeChannelTools: boolean;
  includeOpenClawTools: boolean;
  includePluginTools: boolean;
};
export const testing: any = undefined;
export function resolveProcessToolScopeKey(..._args: any[]): any {
  return undefined;
}
export function createOpenClawCodingTools(..._args: any[]): any {
  return undefined;
}
